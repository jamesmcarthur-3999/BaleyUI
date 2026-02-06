# Remaining Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all remaining issues from the post-implementation audit: V1 API stubs, console.log replacements, TypeScript improvements, TODO items, and execution/cancellation gaps.

**Architecture:** Priority-based approach - complete V1 API functionality first, then improve observability (logging), then type safety, finally advanced execution features.

**Tech Stack:** TypeScript, tRPC, Drizzle ORM, React 19, Next.js 15, @baleybots/tools, Vitest

---

## Phase 1: V1 API Execution Engine Integration (PRIORITY: CRITICAL)

### Task 1.1: Implement V1 Flow Execution with BAL Executor

**Files:**
- Modify: `apps/web/src/app/api/v1/flows/[id]/execute/route.ts`
- Reference: `packages/sdk/src/bal-executor.ts`

**Context:** The V1 flow execution endpoint creates an execution record but doesn't actually execute the flow. We need to integrate with the BAL executor.

**Step 1: Add BAL executor import and implementation**

```typescript
// At top of file, add imports
import { executeBALCode, type BALExecutionResult } from '@baleybots/sdk';
import { createLogger } from '@/lib/logger';

const logger = createLogger('v1-flow-execute');

// Replace the TODO section (lines 83-84) with actual execution
// After creating execution record, add:

// Get flow definition with nodes
const flowWithNodes = await db.query.flows.findFirst({
  where: and(
    eq(flows.id, params.id),
    notDeleted(flows),
  ),
  with: {
    nodes: true,
    edges: true,
  },
});

if (!flowWithNodes) {
  return NextResponse.json(
    { error: 'Flow not found' },
    { status: 404 }
  );
}

// Find the start node and get BAL code
const startNode = flowWithNodes.nodes.find(n => n.type === 'balCode' || n.type === 'ai-block');
const balCode = startNode?.data?.balCode || startNode?.data?.code;

if (!balCode) {
  await db.update(flowExecutions)
    .set({
      status: 'failed',
      error: 'No executable BAL code found in flow',
      completedAt: new Date(),
    })
    .where(eq(flowExecutions.id, execution.id));

  return NextResponse.json(
    { error: 'Flow has no executable code' },
    { status: 400 }
  );
}

// Execute asynchronously
executeBALCode(balCode, {
  model: 'gpt-4o-mini',
  timeout: 60000,
  onEvent: async (event) => {
    logger.debug('Execution event', { executionId: execution.id, event: event.type });
  },
}).then(async (result: BALExecutionResult) => {
  await db.update(flowExecutions)
    .set({
      status: result.status === 'success' ? 'completed' : 'failed',
      result: result.result,
      error: result.error,
      completedAt: new Date(),
    })
    .where(eq(flowExecutions.id, execution.id));

  logger.info('Flow execution completed', {
    executionId: execution.id,
    status: result.status,
    duration: result.duration,
  });
}).catch(async (error) => {
  logger.error('Flow execution failed', { executionId: execution.id, error });
  await db.update(flowExecutions)
    .set({
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      completedAt: new Date(),
    })
    .where(eq(flowExecutions.id, execution.id));
});

// Return immediately with execution ID (async execution)
return NextResponse.json({
  execution: {
    id: execution.id,
    status: 'running',
    startedAt: execution.startedAt,
  },
});
```

**Step 2: Verify the fix compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI/apps/web && pnpm tsc --noEmit`

Expected: No type errors

**Step 3: Commit**

```bash
git add apps/web/src/app/api/v1/flows/[id]/execute/route.ts
git commit -m "feat(api): implement V1 flow execution with BAL executor"
```

---

### Task 1.2: Implement V1 Block Run with BAL Executor

**Files:**
- Modify: `apps/web/src/app/api/v1/blocks/[id]/run/route.ts`

**Context:** The V1 block run endpoint creates an execution record but doesn't execute. Integrate with BAL executor.

**Step 1: Add BAL executor integration**

```typescript
// At top of file, add imports
import { executeBALCode, type BALExecutionResult } from '@baleybots/sdk';
import { createLogger } from '@/lib/logger';

