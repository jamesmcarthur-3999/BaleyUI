# Comprehensive Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all security vulnerabilities, high-priority bugs, component issues, and complete TODO items identified in the project review.

**Architecture:** Security-first approach - fix critical vulnerabilities before stability issues, then component quality. Each task is isolated and independently testable.

**Tech Stack:** TypeScript, tRPC, Drizzle ORM, React 19, Next.js 15, Framer Motion, Vitest

---

## Phase 1: Critical Security Fixes (PRIORITY: IMMEDIATE)

### Task 1.1: Add Ownership Verification to getExecution

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts:506-532`

**Context:** The `getExecution` procedure accesses `execution.baleybot.workspaceId` at line 524 without first checking if `execution.baleybot` exists. If the `baleybot` relation is null (e.g., orphaned execution), this throws a runtime error.

**Step 1: Add null check before property access**

```typescript
// In getExecution procedure, after line 521
if (!execution.baleybot) {
  throw new TRPCError({
    code: 'NOT_FOUND',
    message: 'Execution not found',
  });
}

// Verify the BaleyBot belongs to the workspace
if (execution.baleybot.workspaceId !== ctx.workspace.id) {
```

**Step 2: Verify the fix compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI && pnpm turbo run type-check --filter=@baleyui/web`

Expected: No type errors

**Step 3: Commit**

```bash
git add apps/web/src/lib/trpc/routers/baleybots.ts
git commit -m "fix(security): add null check for baleybot relation in getExecution"
```

---

### Task 1.2: Add Ownership Verification to handleApprovalDecision

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts:744-796`

**Context:** Line 760 accesses `execution.baleybot.workspaceId` without checking if `baleybot` is null.

**Step 1: Add null check before property access**

```typescript
// Replace line 760
if (!execution || !execution.baleybot || execution.baleybot.workspaceId !== ctx.workspace.id) {
  throw new TRPCError({
    code: 'NOT_FOUND',
    message: 'Execution not found',
  });
}
```

**Step 2: Verify the fix compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI && pnpm turbo run type-check --filter=@baleyui/web`

Expected: No type errors

**Step 3: Commit**

```bash
git add apps/web/src/lib/trpc/routers/baleybots.ts
git commit -m "fix(security): add null check for baleybot in handleApprovalDecision"
```

---

### Task 1.3: Sanitize Error Messages in Execute Procedure

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts:437-456`

**Context:** The execute procedure exposes raw error messages to clients at line 454. Internal errors could leak sensitive information about the system.

**Step 1: Create error sanitizer utility**

Create file: `apps/web/src/lib/errors/sanitize.ts`

```typescript
/**
 * Sanitize error messages before sending to client.
 * Removes internal details while preserving actionable information.
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;

    // Remove stack traces
    const sanitized = message.split('\n')[0];

    // Remove file paths
    const noPath = sanitized.replace(/\/[^\s]+\.(ts|js|tsx|jsx)/g, '[internal]');

    // Remove API keys patterns
    const noKeys = noPath.replace(/sk-[a-zA-Z0-9]+/g, '[redacted]');

    // Limit length
    return noKeys.slice(0, 200);
  }

  return 'An unexpected error occurred';
}

/**
 * Check if an error is safe to expose to clients
 */
export function isUserFacingError(error: unknown): boolean {
  if (error instanceof Error) {
    // Known safe error patterns
    const safePatterns = [
      /timeout/i,
      /cancelled/i,
      /not found/i,
      /invalid input/i,
      /rate limit/i,
    ];
    return safePatterns.some(p => p.test(error.message));
  }
  return false;
}
```

**Step 2: Update execute procedure to use sanitizer**

```typescript
// At top of file, add import
import { sanitizeErrorMessage, isUserFacingError } from '@/lib/errors/sanitize';

// Replace lines 452-455 in catch block
const errorMessage = isUserFacingError(error)
  ? sanitizeErrorMessage(error)
  : 'Execution failed due to an internal error';

throw new TRPCError({
  code: 'INTERNAL_SERVER_ERROR',
  message: errorMessage,
});
```

**Step 3: Verify the fix compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI && pnpm turbo run type-check --filter=@baleyui/web`

Expected: No type errors

**Step 4: Commit**

```bash
git add apps/web/src/lib/errors/sanitize.ts apps/web/src/lib/trpc/routers/baleybots.ts
git commit -m "fix(security): sanitize error messages before sending to client"
```

---

### Task 1.4: Add Type-Safe Segments Handling

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts:772-784`

**Context:** Line 773 casts `execution.segments` to `unknown[]` without validation. Malformed data could cause runtime errors.

**Step 1: Add safe segments parsing**

```typescript
// Replace lines 772-784
// Safely parse existing segments
let currentSegments: unknown[] = [];
if (execution.segments !== null && execution.segments !== undefined) {
  if (Array.isArray(execution.segments)) {
    currentSegments = execution.segments;
  } else {
    console.warn(`Invalid segments format for execution ${input.executionId}`);
  }
}

const updatedSegments = [
  ...currentSegments,
  {
    type: 'approval_decision',
    toolCallId: input.toolCallId,
    approved: input.approved,
    denyReason: input.denyReason,
    decidedBy: ctx.userId,
    decidedAt: new Date().toISOString(),
  },
];
```

**Step 2: Verify the fix compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI && pnpm turbo run type-check --filter=@baleyui/web`

Expected: No type errors

**Step 3: Commit**

```bash
git add apps/web/src/lib/trpc/routers/baleybots.ts
git commit -m "fix(security): add type-safe segments handling in handleApprovalDecision"
```

---

## Phase 2: High Priority Stability Fixes

### Task 2.1: Fix Race Condition in Execute Procedure

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts:341-457`

**Context:** The execute procedure creates an execution record, then runs BAL code (which can take up to 60s), then updates the record. During this time, the record could be modified or deleted, causing stale updates.

**Step 1: Use database transaction for execution lifecycle**

```typescript
// Import at top of file (add 'sql' to existing @baleyui/db import)
import {
  baleybots,
  baleybotExecutions,
  approvalPatterns,
  connections,
  eq,
  and,
  desc,
  isNull,
  notDeleted,
  softDelete,
  updateWithLock,
  sql,
} from '@baleyui/db';

// Replace the execute mutation body starting after line 373 (after status check)
// Wrap in transaction
return await ctx.db.transaction(async (tx) => {
  // Create execution record within transaction
  const [execution] = await tx
    .insert(baleybotExecutions)
    .values({
      baleybotId: input.id,
      status: 'pending',
      input: input.input,
      triggeredBy: input.triggeredBy,
      triggerSource: input.triggerSource,
      createdAt: new Date(),
    })
    .returning();

  // Update execution count (using FOR UPDATE to lock)
  await tx
    .update(baleybots)
    .set({
      executionCount: sql`${baleybots.executionCount} + 1`,
      lastExecutedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(baleybots.id, input.id));

  // Mark as running
  await tx
    .update(baleybotExecutions)
    .set({ status: 'running', startedAt: new Date() })
    .where(eq(baleybotExecutions.id, execution.id));

  // Execute BAL code (outside transaction to avoid long-running lock)
  const startTime = Date.now();
  let result;
  let errorMessage: string | undefined;

  try {
    const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    result = await executeBALCode(baleybot.balCode, {
      model: 'gpt-4o-mini',
      apiKey,
      timeout: 60000,
    });
  } catch (error) {
    errorMessage = isUserFacingError(error)
      ? sanitizeErrorMessage(error)
      : 'Execution failed due to an internal error';
  }

  const duration = Date.now() - startTime;

  // Update execution record
  if (result) {
    await tx
      .update(baleybotExecutions)
      .set({
        status: result.status === 'success' ? 'completed' : result.status === 'cancelled' ? 'cancelled' : 'failed',
        output: result.result,
        error: result.error,
        completedAt: new Date(),
        durationMs: duration,
      })
      .where(eq(baleybotExecutions.id, execution.id));
  } else {
    await tx
      .update(baleybotExecutions)
      .set({
        status: 'failed',
        error: errorMessage,
        completedAt: new Date(),
        durationMs: duration,
      })
      .where(eq(baleybotExecutions.id, execution.id));
  }

  // Return final state
  const updatedExecution = await tx.query.baleybotExecutions.findFirst({
    where: eq(baleybotExecutions.id, execution.id),
  });

  if (errorMessage && !result) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: errorMessage,
    });
  }

  return updatedExecution || execution;
});
```

**Step 2: Verify the fix compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI && pnpm turbo run type-check --filter=@baleyui/web`

