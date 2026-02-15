import {
  db,
  orchestrationRuns,
  orchestrationTasks,
  and,
  eq,
  desc,
  inArray,
} from '@baleyui/db';

export type OrchestrationRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type OrchestrationTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface StartOrchestrationRunInput {
  workspaceId: string;
  rootExecutionId?: string | null;
  entryBot: string;
  objective: string;
  strategy?: Record<string, unknown>;
}

export interface StartOrchestrationTaskInput {
  taskId?: string;
  runId: string;
  workspaceId: string;
  parentTaskId?: string | null;
  assignedBot: string;
  expectedArtifact?: string | null;
  attempt?: number;
  depth?: number;
  fingerprint?: string | null;
  input?: unknown;
  strategyHints?: unknown[];
}

export interface CompleteOrchestrationTaskInput {
  taskId: string;
  executionId?: string | null;
  output?: unknown;
  status?: Extract<OrchestrationTaskStatus, 'completed' | 'skipped'>;
}

export interface FailOrchestrationTaskInput {
  taskId: string;
  executionId?: string | null;
  error: string;
  issuePack?: unknown;
}

function durationSince(startedAt: Date | null): number | null {
  if (!startedAt) return null;
  return Math.max(0, Date.now() - startedAt.getTime());
}

export async function startOrchestrationRun(
  input: StartOrchestrationRunInput
): Promise<{ runId: string }> {
  const [created] = await db
    .insert(orchestrationRuns)
    .values({
      workspaceId: input.workspaceId,
      rootExecutionId: input.rootExecutionId ?? null,
      entryBot: input.entryBot,
      status: 'running',
      objective: input.objective,
      strategy: input.strategy ?? {},
      startedAt: new Date(),
    })
    .returning({ runId: orchestrationRuns.id });

  if (!created) {
    throw new Error('Failed to create orchestration run');
  }
  return created;
}

export async function completeOrchestrationRun(args: {
  runId: string;
  status: Exclude<OrchestrationRunStatus, 'running'>;
  summary?: string | null;
  metrics?: Record<string, unknown>;
}): Promise<void> {
  await db
    .update(orchestrationRuns)
    .set({
      status: args.status,
      summary: args.summary ?? null,
      metrics: args.metrics ?? {},
      completedAt: new Date(),
    })
    .where(eq(orchestrationRuns.id, args.runId));
}

export async function startOrchestrationTask(
  input: StartOrchestrationTaskInput
): Promise<{ taskId: string }> {
  const [created] = await db
    .insert(orchestrationTasks)
    .values({
      ...(input.taskId ? { id: input.taskId } : {}),
      runId: input.runId,
      workspaceId: input.workspaceId,
      parentTaskId: input.parentTaskId ?? null,
      assignedBot: input.assignedBot,
      expectedArtifact: input.expectedArtifact ?? null,
      status: 'running',
      attempt: input.attempt ?? 0,
      depth: input.depth ?? 0,
      fingerprint: input.fingerprint ?? null,
      input: (input.input ?? null) as Record<string, unknown> | null,
      strategyHints: input.strategyHints ?? [],
      startedAt: new Date(),
    })
    .returning({ taskId: orchestrationTasks.id });

  if (!created) {
    throw new Error('Failed to create orchestration task');
  }
  return created;
}

export async function completeOrchestrationTask(
  input: CompleteOrchestrationTaskInput
): Promise<void> {
  const existing = await db.query.orchestrationTasks.findFirst({
    where: eq(orchestrationTasks.id, input.taskId),
    columns: { startedAt: true },
  });

  await db
    .update(orchestrationTasks)
    .set({
      status: input.status ?? 'completed',
      executionId: input.executionId ?? null,
      output: (input.output ?? null) as Record<string, unknown> | null,
      completedAt: new Date(),
      durationMs: durationSince(existing?.startedAt ?? null),
    })
    .where(eq(orchestrationTasks.id, input.taskId));
}

export async function failOrchestrationTask(
  input: FailOrchestrationTaskInput
): Promise<void> {
  const existing = await db.query.orchestrationTasks.findFirst({
    where: eq(orchestrationTasks.id, input.taskId),
    columns: { startedAt: true },
  });

  await db
    .update(orchestrationTasks)
    .set({
      status: 'failed',
      executionId: input.executionId ?? null,
      error: input.error,
      issuePack: (input.issuePack ?? null) as Record<string, unknown> | null,
      completedAt: new Date(),
      durationMs: durationSince(existing?.startedAt ?? null),
    })
    .where(eq(orchestrationTasks.id, input.taskId));
}

export async function listOrchestrationTasks(args: {
  workspaceId: string;
  runId?: string;
  ids?: string[];
  limit?: number;
}): Promise<Array<{
  id: string;
  runId: string;
  parentTaskId: string | null;
  assignedBot: string;
  expectedArtifact: string | null;
  status: string;
  attempt: number;
  depth: number;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  error: string | null;
}>> {
  if (args.ids && args.ids.length === 0) return [];

  const rows = await db.query.orchestrationTasks.findMany({
    where:
      args.ids && args.ids.length > 0
        ? and(
            eq(orchestrationTasks.workspaceId, args.workspaceId),
            inArray(orchestrationTasks.id, args.ids)
          )
        : args.runId
          ? and(
              eq(orchestrationTasks.workspaceId, args.workspaceId),
              eq(orchestrationTasks.runId, args.runId)
            )
          : eq(orchestrationTasks.workspaceId, args.workspaceId),
    columns: {
      id: true,
      runId: true,
      parentTaskId: true,
      assignedBot: true,
      expectedArtifact: true,
      status: true,
      attempt: true,
      depth: true,
      startedAt: true,
      completedAt: true,
      durationMs: true,
      error: true,
    },
    orderBy: [desc(orchestrationTasks.createdAt)],
    limit: args.limit ?? 50,
  });

  return rows;
}

export async function getOrchestrationRun(args: {
  workspaceId: string;
  runId: string;
}): Promise<{
  id: string;
  rootExecutionId: string | null;
  entryBot: string;
  status: string;
  objective: string;
  strategy: unknown;
  summary: string | null;
  metrics: unknown;
  startedAt: Date;
  completedAt: Date | null;
} | null> {
  const row = await db.query.orchestrationRuns.findFirst({
    where: and(
      eq(orchestrationRuns.workspaceId, args.workspaceId),
      eq(orchestrationRuns.id, args.runId)
    ),
    columns: {
      id: true,
      rootExecutionId: true,
      entryBot: true,
      status: true,
      objective: true,
      strategy: true,
      summary: true,
      metrics: true,
      startedAt: true,
      completedAt: true,
    },
  });
  return row ?? null;
}