const logger = createLogger('v1-block-run');

// Replace TODO section (lines 72-73) with:

// Get block BAL code
const balCode = block.balCode || block.code;

if (!balCode) {
  await db.update(blockExecutions)
    .set({
      status: 'failed',
      error: 'Block has no executable code',
      completedAt: new Date(),
    })
    .where(eq(blockExecutions.id, execution.id));

  return NextResponse.json(
    { error: 'Block has no executable code' },
    { status: 400 }
  );
}

// Execute asynchronously
executeBALCode(balCode, {
  model: 'gpt-4o-mini',
  timeout: 60000,
  onEvent: async (event) => {
    logger.debug('Block execution event', { executionId: execution.id, event: event.type });
  },
}).then(async (result: BALExecutionResult) => {
  await db.update(blockExecutions)
    .set({
      status: result.status === 'success' ? 'completed' : 'failed',
      output: result.result,
      error: result.error,
      completedAt: new Date(),
    })
    .where(eq(blockExecutions.id, execution.id));

  logger.info('Block execution completed', {
    executionId: execution.id,
    status: result.status,
    duration: result.duration,
  });
}).catch(async (error) => {
  logger.error('Block execution failed', { executionId: execution.id, error });
  await db.update(blockExecutions)
    .set({
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      completedAt: new Date(),
    })
    .where(eq(blockExecutions.id, execution.id));
});

// Return immediately
return NextResponse.json({
  execution: {
    id: execution.id,
    status: 'running',
    startedAt: execution.startedAt,
  },
});
```

**Step 2: Verify compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI/apps/web && pnpm tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/web/src/app/api/v1/blocks/[id]/run/route.ts
git commit -m "feat(api): implement V1 block run with BAL executor"
```

---

### Task 1.3: Implement V1 Execution Streaming with Real-time Events

**Files:**
- Modify: `apps/web/src/app/api/v1/executions/[id]/stream/route.ts`

**Context:** The V1 stream endpoint returns current status but doesn't stream real-time updates. Implement proper SSE streaming.

**Step 1: Implement real-time streaming**

```typescript
// At top of file, add imports
import { createLogger } from '@/lib/logger';

const logger = createLogger('v1-execution-stream');

// Replace TODO section (lines 73-74) with proper SSE implementation:

// Set up SSE response
const encoder = new TextEncoder();
let isActive = true;

const stream = new ReadableStream({
  async start(controller) {
    const sendEvent = (event: string, data: unknown) => {
      if (!isActive) return;
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(encoder.encode(message));
    };

    // Send initial state
    sendEvent('status', {
      id: execution.id,
      status: execution.status,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      result: execution.result,
      error: execution.error,
    });

    // If already complete, close stream
    if (['completed', 'failed', 'cancelled'].includes(execution.status)) {
      sendEvent('done', { status: execution.status });
      controller.close();
      return;
    }

    // Poll for updates
    const pollInterval = setInterval(async () => {
      if (!isActive) {
        clearInterval(pollInterval);
        return;
      }

      try {
        const updated = await db.query.flowExecutions.findFirst({
          where: eq(flowExecutions.id, params.id),
        });

        if (!updated) {
          clearInterval(pollInterval);
          sendEvent('error', { message: 'Execution not found' });
          controller.close();
          return;
        }

        sendEvent('status', {
          id: updated.id,
          status: updated.status,
          completedAt: updated.completedAt,
          result: updated.result,
          error: updated.error,
        });

        if (['completed', 'failed', 'cancelled'].includes(updated.status)) {
          clearInterval(pollInterval);
          sendEvent('done', { status: updated.status });
          controller.close();
        }
      } catch (error) {
        logger.error('Stream poll error', { executionId: params.id, error });
        clearInterval(pollInterval);
        sendEvent('error', { message: 'Internal error' });
        controller.close();
      }
    }, 500); // Poll every 500ms

    // Cleanup on abort
    return () => {
      isActive = false;
      clearInterval(pollInterval);
    };
  },
  cancel() {
    isActive = false;
  },
});

return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  },
});
```

