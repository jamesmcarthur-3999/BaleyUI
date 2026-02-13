# Phase 1: Foundation — Recommendations DB + Shared Context

**Status:** Pending Review
**Dependencies:** None
**Estimated Scope:** ~400 LOC across 6 files

## Overview

Create the two foundational data layers that nearly every subsequent phase depends on:
1. A `recommendations` table for storing BB-generated insights, proposed fixes, and user decisions
2. A `sharedContext` table for editable knowledge that all BBs share
3. Delete the build supervisor stub (unsalvageable `@ts-nocheck` code)

---

## 1.1 — Recommendations Table + tRPC Router

### Database Schema

Add to `packages/db/src/schema.ts`:

```typescript
export const recommendations = pgTable(
  'recommendations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),

    // Source tracking
    sourceType: varchar('source_type', { length: 50 }).notNull(),
      // 'pattern_learner' | 'execution_reviewer' | 'analytics_interpreter' | 'manual'
    sourceBaleybotId: uuid('source_baleybot_id')
      .references(() => baleybots.id, { onDelete: 'set null' }),
    sourceExecutionId: uuid('source_execution_id')
      .references(() => baleybotExecutions.id, { onDelete: 'set null' }),

    // Target (what this recommendation is about)
    targetBaleybotId: uuid('target_baleybot_id')
      .references(() => baleybots.id, { onDelete: 'cascade' }),
    targetType: varchar('target_type', { length: 50 }).notNull(),
      // 'approval_pattern' | 'bal_patch' | 'configuration' | 'insight' | 'performance'

    // Content
    title: varchar('title', { length: 500 }).notNull(),
    description: text('description').notNull(),
    severity: varchar('severity', { length: 20 }).notNull().default('info'),
      // 'info' | 'warning' | 'critical'

    // Proposed action (JSON — shape depends on targetType)
    proposedAction: jsonb('proposed_action'),
      // For 'approval_pattern': { tool, actionPattern, entityGoalPattern }
      // For 'bal_patch': { currentCode, proposedCode, diff }
      // For 'configuration': { key, currentValue, proposedValue }
      // For 'insight': null (informational only)

    // User decision
    status: varchar('status', { length: 20 }).notNull().default('pending'),
      // 'pending' | 'accepted' | 'rejected' | 'applied' | 'dismissed'
    decidedBy: varchar('decided_by', { length: 255 }),
    decidedAt: timestamp('decided_at'),
    decisionNote: text('decision_note'),

    // Metadata
    confidence: doublePrecision('confidence'), // 0-1, from the source BB
    metadata: jsonb('metadata'), // Source-specific extra data

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('recommendations_workspace_idx').on(table.workspaceId),
    index('recommendations_status_idx').on(table.status),
    index('recommendations_target_bb_idx').on(table.targetBaleybotId),
    index('recommendations_source_type_idx').on(table.sourceType),
    index('recommendations_ws_status_idx').on(table.workspaceId, table.status),
    index('recommendations_created_idx').on(table.createdAt),
  ]
);
```

### Relations

```typescript
export const recommendationsRelations = relations(recommendations, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [recommendations.workspaceId],
    references: [workspaces.id],
  }),
  sourceBaleybot: one(baleybots, {
    fields: [recommendations.sourceBaleybotId],
    references: [baleybots.id],
    relationName: 'recommendationSource',
  }),
  targetBaleybot: one(baleybots, {
    fields: [recommendations.targetBaleybotId],
    references: [baleybots.id],
    relationName: 'recommendationTarget',
  }),
}));
```

Also add to `baleybotsRelations`:
```typescript
recommendationsReceived: many(recommendations, { relationName: 'recommendationTarget' }),
```

And to `workspacesRelations`:
```typescript
recommendations: many(recommendations),
```

### tRPC Router

Create `apps/web/src/lib/trpc/routers/recommendations.ts`:

```typescript
// Procedures:
// - list: paginated, filterable by status/sourceType/targetBaleybotId/severity
// - getById: single recommendation with full details
// - accept: sets status='accepted', runs apply logic based on targetType
// - reject: sets status='rejected' with optional decisionNote
// - dismiss: sets status='dismissed' (acknowledge without acting)
// - apply: for 'bal_patch' type — applies the proposed BAL code change
// - counts: returns { pending, accepted, rejected, applied } counts for workspace
```

**Key `accept` logic by `targetType`:**

| targetType | On Accept |
|---|---|
| `approval_pattern` | Insert row into `approvalPatterns` table |
| `bal_patch` | Update BB's `balCode` via `updateWithLock()` |
| `configuration` | Apply config change (depends on `proposedAction.key`) |
| `insight` | Just mark accepted (informational) |
| `performance` | Just mark accepted (informational) |

