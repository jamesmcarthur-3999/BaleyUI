# BaleyBot Complete Component Wiring Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire up ALL existing but unused BaleyBot components, services, and database tables to create a complete, functional system.

**Architecture:** Infrastructure exists but layers are disconnected. This plan connects:
- Database tables → tRPC routers (API exposure)
- tRPC routers → React components (data fetching)
- React components → Pages (user access)
- Services → Execution flow (trigger processing)

**Tech Stack:** Next.js 15, tRPC, React 19, Drizzle ORM, @baleyui/db

---

## Current State Summary

| Layer | Defined | Wired | Gap |
|-------|---------|-------|-----|
| Database Tables | 29 | 10 | **19 tables with no API** |
| tRPC Procedures | ~120 | ~50 | **~70 procedures missing** |
| React Components | 206 | 180 | **26 components never imported** |
| Service Functions | 40+ | 15 | **25+ functions never called** |

---

## Definition of Done

### Functional Requirements
- [ ] All built-in tools write to their database tables AND data is queryable via API
- [ ] BB completion chains fire automatically when source BB completes
- [ ] Users can configure triggers via UI without writing code
- [ ] Users can view/manage notifications, scheduled tasks, memory storage
- [ ] Visual editor provides bidirectional BAL ↔ visual editing
- [ ] Schema builder changes persist to BAL code
- [ ] All management actions (pause/delete/clone) accessible from list view

### Technical Requirements
- [ ] Every database table with user data has at least `list` and `get` tRPC procedures
- [ ] Every component in `/components/` is either imported OR explicitly marked deprecated
- [ ] Every service function is either called OR explicitly marked deprecated
- [ ] No console.log stubs replacing real functionality
- [ ] All builds pass: `pnpm build`
- [ ] All tests pass: `pnpm test`
- [ ] Type check passes: `pnpm type-check`

---

## Phase 1: Critical Infrastructure (Blocks Core Features)

### Task 1.1: Create Tools tRPC Router

**Why:** `tools` table exists with no API. Blocks tool management entirely.

**Files:**
- Create: `apps/web/src/lib/trpc/routers/tools.ts`
- Modify: `apps/web/src/lib/trpc/routers/index.ts`

**Step 1: Create tools router**

```typescript
/**
 * Tools Router - Workspace tool management
 */
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { db, tools, eq, and, notDeleted } from '@baleyui/db';

export const toolsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.query.tools.findMany({
      where: and(
        eq(tools.workspaceId, ctx.workspace.id),
        notDeleted(tools)
      ),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tool = await db.query.tools.findFirst({
        where: and(
          eq(tools.id, input.id),
          eq(tools.workspaceId, ctx.workspace.id),
          notDeleted(tools)
        ),
      });
      if (!tool) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tool not found' });
      }
      return tool;
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      description: z.string(),
      inputSchema: z.record(z.unknown()),
      code: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [tool] = await db.insert(tools).values({
        workspaceId: ctx.workspace.id,
        ...input,
      }).returning();
      return tool;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(100).optional(),
      description: z.string().optional(),
      inputSchema: z.record(z.unknown()).optional(),
      code: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [tool] = await db.update(tools)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(
          eq(tools.id, id),
          eq(tools.workspaceId, ctx.workspace.id)
        ))
        .returning();
      return tool;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(tools)
        .set({ deletedAt: new Date() })
        .where(and(
          eq(tools.id, input.id),
          eq(tools.workspaceId, ctx.workspace.id)
        ));
      return { success: true };
    }),
});
```

**Step 2: Register in index.ts**

Add import and registration.

**Step 3: Verify**

```bash
cd apps/web && pnpm type-check && pnpm build
```

**Step 4: Commit**

```bash
git add apps/web/src/lib/trpc/routers/tools.ts apps/web/src/lib/trpc/routers/index.ts
git commit -m "feat(tools): create tRPC router for workspace tools CRUD"
```

---

### Task 1.2: Create Triggers tRPC Router

**Why:** `baleybotTriggers` table and service exist but no API exposure.

**Files:**
- Create: `apps/web/src/lib/trpc/routers/triggers.ts`
- Modify: `apps/web/src/lib/trpc/routers/index.ts`

**Step 1: Create triggers router**