**Step 2: Verify compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI/apps/web && pnpm tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/web/src/app/api/v1/executions/[id]/stream/route.ts
git commit -m "feat(api): implement V1 execution streaming with real-time SSE"
```

---

## Phase 2: Replace Console Statements with Structured Logging (PRIORITY: HIGH)

### Task 2.1: Update V1 API Routes Logging

**Files:**
- Modify: `apps/web/src/app/api/v1/blocks/route.ts`
- Modify: `apps/web/src/app/api/v1/flows/route.ts`
- Modify: `apps/web/src/app/api/v1/flows/[id]/route.ts`
- Modify: `apps/web/src/app/api/v1/executions/[id]/route.ts`

**Step 1: Update blocks route**

```typescript
// apps/web/src/app/api/v1/blocks/route.ts
// Add at top:
import { createLogger } from '@/lib/logger';
const logger = createLogger('v1-blocks');

// Replace line 56:
// console.error('Failed to list blocks:', error)
logger.error('Failed to list blocks', { error });
```

**Step 2: Update flows route**

```typescript
// apps/web/src/app/api/v1/flows/route.ts
// Add at top:
import { createLogger } from '@/lib/logger';
const logger = createLogger('v1-flows');

// Replace line 52:
// console.error('Failed to list flows:', error)
logger.error('Failed to list flows', { error });
```

**Step 3: Update flows/[id] route**

```typescript
// apps/web/src/app/api/v1/flows/[id]/route.ts
// Add at top:
import { createLogger } from '@/lib/logger';
const logger = createLogger('v1-flow-detail');

// Replace line 63:
// console.error('Failed to get flow:', error)
logger.error('Failed to get flow', { flowId: params.id, error });
```

**Step 4: Update executions/[id] route**

```typescript
// apps/web/src/app/api/v1/executions/[id]/route.ts
// Add at top:
import { createLogger } from '@/lib/logger';
const logger = createLogger('v1-execution-detail');

// Replace line 70:
// console.error('Failed to get execution:', error)
logger.error('Failed to get execution', { executionId: params.id, error });
```

**Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/
git commit -m "refactor(logging): replace console.error with structured logger in V1 routes"
```

---

### Task 2.2: Update Flow Executor Logging

**Files:**
- Modify: `apps/web/src/lib/execution/flow-executor.ts`

**Step 1: Add logger import and replace console calls**

```typescript
// At top of file:
import { createLogger } from '@/lib/logger';
const logger = createLogger('flow-executor');

// Replace line 155:
// console.error(`Flow execution ${execution.id} failed:`, error)
logger.error('Flow execution failed', {
  executionId: execution.id,
  error: error instanceof Error ? error.message : String(error),
  stack: error instanceof Error ? error.stack : undefined,
});
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/execution/flow-executor.ts
git commit -m "refactor(logging): use structured logger in flow executor"
```

---

### Task 2.3: Update Event Emitter Logging

**Files:**
- Modify: `apps/web/src/lib/execution/event-emitter.ts`

**Step 1: Add logger and replace all console calls**

```typescript
// At top of file:
import { createLogger } from '@/lib/logger';
const logger = createLogger('event-emitter');

// Replace line 28:
// console.error('Failed to persist event:', error)
logger.error('Failed to persist event', { error });

// Replace line 46:
// console.error('Failed to emit event:', error)
logger.error('Failed to emit event', { error });

// Replace line 56:
// console.error('Listener error:', error)
logger.error('Event listener error', { error });

// Replace line 147:
// console.error('Failed to flush events:', error)
logger.error('Failed to flush events', { error });

// Replace line 161:
// console.warn('Event queue overflow, dropping oldest events')
logger.warn('Event queue overflow, dropping oldest events');
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/execution/event-emitter.ts
git commit -m "refactor(logging): use structured logger in event emitter"
```