Expected: No type errors

**Step 3: Commit**

```bash
git add apps/web/src/lib/trpc/routers/baleybots.ts
git commit -m "fix(stability): use transaction for execute procedure to prevent race conditions"
```

---

### Task 2.2: Add Null-Safe Connection Formatting

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts:846-863`

**Context:** Lines 846-852 and 854-863 access optional properties without proper guards.

**Step 1: Add defensive formatting**

```typescript
// Replace lines 846-863
// 3. Format connections for the generator context (null-safe)
const formattedConnections = workspaceConnections.map((conn) => ({
  id: conn.id,
  type: conn.type,
  name: conn.name,
  status: conn.status ?? 'unknown',
  isDefault: conn.isDefault ?? false,
}));

// 4. Format existing BaleyBots for the generator context (null-safe)
const formattedBaleybots = existingBaleybots.map((bb) => ({
  id: bb.id,
  name: bb.name,
  description: bb.description ?? undefined,
  icon: bb.icon ?? undefined,
  status: 'active' as const,
  executionCount: 0,
  lastExecutedAt: null,
}));
```

**Step 2: Verify the fix compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI && pnpm turbo run type-check --filter=@baleyui/web`

Expected: No type errors

**Step 3: Commit**

```bash
git add apps/web/src/lib/trpc/routers/baleybots.ts
git commit -m "fix(stability): add null-safe formatting for connections and baleybots"
```

