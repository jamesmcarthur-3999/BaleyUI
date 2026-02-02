# BaleyUI Implementation Roadmap

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Execute ALL phases continuously without stopping for review between phases.

**Goal:** Transform BaleyUI from its current state into the vision defined in `2026-01-30-architecture-and-vision-design.md` — a fully event-sourced, dual-path AI platform with invisible UI and ambient AI companion.

**Architecture:** Full event-sourcing with tRPC commands, hybrid builder views (Profile, Flow, Timeline), AI companion as ambient presence, and subscription-gated UI tiers.

**Tech Stack:** Next.js 15, React 19, TypeScript, tRPC, Drizzle ORM, PostgreSQL, BaleyBots, Zustand, SSE

**Working Directory:** `/Users/jamesmcarthur/Documents/GitHub/BaleyUI`

**Execution Mode:** Full autonomous execution of all phases. Commit after each task. Continue through all phases without pausing.

---

## Implementation Phases Overview

| Phase | Focus | Duration | Dependencies |
|-------|-------|----------|--------------|
| **Phase 0** | Type Safety & Foundation Fixes | 1 week | None |
| **Phase 1** | Event-Sourcing Infrastructure | 2 weeks | Phase 0 |
| **Phase 2** | Builder View System | 2 weeks | Phase 1 |
| **Phase 3** | Output System | 2 weeks | Phase 1 |
| **Phase 4** | AI Companion | 2 weeks | Phase 2, 3 |
| **Phase 5** | Onboarding Agent | 1 week | Phase 4 |
| **Phase 6** | Polish & Integration | 1 week | All |

**Total Estimated Duration:** 11 weeks

---

## Phase 0: Type Safety & Foundation Fixes

**Goal:** Fix critical type issues and establish baseline code quality before architectural changes.

**Reference:** AUDIT_REPORT.md, IMPROVEMENT_TASKS.md

---

### Task 0.1: Fix CompiledNode Type Mismatch

**Files:**
- Modify: `/apps/web/src/lib/execution/types.ts:189-195`
- Modify: `/apps/web/src/lib/execution/flow-executor.ts` (usages)

**Step 1: Read and understand current type**

```bash
grep -n "incomingEdges\|outgoingEdges" apps/web/src/lib/execution/types.ts
grep -n "incomingEdges\|outgoingEdges" apps/web/src/lib/execution/flow-executor.ts
```

**Step 2: Update CompiledNode type definition**

```typescript
// In types.ts - Update CompiledNode interface
export interface CompiledNode {
  id: string;
  type: NodeType;
  data: NodeData;
  incomingEdges: Array<{ sourceId: string; sourceHandle?: string }>;
  outgoingEdges: Array<{ targetId: string; targetHandle?: string }>;
}
```

**Step 3: Run TypeScript to verify no new errors**

```bash
cd apps/web && pnpm tsc --noEmit
```

Expected: No errors related to CompiledNode

**Step 4: Commit**

```bash
git add apps/web/src/lib/execution/types.ts
git commit -m "fix: correct CompiledNode edge types to match actual usage"
```

---

### Task 0.2: Replace `any` Types in Blocks Router

**Files:**
- Modify: `/apps/web/src/lib/trpc/routers/blocks.ts`

**Step 1: Identify all `any` usages**

```bash
grep -n ": any" apps/web/src/lib/trpc/routers/blocks.ts
```

**Step 2: Replace `any[]` for blockTools (line ~56)**

```typescript
// Before
let blockTools: any[] = [];

// After
import { type tools } from '@baleyui/db';
type Tool = typeof tools.$inferSelect;
let blockTools: Tool[] = [];
```

**Step 3: Replace `any` for updateData (line ~258)**

```typescript
// Before
const updateData: any = {};

// After
import { type blocks } from '@baleyui/db';
type BlockUpdate = Partial<typeof blocks.$inferInsert>;
const updateData: BlockUpdate = {};
```

**Step 4: Run TypeScript check**

```bash
cd apps/web && pnpm tsc --noEmit
```

**Step 5: Commit**

```bash
git add apps/web/src/lib/trpc/routers/blocks.ts
git commit -m "fix: replace any types with proper types in blocks router"
```

---

### Task 0.3: Replace `any` Types in BlockEditor

**Files:**
- Modify: `/apps/web/src/components/blocks/BlockEditor.tsx`

**Step 1: Identify `any` usages**

```bash
grep -n ": any\|as any" apps/web/src/components/blocks/BlockEditor.tsx
```

**Step 2: Create Block type and update state**

