# Phase 0: Security & Data Integrity

**Status:** Pending Review
**Dependencies:** None
**Estimated Scope:** ~150 LOC across 6 files + 1 test file

## Overview

A comprehensive codebase audit identified 6 security and data integrity bugs that should be fixed before starting the Intelligent Platform phases. These are not feature work — they're correctness fixes that affect the reliability of all subsequent phases.

---

## 0.1 — Add `notDeleted()` to Trigger Queries [CRITICAL]

### Problem

Soft-deleted triggers still fire on BB completion and appear in list queries. The trigger service and tRPC router have multiple queries missing the `notDeleted(baleybotTriggers)` filter.

### Fix

**File 1:** `apps/web/src/lib/baleybot/services/bb-completion-trigger-service.ts`
- Add `notDeleted(baleybotTriggers)` to `getTriggersForSource()` where clause (line ~71)
- `notDeleted` is already imported

**File 2:** `apps/web/src/lib/trpc/routers/triggers.ts`
- Add `notDeleted(baleybotTriggers)` to all queries that filter triggers:
  - `list` procedure
  - `getForTarget` procedure
  - `create` cycle detection query
  - `create` duplicate check query
  - `delete` procedure
  - `enable` procedure
  - `disable` procedure
  - `update` procedure

---

## 0.2 — Fix Webhook Secret Timing Comparison [CRITICAL]

### Problem

When webhook secret lengths differ, the code compares `expectedBuffer` against itself instead of against `providedBuffer`. This defeats the purpose of constant-time comparison.

### Fix

**File:** `apps/web/src/app/api/webhooks/baleybots/[workspaceId]/[baleybotId]/route.ts`

Replace regex-length comparison with HMAC-then-compare, which ensures constant-time regardless of input length:

```typescript
function verifyWebhookSecret(expected: string, provided: string | null): boolean {
  if (!provided || !expected) return false;
  const expectedHmac = crypto.createHmac('sha256', expected).update('verify').digest();
  const providedHmac = crypto.createHmac('sha256', provided).update('verify').digest();
  return crypto.timingSafeEqual(expectedHmac, providedHmac);
}
```

---

## 0.3 — Add Webhook Body Size Limit

### Problem

Webhook endpoint accepts arbitrary-sized request bodies, enabling DoS via memory exhaustion.

### Fix

**File:** Same webhook route file

Add content-length check before body parsing:

```typescript
const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
const MAX_WEBHOOK_BODY_SIZE = 102_400; // 100KB
if (contentLength > MAX_WEBHOOK_BODY_SIZE) {
  return NextResponse.json(
    { error: 'Request body too large', maxBytes: MAX_WEBHOOK_BODY_SIZE },
    { status: 413 }
  );
}
```

---

## 0.4 — Add Unique Constraint on Internal BB Names

### Problem

Concurrent auto-seeding can create duplicate internal BaleyBots within a workspace since there's no unique constraint on `(workspaceId, name)` for internal BBs.

### Fix

**File:** `packages/db/src/schema.ts`

Add a partial unique index to the `baleybots` table:

```typescript
uniqueIndex('baleybots_workspace_name_internal_idx')
  .on(table.workspaceId, table.name)
  .where(sql`${table.isInternal} = true`)
```

This prevents duplicate internal BB names within a workspace. User-created BBs are not affected.

---

## 0.5 — Log Decryption Failures

### Problem

`decryptMaybe()` silently returns the encrypted value when decryption fails. This means BBs attempt to use encrypted text as an API key, producing confusing "invalid API key" errors.

### Fix

**File:** `apps/web/src/lib/baleybot/services/ai-credentials-service.ts`

Add warning log when decryption fails:

```typescript
export function decryptMaybe(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    return decrypt(value);
  } catch (error) {
    log.warn('Failed to decrypt credential value — returning raw value', {
      error: error instanceof Error ? error.message : String(error),
      valueLength: value.length,
    });
    return value;
  }
}
```

---

## 0.6 — Wrap Failure-Path Reschedule in Transaction

### Problem

When a scheduled task fails, the status update and reschedule happen as two separate DB operations. If the reschedule fails, the task is marked as failed but never rescheduled, causing recurring tasks to stop executing silently.

### Fix

**File:** `apps/web/src/app/api/cron/process-scheduled-tasks/route.ts`

Wrap the failure-path status update and reschedule in `withTransaction`:

```typescript
await withTransaction(async (tx) => {
  await tx
    .update(scheduledTasks)
    .set({
      status: task.cronExpression ? 'pending' : 'failed',
      lastRunAt: new Date(),
      lastRunStatus: 'failed',
      lastRunError: errorMessage,
      runCount: (task.runCount ?? 0) + 1,
    })
    .where(eq(scheduledTasks.id, task.id));

  if (task.cronExpression) {
    await rescheduleRecurringTask(task, tx);
  }
});
```

`rescheduleRecurringTask` already accepts an optional `tx` parameter.

---

## Verification

```bash
pnpm type-check    # No TypeScript errors
pnpm test          # All tests pass (including new Phase 0 tests)
pnpm lint          # No lint errors
pnpm db:push       # Push unique constraint to dev database
```

### Manual Testing

1. Soft-delete a trigger → verify it no longer appears in `triggers.list` or fires on BB completion
2. Send webhook with wrong secret → returns 401
3. Send webhook with body > 100KB → returns 413
4. Check logs after decryption failure → warning appears
5. Fail a scheduled task → verify status update + reschedule are atomic

---

## Files Modified

| Action | File |
|---|---|
| **Modify** | `apps/web/src/lib/baleybot/services/bb-completion-trigger-service.ts` |
| **Modify** | `apps/web/src/lib/trpc/routers/triggers.ts` |
| **Modify** | `apps/web/src/app/api/webhooks/baleybots/[workspaceId]/[baleybotId]/route.ts` |
| **Modify** | `packages/db/src/schema.ts` |
| **Modify** | `apps/web/src/lib/baleybot/services/ai-credentials-service.ts` |
| **Modify** | `apps/web/src/app/api/cron/process-scheduled-tasks/route.ts` |
| **Create** | `apps/web/src/lib/baleybot/services/__tests__/phase-0-security.test.ts` |