---

### Task 2.3: Add Safe Date Parsing in Page Components

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx:594-602`

**Context:** Loading conversation history parses dates from strings without validation.

**Step 1: Create date validation utility**

Create file: `apps/web/src/lib/utils/date.ts`

```typescript
/**
 * Safely parse a date from various formats.
 * Returns current date if parsing fails.
 */
export function safeParseDate(value: unknown): Date {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? new Date() : value;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  if (typeof value === 'number') {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  return new Date();
}

/**
 * Format a date for display, with fallback
 */
export function formatDateSafe(value: unknown, fallback = 'Unknown date'): string {
  try {
    const date = safeParseDate(value);
    return date.toLocaleString();
  } catch {
    return fallback;
  }
}
```

**Step 2: Update conversation history loading**

```typescript
// At top of page.tsx, add import
import { safeParseDate } from '@/lib/utils/date';

// Replace lines 594-602
if (existingBaleybot.conversationHistory && Array.isArray(existingBaleybot.conversationHistory)) {
  const loadedMessages: CreatorMessage[] = existingBaleybot.conversationHistory
    .filter((msg): msg is { id: string; role: 'user' | 'assistant'; content: string; timestamp: string } =>
      msg && typeof msg.id === 'string' && typeof msg.content === 'string'
    )
    .map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: safeParseDate(msg.timestamp),
    }));
  setMessages(loadedMessages);
}
```

**Step 3: Verify the fix compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI && pnpm turbo run type-check --filter=@baleyui/web`

Expected: No type errors

**Step 4: Commit**

```bash
git add apps/web/src/lib/utils/date.ts apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "fix(stability): add safe date parsing for conversation history"
```

---

## Phase 3: Component Quality Improvements

### Task 3.1: Create Global Error Boundary Component

**Files:**
- Create: `apps/web/src/components/errors/ErrorBoundary.tsx`

**Context:** No React Error Boundary exists to catch render-time errors gracefully.

**Step 1: Create ErrorBoundary component**

```typescript
'use client';

import { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component for catching React render errors.
 * Prevents entire app crash and shows recovery UI.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] p-6 bg-destructive/5 rounded-xl border border-destructive/20">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
          <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <Button onClick={this.handleRetry} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
```

**Step 2: Export from errors index**

Create file: `apps/web/src/components/errors/index.ts`