```typescript
/**
 * Triggers Router - BB completion chain management
 */
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { db, baleybotTriggers, baleybots, eq, and, notDeleted } from '@baleyui/db';
import {
  createTrigger,
  deleteTrigger,
  enableTrigger,
  disableTrigger,
  getTriggersForSource,
} from '@/lib/baleybot/services/bb-completion-trigger-service';

export const triggersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.query.baleybotTriggers.findMany({
      where: eq(baleybotTriggers.workspaceId, ctx.workspace.id),
      with: {
        sourceBaleybot: { columns: { id: true, name: true } },
        targetBaleybot: { columns: { id: true, name: true } },
      },
    });
  }),

  getForSource: protectedProcedure
    .input(z.object({ sourceBaleybotId: z.string().uuid() }))
    .query(async ({ input }) => {
      return getTriggersForSource(input.sourceBaleybotId);
    }),

  getForTarget: protectedProcedure
    .input(z.object({ targetBaleybotId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return db.query.baleybotTriggers.findMany({
        where: and(
          eq(baleybotTriggers.targetBaleybotId, input.targetBaleybotId),
          eq(baleybotTriggers.workspaceId, ctx.workspace.id)
        ),
        with: {
          sourceBaleybot: { columns: { id: true, name: true } },
        },
      });
    }),

  create: protectedProcedure
    .input(z.object({
      sourceBaleybotId: z.string().uuid(),
      targetBaleybotId: z.string().uuid(),
      triggerType: z.enum(['completion', 'success', 'failure']),
      inputMapping: z.record(z.string()).optional(),
      staticInput: z.record(z.unknown()).optional(),
      condition: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify both BBs belong to workspace
      const [sourceBB, targetBB] = await Promise.all([
        db.query.baleybots.findFirst({
          where: and(eq(baleybots.id, input.sourceBaleybotId), eq(baleybots.workspaceId, ctx.workspace.id), notDeleted(baleybots)),
        }),
        db.query.baleybots.findFirst({
          where: and(eq(baleybots.id, input.targetBaleybotId), eq(baleybots.workspaceId, ctx.workspace.id), notDeleted(baleybots)),
        }),
      ]);

      if (!sourceBB || !targetBB) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Source or target BaleyBot not found' });
      }

      if (input.sourceBaleybotId === input.targetBaleybotId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'A BaleyBot cannot trigger itself' });
      }

      const triggerId = await createTrigger(ctx.workspace.id, input.sourceBaleybotId, input.targetBaleybotId, {
        triggerType: input.triggerType,
        inputMapping: input.inputMapping,
        staticInput: input.staticInput,
        condition: input.condition,
      });

      return { id: triggerId };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const trigger = await db.query.baleybotTriggers.findFirst({
        where: and(eq(baleybotTriggers.id, input.id), eq(baleybotTriggers.workspaceId, ctx.workspace.id)),
      });
      if (!trigger) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Trigger not found' });
      }
      await deleteTrigger(input.id);
      return { success: true };
    }),

  enable: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const trigger = await db.query.baleybotTriggers.findFirst({
        where: and(eq(baleybotTriggers.id, input.id), eq(baleybotTriggers.workspaceId, ctx.workspace.id)),
      });
      if (!trigger) throw new TRPCError({ code: 'NOT_FOUND' });
      await enableTrigger(input.id);
      return { success: true };
    }),

  disable: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const trigger = await db.query.baleybotTriggers.findFirst({
        where: and(eq(baleybotTriggers.id, input.id), eq(baleybotTriggers.workspaceId, ctx.workspace.id)),
      });
      if (!trigger) throw new TRPCError({ code: 'NOT_FOUND' });
      await disableTrigger(input.id);
      return { success: true };
    }),
});
```

**Step 2: Register in index.ts**

**Step 3: Verify & Commit**

---

### Task 1.3: Wire processBBCompletion to Execution Flow

**Why:** Triggers never fire because `processBBCompletion()` is never called.

