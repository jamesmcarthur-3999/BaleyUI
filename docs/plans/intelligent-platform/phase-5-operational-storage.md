# Phase 5: Operational Storage

**Status:** Pending Review
**Dependencies:** None (5.5 needs Phase 1.2 shared context)
**Estimated Scope:** ~250 LOC across 6 files

## Overview

Wire up the existing operational storage service (469 LOC, fully implemented) so BBs can use dedicated database connections for storing execution results, analytics, and structured data.

**Existing code (DO NOT rebuild):**
- `apps/web/src/lib/baleybot/services/operational-storage-service.ts` — `getOperationalStorageService()`, full implementation

---

## 5.1 — Wire into Execute-Stream Route

### Current State

The operational storage service exists but is never called during BB execution.

### Integration

**File:** `apps/web/src/app/api/baleybots/[id]/execute-stream/route.ts` (or wherever the BB execution response is finalized)

After execution completes, persist results to the operational database if one is configured:

```typescript
import { getOperationalStorageService } from '@/lib/baleybot/services/operational-storage-service';

// After execution completes:
const opsService = await getOperationalStorageService(workspaceId);
if (opsService) {
  // Fire-and-forget — don't block the stream
  void opsService.storeExecutionResult(execution).catch(err => {
    logger.warn('Operational storage failed', { error: err.message });
  });
}
```

**Key:** This is fire-and-forget. If no operational DB is configured or the write fails, execution proceeds normally.

---

## 5.2 — `isOperational` Toggle in tRPC Router

### Current State

The `connections` table already has an `isOperational` boolean column (line 177 of schema.ts). Need to expose it in the connections tRPC router.

### Integration

**File:** `apps/web/src/lib/trpc/routers/connections.ts`

Add/verify these capabilities:
- `connections.update` should accept `isOperational` as an updatable field
- `connections.list` should return `isOperational` in the response
- Add validation: only database connections (`type: 'postgres' | 'mysql'`) can be marked as operational
- At most one connection per workspace can be `isOperational: true` (enforce on update)

---

## 5.3 — "Operational Database" Switch in Connection Settings UI

### Current State

Connection settings UI exists but doesn't expose the `isOperational` toggle.

### Integration

**Location:** Connection detail/edit form (wherever individual connection settings are rendered)

**UI:** For database connections only, add a toggle:

```
┌─────────────────────────────────────────────────────┐
│ Connection Settings: my-postgres-db                  │
│                                                      │
│ Type: PostgreSQL                                     │
│ Host: db.example.com                                 │
│ ...                                                  │
│                                                      │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 🗄️ Use as Operational Database          [  ON]  │ │
│ │ BaleyBots will store execution results and       │ │
│ │ analytics in this database automatically.        │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Behavior:**
- Only shown for `type: 'postgres' | 'mysql'`
- Toggling ON: shows confirmation dialog explaining what will be stored
- Toggling ON: calls `connections.update({ id, isOperational: true })`
- Backend enforces: if another connection was operational, it gets set to `false`

---

## 5.4 — MySQL Table Creation (Currently Stubbed)

### Current State

The operational storage service logs a warning for MySQL: `log.warn('MySQL operational storage not yet implemented')`.

### Implementation

**File:** `apps/web/src/lib/baleybot/services/operational-storage-service.ts`

Implement the MySQL equivalent of the PostgreSQL table creation logic:
- Create `bb_execution_results` table with the same columns
- Use MySQL-compatible DDL (e.g., `JSON` instead of `JSONB`, `AUTO_INCREMENT` instead of `SERIAL`)
- Implement `storeExecutionResult()` for MySQL connection type

**Table structure (MySQL):**
```sql
CREATE TABLE IF NOT EXISTS bb_execution_results (
  id CHAR(36) PRIMARY KEY,
  baleybot_id CHAR(36) NOT NULL,
  execution_id CHAR(36) NOT NULL,
  status VARCHAR(50) NOT NULL,
  input JSON,
  output JSON,
  error TEXT,
  duration_ms INT,
  token_count INT,
  model VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_baleybot (baleybot_id),
  INDEX idx_created (created_at)
);
```

---

## 5.5 — Creator BB Awareness via Shared Context

**Dependency:** Phase 1.2 (shared context table)

### Goal

When `creator_bot` creates a new BB, it should know about the operational storage capability if configured.

### Implementation

Add a shared context entry (auto-populated when operational storage is enabled):

```typescript
// When isOperational is toggled ON for a connection:
await db.insert(sharedContext).values({
  workspaceId,
  key: 'operational_storage',
  value: `This workspace has an operational database configured (${connectionType}). BaleyBots automatically store their execution results there. When creating BBs that need persistent data, mention this capability.`,
  category: 'domain_knowledge',
  isActive: true,
}).onConflictDoUpdate({
  target: [sharedContext.workspaceId, sharedContext.key],
  set: { value: /* updated value */, isActive: true },
});
```

This way, `creator_bot` (via the shared context injection from Phase 1.2) knows to mention operational storage when relevant.

---

## 5.6 — Usage Pricing Hooks

### Byte Tracking

**File:** Modify the operational storage service to track bytes written per execution.

```typescript
// After storing results:
const bytesWritten = JSON.stringify(result).length;
await db.insert(baleybotUsage).values({
  workspaceId,
  baleybotId,
  executionId,
  // ... existing fields ...
  // Add new field or use metadata:
  metadata: { operationalStorageBytes: bytesWritten },
});
```

### Billing Display

**File:** Add to the workspace settings or billing page (if it exists)

Show operational storage usage:
```
Operational Storage: 12.4 MB used this period
  └ 3,421 execution results stored
```

**Note:** Actual billing integration (Stripe metered usage) is deferred — this phase only tracks and displays usage.

---

## Verification

```bash
pnpm type-check
pnpm test
pnpm lint
```

### Manual Testing
1. Mark a PostgreSQL connection as operational
2. Execute a BB → check the operational DB for the `bb_execution_results` row
3. Toggle operational OFF → executions no longer write to external DB
4. Test with MySQL connection (if available)

## Files Modified

| Action | File |
|---|---|
| **Modify** | `apps/web/src/app/api/baleybots/[id]/execute-stream/route.ts` — add operational storage hook |
| **Modify** | `apps/web/src/lib/trpc/routers/connections.ts` — expose isOperational toggle |
| **Modify** | Connection settings UI component — add operational database switch |
| **Modify** | `apps/web/src/lib/baleybot/services/operational-storage-service.ts` — MySQL implementation |
| **Modify** | `apps/web/src/lib/trpc/routers/connections.ts` — auto-create shared context on toggle |
| **Modify** | Usage/billing UI (if exists) — add storage usage display |