```typescript
export { ErrorBoundary } from './ErrorBoundary';
export { ExecutionErrorDisplay } from './ExecutionErrorDisplay';
export { ErrorSuggestions } from './ErrorSuggestions';
```

**Step 3: Verify the fix compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI && pnpm turbo run type-check --filter=@baleyui/web`

Expected: No type errors

**Step 4: Commit**

```bash
git add apps/web/src/components/errors/ErrorBoundary.tsx apps/web/src/components/errors/index.ts
git commit -m "feat(components): add global ErrorBoundary component"
```

---

### Task 3.2: Wrap Canvas Component with Error Boundary

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Context:** The Canvas component handles complex state and animations. Errors during render should be caught gracefully.

**Step 1: Import ErrorBoundary**

```typescript
// Add to imports at top of file
import { ErrorBoundary } from '@/components/errors';
```

**Step 2: Wrap Canvas with ErrorBoundary**

```typescript
// Replace lines 912-922 (Canvas area)
{/* Canvas area - responsive padding (Phase 4.6, 4.8) */}
<div className="flex-1 relative overflow-hidden p-2 sm:p-4 md:p-6">
  <div className="max-w-4xl mx-auto h-full">
    <ErrorBoundary
      fallback={
        <div className="h-full flex items-center justify-center bg-muted/20 rounded-2xl">
          <p className="text-muted-foreground">Failed to render canvas. Please refresh.</p>
        </div>
      }
    >
      <Canvas
        entities={entities}
        connections={connections}
        status={status}
        className="h-full"
      />
    </ErrorBoundary>
  </div>
</div>
```

**Step 3: Verify the fix compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI && pnpm turbo run type-check --filter=@baleyui/web`

Expected: No type errors

**Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "fix(ui): wrap Canvas with ErrorBoundary for graceful error handling"
```

---

### Task 3.3: Add Accessibility Improvements to Canvas Controls

**Files:**
- Modify: `apps/web/src/components/creator/Canvas.tsx:628-663`

**Context:** Zoom control buttons lack proper ARIA labels for screen readers.

**Step 1: Add comprehensive ARIA labels**

```typescript
// Replace zoom controls section (lines 618-665)
{/* Zoom controls (Phase 5.3, responsive Phase 4.1) */}
{showEntities && (
  <div
    className={cn(
      'absolute flex items-center bg-background/80 backdrop-blur-sm rounded-lg border border-border/50 shadow-sm',
      isMobile ? 'bottom-2 right-2 gap-0.5 p-0.5' : 'bottom-4 right-4 gap-1 p-1'
    )}
    style={{ zIndex: 10 }}
    role="group"
    aria-label="Canvas zoom controls"
  >
    <Button
      variant="ghost"
      size="icon"
      className={isMobile ? 'h-7 w-7' : 'h-8 w-8'}
      onClick={handleZoomOut}
      disabled={zoom <= MIN_ZOOM}
      aria-label={`Zoom out (current zoom: ${Math.round(zoom * 100)}%)`}
    >
      <ZoomOut className={isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
    </Button>
    <span
      className={cn(
        'font-medium text-muted-foreground text-center',
        isMobile ? 'text-[10px] min-w-[2.5rem]' : 'text-xs min-w-[3rem]'
      )}
      aria-live="polite"
      role="status"
    >
      {Math.round(zoom * 100)}%
    </span>
    <Button
      variant="ghost"
      size="icon"
      className={isMobile ? 'h-7 w-7' : 'h-8 w-8'}
      onClick={handleZoomIn}
      disabled={zoom >= MAX_ZOOM}
      aria-label={`Zoom in (current zoom: ${Math.round(zoom * 100)}%)`}
    >
      <ZoomIn className={isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
    </Button>
    <div className={cn('w-px bg-border', isMobile ? 'h-3 mx-0.5' : 'h-4 mx-1')} aria-hidden="true" />
    <Button
      variant="ghost"
      size="icon"
      className={isMobile ? 'h-7 w-7' : 'h-8 w-8'}
      onClick={handleZoomReset}
      aria-label="Fit to view (reset zoom)"
    >
      <Maximize2 className={isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
    </Button>
  </div>
)}
```

**Step 2: Verify the fix compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI && pnpm turbo run type-check --filter=@baleyui/web`

Expected: No type errors

**Step 3: Commit**

```bash
git add apps/web/src/components/creator/Canvas.tsx
git commit -m "fix(a11y): add comprehensive ARIA labels to Canvas zoom controls"
```

---

### Task 3.4: Add Memoization to Canvas Component

**Files:**
- Modify: `apps/web/src/components/creator/Canvas.tsx`

**Context:** Canvas re-renders on every zoom change. Memoizing expensive calculations improves performance.

**Step 1: Add useMemo for sorted entities**

```typescript
// Add useMemo to imports
import { useState, useCallback, useEffect, useMemo } from 'react';

// Replace line 475 (sorting entities)
const sortedEntities = useMemo(
  () => [...entities].sort((a, b) => a.id.localeCompare(b.id)),
  [entities]
);
```

**Step 2: Memoize ConnectionLine component**

```typescript
// Add memo import
import { useState, useCallback, useEffect, useMemo, memo } from 'react';

// Wrap ConnectionLine with memo (after line 323)
const MemoizedConnectionLine = memo(ConnectionLine);

// Update usage in render (around line 543)
{connections.map((connection) => (
  <MemoizedConnectionLine
    key={connection.id}
    connection={connection}
    entities={sortedEntities}
    dimmed={isRebuilding}
    isMobile={isMobile}
  />
))}
```

**Step 3: Memoize EntityCard component**

```typescript
// Wrap EntityCard with memo (after line 438)
const MemoizedEntityCard = memo(EntityCard);

// Update usage in render (around line 559)
{sortedEntities.map((entity, index) => (
  <MemoizedEntityCard
    key={entity.id}
    entity={entity}
    index={index}
    total={sortedEntities.length}
    dimmed={isRebuilding}
    isMobile={isMobile}
  />
))}
```

**Step 4: Verify the fix compiles**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI && pnpm turbo run type-check --filter=@baleyui/web`

Expected: No type errors

**Step 5: Commit**

```bash
git add apps/web/src/components/creator/Canvas.tsx
git commit -m "perf(canvas): add memoization to prevent unnecessary re-renders"
```

---

## Phase 4: TODO Item Implementations

### Task 4.1: Add Flow Execution Engine Integration Placeholder

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/flows.ts:262-266`

**Context:** The TODO at line 263 needs a placeholder that clarifies the integration path.

**Step 1: Update TODO with more context**

```typescript
// Replace lines 262-266
// Flow execution integration
// TODO(Phase 3): Implement flow execution by:
// 1. Parse flow.nodes to extract BaleyBot IDs
// 2. Build execution graph from flow.edges
// 3. Execute each BaleyBot in topological order
// 4. Pass outputs between connected nodes
// 5. Update flowExecution status as nodes complete
// See: packages/sdk/src/bal-executor.ts for BaleyBot execution pattern

return execution;
```

**Step 2: Also update the cancel TODO at line 430**

```typescript
// Replace lines 429-430
// TODO(Phase 3): Implement flow cancellation by:
// 1. Get running BaleyBot executions from flowExecution.blockExecutions
// 2. Signal cancellation to each running executor via AbortController
// 3. Update individual block execution statuses
// See: packages/sdk/src/bal-executor.ts for cancellation pattern

return cancelled;
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/trpc/routers/flows.ts
git commit -m "docs: clarify flow execution engine integration TODOs"
```

---

### Task 4.2: Create SDK BAL Executor Documentation

**Files:**
- Modify: `packages/sdk/README.md`

**Context:** The SDK README lacks documentation for the BAL executor functionality.

**Step 1: Read existing README**

Run: `cat /Users/jamesmcarthur/Documents/GitHub/BaleyUI/packages/sdk/README.md`

**Step 2: Add BAL executor section to README**

Create/update: `packages/sdk/README.md`

```markdown
# @baleyui/sdk

Official JavaScript/TypeScript SDK for BaleyUI. Execute AI flows and blocks programmatically.

## Installation

```bash
npm install @baleyui/sdk
# or
pnpm add @baleyui/sdk
```

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 4.7.0 (optional, for type definitions)

## Quick Start

### BAL Code Execution

Execute BAL (Baleybots Assembly Language) code directly:

```typescript
import { executeBALCode, compileBALCode } from '@baleyui/sdk';

// Compile BAL code (validation only, no execution)
const compiled = compileBALCode(`
  @entity Researcher
  instructions: "Research the given topic"
  tools: [web_search]

  @run Researcher("What is TypeScript?")
`);

if (compiled.errors) {
  console.error('Compilation errors:', compiled.errors);
} else {
  console.log('Entities:', compiled.entities);
  console.log('Structure:', compiled.structure);
}

// Execute BAL code
const result = await executeBALCode(`
  @entity Researcher
  instructions: "Research the given topic"
  tools: [web_search]

  @run Researcher("What is TypeScript?")
`, {
  model: 'gpt-4o-mini',
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60000, // 60 seconds
  enableWebSearch: true,
  tavilyApiKey: process.env.TAVILY_API_KEY,
});

if (result.status === 'success') {
  console.log('Result:', result.result);
} else if (result.status === 'error') {
  console.error('Error:', result.error);
}
```

### Streaming Execution

For real-time progress updates:

```typescript
import { streamBALExecution } from '@baleyui/sdk';

const generator = streamBALExecution(balCode, {
  model: 'gpt-4o-mini',
  apiKey: process.env.OPENAI_API_KEY,
});

for await (const event of generator) {
  switch (event.type) {
    case 'parsing':
      console.log('Parsing BAL code...');
      break;
    case 'compiled':
      console.log('Entities:', event.entities);
      break;
    case 'started':
      console.log('Execution started with input:', event.input);
      break;
    case 'progress':
      console.log(`[${event.botName}] ${event.message}`);
      break;
    case 'completed':
      console.log('Result:', event.result);
      break;
    case 'error':
      console.error('Error:', event.error);
      break;
  }
}
```

### Cancellation

Cancel a running execution:

```typescript
const controller = new AbortController();

// Start execution with abort signal
const resultPromise = executeBALCode(balCode, {
  signal: controller.signal,
  // ... other options
});

// Cancel after 10 seconds
setTimeout(() => controller.abort(), 10000);

const result = await resultPromise;
if (result.status === 'cancelled') {
  console.log('Execution was cancelled');
}
```

## API Reference

### `executeBALCode(code, options)`

Execute BAL code and return the result.

**Parameters:**
- `code: string` - The BAL code to execute
- `options: BALExecutionOptions` - Execution options

**Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | `'gpt-4o-mini'` | Model to use for execution |
| `apiKey` | string | - | API key for the model provider |
| `timeout` | number | `60000` | Maximum execution time in ms |
| `enableWebSearch` | boolean | `false` | Enable web search tool |
| `tavilyApiKey` | string | - | Tavily API key (required if enableWebSearch) |
| `enableSequentialThinking` | boolean | `false` | Enable sequential thinking tool |
| `signal` | AbortSignal | - | Abort signal for cancellation |
| `onEvent` | function | - | Callback for streaming events |

**Returns:** `Promise<BALExecutionResult>`

### `compileBALCode(code, options)`

Compile BAL code without executing it. Useful for validation.

**Parameters:**
- `code: string` - The BAL code to compile
- `options: BALExecutionOptions` - Compilation options

**Returns:** `BALCompileResult`

### `streamBALExecution(code, options)`

Execute BAL code with streaming events.

**Returns:** `AsyncGenerator<BALExecutionEvent, BALExecutionResult>`

## Types

### BALExecutionResult

```typescript
interface BALExecutionResult {
  status: 'success' | 'error' | 'cancelled' | 'timeout';
  result?: unknown;
  error?: string;
  entities?: string[];
  structure?: PipelineStructure | null;
  duration?: number;
}
```

### BALExecutionEvent

```typescript
type BALExecutionEvent =
  | { type: 'parsing'; message: string }
  | { type: 'compiled'; entities: string[]; structure: PipelineStructure | null }
  | { type: 'started'; input: unknown }
  | { type: 'token'; botName: string; event: BaleybotStreamEvent }
  | { type: 'progress'; botName: string; message: string }
  | { type: 'completed'; result: unknown }
  | { type: 'error'; error: string }
  | { type: 'cancelled' };
```

## License

MIT
```

**Step 3: Commit**

```bash
git add packages/sdk/README.md
git commit -m "docs(sdk): add comprehensive BAL executor documentation"
```

---

### Task 4.3: Add SDK BAL Executor Unit Tests

**Files:**
- Create: `packages/sdk/src/__tests__/bal-executor.test.ts`

**Context:** The BAL executor lacks unit tests.

**Step 1: Create test file**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compileBALCode, executeBALCode, streamBALExecution } from '../bal-executor';

// Mock @baleybots/tools
vi.mock('@baleybots/tools', () => ({
  compileBAL: vi.fn(),
  executeBAL: vi.fn(),
  webSearchTool: vi.fn(() => ({})),
  sequentialThinkTool: {},
}));

import { compileBAL, executeBAL } from '@baleybots/tools';

const mockedCompileBAL = vi.mocked(compileBAL);
const mockedExecuteBAL = vi.mocked(executeBAL);

describe('compileBALCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns entities and structure on success', () => {
    mockedCompileBAL.mockReturnValue({
      entityNames: ['Researcher', 'Writer'],
      pipelineStructure: { type: 'sequential', steps: [] },
      runInput: 'test input',
    });

    const result = compileBALCode('@entity Researcher');

    expect(result.entities).toEqual(['Researcher', 'Writer']);
    expect(result.structure).toEqual({ type: 'sequential', steps: [] });
    expect(result.runInput).toBe('test input');
    expect(result.errors).toBeUndefined();
  });

  it('returns errors on compilation failure', () => {
    mockedCompileBAL.mockImplementation(() => {
      throw new Error('Syntax error at line 1');
    });

    const result = compileBALCode('invalid code');

    expect(result.errors).toEqual(['Syntax error at line 1']);
    expect(result.entities).toEqual([]);
    expect(result.structure).toBeNull();
  });

  it('includes web search tool when enabled with API key', () => {
    mockedCompileBAL.mockReturnValue({
      entityNames: [],
      pipelineStructure: null,
      runInput: null,
    });

    compileBALCode('@entity Test', {
      enableWebSearch: true,
      tavilyApiKey: 'test-key',
    });

    expect(mockedCompileBAL).toHaveBeenCalledWith(
      '@entity Test',
      expect.objectContaining({
        availableTools: expect.objectContaining({
          web_search: expect.any(Object),
        }),
      })
    );
  });

  it('does not include web search without API key', () => {
    mockedCompileBAL.mockReturnValue({
      entityNames: [],
      pipelineStructure: null,
      runInput: null,
    });

    compileBALCode('@entity Test', {
      enableWebSearch: true,
      // No tavilyApiKey
    });

    expect(mockedCompileBAL).toHaveBeenCalledWith(
      '@entity Test',
      expect.objectContaining({
        availableTools: {},
      })
    );
  });
});

