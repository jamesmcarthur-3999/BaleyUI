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
import { createLogger } from '@/lib/logger';
import { requireEnv } from '@/lib/env';
import { getWorkspaceAICredentials } from '@/lib/baleybot/services';

const log = createLogger('cron');

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

  let cronSecret: string;
  try {
    cronSecret = requireEnv('CRON_SECRET', 'cron job authorization');
  } catch {
    log.error('CRON_SECRET environment variable not set');
    return NextResponse.json(
      { error: 'Cron not configured' },
      { status: 500 }
    );
  }

  // Use timing-safe comparison for bearer token
  const expectedHeader = `Bearer ${cronSecret}`;
  const headersMatch = authHeader !== null
    && authHeader.length === expectedHeader.length
    && (() => {
        const { timingSafeEqual } = require('crypto');
        return timingSafeEqual(
          Buffer.from(authHeader, 'utf-8'),
          Buffer.from(expectedHeader, 'utf-8')
        );
      })();

  if (!headersMatch) {
    log.warn('Unauthorized cron request');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const startTime = Date.now();
  log.info(' Starting scheduled task processing');

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
      log.info(' No due tasks found');
      return NextResponse.json({
        processed: 0,
        durationMs: Date.now() - startTime,
      });
    }

    log.info(`Found ${dueTasks.length} due tasks`);

    // Process each task
    const results: TaskResult[] = [];
    for (const task of dueTasks) {
      const result = await processScheduledTask(task);
      results.push(result);
    }

    const completedCount = results.filter((r) => r.status === 'completed').length;
    const failedCount = results.filter((r) => r.status === 'failed').length;

    log.info('Processed scheduled tasks', { total: results.length, completed: completedCount, failed: failedCount });

    return NextResponse.json({
      processed: results.length,
      completed: completedCount,
      failed: failedCount,
      durationMs: Date.now() - startTime,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error(' Error processing scheduled tasks:', message);

    const isDev = process.env.NODE_ENV === 'development';
    return NextResponse.json(
      {
        error: 'Failed to process scheduled tasks',
        ...(isDev ? { message } : {}),
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
  log.info('Processing scheduled task', { taskId: task.id, baleybotId: task.baleybotId });

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

    // Get AI credentials from workspace connections
    const credentials = await getWorkspaceAICredentials(task.workspaceId);
    if (!credentials) {
      throw new Error('No AI provider configured for this workspace. Please add an OpenAI or Anthropic connection in Settings.');
    }

    // Execute the BaleyBot with the scheduled task's input
    const inputStr = task.input ? JSON.stringify(task.input) : undefined;
    const result = await executeBALCode(baleybot.balCode, {
      input: inputStr,
      model: credentials.model,
      apiKey: credentials.apiKey,
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

    log.error('Scheduled task failed', { taskId: task.id, error: errorMessage });

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
    log.info('Task reached max runs', { taskId: task.id });
    await db
      .update(scheduledTasks)
      .set({ status: 'completed' })
      .where(eq(scheduledTasks.id, task.id));
    return;
  }

  // Calculate next run time
  const nextRun = parseCronExpression(task.cronExpression);

  if (!nextRun) {
    log.error('Invalid cron expression', { taskId: task.id, cronExpression: task.cronExpression });
    return;
  }

  log.info('Rescheduling task', { taskId: task.id, nextRun: nextRun.toISOString() });

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