Register in `apps/web/src/lib/trpc/routers/index.ts`.

### Export from `@baleyui/db`

Add `recommendations` to `packages/db/src/index.ts` re-exports (automatic via `* from './schema'`).

---

## 1.2 — Shared Context Table + Admin UI

### Database Schema

Add to `packages/db/src/schema.ts`:

```typescript
export const sharedContext = pgTable(
  'shared_context',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),

    // Content
    key: varchar('key', { length: 255 }).notNull(),
    value: text('value').notNull(),
    description: text('description'), // Human-readable explanation of this context entry

    // Categorization
    category: varchar('category', { length: 100 }).default('general'),
      // 'general' | 'domain_knowledge' | 'coding_standards' | 'safety_rules' | 'brand_voice'

    // Status
    isActive: boolean('is_active').default(true).notNull(),

    // Audit
    createdBy: varchar('created_by', { length: 255 }),
    updatedBy: varchar('updated_by', { length: 255 }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('shared_context_ws_key_idx').on(table.workspaceId, table.key),
    index('shared_context_workspace_idx').on(table.workspaceId),
    index('shared_context_category_idx').on(table.category),
    index('shared_context_active_idx').on(table.isActive),
  ]
);
```

### tRPC Router

Create `apps/web/src/lib/trpc/routers/shared-context.ts`:

```typescript
// Procedures:
// - list: all active context entries for workspace, grouped by category
// - create: add new context entry (admin only)
// - update: edit value/description/category (admin only)
// - delete: remove entry (admin only)
// - getForExecution: returns all active entries as a formatted string for BB system prompts
```

### Admin UI Page

Create `apps/web/src/app/dashboard/admin/shared-context/page.tsx`:

- Table of all shared context entries, grouped by category
- Inline editing for value and description fields
- Add new entry form (key, value, description, category dropdown)
- Delete with confirmation
- Only accessible to workspace admins (check role from `workspaceMembers`)

### Integration with BB Execution

In `apps/web/src/lib/baleybot/executor.ts`, when building the system prompt for any BB execution:

```typescript
// Fetch shared context and append to system prompt
const sharedContextEntries = await trpc.sharedContext.getForExecution({ workspaceId });
if (sharedContextEntries.length > 0) {
  systemPrompt += '\n\n## Shared Knowledge\n' + sharedContextEntries;
}
```

---

## 1.3 — Delete Build Supervisor Stub

### Files to Delete

| File | Reason |
|---|---|
| `apps/web/src/lib/baleybot/build/supervisor.ts` | `@ts-nocheck`, references 9+ non-existent DB tables, 0% functional |
| `apps/web/src/lib/baleybot/build/__tests__/supervisor.integration.test.ts` | Tests for deleted code |
| `apps/web/src/lib/baleybot/build/types.ts` | Types only used by supervisor (verify no other importers first) |
| `apps/web/src/lib/baleybot/bal-capabilities.ts` | Stub that says "used by build/supervisor.ts" |

### Files to Clean Up

- `apps/web/src/lib/baleybot/creator-pipeline-adapter.ts` — remove any `supervisor` or `queueBuildValidationSafely` references
- Any other imports of the deleted files (grep for `build/supervisor`, `bal-capabilities`, `build/types`)

---

## Verification

```bash
pnpm type-check    # No TS errors (supervisor was @ts-nocheck anyway)
pnpm test          # All existing tests pass
pnpm lint          # No lint errors
pnpm db:push       # Push new tables to dev database
```

## Files Created/Modified

| Action | File |
|---|---|
| **Modify** | `packages/db/src/schema.ts` — add `recommendations` + `sharedContext` tables + relations |
| **Create** | `apps/web/src/lib/trpc/routers/recommendations.ts` |
| **Create** | `apps/web/src/lib/trpc/routers/shared-context.ts` |
| **Modify** | `apps/web/src/lib/trpc/routers/index.ts` — register new routers |
| **Create** | `apps/web/src/app/dashboard/admin/shared-context/page.tsx` |
| **Modify** | `apps/web/src/lib/baleybot/executor.ts` — inject shared context into system prompt |
| **Delete** | `apps/web/src/lib/baleybot/build/supervisor.ts` |
| **Delete** | `apps/web/src/lib/baleybot/build/__tests__/supervisor.integration.test.ts` |
| **Delete** | `apps/web/src/lib/baleybot/build/types.ts` (if solely used by supervisor) |
| **Delete** | `apps/web/src/lib/baleybot/bal-capabilities.ts` |
| **Modify** | `apps/web/src/lib/baleybot/creator-pipeline-adapter.ts` — remove supervisor refs |