---

### Task 2.4: Update Node Executors Logging

**Files:**
- Modify: `apps/web/src/lib/execution/node-executors/sink.ts`
- Modify: `apps/web/src/lib/execution/node-executors/loop.ts`
- Modify: `apps/web/src/lib/execution/node-executors/ai-block.ts`

**Step 1: Update sink executor**

```typescript
// apps/web/src/lib/execution/node-executors/sink.ts
// Add at top:
import { createLogger } from '@/lib/logger';
const logger = createLogger('sink-executor');

// Remove debug console.logs (lines 34, 84, 98) or convert to logger.debug:
// console.log('[Sink] Database output:', input)
logger.debug('Sink database output', { input });

// console.log('[Sink] Webhook output:', input)
logger.debug('Sink webhook output', { input });

// console.log('[Sink] File output:', input)
logger.debug('Sink file output', { input });
```

**Step 2: Update loop executor**

```typescript
// apps/web/src/lib/execution/node-executors/loop.ts
// Add at top:
import { createLogger } from '@/lib/logger';
const logger = createLogger('loop-executor');

// Replace line 74:
// console.warn('Unsafe loop condition...')
logger.warn('Unsafe loop condition detected', { condition });

// Replace line 82:
// console.warn('Loop iteration limit reached')
logger.warn('Loop iteration limit reached', { maxIterations: 1000 });
```

**Step 3: Update ai-block executor**

```typescript
// apps/web/src/lib/execution/node-executors/ai-block.ts
// Add at top:
import { createLogger } from '@/lib/logger';
const logger = createLogger('ai-block-executor');

// Replace line 172:
// console.error('Code execution failed...')
logger.error('AI block code execution failed', { error });
```

**Step 4: Commit**

```bash
git add apps/web/src/lib/execution/node-executors/
git commit -m "refactor(logging): use structured logger in node executors"
```

---

### Task 2.5: Update Streaming Route Logging

**Files:**
- Modify: `apps/web/src/app/api/executions/[id]/stream/route.ts`

**Step 1: Add logger and replace console calls**

```typescript
// At top of file:
import { createLogger } from '@/lib/logger';
const logger = createLogger('execution-stream');

// Replace lines 86, 219, 230, 346 - all console.error calls:
// console.error('Stream error:', error)
logger.error('Stream error', { executionId: params.id, error });
```

**Step 2: Commit**

```bash
git add apps/web/src/app/api/executions/[id]/stream/route.ts
git commit -m "refactor(logging): use structured logger in execution stream"
```

---

## Phase 3: TypeScript Type Safety Improvements (PRIORITY: MEDIUM)

### Task 3.1: Fix Type Casts in Execution Start Route

**Files:**
- Modify: `apps/web/src/app/api/executions/start/route.ts`

**Context:** Line 71 has `input: input as any` - should use proper Zod validation result type.

**Step 1: Add proper type inference**

```typescript
// Replace line 71:
// input: input as any
// With:
input: validatedInput.input,

// Ensure Zod schema provides proper type:
const inputSchema = z.object({
  input: z.unknown(),
  // ... other fields
});

type ValidatedInput = z.infer<typeof inputSchema>;
```

**Step 2: Verify compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI/apps/web && pnpm tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/web/src/app/api/executions/start/route.ts
git commit -m "fix(types): remove 'as any' cast in execution start route"
```

---

### Task 3.2: Fix Type Casts in FlowCanvas Component

**Files:**
- Modify: `apps/web/src/components/flow/FlowCanvas.tsx`

**Context:** Line 49 has `addEdgeToStore(edge as any)` - React Flow edge type mismatch.

**Step 1: Add proper Edge type import and cast**

```typescript
// Import Edge type from React Flow
import type { Edge, Connection } from '@xyflow/react';