```typescript
// Add proper type import
import { type Block } from '@/lib/types';

// Replace any with Block type
const [block, setBlock] = useState<Block>(initialBlock);
```

**Step 3: Type the onChange handlers properly**

```typescript
// Type event handlers
const handleGoalChange = (goal: string) => {
  setBlock(prev => ({ ...prev, goal }));
};

const handleModelChange = (model: string) => {
  setBlock(prev => ({ ...prev, model }));
};
```

**Step 4: Run TypeScript check**

```bash
cd apps/web && pnpm tsc --noEmit
```

**Step 5: Commit**

```bash
git add apps/web/src/components/blocks/BlockEditor.tsx
git commit -m "fix: replace any types with proper types in BlockEditor"
```

---

### Task 0.4: Add Stricter ESLint Rules

**Files:**
- Modify: `/apps/web/eslint.config.js`

**Step 1: Add TypeScript-ESLint strict rules**

```javascript
// Add to eslint.config.js rules section
{
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'warn',
    '@typescript-eslint/no-unsafe-member-access': 'warn',
    '@typescript-eslint/no-unsafe-call': 'warn',
    '@typescript-eslint/no-unsafe-return': 'warn',
  }
}
```

**Step 2: Run ESLint to see current violations**

```bash
cd apps/web && pnpm eslint src --ext .ts,.tsx --max-warnings 0 2>&1 | head -100
```

**Step 3: Create tracking issue for remaining violations**

Document violations in `IMPROVEMENT_TASKS.md` under a new "ESLint Violations" section.

**Step 4: Commit**

```bash
git add apps/web/eslint.config.js IMPROVEMENT_TASKS.md
git commit -m "chore: add stricter ESLint rules for type safety"
```

---

### Task 0.5: Add LICENSE File

**Files:**
- Create: `/LICENSE`

**Step 1: Create MIT License file**

```
MIT License

Copyright (c) 2026 James McArthur

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Step 2: Commit**

```bash
git add LICENSE
git commit -m "chore: add MIT LICENSE file"
```

---

## Phase 1: Event-Sourcing Infrastructure

**Goal:** Implement the event-sourcing foundation that enables "watch AI build," undo/redo, and time-travel.

---

### Task 1.1: Define Builder Event Schema

**Files:**
- Create: `/apps/web/src/lib/events/types.ts`
- Create: `/apps/web/src/lib/events/schema.ts`

**Step 1: Write failing test**

```typescript
// tests/lib/events/types.test.ts
import { describe, it, expect } from 'vitest';
import { type BuilderEvent, isBuilderEvent } from '@/lib/events/types';

