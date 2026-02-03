# Consolidated Execution Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan.

**Goal:** Clean up technical debt, implement the tool ecosystem, and prepare for BAL-first architecture migration.

**Architecture:** BAL (Baleybots Assembly Language) is the source of truth. Current execution layer bridges to future `Pipeline.from()` integration.

**Tech Stack:** Next.js 15, React 19, tRPC, Drizzle ORM, @baleybots/core, @baleybots/tools

---

## Overview

| Phase | Focus | Tasks | Priority |
|-------|-------|-------|----------|
| 0 | Immediate Cleanup | 4 | CRITICAL |
| 1 | Built-in Tools | 8 | HIGH |
| 2 | Code Quality | 4 | HIGH |
| 3 | Triggers & Scheduling | 4 | HIGH |
| 4 | Connection Tools | 3 | MEDIUM |
| 5 | Data Flow & Storage | 3 | MEDIUM |
| 6 | Analytics | 4 | MEDIUM |
| 7 | Visual Editor Sync | 3 | LOW |
| 8 | Dynamic Tools | 3 | LOW |

**Total: 36 tasks**

---

## Phase 0: Immediate Cleanup (CRITICAL)

> Remove technical debt that violates project standards.

### Task 0.1: Delete Duplicate/Empty Files

**Files to delete:**
- `apps/web/src/lib/flow-executor.ts` (duplicate of `/lib/execution/flow-executor.ts`)
- `apps/web/src/lib/utils.ts` (empty wrapper, 169 bytes)

**Verification:** `pnpm type-check` passes

---

### Task 0.2: Consolidate Directory Structure

**Step 1:** Merge baleybot directories
```bash
# Move files from /lib/baleybots/ to /lib/baleybot/
mv apps/web/src/lib/baleybots/* apps/web/src/lib/baleybot/
rmdir apps/web/src/lib/baleybots/
```

**Step 2:** Update all imports
```bash
# Find and replace imports
grep -r "from '@/lib/baleybots" apps/web/src/ --include="*.ts" --include="*.tsx"
# Update to: from '@/lib/baleybot'
```

**Step 3:** Consolidate flows directory
```bash
mv apps/web/src/components/flows/WebhookConfig.tsx apps/web/src/components/flow/
rmdir apps/web/src/components/flows/
```

**Verification:** `pnpm type-check && pnpm test`

---

### Task 0.3: Remove React 19 Violations

Per CLAUDE.md, React 19 compiler handles memoization automatically.

**Files to modify:**

| File | Remove |
|------|--------|
| `components/creator/Canvas.tsx` | 2 `memo()`, 1 `useMemo`, 4 `useCallback` |
| `components/flow/FlowCanvas.tsx` | 7 `useCallback` |
| `components/flow/NodeConfigPanel.tsx` | 7 `useCallback` |
| `hooks/useExecutionTimeline.ts` | 3 `useMemo`, 1 `useCallback` |
| `hooks/useHistory.ts` | 5 `useCallback` |
| `hooks/useDebounce.ts` | 4 `useCallback` |
| `hooks/useExecutionStream.ts` | 4 `useCallback` |
| `hooks/useDirtyState.ts` | 3 `useCallback` |
| `hooks/useNavigationGuard.ts` | 4 `useCallback` |
| `hooks/useBlockStream.ts` | 3 `useCallback` |
| `components/blocks/ModelSelector.tsx` | 2 `useMemo` |
| `components/analytics/BlockAnalytics.tsx` | 3 `useMemo` |
| `components/ui/schema-form.tsx` | 1 `useMemo`, 2 `useCallback` |
| `components/ui/breadcrumbs.tsx` | 1 `useMemo` |
| `components/approvals/ApproveAndRememberDialog.tsx` | 1 `useMemo` |
| `components/creator/ConversationThread.tsx` | 2 `useCallback` |
| `components/charts/SimpleTrendChart.tsx` | 1 `useMemo` |
| `components/streaming/StreamingJSON.tsx` | 1 `useMemo` |
| `app/dashboard/decisions/page.tsx` | 1 `useMemo` |
| `app/dashboard/baleybots/[id]/page.tsx` | 1 `useMemo` |
| `app/dashboard/flows/[id]/page.tsx` | 2 `useCallback` |
| `app/dashboard/executions/[id]/page.tsx` | 2 `useCallback` |