**Files:**
- Modify: `apps/web/src/app/api/baleybots/[id]/execute-stream/route.ts`
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts`

**Step 1: Import in execute-stream route**

```typescript
import { processBBCompletion } from '@/lib/baleybot/services/bb-completion-trigger-service';
```

**Step 2: Call after execution completes (around line 340)**

After updating execution record:
```typescript
// Process downstream BB triggers
if (finalStatus === 'completed' || finalStatus === 'failed') {
  processBBCompletion({
    sourceBaleybotId: baleybotId,
    executionId: execution.id,
    status: finalStatus === 'completed' ? 'completed' : 'failed',
    output,
  }).catch((err) => {
    log.error('Failed to process BB completion triggers', err);
  });
}
```

**Step 3: Also add to baleybots.ts execute mutation**

Same pattern in the tRPC execute mutation.

**Step 4: Verify & Commit**

---

## Phase 2: Wire Visual Editor & Triggers UI

### Task 2.1: Integrate VisualEditor into BaleyBot Page

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Step 1: Add import**

```typescript
import { VisualEditor } from '@/components/visual-editor';
```

**Step 2: Replace Canvas with VisualEditor in visual mode (around line 1018)**

```typescript
{viewMode === 'visual' && (
  <div className="flex-1 min-h-0">
    <VisualEditor
      balCode={balCode}
      onChange={handleCodeChange}
      readOnly={status === 'building' || status === 'running'}
      className="h-full"
    />
  </div>
)}
```

**Step 3: Verify & Commit**

---

### Task 2.2: Add Triggers Tab with TriggerConfig

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Step 1: Import TriggerConfig and update ViewMode**

```typescript
import { TriggerConfig } from '@/components/baleybots';
import { Zap } from 'lucide-react';

type ViewMode = 'conversation' | 'visual' | 'code' | 'schema' | 'triggers';
```

**Step 2: Add state for trigger config**

```typescript
const [triggerConfig, setTriggerConfig] = useState<TriggerConfigType | undefined>(undefined);
```

**Step 3: Add query for available BBs**

```typescript
const { data: availableBBs } = trpc.baleybots.list.useQuery(
  { limit: 100 },
  { enabled: viewMode === 'triggers' }
);
```

**Step 4: Add Triggers TabsTrigger**

```typescript
<TabsTrigger value="triggers" className="gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
  <Zap className="h-3.5 w-3.5" />
  <span className="hidden sm:inline">Triggers</span>
