# Phase 2: Internal BB Intelligence — Pattern Learner + Execution Reviewer

**Status:** Pending Review
**Dependencies:** Phase 1 (recommendations table)
**Estimated Scope:** ~300 LOC modifications across 4 files

## Overview

Wire the existing Pattern Learner and Execution Reviewer internal BBs to run automatically and persist their findings into the Phase 1 `recommendations` table. Currently these BBs exist and work, but are never auto-invoked and their output disappears.

**Existing code to build on (DO NOT rebuild):**
- `apps/web/src/lib/baleybot/services/pattern-learner.ts` — `proposePattern()` + helpers
- `apps/web/src/lib/baleybot/services/reviewer.ts` — `quickReview()`
- `apps/web/src/lib/baleybot/internal-baleybots.ts` — `executeInternalBaleybot()`

---

## 2.1 — Pattern Learner Auto-Invocation

### Trigger Point

After every **non-internal** BB execution completes successfully, invoke the pattern learner.

**File:** `apps/web/src/lib/baleybot/executor.ts` (or the execute-stream API route)

```typescript
// After execution completes with status 'completed':
if (!isInternalExecution) {
  // Fire-and-forget — don't block the response
  void analyzeWithPatternLearner(execution, workspaceId);
}
```

### Implementation: `analyzeWithPatternLearner()`

**File:** `apps/web/src/lib/baleybot/services/pattern-learner.ts` (extend existing)

1. Call existing `proposePattern()` with the execution data
2. If it returns proposed patterns, persist each as a `recommendation`:
   ```typescript
   await db.insert(recommendations).values({
     workspaceId,
     sourceType: 'pattern_learner',
     sourceBaleybotId: patternLearnerBbId, // internal BB ID
     sourceExecutionId: execution.id,
     targetBaleybotId: execution.baleybotId,
     targetType: 'approval_pattern',
     title: `Auto-approve "${pattern.tool}" for ${pattern.actionPattern}`,
     description: pattern.reasoning,
     severity: 'info',
     proposedAction: {
       tool: pattern.tool,
       actionPattern: pattern.actionPattern,
       entityGoalPattern: pattern.entityGoalPattern,
     },
     confidence: pattern.confidence,
   });
   ```

### Accept Behavior

When a user accepts a pattern recommendation (via Phase 1.1 `accept` procedure):
- Insert into `approvalPatterns` table with `trustLevel: 'provisional'`
- The existing approval matching logic already checks this table at execution time

---

## 2.2 — Execution Reviewer Auto-Invocation

### Trigger Point

After every **non-internal** BB execution that fails (`status: 'failed'`), invoke the reviewer. Also trigger for the **first 3 executions** of a new BB (regardless of status) to provide early guidance and catch configuration issues before they compound.

**File:** Same location as 2.1

```typescript
if (!isInternalExecution && execution.status === 'failed') {
  void reviewFailedExecution(execution, workspaceId);
}

// Also review first 3 executions of any new BB for early guidance
if (!isInternalExecution && execution.executionNumber <= 3) {
  void reviewNewBBExecution(execution, workspaceId);
}
```

### Implementation: `reviewFailedExecution()`

**File:** `apps/web/src/lib/baleybot/services/reviewer.ts` (extend existing)

1. Call existing `quickReview()` with the execution data
2. If it returns a proposed fix (BAL patch), persist as a `recommendation`:
   ```typescript
   await db.insert(recommendations).values({
     workspaceId,
     sourceType: 'execution_reviewer',
     sourceBaleybotId: reviewerBbId,
     sourceExecutionId: execution.id,
     targetBaleybotId: execution.baleybotId,
     targetType: 'bal_patch',
     title: `Fix: ${review.summary}`,
     description: review.analysis,
     severity: review.severity, // 'warning' or 'critical'
     proposedAction: {
       currentCode: currentBalCode,
       proposedCode: review.proposedBalCode,
       diff: review.diff,
     },
     confidence: review.confidence,
   });
   ```

### Accept Behavior

When a user accepts a BAL patch recommendation:
- Apply the patch via `updateWithLock(baleybots, bbId, version, { balCode: proposedCode })`
- This integrates with the visual builder's bidirectional sync (BAL changes auto-reflect in visual editor)

---

## 2.3 — Slow/Expensive Execution Review

### Additional Trigger

Also invoke the reviewer when an execution succeeds but is abnormally slow or expensive.

**Threshold Logic:**
```typescript
// After successful non-internal execution:
const medianDuration = await getMedianDuration(execution.baleybotId);
const multiplier = await getConfig('slow_execution_multiplier', 2); // From Phase 4.5 centralized config
if (execution.durationMs > medianDuration * multiplier && medianDuration > 0) {
  void reviewSlowExecution(execution, workspaceId);
}
```

`getMedianDuration()` queries `baleybotExecutions` for the last 20 successful runs of the same BB.

**Note:** The threshold multiplier defaults to 2x but is tunable via the centralized config system (Phase 4.5). This allows admins to adjust sensitivity from the admin panel without code changes.

**Recommendation generated:**
```typescript
{
  targetType: 'performance',
  severity: 'warning',
  title: `Slow execution: ${execution.durationMs}ms (2x median of ${medianDuration}ms)`,
  proposedAction: { type: 'performance_review', details: review.suggestions }
}
```

---

## Guard Rails

- **No infinite loops:** Internal BB executions (`isInternal: true`) are NEVER auto-analyzed. The pattern learner and reviewer are themselves internal BBs.
- **Rate limiting:** At most 1 pattern learner + 1 reviewer invocation per BB per 5 minutes (use a simple in-memory throttle map).
- **Fire-and-forget:** All auto-invocations are `void`-called and wrapped in try/catch to never affect the user's execution.

---

## Verification

```bash
pnpm type-check
pnpm test
pnpm lint
```

### Manual Testing
1. Execute a user BB successfully → check `recommendations` table for pattern_learner entries
2. Execute a user BB that fails → check for execution_reviewer entries
3. Execute an internal BB → confirm NO recommendations are created
4. Accept a pattern recommendation → confirm row appears in `approvalPatterns`
5. Accept a BAL patch recommendation → confirm BB's `balCode` is updated

## Files Modified

| Action | File |
|---|---|
| **Modify** | `apps/web/src/lib/baleybot/services/pattern-learner.ts` — add `analyzeWithPatternLearner()` |
| **Modify** | `apps/web/src/lib/baleybot/services/reviewer.ts` — add `reviewFailedExecution()`, `reviewSlowExecution()` |
| **Modify** | `apps/web/src/lib/baleybot/executor.ts` (or execute-stream route) — add auto-invocation hooks |
| **Create** | `apps/web/src/lib/baleybot/services/__tests__/auto-analysis.test.ts` — tests for auto-invocation logic |