**Pattern:**
```typescript
// REMOVE THIS:
const memoized = useMemo(() => computeValue(), [deps]);
const callback = useCallback(() => doThing(), [deps]);
export default memo(Component);

// REPLACE WITH:
const memoized = computeValue();
const callback = () => doThing();
export default Component;
```

**Verification:** `pnpm type-check && pnpm test`

---

### Task 0.4: Replace Console Statements with Logger

**Create structured logger usage pattern:**

```typescript
// BEFORE:
console.log('[Fallback Tracker] Processing', data);
console.error('Failed to update', error);

// AFTER:
import { logger } from '@/lib/logger';
logger.info('Fallback Tracker: Processing', { data });
logger.error('Failed to update', { error });
```

**Files with most console usage (priority order):**
1. `lib/execution/fallback-tracker.ts` (7 instances)
2. `lib/execution/event-emitter.ts` (5 instances)
3. `app/api/executions/[id]/stream/route.ts` (5 instances)
4. `lib/connections/ollama.ts` (4 instances)
5. Remaining 76 instances across other files

**Verification:** `grep -r "console\." apps/web/src/lib apps/web/src/app --include="*.ts" --include="*.tsx" | wc -l` returns 0

---

## Phase 1: Built-in Tools (HIGH PRIORITY)

> Implement the 8 built-in tools per Tool Ecosystem Design Section 1.2

### Task 1.1: Create Tool Infrastructure

**Create:** `apps/web/src/lib/baleybot/tools/built-in/index.ts`

```typescript
import { z } from 'zod';
import type { ZodToolDefinition } from '@baleybots/core';

// Tool metadata for catalog
export interface BuiltInToolMetadata {
  name: string;
  description: string;
  category: 'search' | 'data' | 'orchestration' | 'notification' | 'scheduling';
  requiresApproval: boolean;
  inputSchema: z.ZodType;
}

export const BUILT_IN_TOOLS_METADATA: Record<string, BuiltInToolMetadata> = {
  // Will be populated in subsequent tasks
};

export function getBuiltInTools(
  workspaceId: string,
  config: { tavilyApiKey?: string }
): Record<string, ZodToolDefinition> {
  // Will return configured tools
}
```

**Create:** `apps/web/src/lib/baleybot/tools/built-in/implementations.ts`

---

### Task 1.2: Implement web_search Tool

**File:** `apps/web/src/lib/baleybot/tools/built-in/web-search.ts`