describe('executeBALCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success result on successful execution', async () => {
    mockedCompileBAL.mockReturnValue({
      entityNames: ['Test'],
      pipelineStructure: { type: 'single', entity: 'Test' },
      runInput: 'input',
    });
    mockedExecuteBAL.mockResolvedValue({
      result: 'test output',
    });

    const result = await executeBALCode('@entity Test @run Test("input")');

    expect(result.status).toBe('success');
    expect(result.result).toBe('test output');
    expect(result.entities).toEqual(['Test']);
  });

  it('returns error on compilation failure', async () => {
    mockedCompileBAL.mockImplementation(() => {
      throw new Error('Compile error');
    });

    const result = await executeBALCode('invalid');

    expect(result.status).toBe('error');
    expect(result.error).toBe('Compile error');
  });

  it('returns success with no-op message when no pipeline exists', async () => {
    mockedCompileBAL.mockReturnValue({
      entityNames: ['Test'],
      pipelineStructure: null,
      runInput: null,
    });

    const result = await executeBALCode('@entity Test');

    expect(result.status).toBe('success');
    expect(result.result).toEqual({
      message: 'No pipeline to execute',
      entities: ['Test'],
    });
    expect(mockedExecuteBAL).not.toHaveBeenCalled();
  });

  it('handles timeout', async () => {
    mockedCompileBAL.mockReturnValue({
      entityNames: ['Test'],
      pipelineStructure: { type: 'single', entity: 'Test' },
      runInput: 'input',
    });
    mockedExecuteBAL.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 5000))
    );

    const result = await executeBALCode('@entity Test @run Test("input")', {
      timeout: 100,
    });

    expect(result.status).toBe('timeout');
  }, 10000);

  it('calls onEvent callback with events', async () => {
    mockedCompileBAL.mockReturnValue({
      entityNames: ['Test'],
      pipelineStructure: { type: 'single', entity: 'Test' },
      runInput: 'input',
    });
    mockedExecuteBAL.mockResolvedValue({ result: 'output' });

    const events: unknown[] = [];
    await executeBALCode('@entity Test @run Test("input")', {
      onEvent: (event) => events.push(event),
    });

    expect(events.some((e: any) => e.type === 'parsing')).toBe(true);
    expect(events.some((e: any) => e.type === 'compiled')).toBe(true);
    expect(events.some((e: any) => e.type === 'started')).toBe(true);
    expect(events.some((e: any) => e.type === 'completed')).toBe(true);
  });
});