// Replace line 49:
// addEdgeToStore(edge as any)
// With properly typed edge:
const newEdge: Edge = {
  id: `e${edge.source}-${edge.target}`,
  source: edge.source,
  target: edge.target,
  sourceHandle: edge.sourceHandle ?? undefined,
  targetHandle: edge.targetHandle ?? undefined,
};
addEdgeToStore(newEdge);
```

**Step 2: Verify compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI/apps/web && pnpm tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/web/src/components/flow/FlowCanvas.tsx
git commit -m "fix(types): properly type React Flow edge in FlowCanvas"
```

---

### Task 3.3: Fix Type Casts in ExportPanel Component

**Files:**
- Modify: `apps/web/src/components/analytics/ExportPanel.tsx`

**Context:** Lines 159 and 175 have Select component value casts to any.

**Step 1: Add proper type handling for Select values**

```typescript
// Add type for format selection
type ExportFormat = 'csv' | 'json' | 'xlsx';

// Replace lines 159 and 175 with properly typed handlers:
<Select
  value={format}
  onValueChange={(value: ExportFormat) => setFormat(value)}
>
  {/* ... options */}
</Select>
```

**Step 2: Verify compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI/apps/web && pnpm tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/web/src/components/analytics/ExportPanel.tsx
git commit -m "fix(types): properly type Select value in ExportPanel"
```

---

### Task 3.4: Improve Soft Delete Type Safety

**Files:**
- Modify: `packages/db/src/soft-delete.ts`

**Context:** Lines 75, 80, 129-130 have Drizzle ORM type assertions that could be improved.

**Step 1: Add generic constraints for better type inference**

```typescript
// Add type helper for tables with deletedAt
type SoftDeletableTable = {
  deletedAt: PgColumn<any>;
  [key: string]: unknown;
};

// Update function signatures to use proper generics
export function notDeleted<T extends SoftDeletableTable>(table: T) {
  return isNull(table.deletedAt);
}

export async function softDelete<T extends SoftDeletableTable>(
  db: DrizzleClient,
  table: T,
  where: SQL
) {
  return db.update(table).set({ deletedAt: new Date() }).where(where);
}
```

**Step 2: Verify compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI/packages/db && pnpm tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/db/src/soft-delete.ts
git commit -m "fix(types): improve type safety in soft delete utilities"
```

---

### Task 3.5: Improve Optimistic Lock Type Safety

**Files:**
- Modify: `packages/db/src/optimistic-lock.ts`

**Context:** Lines 77, 82, 91 have Drizzle ORM type assertions.

**Step 1: Add proper generics**

```typescript
// Add type helper for tables with version column
type VersionedTable = {
  version: PgColumn<any>;
  [key: string]: unknown;
};

// Update function to use proper generics
export async function updateWithLock<T extends VersionedTable>(
  db: DrizzleClient,
  table: T,
  id: string,
  expectedVersion: number,
  updates: Partial<Record<keyof T, unknown>>
) {
  const result = await db
    .update(table)
    .set({ ...updates, version: expectedVersion + 1 })
    .where(and(eq(table.id, id), eq(table.version, expectedVersion)))
    .returning();

  if (result.length === 0) {
    throw new OptimisticLockError('Record was modified by another process');
  }

  return result[0];
}
```

**Step 2: Verify compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI/packages/db && pnpm tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/db/src/optimistic-lock.ts
git commit -m "fix(types): improve type safety in optimistic lock utilities"
```

---

## Phase 4: Flow Cancellation Signal Implementation (PRIORITY: HIGH)

### Task 4.1: Create Execution Registry for AbortController Management

**Files:**
- Create: `apps/web/src/lib/execution/execution-registry.ts`

**Context:** Flow cancellation currently updates database status but doesn't signal running executors to stop. We need a registry to track running executions and their abort controllers.

**Step 1: Create execution registry**

```typescript
/**
 * Registry for tracking running executions and their abort controllers.
 * Enables proper cancellation of running tasks.
 */

interface ExecutionEntry {
  id: string;
  abortController: AbortController;
  startedAt: Date;
  type: 'flow' | 'block' | 'baleybot';
}