describe('BuilderEvent', () => {
  it('validates BlockCreated event', () => {
    const event: BuilderEvent = {
      type: 'BlockCreated',
      id: 'evt_123',
      timestamp: new Date(),
      actor: { type: 'user', userId: 'usr_123' },
      data: { blockId: 'blk_123', name: 'My Block', blockType: 'ai' }
    };
    expect(isBuilderEvent(event)).toBe(true);
  });

  it('validates AI actor events', () => {
    const event: BuilderEvent = {
      type: 'FlowNodeAdded',
      id: 'evt_124',
      timestamp: new Date(),
      actor: { type: 'ai-agent', agentId: 'agt_onboarding', agentName: 'Onboarding Assistant' },
      data: { flowId: 'flw_123', nodeId: 'nd_123', nodeType: 'ai-block' }
    };
    expect(isBuilderEvent(event)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run tests/lib/events/types.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement event types**

```typescript
// src/lib/events/types.ts
import { z } from 'zod';

// Actor types
export const UserActorSchema = z.object({
  type: z.literal('user'),
  userId: z.string(),
});

export const AIActorSchema = z.object({
  type: z.literal('ai-agent'),
  agentId: z.string(),
  agentName: z.string(),
});

export const SystemActorSchema = z.object({
  type: z.literal('system'),
  reason: z.string(),
});

export const ActorSchema = z.discriminatedUnion('type', [
  UserActorSchema,
  AIActorSchema,
  SystemActorSchema,
]);

export type Actor = z.infer<typeof ActorSchema>;

// Base event structure
export const BaseEventSchema = z.object({
  id: z.string(),
  timestamp: z.date(),
  actor: ActorSchema,
  workspaceId: z.string(),
  version: z.number().default(1),
});

// Block events
export const BlockCreatedSchema = BaseEventSchema.extend({
  type: z.literal('BlockCreated'),
  data: z.object({
    blockId: z.string(),
    name: z.string(),
    blockType: z.enum(['ai', 'function', 'router', 'pipeline', 'loop', 'parallel']),
  }),
});

export const BlockUpdatedSchema = BaseEventSchema.extend({
  type: z.literal('BlockUpdated'),
  data: z.object({
    blockId: z.string(),
    changes: z.record(z.unknown()),
    previousValues: z.record(z.unknown()).optional(),
  }),
});

export const BlockDeletedSchema = BaseEventSchema.extend({
  type: z.literal('BlockDeleted'),
  data: z.object({
    blockId: z.string(),
  }),
});

// Flow events
export const FlowCreatedSchema = BaseEventSchema.extend({
  type: z.literal('FlowCreated'),
  data: z.object({
    flowId: z.string(),
    name: z.string(),
  }),
});

export const FlowNodeAddedSchema = BaseEventSchema.extend({
  type: z.literal('FlowNodeAdded'),
  data: z.object({
    flowId: z.string(),
    nodeId: z.string(),
    nodeType: z.string(),
    position: z.object({ x: z.number(), y: z.number() }).optional(),
  }),
});

export const FlowNodeRemovedSchema = BaseEventSchema.extend({
  type: z.literal('FlowNodeRemoved'),
  data: z.object({
    flowId: z.string(),
    nodeId: z.string(),
  }),
});

export const FlowEdgeAddedSchema = BaseEventSchema.extend({
  type: z.literal('FlowEdgeAdded'),
  data: z.object({
    flowId: z.string(),
    edgeId: z.string(),
    sourceNodeId: z.string(),
    targetNodeId: z.string(),
    sourceHandle: z.string().optional(),
    targetHandle: z.string().optional(),
  }),
});

export const FlowEdgeRemovedSchema = BaseEventSchema.extend({
  type: z.literal('FlowEdgeRemoved'),
  data: z.object({
    flowId: z.string(),
    edgeId: z.string(),
  }),
});

// Connection events
export const ConnectionCreatedSchema = BaseEventSchema.extend({
  type: z.literal('ConnectionCreated'),
  data: z.object({
    connectionId: z.string(),
    provider: z.enum(['openai', 'anthropic', 'ollama', 'custom']),
    name: z.string(),
  }),
});

export const ConnectionTestedSchema = BaseEventSchema.extend({
  type: z.literal('ConnectionTested'),
  data: z.object({
    connectionId: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
  }),
});

// Union of all events
export const BuilderEventSchema = z.discriminatedUnion('type', [
  BlockCreatedSchema,
  BlockUpdatedSchema,
  BlockDeletedSchema,
  FlowCreatedSchema,
  FlowNodeAddedSchema,
  FlowNodeRemovedSchema,
  FlowEdgeAddedSchema,
  FlowEdgeRemovedSchema,
  ConnectionCreatedSchema,
  ConnectionTestedSchema,
]);

export type BuilderEvent = z.infer<typeof BuilderEventSchema>;

export function isBuilderEvent(event: unknown): event is BuilderEvent {
  return BuilderEventSchema.safeParse(event).success;
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm vitest run tests/lib/events/types.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/events/ apps/web/tests/lib/events/
git commit -m "feat: add builder event type definitions with Zod schemas"
```

---

### Task 1.2: Create Event Store Database Table

**Files:**
- Modify: `/packages/db/src/schema.ts`
- Create: Migration file

**Step 1: Add builderEvents table to schema**

```typescript
// Add to schema.ts
export const builderEvents = pgTable('builder_events', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  type: text('type').notNull(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  actor: jsonb('actor').notNull(), // { type, userId/agentId, ... }
  data: jsonb('data').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  version: integer('version').notNull().default(1),
  // For efficient querying
  entityType: text('entity_type'), // 'block', 'flow', 'connection'
  entityId: text('entity_id'),
  // Sequence for ordering
  sequenceNumber: serial('sequence_number'),
}, (table) => ({
  workspaceIdx: index('builder_events_workspace_idx').on(table.workspaceId),
  entityIdx: index('builder_events_entity_idx').on(table.entityType, table.entityId),
  timestampIdx: index('builder_events_timestamp_idx').on(table.timestamp),
  sequenceIdx: index('builder_events_sequence_idx').on(table.sequenceNumber),
}));

export const builderEventsRelations = relations(builderEvents, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [builderEvents.workspaceId],
    references: [workspaces.id],
  }),
}));
```

**Step 2: Generate and run migration**

```bash
cd packages/db && pnpm drizzle-kit generate
cd packages/db && pnpm drizzle-kit push
```

**Step 3: Verify table exists**

```bash
# Check migration was applied (via psql or db client)
```

**Step 4: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle/
git commit -m "feat: add builder_events table for event sourcing"
```

---

### Task 1.3: Implement Event Store Service

**Files:**
- Create: `/apps/web/src/lib/events/event-store.ts`
- Create: `/apps/web/tests/lib/events/event-store.test.ts`

**Step 1: Write failing test**

```typescript
// tests/lib/events/event-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { EventStore } from '@/lib/events/event-store';
import { type BuilderEvent } from '@/lib/events/types';

describe('EventStore', () => {
  let store: EventStore;

  beforeEach(() => {
    store = new EventStore(/* mock db */);
  });

  it('appends events and returns sequence number', async () => {
    const event: Omit<BuilderEvent, 'id' | 'timestamp'> = {
      type: 'BlockCreated',
      actor: { type: 'user', userId: 'usr_123' },
      workspaceId: 'ws_123',
      version: 1,
      data: { blockId: 'blk_123', name: 'Test', blockType: 'ai' },
    };

    const result = await store.append(event);
    expect(result.sequenceNumber).toBeGreaterThan(0);
    expect(result.id).toBeDefined();
  });

  it('retrieves events by entity', async () => {
    // Append some events first
    await store.append({
      type: 'BlockCreated',
      actor: { type: 'user', userId: 'usr_123' },
      workspaceId: 'ws_123',
      version: 1,
      data: { blockId: 'blk_123', name: 'Test', blockType: 'ai' },
    });

    const events = await store.getByEntity('block', 'blk_123');
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('BlockCreated');
  });

  it('retrieves events after sequence number', async () => {
    const first = await store.append({ /* ... */ });
    const second = await store.append({ /* ... */ });

    const events = await store.getAfterSequence('ws_123', first.sequenceNumber);
    expect(events.length).toBe(1);
    expect(events[0].sequenceNumber).toBe(second.sequenceNumber);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm vitest run tests/lib/events/event-store.test.ts
```

**Step 3: Implement EventStore**

```typescript
// src/lib/events/event-store.ts
import { db } from '@baleyui/db';
import { builderEvents } from '@baleyui/db/schema';
import { eq, and, gt, desc, asc } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { type BuilderEvent, BuilderEventSchema } from './types';

export interface StoredEvent extends BuilderEvent {
  sequenceNumber: number;
}

export interface AppendResult {
  id: string;
  sequenceNumber: number;
  timestamp: Date;
}

export class EventStore {
  constructor(private database = db) {}

  async append(
    event: Omit<BuilderEvent, 'id' | 'timestamp'>
  ): Promise<AppendResult> {
    const id = createId();
    const timestamp = new Date();

    // Extract entity info for indexing
    const entityInfo = this.extractEntityInfo(event);

    const [inserted] = await this.database
      .insert(builderEvents)
      .values({
        id,
        type: event.type,
        workspaceId: event.workspaceId,
        actor: event.actor,
        data: event.data,
        timestamp,
        version: event.version ?? 1,
        entityType: entityInfo.entityType,
        entityId: entityInfo.entityId,
      })
      .returning({ sequenceNumber: builderEvents.sequenceNumber });

    return {
      id,
      sequenceNumber: inserted.sequenceNumber,
      timestamp,
    };
  }

  async appendBatch(
    events: Array<Omit<BuilderEvent, 'id' | 'timestamp'>>
  ): Promise<AppendResult[]> {
    const timestamp = new Date();
    const toInsert = events.map((event) => {
      const entityInfo = this.extractEntityInfo(event);
      return {
        id: createId(),
        type: event.type,
        workspaceId: event.workspaceId,
        actor: event.actor,
        data: event.data,
        timestamp,
        version: event.version ?? 1,
        entityType: entityInfo.entityType,
        entityId: entityInfo.entityId,
      };
    });

    const inserted = await this.database
      .insert(builderEvents)
      .values(toInsert)
      .returning({
        id: builderEvents.id,
        sequenceNumber: builderEvents.sequenceNumber,
      });

    return inserted.map((row) => ({
      id: row.id,
      sequenceNumber: row.sequenceNumber,
      timestamp,
    }));
  }

  async getByEntity(
    entityType: string,
    entityId: string,
    options?: { limit?: number; afterSequence?: number }
  ): Promise<StoredEvent[]> {
    const conditions = [
      eq(builderEvents.entityType, entityType),
      eq(builderEvents.entityId, entityId),
    ];

    if (options?.afterSequence) {
      conditions.push(gt(builderEvents.sequenceNumber, options.afterSequence));
    }

    const rows = await this.database
      .select()
      .from(builderEvents)
      .where(and(...conditions))
      .orderBy(asc(builderEvents.sequenceNumber))
      .limit(options?.limit ?? 1000);

    return rows.map(this.rowToEvent);
  }

  async getAfterSequence(
    workspaceId: string,
    afterSequence: number,
    limit = 100
  ): Promise<StoredEvent[]> {
    const rows = await this.database
      .select()
      .from(builderEvents)
      .where(
        and(
          eq(builderEvents.workspaceId, workspaceId),
          gt(builderEvents.sequenceNumber, afterSequence)
        )
      )
      .orderBy(asc(builderEvents.sequenceNumber))
      .limit(limit);

    return rows.map(this.rowToEvent);
  }

  async getLatestSequence(workspaceId: string): Promise<number> {
    const [row] = await this.database
      .select({ seq: builderEvents.sequenceNumber })
      .from(builderEvents)
      .where(eq(builderEvents.workspaceId, workspaceId))
      .orderBy(desc(builderEvents.sequenceNumber))
      .limit(1);

    return row?.seq ?? 0;
  }

  private extractEntityInfo(event: Omit<BuilderEvent, 'id' | 'timestamp'>): {
    entityType: string | null;
    entityId: string | null;
  } {
    const data = event.data as Record<string, unknown>;

    if ('blockId' in data) {
      return { entityType: 'block', entityId: data.blockId as string };
    }
    if ('flowId' in data) {
      return { entityType: 'flow', entityId: data.flowId as string };
    }
    if ('connectionId' in data) {
      return { entityType: 'connection', entityId: data.connectionId as string };
    }

    return { entityType: null, entityId: null };
  }

  private rowToEvent(row: typeof builderEvents.$inferSelect): StoredEvent {
    return {
      id: row.id,
      type: row.type,
      workspaceId: row.workspaceId,
      actor: row.actor as BuilderEvent['actor'],
      data: row.data,
      timestamp: row.timestamp,
      version: row.version,
      sequenceNumber: row.sequenceNumber,
    } as StoredEvent;
  }
}

export const eventStore = new EventStore();
```

**Step 4: Run tests**

```bash
cd apps/web && pnpm vitest run tests/lib/events/event-store.test.ts
```

**Step 5: Commit**

```bash
git add apps/web/src/lib/events/event-store.ts apps/web/tests/lib/events/
git commit -m "feat: implement EventStore for persisting builder events"
```

---

### Task 1.4: Create Event Emitter Middleware

**Files:**
- Create: `/apps/web/src/lib/events/event-emitter.ts`
- Create: `/apps/web/src/lib/events/with-events.ts`

**Step 1: Create event emitter for broadcasting**

```typescript
// src/lib/events/event-emitter.ts
import { EventEmitter } from 'events';
import { type StoredEvent } from './event-store';

class BuilderEventEmitter extends EventEmitter {
  private static instance: BuilderEventEmitter;

  static getInstance(): BuilderEventEmitter {
    if (!BuilderEventEmitter.instance) {
      BuilderEventEmitter.instance = new BuilderEventEmitter();
    }
    return BuilderEventEmitter.instance;
  }

  emitEvent(workspaceId: string, event: StoredEvent): void {
    this.emit(`workspace:${workspaceId}`, event);
    this.emit(`entity:${event.entityType}:${event.entityId}`, event);
  }

  subscribeToWorkspace(
    workspaceId: string,
    callback: (event: StoredEvent) => void
  ): () => void {
    const channel = `workspace:${workspaceId}`;
    this.on(channel, callback);
    return () => this.off(channel, callback);
  }

  subscribeToEntity(
    entityType: string,
    entityId: string,
    callback: (event: StoredEvent) => void
  ): () => void {
    const channel = `entity:${entityType}:${entityId}`;
    this.on(channel, callback);
    return () => this.off(channel, callback);
  }
}

export const builderEventEmitter = BuilderEventEmitter.getInstance();
```

**Step 2: Create tRPC middleware for event emission**

```typescript
// src/lib/events/with-events.ts
import { eventStore, type AppendResult } from './event-store';
import { builderEventEmitter } from './event-emitter';
import { type BuilderEvent } from './types';
import { type Actor } from './types';

export interface EventContext {
  workspaceId: string;
  actor: Actor;
}

export async function emitBuilderEvent(
  ctx: EventContext,
  eventType: BuilderEvent['type'],
  data: BuilderEvent['data']
): Promise<AppendResult> {
  const result = await eventStore.append({
    type: eventType,
    workspaceId: ctx.workspaceId,
    actor: ctx.actor,
    data,
    version: 1,
  } as Omit<BuilderEvent, 'id' | 'timestamp'>);

  // Broadcast to subscribers
  const storedEvent = {
    id: result.id,
    type: eventType,
    workspaceId: ctx.workspaceId,
    actor: ctx.actor,
    data,
    timestamp: result.timestamp,
    version: 1,
    sequenceNumber: result.sequenceNumber,
  };

  builderEventEmitter.emitEvent(ctx.workspaceId, storedEvent as any);

  return result;
}

// Helper to create actor from tRPC context
export function actorFromContext(ctx: { userId: string }): Actor {
  return {
    type: 'user',
    userId: ctx.userId,
  };
}

export function aiActor(agentId: string, agentName: string): Actor {
  return {
    type: 'ai-agent',
    agentId,
    agentName,
  };
}
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/events/
git commit -m "feat: add event emitter and emission helpers for tRPC"
```

---

### Task 1.5: Add Event Emission to Blocks Router

**Files:**
- Modify: `/apps/web/src/lib/trpc/routers/blocks.ts`

**Step 1: Import event helpers**

```typescript
// Add imports at top of blocks.ts
import { emitBuilderEvent, actorFromContext } from '@/lib/events/with-events';
```

**Step 2: Emit event on block creation**

Find the `create` procedure and add event emission after successful insert:

```typescript
// In create procedure, after db.insert
const result = await db.insert(blocks).values({...}).returning();
const newBlock = result[0];

// Emit event
await emitBuilderEvent(
  { workspaceId: ctx.workspace.id, actor: actorFromContext(ctx) },
  'BlockCreated',
  {
    blockId: newBlock.id,
    name: newBlock.name,
    blockType: newBlock.type,
  }
);

return newBlock;
```

**Step 3: Emit event on block update**

```typescript
// In update procedure, after updateWithLock
await emitBuilderEvent(
  { workspaceId: ctx.workspace.id, actor: actorFromContext(ctx) },
  'BlockUpdated',
  {
    blockId: input.id,
    changes: updateData,
    previousValues: existingBlock, // optional
  }
);
```

**Step 4: Emit event on block delete**

```typescript
// In delete procedure, after soft delete
await emitBuilderEvent(
  { workspaceId: ctx.workspace.id, actor: actorFromContext(ctx) },
  'BlockDeleted',
  {
    blockId: input.id,
  }
);
```

**Step 5: Test manually**

```bash
cd apps/web && pnpm dev
# Create a block via UI, check database for builder_events entry
```

**Step 6: Commit**

```bash
git add apps/web/src/lib/trpc/routers/blocks.ts
git commit -m "feat: emit builder events from blocks router"
```

---

### Task 1.6: Add Event Emission to Flows Router

**Files:**
- Modify: `/apps/web/src/lib/trpc/routers/flows.ts`

**Step 1: Add event emission to flow CRUD operations**

Follow same pattern as blocks router:
- `FlowCreated` on create
- `FlowUpdated` on update (for name, description changes)
- `FlowNodeAdded` when nodes are added
- `FlowNodeRemoved` when nodes are removed
- `FlowEdgeAdded` when edges are added
- `FlowEdgeRemoved` when edges are removed
- `FlowDeleted` on delete

**Step 2: Commit**

```bash
git add apps/web/src/lib/trpc/routers/flows.ts
git commit -m "feat: emit builder events from flows router"
```

---

### Task 1.7: Create SSE Endpoint for Event Subscription

**Files:**
- Create: `/apps/web/src/app/api/events/[workspaceId]/route.ts`

**Step 1: Create SSE endpoint**

```typescript
// app/api/events/[workspaceId]/route.ts
import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eventStore } from '@/lib/events/event-store';
import { builderEventEmitter } from '@/lib/events/event-emitter';

export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const workspaceId = params.workspaceId;
  const lastSequence = parseInt(
    request.nextUrl.searchParams.get('lastSequence') ?? '0'
  );

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Send any missed events first
      const missedEvents = await eventStore.getAfterSequence(
        workspaceId,
        lastSequence
      );

      for (const event of missedEvents) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      }

      // Subscribe to new events
      const unsubscribe = builderEventEmitter.subscribeToWorkspace(
        workspaceId,
        (event) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        }
      );

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/api/events/
git commit -m "feat: add SSE endpoint for builder event subscription"
```

---

### Task 1.8: Create useBuilderEvents Hook

**Files:**
- Create: `/apps/web/src/hooks/useBuilderEvents.ts`

**Step 1: Implement hook**

```typescript
// hooks/useBuilderEvents.ts
import { useEffect, useRef, useCallback, useState } from 'react';
import { type StoredEvent } from '@/lib/events/event-store';

interface UseBuilderEventsOptions {
  workspaceId: string;
  onEvent?: (event: StoredEvent) => void;
  enabled?: boolean;
}

export function useBuilderEvents({
  workspaceId,
  onEvent,
  enabled = true,
}: UseBuilderEventsOptions) {
  const [lastSequence, setLastSequence] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!enabled || !workspaceId) return;

    const url = `/api/events/${workspaceId}?lastSequence=${lastSequence}`;
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (e) => {
      try {
        const event: StoredEvent = JSON.parse(e.data);
        setEvents((prev) => [...prev, event]);
        setLastSequence(event.sequenceNumber);
        onEvent?.(event);
      } catch (err) {
        console.error('Failed to parse event:', err);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      eventSource.close();
      // Reconnect after delay
      setTimeout(connect, 2000);
    };

    eventSourceRef.current = eventSource;
  }, [workspaceId, lastSequence, onEvent, enabled]);

  useEffect(() => {
    connect();

    return () => {
      eventSourceRef.current?.close();
    };
  }, [connect]);

  return {
    events,
    isConnected,
    lastSequence,
  };
}
```

**Step 2: Commit**

```bash
git add apps/web/src/hooks/useBuilderEvents.ts
git commit -m "feat: add useBuilderEvents hook for real-time event subscription"
```

---

## Phase 2: Builder View System

**Goal:** Implement the hybrid view system with Agent Profile, Flow Canvas, and Behavior Timeline views.

---

### Task 2.1: Create Agent Profile View Component

**Files:**
- Create: `/apps/web/src/components/blocks/AgentProfileView.tsx`

**Description:** A "character sheet" view for single agents showing goal, tools, constraints, output schema, and model selection.

*(Detailed implementation steps follow same pattern: failing test → implement → verify → commit)*

---

### Task 2.2: Create Behavior Timeline View Component

**Files:**
- Create: `/apps/web/src/components/execution/BehaviorTimeline.tsx`

**Description:** Shows what happened during execution—tool calls, decisions, timing—as a vertical timeline.

---

### Task 2.3: Implement View Switching Logic

**Files:**
- Modify: `/apps/web/src/app/dashboard/blocks/[id]/page.tsx`
- Create: `/apps/web/src/stores/view-mode.ts`

**Description:** Add ability to switch between Profile, Flow, and Timeline views based on context.

---

### Task 2.4: Update Flow Canvas for Composition Mode

**Files:**
- Modify: `/apps/web/src/components/flow/FlowCanvas.tsx`

**Description:** Enhance canvas to serve as composition view for multi-agent orchestration.

---

## Phase 3: Output System

**Goal:** Build the template library, component kit, and AI output generation tools.

---

### Task 3.1: Create Output Template System

**Files:**
- Create: `/apps/web/src/lib/outputs/templates/`
- Create: `/apps/web/src/lib/outputs/types.ts`

---

### Task 3.2: Build Report Template

**Files:**
- Create: `/apps/web/src/components/outputs/ReportTemplate.tsx`

---

### Task 3.3: Build Dashboard Template

**Files:**
- Create: `/apps/web/src/components/outputs/DashboardTemplate.tsx`

---

### Task 3.4: Create Component Kit

**Files:**
- Create: `/apps/web/src/components/outputs/kit/`

Components: ChartCard, MetricCard, InsightCard, DataTable, TextBlock

---

### Task 3.5: Implement AI Output Tools

**Files:**
- Create: `/apps/web/src/lib/outputs/ai-tools.ts`

Tools for AI to generate content, charts, files, interactive widgets.

---

## Phase 4: AI Companion

**Goal:** Build the ambient AI assistant interface—floating, minimizable, voice-capable.

---

### Task 4.1: Create Companion Container Component

**Files:**
- Create: `/apps/web/src/components/companion/CompanionContainer.tsx`
- Create: `/apps/web/src/stores/companion.ts`

**Description:** Draggable, resizable container that can snap to edges or minimize to orb.

---

### Task 4.2: Implement Chat Mode

**Files:**
- Create: `/apps/web/src/components/companion/ChatMode.tsx`

---

### Task 4.3: Implement Orb Mode

**Files:**
- Create: `/apps/web/src/components/companion/OrbMode.tsx`

**Description:** Minimized glowing orb that expands on interaction.

---

### Task 4.4: Implement Command Palette (Cmd+K)

**Files:**
- Create: `/apps/web/src/components/companion/CommandPalette.tsx`

---

### Task 4.5: Implement Inline Prompts

**Files:**
- Create: `/apps/web/src/components/companion/InlinePrompt.tsx`

---

### Task 4.6: Voice Mode Foundation

**Files:**
- Create: `/apps/web/src/components/companion/VoiceMode.tsx`
- Create: `/apps/web/src/lib/voice/`

**Description:** Foundation for voice interaction using BaleyBots Live APIs.

---

## Phase 5: Onboarding Agent

**Goal:** Build the AI-powered onboarding experience.

---

### Task 5.1: Create Onboarding Agent Definition

**Files:**
- Create: `/apps/web/src/lib/agents/onboarding-agent.ts`

**Description:** BaleyBot configuration with tools for guiding new users.

---

### Task 5.2: Implement Onboarding Tools

**Files:**
- Create: `/apps/web/src/lib/agents/onboarding-tools.ts`

Tools: `assess_technical_level`, `list_integrations`, `test_connection`, `introspect_schema`, `scaffold_agent`, `create_team_task`

---

### Task 5.3: Create Playground Environment

**Files:**
- Create: `/apps/web/src/app/dashboard/playground/`

**Description:** Sandbox with sample data for users without integrations.

---

### Task 5.4: Implement Task Creation System

**Files:**
- Create: `/apps/web/src/lib/tasks/`
- Modify database schema for tasks table

---

## Phase 6: Polish & Integration

**Goal:** Final integration, testing, and polish.

---

### Task 6.1: End-to-End Integration Testing

**Files:**
- Create: `/apps/web/tests/e2e/`

---

### Task 6.2: Performance Optimization

- Add virtualization to large lists
- Debounce auto-save operations
- Optimize event subscription

---

### Task 6.3: Accessibility Audit

- Add ARIA labels
- Keyboard navigation
- Screen reader testing

---

### Task 6.4: Documentation

- Update CLAUDE.md with new patterns
- Create developer onboarding guide
- Document event schema

---

## Appendix: File Structure After Implementation

```
apps/web/src/
├── app/
│   ├── api/
│   │   └── events/[workspaceId]/route.ts    # NEW: SSE endpoint
│   └── dashboard/
│       └── playground/                       # NEW: Sandbox
├── components/
│   ├── blocks/
│   │   └── AgentProfileView.tsx              # NEW: Profile view
│   ├── companion/                            # NEW: AI companion
│   │   ├── CompanionContainer.tsx
│   │   ├── ChatMode.tsx
│   │   ├── OrbMode.tsx
│   │   ├── CommandPalette.tsx
│   │   ├── InlinePrompt.tsx
│   │   └── VoiceMode.tsx
│   ├── execution/
│   │   └── BehaviorTimeline.tsx              # NEW: Timeline view
│   └── outputs/                              # NEW: Output system
│       ├── ReportTemplate.tsx
│       ├── DashboardTemplate.tsx
│       └── kit/
├── hooks/
│   └── useBuilderEvents.ts                   # NEW: Event subscription
├── lib/
│   ├── agents/                               # NEW: Internal agents
│   │   ├── onboarding-agent.ts
│   │   └── onboarding-tools.ts
│   ├── events/                               # NEW: Event sourcing
│   │   ├── types.ts
│   │   ├── event-store.ts
│   │   ├── event-emitter.ts
│   │   └── with-events.ts
│   ├── outputs/                              # NEW: Output generation
│   │   ├── types.ts
│   │   ├── templates/
│   │   └── ai-tools.ts
│   ├── tasks/                                # NEW: Task system
│   └── voice/                                # NEW: Voice support
└── stores/
    ├── companion.ts                          # NEW: Companion state
    └── view-mode.ts                          # NEW: View switching
```

---

## Success Criteria

At the end of this implementation:

1. **Event-Sourcing Works**
   - All builder actions emit events
   - Events persist to database
   - Clients receive real-time updates via SSE
   - Time-travel queries possible

2. **Builder Views Complete**
   - Agent Profile view for single agents
   - Flow Canvas for compositions
   - Behavior Timeline for observability
   - Seamless view switching

3. **Output System Functional**
   - Report and Dashboard templates work
   - Component kit available
   - AI can generate outputs

4. **AI Companion Operational**
   - Floating/draggable interface
   - Minimizes to orb
   - Cmd+K command palette works
   - Inline prompts functional

5. **Onboarding Guides Users**
   - AI agent adapts to user goals
   - Playground available for exploration
   - Task creation for blockers

---

*Plan generated January 30, 2026*