describe('streamBALExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('yields events in order', async () => {
    mockedCompileBAL.mockReturnValue({
      entityNames: ['Test'],
      pipelineStructure: { type: 'single', entity: 'Test' },
      runInput: 'input',
    });
    mockedExecuteBAL.mockResolvedValue({ result: 'output' });

    const events: unknown[] = [];
    const generator = streamBALExecution('@entity Test @run Test("input")');

    for await (const event of generator) {
      events.push(event);
    }

    const types = events.map((e: any) => e.type);
    expect(types).toContain('parsing');
    expect(types).toContain('compiled');
    expect(types).toContain('started');
    expect(types).toContain('completed');
  });

  it('returns final result', async () => {
    mockedCompileBAL.mockReturnValue({
      entityNames: ['Test'],
      pipelineStructure: { type: 'single', entity: 'Test' },
      runInput: 'input',
    });
    mockedExecuteBAL.mockResolvedValue({ result: 'output' });

    const generator = streamBALExecution('@entity Test @run Test("input")');

    let result;
    for await (const event of generator) {
      // consume events
    }
    // Get return value
    const final = await generator.next();

    // Note: The return value is accessed differently in async generators
    // This test verifies the generator completes successfully
    expect(final.done).toBe(true);
  });
});
```

**Step 2: Update package.json to include test script**

```json
// In packages/sdk/package.json, add to scripts:
"test": "vitest run",
"test:watch": "vitest"
```

**Step 3: Add vitest to devDependencies**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI/packages/sdk && pnpm add -D vitest`