</TabsTrigger>
```

**Step 5: Add Triggers panel content**

```typescript
{viewMode === 'triggers' && (
  <div className="flex-1 p-6 overflow-y-auto">
    <div className="max-w-2xl mx-auto">
      <h3 className="text-lg font-semibold mb-4">Trigger Configuration</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Configure when this BaleyBot should automatically execute.
      </p>
      <TriggerConfig
        value={triggerConfig}
        onChange={setTriggerConfig}
        availableBaleybots={availableBBs?.items
          ?.filter((bb) => bb.id !== params.id)
          .map((bb) => ({ id: bb.id, name: bb.name })) || []}
      />
    </div>
  </div>
)}
```

**Step 6: Verify & Commit**

---

### Task 2.3: Fix Schema Builder Integration

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Step 1: Replace orphaned handleSchemaChange (around line 594)**

```typescript
const handleSchemaChange = (newSchema: Record<string, string>) => {
  setOutputSchema(newSchema);

  if (Object.keys(newSchema).length > 0) {
    const updatedCode = schemaFieldsToBAL(balCode, newSchema);
    if (updatedCode !== balCode) {
      setBalCode(updatedCode);
      pushHistory({ entities, connections, balCode: updatedCode, name, icon }, 'Schema update');
    }
  }
};
```

**Step 2: Verify & Commit**

---

## Phase 3: Create Missing Routers for Built-in Tool Data

### Task 3.1: Create Notifications Router

**Why:** `send_notification` tool writes to `notifications` table but users can't view them.

**Files:**
- Create: `apps/web/src/lib/trpc/routers/notifications.ts`

```typescript
export const notificationsRouter = router({
  list: protectedProcedure
    .input(z.object({
      unreadOnly: z.boolean().optional(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      // Query notifications for the user
      return db.query.notifications.findMany({
        where: and(
          eq(notifications.userId, ctx.userId!),
          input.unreadOnly ? isNull(notifications.readAt) : undefined
        ),
        orderBy: (n, { desc }) => [desc(n.createdAt)],
        limit: input.limit,
      });
    }),

  markRead: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(notifications)
        .set({ readAt: new Date() })
        .where(and(
          eq(notifications.id, input.id),
          eq(notifications.userId, ctx.userId!)
        ));
      return { success: true };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await db.update(notifications)
      .set({ readAt: new Date() })
      .where(and(
        eq(notifications.userId, ctx.userId!),
        isNull(notifications.readAt)
      ));
    return { success: true };
  }),

  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(
        eq(notifications.userId, ctx.userId!),
        isNull(notifications.readAt)
      ));
    return result[0]?.count ?? 0;
  }),
});
```

**Step 2: Register & Commit**

---

### Task 3.2: Create Scheduled Tasks Router

**Why:** `schedule_task` tool creates tasks but users can't view/manage them.

**Files:**
- Create: `apps/web/src/lib/trpc/routers/scheduled-tasks.ts`

```typescript
export const scheduledTasksRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.query.scheduledTasks.findMany({
      where: eq(scheduledTasks.workspaceId, ctx.workspace.id),
      with: {
        baleybot: { columns: { id: true, name: true } },
      },
      orderBy: (t, { asc }) => [asc(t.runAt)],
    });
  }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(scheduledTasks)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(and(
          eq(scheduledTasks.id, input.id),
          eq(scheduledTasks.workspaceId, ctx.workspace.id),
          eq(scheduledTasks.status, 'pending')
        ));
      return { success: true };
    }),

  reschedule: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      runAt: z.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.update(scheduledTasks)
        .set({ runAt: input.runAt, updatedAt: new Date() })
        .where(and(
          eq(scheduledTasks.id, input.id),
          eq(scheduledTasks.workspaceId, ctx.workspace.id),
          eq(scheduledTasks.status, 'pending')
        ));
      return { success: true };
    }),
});
```

---

### Task 3.3: Create Memory Router

**Why:** `store_memory` tool writes to `baleybotMemory` but data is never queryable.

**Files:**
- Create: `apps/web/src/lib/trpc/routers/memory.ts`

```typescript
export const memoryRouter = router({
  listForBaleybot: protectedProcedure
    .input(z.object({ baleybotId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify BB belongs to workspace
      const bb = await db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.baleybotId),
          eq(baleybots.workspaceId, ctx.workspace.id)
        ),
      });
      if (!bb) throw new TRPCError({ code: 'NOT_FOUND' });

      return db.query.baleybotMemory.findMany({
        where: eq(baleybotMemory.baleybotId, input.baleybotId),
        orderBy: (m, { desc }) => [desc(m.updatedAt)],
      });
    }),

  get: protectedProcedure
    .input(z.object({ baleybotId: z.string().uuid(), key: z.string() }))
    .query(async ({ ctx, input }) => {
      return db.query.baleybotMemory.findFirst({
        where: and(
          eq(baleybotMemory.baleybotId, input.baleybotId),
          eq(baleybotMemory.key, input.key)
        ),
      });
    }),

  delete: protectedProcedure
    .input(z.object({ baleybotId: z.string().uuid(), key: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(baleybotMemory)
        .where(and(
          eq(baleybotMemory.baleybotId, input.baleybotId),
          eq(baleybotMemory.key, input.key)
        ));
      return { success: true };
    }),

  clear: protectedProcedure
    .input(z.object({ baleybotId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(baleybotMemory)
        .where(eq(baleybotMemory.baleybotId, input.baleybotId));
      return { success: true };
    }),
});
```

---

## Phase 4: Create Missing Pages

### Task 4.1: Create Tools Management Page

**Files:**
- Create: `apps/web/src/app/dashboard/tools/page.tsx`

Wire `WorkspaceToolsList` component to the tools router.

---

### Task 4.2: Create Notifications Page

**Files:**
- Create: `apps/web/src/app/dashboard/notifications/page.tsx`

Simple list of notifications with mark-read functionality.

---

### Task 4.3: Create Scheduled Tasks Page

**Files:**
- Create: `apps/web/src/app/dashboard/scheduled-tasks/page.tsx`

List pending/completed tasks with cancel/reschedule actions.

---

### Task 4.4: Fix Connections Page

**Why:** Route exists but has no page.tsx - only error.tsx and loading.tsx

**Files:**
- Create: `apps/web/src/app/dashboard/connections/page.tsx`

Wire existing connections router and components.

---

## Phase 5: Wire Management Actions to List View

### Task 5.1: Add Actions Dropdown to BaleybotCard

**Files:**
- Modify: `apps/web/src/components/baleybots/BaleybotCard.tsx`
- Modify: `apps/web/src/app/dashboard/baleybots/page.tsx`

Add dropdown with: Execute, Pause, Activate, Delete, Duplicate actions.

---

### Task 5.2: Wire Trigger Display to BaleybotCard

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/page.tsx`

