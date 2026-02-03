/**
 * Schedule Task Service
 *
 * Implements task scheduling for the schedule_task built-in tool.
 * Creates scheduled task records that will be picked up by a cron job.
 */

import { db, scheduledTasks, baleybots, eq, and, notDeleted } from '@baleyui/db';
import type { BuiltInToolContext } from '../tools/built-in';

// ============================================================================
// TYPES
// ============================================================================

export interface ScheduleTaskInput {
  baleybotIdOrName: string;
  runAt: string; // ISO datetime or cron expression
  input: unknown;
}

export interface ScheduleTaskResult {
  scheduled: boolean;
  task_id: string;
  run_at: string;
}

export type TaskScheduler = (
  task: ScheduleTaskInput,
  ctx: BuiltInToolContext
) => Promise<ScheduleTaskResult>;

// ============================================================================
// IMPLEMENTATION
// ============================================================================

/**
 * Parse a run_at string to determine if it's a cron expression or datetime
 */
function parseRunAt(runAt: string): { runAt: Date; cronExpression?: string } {
  // Simple check for cron expression (contains spaces and typical cron chars)
  const isCron = /^[\d*\-,\/\s]+$/.test(runAt) && runAt.split(/\s+/).length >= 5;

  if (isCron) {
    // For cron expressions, set first run to now (cron service will calculate actual time)
    return {
      runAt: new Date(),
      cronExpression: runAt,
    };
  }

  // Try to parse as ISO date
  const date = new Date(runAt);
  if (isNaN(date.getTime())) {
    throw new Error(
      `Invalid run_at value: "${runAt}". Use ISO datetime (e.g., "2024-01-15T09:00:00Z") or cron expression.`
    );
  }

  // Don't allow scheduling more than 5 seconds in the past
  // This allows for near-immediate scheduling while preventing obviously past dates
  const fiveSecondsAgo = new Date(Date.now() - 5000);
  if (date < fiveSecondsAgo) {
    throw new Error('Cannot schedule tasks in the past');
  }

  // If the date is in the "now" window (within 5 seconds of current time),
  // adjust to run immediately
  const now = new Date();
  const effectiveDate = date < now ? now : date;

  return { runAt: effectiveDate };
}

/**
 * Look up a BaleyBot by ID or name
 */
async function lookupBaleybot(
  idOrName: string,
  workspaceId: string
): Promise<{ id: string; name: string } | null> {
  // Try to find by ID first (if it looks like a UUID)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    idOrName
  );

  if (isUuid) {
    const byId = await db.query.baleybots.findFirst({
      where: and(
        eq(baleybots.id, idOrName),
        eq(baleybots.workspaceId, workspaceId),
        notDeleted(baleybots)
      ),
      columns: { id: true, name: true },
    });

    if (byId) return byId;
  }

  // Try to find by name
  const byName = await db.query.baleybots.findFirst({
    where: and(
      eq(baleybots.name, idOrName),
      eq(baleybots.workspaceId, workspaceId),
      notDeleted(baleybots)
    ),
    columns: { id: true, name: true },
  });

  return byName ?? null;
}

/**
 * Schedule a BaleyBot to run at a specific time
 */
async function scheduleTask(
  task: ScheduleTaskInput,
  ctx: BuiltInToolContext
): Promise<ScheduleTaskResult> {
  // Look up the target BaleyBot
  const targetBB = await lookupBaleybot(task.baleybotIdOrName, ctx.workspaceId);

  if (!targetBB) {
    throw new Error(
      `BaleyBot not found: "${task.baleybotIdOrName}". ` +
        'Make sure the BaleyBot exists in this workspace.'
    );
  }

  // Parse the run_at value
  const { runAt, cronExpression } = parseRunAt(task.runAt);

  // Create the scheduled task record
  const [result] = await db
    .insert(scheduledTasks)
    .values({
      workspaceId: ctx.workspaceId,
      baleybotId: targetBB.id,
      runAt,
      cronExpression,
      input: task.input,
      status: 'pending',
      approvedBy: ctx.userId,
      approvedAt: new Date(),
    })
    .returning({ id: scheduledTasks.id, runAt: scheduledTasks.runAt });

  if (!result) {
    throw new Error('Failed to create scheduled task');
  }

  return {
    scheduled: true,
    task_id: result.id,
    run_at: result.runAt.toISOString(),
  };
}

// ============================================================================
// EXPORT SERVICE
// ============================================================================

/**
 * Create the task scheduler function
 */
export function createTaskScheduler(): TaskScheduler {
  return scheduleTask;
}

/**
 * Default task scheduler instance
 */
export const taskScheduler = createTaskScheduler();