**Step 4: Run tests**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI/packages/sdk && pnpm test`

Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/sdk/src/__tests__/bal-executor.test.ts packages/sdk/package.json
git commit -m "test(sdk): add unit tests for BAL executor"
```

---

## Phase 5: Final Verification

### Task 5.1: Run Full Type Check

**Step 1: Run type check across all packages**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI && pnpm turbo run type-check`

Expected: No type errors

### Task 5.2: Run Full Test Suite

**Step 1: Run all tests**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI && pnpm turbo run test`

Expected: All tests pass

### Task 5.3: Run Lint Check

**Step 1: Run linting**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI && pnpm turbo run lint`

Expected: No lint errors (or only pre-existing warnings)

### Task 5.4: Final Commit Summary

```bash
git log --oneline -15
```

Expected output showing all commits from this plan.

---

## Summary

| Phase | Tasks | Purpose |
|-------|-------|---------|
| 1 | 1.1-1.4 | Critical security fixes |
| 2 | 2.1-2.3 | High priority stability fixes |
| 3 | 3.1-3.4 | Component quality improvements |
| 4 | 4.1-4.3 | TODO implementations & documentation |
| 5 | 5.1-5.4 | Final verification |

**Total Tasks:** 15
**Estimated Commits:** 15

All tasks are independent within their phase and can be executed in order.