Query triggers for each BB and pass to card for TriggerBadge display.

---

## Phase 6: Audit & Cleanup

### Task 6.1: Remove or Wire Companion Components

**Why:** 6 complete components never used. Either wire them or remove.

**Decision needed:** Keep or deprecate?

If keeping:
- Create `/dashboard/companion` page
- Wire CompanionContainer, ChatMode, OrbMode, etc.

If removing:
- Delete `apps/web/src/components/companion/` folder
- Remove from git

---

### Task 6.2: Consolidate Analytics Components

**Why:** Duplicate components (MetricCard vs analytics/MetricCard)

- Remove unused duplicates
- Keep consistent naming

---

### Task 6.3: Wire or Remove Output Templates

**Why:** DashboardTemplate and ReportTemplate never used

**Decision needed:** Keep for dynamic output rendering or remove?

---

## Verification Checklist

### Phase 1 Verification
- [ ] `pnpm trpc:generate` succeeds with new routers
- [ ] Can call `trpc.tools.list` from browser console
- [ ] Can call `trpc.triggers.create` to make BB chain
- [ ] Executing BB A triggers BB B automatically

### Phase 2 Verification
- [ ] Visual tab shows ClusterDiagram with clickable nodes
- [ ] Clicking node opens NodeEditor panel
- [ ] Changes in NodeEditor update BAL code
- [ ] Triggers tab shows TriggerConfig form
- [ ] Schema tab changes persist to BAL code

### Phase 3 Verification
- [ ] Notifications: `send_notification` tool → appears in notifications.list
- [ ] Scheduled Tasks: `schedule_task` tool → appears in scheduledTasks.list
- [ ] Memory: `store_memory` tool → appears in memory.listForBaleybot

### Phase 4 Verification
- [ ] `/dashboard/tools` page loads and lists workspace tools
- [ ] `/dashboard/notifications` page shows notification list
- [ ] `/dashboard/scheduled-tasks` page shows task list
- [ ] `/dashboard/connections` page loads (was broken)

### Phase 5 Verification
- [ ] BaleybotCard has working dropdown menu
- [ ] Can pause/activate/delete from list view
- [ ] Trigger badge shows on BBs with triggers

### Final Audit
- [ ] No unused components in `/components/` (all imported or deleted)
- [ ] No orphaned console.log replacing functionality
- [ ] All database tables have at least list/get endpoints
- [ ] `pnpm build` passes
- [ ] `pnpm test` passes
- [ ] `pnpm type-check` passes

---

## Summary of All Changes

| Phase | Tasks | New Files | Modified Files |
|-------|-------|-----------|----------------|
| 1 | 3 | 2 routers | 2 files (execution flow) |
| 2 | 3 | 0 | 1 page (baleybot detail) |
| 3 | 3 | 3 routers | 1 file (index.ts) |
| 4 | 4 | 4 pages | 0 |
| 5 | 2 | 0 | 2 components |
| 6 | 3 | 0 | TBD (cleanup) |

**Total: 18 tasks across 6 phases**

---

## Test Plan

After all phases complete:

1. **End-to-End BB Chain Test**
   - Create BB "Greeter" that says hello
   - Create BB "Responder" that responds to greeting
   - Configure Responder to trigger on Greeter completion
   - Execute Greeter
   - Verify Responder auto-executes
   - Check Activity page shows both executions linked

2. **Visual Editor Test**
   - Create new BB via conversation
   - Switch to Visual tab
   - Click a node, edit its goal
   - Switch to Code tab - verify BAL updated
   - Save and reload - verify changes persist

3. **Built-in Tools Data Flow Test**
   - Create BB that uses `store_memory`, `send_notification`, `schedule_task`
   - Execute it
   - Verify data appears in:
     - `/dashboard/baleybots/[id]` → Memory tab
     - `/dashboard/notifications`
     - `/dashboard/scheduled-tasks`

4. **Management Actions Test**
   - From BB list, use dropdown to pause a BB
   - Verify status changes
   - Try to execute paused BB - should fail
   - Activate BB
   - Delete BB - should soft delete

---

## Execution Instructions

1. Open new terminal in worktree or create fresh branch
2. Run: `pnpm install`
3. Run: `pnpm dev` (keep running for testing)
4. Execute plan task by task
5. After each phase, run verification checklist
6. At end, run full test plan
7. Commit with descriptive messages
8. Create PR when all verifications pass