class ExecutionRegistry {
  private executions = new Map<string, ExecutionEntry>();

  /**
   * Register a new execution with its abort controller
   */
  register(id: string, type: ExecutionEntry['type']): AbortController {
    const abortController = new AbortController();
    this.executions.set(id, {
      id,
      abortController,
      startedAt: new Date(),
      type,
    });
    return abortController;
  }

  /**
   * Get abort controller for an execution
   */
  get(id: string): AbortController | undefined {
    return this.executions.get(id)?.abortController;
  }

  /**
   * Cancel an execution by ID
   * Returns true if the execution was found and cancelled
   */
  cancel(id: string): boolean {
    const entry = this.executions.get(id);
    if (entry) {
      entry.abortController.abort();
      this.executions.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Remove a completed execution from the registry
   */
  complete(id: string): void {
    this.executions.delete(id);
  }

  /**
   * Get all running executions
   */
  getRunning(): ExecutionEntry[] {
    return Array.from(this.executions.values());
  }

  /**
   * Cancel all running executions (for graceful shutdown)
   */
  cancelAll(): void {
    for (const entry of this.executions.values()) {
      entry.abortController.abort();
    }
    this.executions.clear();
  }
}

// Singleton instance
export const executionRegistry = new ExecutionRegistry();
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/execution/execution-registry.ts
git commit -m "feat(execution): add execution registry for abort controller management"
```

---

### Task 4.2: Integrate Registry with Flow Executor

**Files:**
- Modify: `apps/web/src/lib/execution/flow-executor.ts`

**Step 1: Import and use execution registry**

```typescript
// At top of file:
import { executionRegistry } from './execution-registry';

// In executeFlow function, after creating execution record:
const abortController = executionRegistry.register(execution.id, 'flow');

// Pass signal to executeBALCode:
const result = await executeBALCode(balCode, {
  ...options,
  signal: abortController.signal,
});

// In finally block or after completion:
executionRegistry.complete(execution.id);
```

**Step 2: Verify compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI/apps/web && pnpm tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/web/src/lib/execution/flow-executor.ts
git commit -m "feat(execution): integrate execution registry with flow executor"
```

---

### Task 4.3: Update Cancellation Endpoints to Use Registry

**Files:**
- Modify: `apps/web/src/app/api/executions/[id]/cancel/route.ts`
- Modify: `apps/web/src/lib/trpc/routers/flows.ts`

**Step 1: Update API cancel route**

```typescript
// apps/web/src/app/api/executions/[id]/cancel/route.ts
// Add import:
import { executionRegistry } from '@/lib/execution/execution-registry';

// Before updating database, signal the running executor:
const wasCancelled = executionRegistry.cancel(params.id);

// Log whether we found a running execution
logger.info('Cancellation requested', {
  executionId: params.id,
  wasRunning: wasCancelled,
});

// Then update database status as before
```

**Step 2: Update tRPC cancel procedure**

```typescript
// apps/web/src/lib/trpc/routers/flows.ts
// In cancelFlowExecution procedure, add:
import { executionRegistry } from '@/lib/execution/execution-registry';

// Before the database update:
const wasCancelled = executionRegistry.cancel(input.executionId);

// Remove the Phase 3 TODO comment since we're implementing it now
```

**Step 3: Verify compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI/apps/web && pnpm tsc --noEmit`

**Step 4: Commit**

```bash
git add apps/web/src/app/api/executions/[id]/cancel/route.ts apps/web/src/lib/trpc/routers/flows.ts
git commit -m "feat(execution): integrate registry with cancellation endpoints"
```

---

## Phase 5: Resolve TODO Items (PRIORITY: MEDIUM)

### Task 5.1: Implement Conditional and Parallel Execution

**Files:**
- Modify: `apps/web/src/lib/baleybot/executor.ts`

**Context:** Line 308 has TODO for conditional and parallel execution. Implement basic support.

**Step 1: Add conditional execution support**

```typescript
// In executor.ts, add helper function:
async function evaluateCondition(
  condition: string,
  context: Record<string, unknown>
): Promise<boolean> {
  // Use safe-eval for condition evaluation
  const { evaluateSafeExpression } = await import('@/lib/utils/safe-eval');
  try {
    const result = evaluateSafeExpression(condition, context);
    return Boolean(result);
  } catch {
    return true; // Default to true if condition can't be evaluated
  }
}

// Update execution logic to check conditions:
async function executeStep(step: PipelineStep, context: ExecutionContext) {
  // Check condition if present
  if (step.condition) {
    const shouldExecute = await evaluateCondition(step.condition, context.variables);
    if (!shouldExecute) {
      return { skipped: true, reason: 'Condition not met' };
    }
  }

  // Execute step...
}

// Add parallel execution support:
async function executeParallelSteps(
  steps: PipelineStep[],
  context: ExecutionContext
): Promise<unknown[]> {
  return Promise.all(
    steps.map(step => executeStep(step, context))
  );
}

// Remove the TODO comment
```

**Step 2: Verify compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI/apps/web && pnpm tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/web/src/lib/baleybot/executor.ts
git commit -m "feat(execution): implement conditional and parallel execution support"
```

---

### Task 5.2: Add Tool Support to AI Block Executor

**Files:**
- Modify: `apps/web/src/lib/execution/node-executors/ai-block.ts`

**Context:** Line 221 has TODO for adding tool support. Implement basic tool integration.

**Step 1: Add tool support**

```typescript
// At top of file, add tool imports:
import { webSearchTool, sequentialThinkTool } from '@baleybots/tools';

// In the AI block execution logic, add tool configuration:
const availableTools: Record<string, ToolDefinition> = {};

// Add tools based on node configuration
if (nodeConfig.enableWebSearch && process.env.TAVILY_API_KEY) {
  availableTools.web_search = webSearchTool({
    apiKey: process.env.TAVILY_API_KEY
  });
}

if (nodeConfig.enableSequentialThinking) {
  availableTools.sequential_think = sequentialThinkTool;
}

// Pass tools to BAL executor:
const result = await executeBALCode(code, {
  ...options,
  availableTools,
});

// Remove the TODO comment
```

**Step 2: Verify compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI/apps/web && pnpm tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/web/src/lib/execution/node-executors/ai-block.ts
git commit -m "feat(execution): add tool support to AI block executor"
```

---

### Task 5.3: Remove Legacy Routes TODO

**Files:**
- Modify: `apps/web/src/lib/routes.ts`

**Context:** Line 27 has TODO to remove after migration complete. Check if migration is done and remove.

**Step 1: Check current usage and remove if safe**

```typescript
// Check if any code still uses the legacy routes
// If not, remove the TODO comment and the legacy route definitions

// Remove line 27 TODO comment and any associated legacy route definitions
// that are no longer used
```

**Step 2: Verify no broken references**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI && grep -r "legacyRoute" apps/`

**Step 3: Commit**

```bash
git add apps/web/src/lib/routes.ts
git commit -m "chore: remove legacy routes TODO and unused definitions"
```

---

### Task 5.4: Implement FlowCard Run Action

**Files:**
- Modify: `apps/web/src/components/flow/FlowCard.tsx`

**Context:** Line 113 has TODO to implement run flow action.

**Step 1: Implement run flow action**

```typescript
// Add import for execution API:
import { api } from '@/lib/trpc/client';

// Add mutation hook:
const executeFlow = api.flows.execute.useMutation({
  onSuccess: (data) => {
    toast.success('Flow execution started');
    // Navigate to execution detail
    router.push(`/dashboard/executions/${data.executionId}`);
  },
  onError: (error) => {
    toast.error(`Failed to run flow: ${error.message}`);
  },
});

// Update the run button handler:
const handleRun = () => {
  executeFlow.mutate({ flowId: flow.id });
};

// Remove the TODO comment
```

**Step 2: Verify compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI/apps/web && pnpm tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/web/src/components/flow/FlowCard.tsx
git commit -m "feat(ui): implement run flow action in FlowCard"
```

---

### Task 5.5: Set Input in Block Test Page

**Files:**
- Modify: `apps/web/src/app/dashboard/blocks/[id]/test/page.tsx`

**Context:** Line 43 has TODO to set input in SingleTest component.

**Step 1: Pass input to SingleTest component**

```typescript
// Add state for input:
const [testInput, setTestInput] = useState<unknown>(null);

// Pass input to SingleTest:
<SingleTest
  blockId={params.id}
  input={testInput}
  onInputChange={setTestInput}
/>

// Remove the TODO comment
```

**Step 2: Verify compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI/apps/web && pnpm tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/blocks/[id]/test/page.tsx
git commit -m "feat(ui): implement input handling in block test page"
```

---

### Task 5.6: Fix Version Check Skip in BaleyBot Page

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Context:** Line 425 has TODO about skipping version check.

**Step 1: Implement proper version check handling**

```typescript
// Add skipVersionCheck parameter to save mutation:
const handleSave = async (skipVersionCheck = false) => {
  await updateBaleybot.mutateAsync({
    id: baleybot.id,
    balCode: code,
    skipVersionCheck,
  });
};

// Update retry logic to skip version check on retry:
if (error.code === 'CONFLICT') {
  // Offer user option to force save
  const confirmed = await confirm('Version conflict. Force save?');
  if (confirmed) {
    await handleSave(true);
  }
}

// Remove the TODO comment
```

**Step 2: Verify compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI/apps/web && pnpm tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "feat(ui): implement version check skip in BaleyBot save"
```

---

## Phase 6: Final Verification and Cleanup

### Task 6.1: Run Full Type Check

**Step 1: Run type check across all packages**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI && pnpm turbo run type-check`

Expected: No type errors

**Step 2: Fix any remaining type errors**

Address any errors found in the type check.

**Step 3: Commit**

```bash
git add .
git commit -m "fix(types): resolve all remaining type errors"
```

---

### Task 6.2: Run Full Test Suite

**Step 1: Run all tests**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI && pnpm turbo run test`

Expected: All tests pass

**Step 2: Fix any failing tests**

Address test failures.

**Step 3: Commit**

```bash
git add .
git commit -m "fix(tests): ensure all tests pass"
```

---

### Task 6.3: Verify No Remaining Console Statements

**Step 1: Search for remaining console statements**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI && grep -r "console\." apps/web/src/lib apps/web/src/app/api --include="*.ts" --include="*.tsx" | grep -v "// eslint-disable" | grep -v "node_modules"`

Expected: No results or only intentional debug statements

**Step 2: Remove any remaining console statements**

Replace with structured logger calls.

**Step 3: Commit**

```bash
git add .
git commit -m "refactor(logging): remove remaining console statements"
```

---

### Task 6.4: Verify No Remaining TODOs

**Step 1: Search for remaining TODO comments**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI && grep -r "TODO" apps/web/src --include="*.ts" --include="*.tsx" | grep -v "node_modules"`

Expected: No critical TODOs remaining

**Step 2: Address any remaining TODOs**

Either implement or convert to tracked issues.

**Step 3: Commit**

```bash
git add .
git commit -m "chore: resolve remaining TODO items"
```

---

## Summary

This plan addresses all 86 remaining issues:

| Phase | Tasks | Issues Addressed |
|-------|-------|------------------|
| Phase 1 | 3 tasks | 3 Critical (V1 API execution integration) |
| Phase 2 | 5 tasks | ~30 Console.log replacements |
| Phase 3 | 5 tasks | 9 TypeScript type safety improvements |
| Phase 4 | 3 tasks | Flow cancellation signal implementation |
| Phase 5 | 6 tasks | 7 TODO items |
| Phase 6 | 4 tasks | Final verification and cleanup |

**Total: 26 tasks covering 100% of identified issues**
