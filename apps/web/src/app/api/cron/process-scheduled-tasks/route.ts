/**
 * Vercel Cron Endpoint: Process Scheduled Tasks
 *
 * This endpoint is called by Vercel Cron every minute to process
 * scheduled BaleyBot tasks. It:
 * 1. Queries for due tasks (status=pending, runAt <= now)
 * 2. Executes each due task
 * 3. Updates task status and reschedules recurring tasks
 *
 * Security: Requires CRON_SECRET authorization header
 */

import { NextResponse } from 'next/server';
import {
  db,
  scheduledTasks,
  baleybots,
  baleybotExecutions,
  eq,
  and,
  lte,
  notDeleted,
} from '@baleyui/db';
import { executeBALCode } from '@baleyui/sdk';
import { parseCronExpression } from './cron-utils';

// ============================================================================
// TYPES
// ============================================================================

interface TaskResult {
  taskId: string;
  baleybotId: string;
  status: 'completed' | 'failed';
  executionId?: string;
  error?: string;
  durationMs: number;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function GET(request: Request): Promise<Response> {
  // Verify cron authorization
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[cron] CRON_SECRET environment variable not set');
    return NextResponse.json(
      { error: 'Cron not configured' },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[cron] Unauthorized cron request');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const startTime = Date.now();
  console.log('[cron] Starting scheduled task processing');

  try {
    // Query due tasks (limit to 10 per invocation to prevent timeout)
    const dueTasks = await db.query.scheduledTasks.findMany({
      where: and(
        eq(scheduledTasks.status, 'pending'),
        lte(scheduledTasks.runAt, new Date())
      ),
      limit: 10,
      orderBy: (tasks, { asc }) => [asc(tasks.runAt)],
    });

    if (dueTasks.length === 0) {
      console.log('[cron] No due tasks found');
      return NextResponse.json({
        processed: 0,
        durationMs: Date.now() - startTime,
      });
    }

    console.log(`[cron] Found ${dueTasks.length} due tasks`);

    // Process each task
    const results: TaskResult[] = [];
    for (const task of dueTasks) {
      const result = await processScheduledTask(task);
      results.push(result);
    }

    const completedCount = results.filter((r) => r.status === 'completed').length;
    const failedCount = results.filter((r) => r.status === 'failed').length;

    console.log(
      `[cron] Processed ${results.length} tasks: ${completedCount} completed, ${failedCount} failed`
    );

    return NextResponse.json({
      processed: results.length,
      completed: completedCount,
      failed: failedCount,
      durationMs: Date.now() - startTime,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cron] Error processing scheduled tasks:', message);

    return NextResponse.json(
      {
        error: 'Failed to process scheduled tasks',
        message,
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// TASK PROCESSING
// ============================================================================

interface ScheduledTask {
  id: string;
  workspaceId: string;
  baleybotId: string;
  runAt: Date;
  cronExpression: string | null;
  input: unknown;
  status: string;
  runCount: number | null;
  maxRuns: number | null;
}

async function processScheduledTask(task: ScheduledTask): Promise<TaskResult> {
  const taskStartTime = Date.now();
  console.log(`[cron] Processing task ${task.id} for BB ${task.baleybotId}`);

  try {
    // Mark task as running
    await db
      .update(scheduledTasks)
      .set({ status: 'running' })
      .where(eq(scheduledTasks.id, task.id));

    // Look up the BaleyBot
    const baleybot = await db.query.baleybots.findFirst({
      where: and(
        eq(baleybots.id, task.baleybotId),
        notDeleted(baleybots)
      ),
      columns: {
        id: true,
        name: true,
        balCode: true,
        workspaceId: true,
      },
    });

    if (!baleybot) {
      throw new Error(`BaleyBot ${task.baleybotId} not found or deleted`);
    }

    // Create execution record
    const [execution] = await db
      .insert(baleybotExecutions)
      .values({
        baleybotId: baleybot.id,
        status: 'running',
        input: task.input as Record<string, unknown>,
        triggeredBy: 'schedule',
        triggerSource: task.id,
        startedAt: new Date(),
      })
      .returning({ id: baleybotExecutions.id });

    if (!execution) {
      throw new Error('Failed to create execution record');
    }

    // Get API key for execution (from environment for now)
    // In production, this would come from workspace connection settings
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('No API key configured for scheduled execution');
    }

    // Execute the BaleyBot
    const result = await executeBALCode(baleybot.balCode, {
      model: 'gpt-4o-mini',
      apiKey,
      timeout: 55000, // 55 seconds (leave margin for cron timeout)
    });

    const durationMs = Date.now() - taskStartTime;

    // Update execution record with success
    await db
      .update(baleybotExecutions)
      .set({
        status: 'completed',
        output: result as unknown as Record<string, unknown>,
        completedAt: new Date(),
        durationMs,
      })
      .where(eq(baleybotExecutions.id, execution.id));

    // Handle recurring tasks
    if (task.cronExpression) {
      await rescheduleRecurringTask(task);
    } else {
      // One-time task completed
      await db
        .update(scheduledTasks)
        .set({
          status: 'completed',
          lastRunAt: new Date(),
          lastRunStatus: 'completed',
          executionId: execution.id,
          runCount: (task.runCount ?? 0) + 1,
        })
        .where(eq(scheduledTasks.id, task.id));
    }

    return {
      taskId: task.id,
      baleybotId: task.baleybotId,
      status: 'completed',
      executionId: execution.id,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - taskStartTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error(`[cron] Task ${task.id} failed:`, errorMessage);

    // Update task with failure
    await db
      .update(scheduledTasks)
      .set({
        status: task.cronExpression ? 'pending' : 'failed', // Recurring tasks stay pending
        lastRunAt: new Date(),
        lastRunStatus: 'failed',
        lastRunError: errorMessage,
        runCount: (task.runCount ?? 0) + 1,
      })
      .where(eq(scheduledTasks.id, task.id));

    // If recurring, reschedule for next run
    if (task.cronExpression) {
      await rescheduleRecurringTask(task);
    }

    return {
      taskId: task.id,
      baleybotId: task.baleybotId,
      status: 'failed',
      error: errorMessage,
      durationMs,
    };
  }
}

// ============================================================================
// RECURRING TASK HANDLING
// ============================================================================

async function rescheduleRecurringTask(task: ScheduledTask): Promise<void> {
  if (!task.cronExpression) return;

  // Check if max runs reached
  if (task.maxRuns !== null && (task.runCount ?? 0) + 1 >= task.maxRuns) {
    console.log(`[cron] Task ${task.id} reached max runs, marking completed`);
    await db
      .update(scheduledTasks)
      .set({ status: 'completed' })
      .where(eq(scheduledTasks.id, task.id));
    return;
  }

  // Calculate next run time
  const nextRun = parseCronExpression(task.cronExpression);

  if (!nextRun) {
    console.error(`[cron] Invalid cron expression for task ${task.id}: ${task.cronExpression}`);
    return;
  }

  console.log(`[cron] Rescheduling task ${task.id} for ${nextRun.toISOString()}`);

  await db
    .update(scheduledTasks)
    .set({
      status: 'pending',
      runAt: nextRun,
      lastRunAt: new Date(),
      runCount: (task.runCount ?? 0) + 1,
    })
    .where(eq(scheduledTasks.id, task.id));
}

// Export config for Vercel
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 second timeout