```typescript
import { z } from 'zod';
import type { ZodToolDefinition } from '@baleybots/core';

const inputSchema = z.object({
  query: z.string().describe('Search query'),
  num_results: z.number().min(1).max(20).default(5).describe('Number of results'),
});

export function createWebSearchTool(tavilyApiKey: string): ZodToolDefinition {
  return {
    name: 'web_search',
    description: 'Search the web for information using Tavily',
    inputSchema,
    function: async ({ query, num_results }) => {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tavilyApiKey}`,
        },
        body: JSON.stringify({
          query,
          max_results: num_results,
          include_answer: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Tavily API error: ${response.statusText}`);
      }

      return response.json();
    },
  };
}
```

---

### Task 1.3: Implement fetch_url Tool

**File:** `apps/web/src/lib/baleybot/tools/built-in/fetch-url.ts`

```typescript
import { z } from 'zod';
import type { ZodToolDefinition } from '@baleybots/core';

const inputSchema = z.object({
  url: z.string().url().describe('URL to fetch'),
  format: z.enum(['html', 'text', 'json']).default('text').describe('Response format'),
});

export function createFetchUrlTool(): ZodToolDefinition {
  return {
    name: 'fetch_url',
    description: 'Fetch content from a URL',
    inputSchema,
    function: async ({ url, format }) => {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'BaleyUI/1.0' },
      });

      if (!response.ok) {
        throw new Error(`Fetch error: ${response.statusText}`);
      }

      switch (format) {
        case 'json':
          return response.json();
        case 'html':
          return response.text();
        case 'text':
        default:
          // Strip HTML tags for plain text
          const html = await response.text();
          return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    },
  };
}
```

---

### Task 1.4: Implement spawn_baleybot Tool

**File:** `apps/web/src/lib/baleybot/tools/built-in/spawn-baleybot.ts`

```typescript
import { z } from 'zod';
import type { ZodToolDefinition } from '@baleybots/core';
import { db } from '@baleyui/db';
import { baleybots, notDeleted } from '@baleyui/db';
import { eq, and } from 'drizzle-orm';
import { executeBALCode } from '@baleyui/sdk';

const inputSchema = z.object({
  baleybot: z.string().describe('BaleyBot name or ID'),
  input: z.any().describe('Input to pass to the BaleyBot'),
});

export function createSpawnBaleybotTool(
  workspaceId: string,
  providerConfig: { apiKey?: string }
): ZodToolDefinition {
  return {
    name: 'spawn_baleybot',
    description: 'Execute another BaleyBot and return its result',
    inputSchema,
    function: async ({ baleybot, input }) => {
      // Look up BaleyBot by name or ID
      const bb = await db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.workspaceId, workspaceId),
          notDeleted(baleybots),
          // Match by ID or name
          or(
            eq(baleybots.id, baleybot),
            eq(baleybots.name, baleybot)
          )
        ),
      });

      if (!bb) {
        throw new Error(`BaleyBot not found: ${baleybot}`);
      }

      // Execute the BaleyBot's BAL code
      const result = await executeBALCode(bb.balCode, {
        input,
        apiKey: providerConfig.apiKey,
        timeout: 60000,
      });

      if (result.status === 'error') {
        throw new Error(result.error);
      }

      return result.result;
    },
  };
}
```

---

### Task 1.5: Implement send_notification Tool

**File:** `apps/web/src/lib/baleybot/tools/built-in/send-notification.ts`

```typescript
import { z } from 'zod';
import type { ZodToolDefinition } from '@baleybots/core';
import { db } from '@baleyui/db';
import { notifications } from '@baleyui/db';

const inputSchema = z.object({
  title: z.string().describe('Notification title'),
  message: z.string().describe('Notification body'),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});

export function createSendNotificationTool(
  workspaceId: string,
  userId: string
): ZodToolDefinition {
  return {
    name: 'send_notification',
    description: 'Send an in-app notification to the user',
    inputSchema,
    function: async ({ title, message, priority }) => {
      const [notification] = await db.insert(notifications).values({
        workspaceId,
        userId,
        title,
        message,
        priority,
        read: false,
      }).returning();

      return {
        sent: true,
        notification_id: notification.id,
      };
    },
  };
}
```

---

### Task 1.6: Implement store_memory Tool

**File:** `apps/web/src/lib/baleybot/tools/built-in/store-memory.ts`

```typescript
import { z } from 'zod';
import type { ZodToolDefinition } from '@baleybots/core';
import { db } from '@baleyui/db';
import { baleybotMemory } from '@baleyui/db';
import { eq, and } from 'drizzle-orm';

const inputSchema = z.object({
  action: z.enum(['get', 'set', 'delete', 'list']).describe('Memory operation'),
  key: z.string().describe('Memory key'),
  value: z.any().optional().describe('Value to store (for set action)'),
});

export function createStoreMemoryTool(
  workspaceId: string,
  baleybotId: string
): ZodToolDefinition {
  return {
    name: 'store_memory',
    description: 'Persist key-value data that survives across BaleyBot executions',
    inputSchema,
    function: async ({ action, key, value }) => {
      switch (action) {
        case 'get': {
          const memory = await db.query.baleybotMemory.findFirst({
            where: and(
              eq(baleybotMemory.baleybotId, baleybotId),
              eq(baleybotMemory.key, key)
            ),
          });
          return memory?.value ?? null;
        }

        case 'set': {
          await db.insert(baleybotMemory)
            .values({
              workspaceId,
              baleybotId,
              key,
              value,
            })
            .onConflictDoUpdate({
              target: [baleybotMemory.baleybotId, baleybotMemory.key],
              set: { value, updatedAt: new Date() },
            });
          return { stored: true, key };
        }

        case 'delete': {
          await db.delete(baleybotMemory)
            .where(and(
              eq(baleybotMemory.baleybotId, baleybotId),
              eq(baleybotMemory.key, key)
            ));
          return { deleted: true, key };
        }

        case 'list': {
          const memories = await db.query.baleybotMemory.findMany({
            where: eq(baleybotMemory.baleybotId, baleybotId),
            columns: { key: true },
          });
          return memories.map(m => m.key);
        }
      }
    },
  };
}
```

---

### Task 1.7: Implement schedule_task Tool

**File:** `apps/web/src/lib/baleybot/tools/built-in/schedule-task.ts`

```typescript
import { z } from 'zod';
import type { ZodToolDefinition } from '@baleybots/core';
import { db } from '@baleyui/db';
import { scheduledTasks } from '@baleyui/db';

const inputSchema = z.object({
  baleybot: z.string().optional().describe('BaleyBot to schedule (defaults to current)'),
  run_at: z.string().describe('ISO datetime or cron expression'),
  input: z.any().optional().describe('Input for the scheduled run'),
});

export function createScheduleTaskTool(
  workspaceId: string,
  currentBaleybotId: string
): ZodToolDefinition {
  return {
    name: 'schedule_task',
    description: 'Schedule this or another BaleyBot to run at a future time',
    inputSchema,
    requiresApproval: true, // Per tool ecosystem design
    function: async ({ baleybot, run_at, input }) => {
      const targetBaleybotId = baleybot || currentBaleybotId;

      // Parse run_at - could be ISO date or cron
      const isCron = run_at.includes('*') || run_at.split(' ').length >= 5;

      const [task] = await db.insert(scheduledTasks).values({
        workspaceId,
        baleybotId: targetBaleybotId,
        scheduleType: isCron ? 'cron' : 'once',
        scheduleExpression: isCron ? run_at : null,
        scheduledFor: isCron ? null : new Date(run_at),
        input,
        status: 'pending',
      }).returning();

      return {
        scheduled: true,
        task_id: task.id,
        run_at: task.scheduledFor?.toISOString() || run_at,
      };
    },
  };
}
```

---

### Task 1.8: Wire Up Tools in Executor

**Modify:** `apps/web/src/lib/baleybot/executor.ts`

Update the executor to include built-in tools:

```typescript
import { getBuiltInRuntimeTools } from './tools/built-in';

// In executeBaleybotCode or similar function:
const tools = getBuiltInRuntimeTools({
  workspaceId,
  baleybotId,
  userId,
  providerConfig: {
    tavilyApiKey: process.env.TAVILY_API_KEY,
    apiKey: connectionApiKey,
  },
});

// Pass tools to BAL execution
const result = await executeBALCode(balCode, {
  availableTools: tools,
  // ... other options
});
```

**Verification:** Create test BaleyBot that uses each tool, verify execution succeeds.

---

## Phase 2: Code Quality (HIGH PRIORITY)

### Task 2.1: Centralize Model Configuration

**Create:** `apps/web/src/lib/models/config.ts`

```typescript
export const DEFAULT_MODELS = {
  openai: 'openai:gpt-4o-mini',
  anthropic: 'anthropic:claude-sonnet-4-20250514',
  ollama: 'ollama:llama3.2',
} as const;

export const AVAILABLE_MODELS = {
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', tier: 'powerful' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', tier: 'fast' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', tier: 'powerful' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', tier: 'powerful' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', tier: 'fast' },
  ],
} as const;

export function getDefaultModelForProvider(provider: 'openai' | 'anthropic' | 'ollama'): string {
  return DEFAULT_MODELS[provider];
}

export function detectProviderFromApiKey(apiKey: string): 'openai' | 'anthropic' | null {
  if (apiKey.startsWith('sk-')) return 'openai';
  if (apiKey.startsWith('sk-ant-')) return 'anthropic';
  return null;
}
```

**Update all hardcoded model strings** to use this config.

---

### Task 2.2: Fix Type Safety Issues

**File:** `packages/db/src/soft-delete.ts`

Replace `any` types with proper generics:

```typescript
// BEFORE:
export async function softDelete<
  T extends PgTable & {
    id: any;
    deletedAt: any;
    deletedBy: any;
    updatedAt: any;
  }
>

// AFTER:
import type { PgColumn } from 'drizzle-orm/pg-core';

export async function softDelete<
  T extends PgTable & {
    id: PgColumn<{ data: string; ... }>;
    deletedAt: PgColumn<{ data: Date | null; ... }>;
    deletedBy: PgColumn<{ data: string | null; ... }>;
    updatedAt: PgColumn<{ data: Date; ... }>;
  }
>
```

---

### Task 2.3: Fix Fire-and-Forget Database Update

**File:** `apps/web/src/lib/api/validate-api-key.ts` (lines 69-76)

```typescript
// BEFORE (fire-and-forget):
db.update(apiKeys)
  .set({ lastUsedAt: new Date() })
  .where(eq(apiKeys.id, key.id))
  .execute()
  .catch((err) => {
    console.error('Failed to update lastUsedAt for API key:', err);
  });

// AFTER (proper async with logging):
try {
  await db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, key.id));
} catch (err) {
  logger.error('Failed to update lastUsedAt for API key', { keyId: key.id, error: err });
  // Don't throw - this is a non-critical update
}
```

---

### Task 2.4: Standardize Streaming Event Field Names

**File:** `apps/web/src/lib/streaming/adapter.ts`

Ensure consistent field naming per CLAUDE.md:
- Use `id` (not `toolCallId`) for tool call IDs
- Use `content` (not `delta`) for text content
- Use `reason` (not `result`) in done events

---

## Phase 3: Triggers & Scheduling (HIGH PRIORITY)

### Task 3.1: Implement BB Completion Trigger

**Create:** `apps/web/src/lib/baleybot/triggers/bb-completion.ts`

When a BaleyBot execution completes, check for dependent triggers:

```typescript
export async function handleBaleybotCompletion(
  executionId: string,
  baleybotId: string,
  status: 'success' | 'failure',
  output: unknown
) {
  // Find triggers that depend on this BB
  const triggers = await db.query.baleybotTriggers.findMany({
    where: and(
      eq(baleybotTriggers.sourceBaleybotId, baleybotId),
      eq(baleybotTriggers.enabled, true),
      // Match trigger type
      or(
        eq(baleybotTriggers.triggerType, 'completion'),
        eq(baleybotTriggers.triggerType, status) // 'success' or 'failure'
      )
    ),
  });

  // Execute each triggered BaleyBot
  for (const trigger of triggers) {
    await queueBaleybotExecution(trigger.targetBaleybotId, {
      sourceExecution: executionId,
      sourceOutput: output,
      triggerType: 'bb_completion',
    });
  }
}
```

---

### Task 3.2: Implement Schedule Trigger Service

**Create:** `apps/web/src/lib/baleybot/triggers/scheduler.ts`

Background service that checks for due scheduled tasks:

```typescript
export async function processScheduledTasks() {
  const dueTasks = await db.query.scheduledTasks.findMany({
    where: and(
      eq(scheduledTasks.status, 'pending'),
      lte(scheduledTasks.scheduledFor, new Date())
    ),
    limit: 100,
  });

  for (const task of dueTasks) {
    // Mark as running
    await db.update(scheduledTasks)
      .set({ status: 'running', startedAt: new Date() })
      .where(eq(scheduledTasks.id, task.id));

    try {
      // Execute the BaleyBot
      await executeBaleybot(task.baleybotId, task.input);

      // Mark complete
      await db.update(scheduledTasks)
        .set({ status: 'completed', completedAt: new Date() })
        .where(eq(scheduledTasks.id, task.id));
    } catch (error) {
      // Mark failed
      await db.update(scheduledTasks)
        .set({ status: 'failed', error: String(error) })
        .where(eq(scheduledTasks.id, task.id));
    }
  }
}
```

---

### Task 3.3: Implement Webhook Trigger Endpoint

**File:** `apps/web/src/app/api/webhooks/[workspaceId]/[baleybotId]/route.ts`

```typescript
export async function POST(
  request: Request,
  { params }: { params: { workspaceId: string; baleybotId: string } }
) {
  const { workspaceId, baleybotId } = params;

  // Verify webhook is enabled for this BaleyBot
  const baleybot = await db.query.baleybots.findFirst({
    where: and(
      eq(baleybots.id, baleybotId),
      eq(baleybots.workspaceId, workspaceId),
      notDeleted(baleybots)
    ),
  });

  if (!baleybot || baleybot.triggerType !== 'webhook') {
    return Response.json({ error: 'Webhook not configured' }, { status: 404 });
  }

  // Parse webhook payload
  const payload = await request.json();

  // Queue execution
  const execution = await queueBaleybotExecution(baleybotId, {
    input: payload,
    triggerType: 'webhook',
  });

  return Response.json({
    success: true,
    execution_id: execution.id,
  });
}
```

---

### Task 3.4: Update Trigger UI Components

Update the BaleyBot editor to support configuring triggers:
- Manual (default)
- Schedule (cron expression builder)
- Webhook (show endpoint URL)
- BB Completion (select source BaleyBot)

---

## Phase 4-8: Remaining Phases

> These phases follow the Tool Ecosystem Design document. See `docs/plans/2026-02-02-baleybot-tool-ecosystem-design.md` for full specifications.

### Phase 4: Connection Tools
- Database connection tool generator
- Schema introspection service
- Intent-based safety detection

### Phase 5: Data Flow & Storage
- Pipeline execution for sync chains
- Shared storage for async BBs
- Customer DB integration

### Phase 6: Analytics
- Analytics schema parser
- Metric storage and aggregation
- Dashboard chart rendering
- Alert system

### Phase 7: Visual Editor Sync
- BAL-to-visual renderer
- Light editing UI
- Bidirectional sync

### Phase 8: Dynamic Tools
- `create_agent` implementation
- `create_tool` implementation
- Promotion flow (ephemeral → permanent)

---

## Verification Checklist

After each phase:

```bash
# Type checking
pnpm type-check

# All tests pass
pnpm test

# Linting
pnpm lint

# Manual smoke test
pnpm dev
# - Create BaleyBot with tools
# - Execute and verify tools work
# - Check streaming output
```

---

## Success Criteria

1. **Phase 0 Complete:** Zero React 19 violations, zero console.log in lib/, clean directory structure
2. **Phase 1 Complete:** All 8 built-in tools functional, BaleyBots can use them
3. **Phase 2 Complete:** No hardcoded models, no `any` types in core code
4. **Phase 3 Complete:** Schedule, webhook, and BB completion triggers working

---

## Estimated Effort

| Phase | Tasks | Effort |
|-------|-------|--------|
| 0 | 4 | 4-6 hours |
| 1 | 8 | 8-12 hours |
| 2 | 4 | 4-6 hours |
| 3 | 4 | 6-8 hours |
| 4-8 | 16 | 20-30 hours |

**Total: 42-62 hours**

---

## Commit Strategy

- One commit per task
- Commit message format: `feat(phase-X): Task X.Y - Brief description`
- Run verification after each commit
- Create PR after each phase for review
