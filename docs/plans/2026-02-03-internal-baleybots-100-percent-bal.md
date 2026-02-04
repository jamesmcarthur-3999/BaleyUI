# Internal BaleyBots - 100% BAL Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert all internal AI services to 100% BAL stored in the database, executing through the standard BaleyBot executor with full tracking.

**Architecture:** Internal services (creator-bot, generator, pattern-learner, reviewer, nl-to-sql, web-search-fallback) become first-class BaleyBots stored in the `baleybots` table with `isInternal: true`. They execute via the same `executeBaleybot()` path as user BBs, with all runs tracked in `baleybotExecutions`. A system workspace owns all internal BBs.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL, BAL v2, @baleybots/core, @baleyui/sdk

---

## Overview

### Current State (Dynamic Creation)
```typescript
// creator-bot.ts - Creates ephemeral BB, no tracking
const bot = Baleybot.create({ name: 'creator_bot', goal: '...', outputSchema: {...} });
const result = await bot.process(userMessage);  // Nothing recorded in DB!
```

### Target State (100% BAL)
```typescript
// creator-bot.ts - Executes stored BAL, full tracking
const internalBB = await getInternalBaleybot('creator_bot');
const result = await executeInternalBaleybot(internalBB.id, userMessage, ctx);
// Execution recorded in baleybotExecutions, visible in analytics
```

### Internal BaleyBots to Create

| Name | Current File | Purpose |
|------|--------------|---------|
| `creator_bot` | `creator-bot.ts` | Creates new BaleyBots from user descriptions |
| `bal_generator` | `generator.ts` | Converts descriptions to BAL code |
| `pattern_learner` | `pattern-learner.ts` | Analyzes approvals, suggests patterns |
| `execution_reviewer` | `reviewer.ts` | Reviews executions, suggests improvements |
| `nl_to_sql_postgres` | `nl-to-sql-service.ts` | Translates NL to PostgreSQL |
| `nl_to_sql_mysql` | `nl-to-sql-service.ts` | Translates NL to MySQL |
| `web_search_fallback` | `web-search-service.ts` | AI fallback when no Tavily key |

---

## Phase 1: Schema & Infrastructure

### Task 1.1: Add isInternal flag to baleybots schema

**Files:**
- Modify: `packages/db/src/schema.ts:583-643`
- Modify: `packages/db/src/index.ts` (export if needed)

**Step 1: Write the failing test**

Create: `packages/db/src/__tests__/schema.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { baleybots } from '../schema';

describe('baleybots schema', () => {
  it('has isInternal column', () => {
    // Access the column definition to verify it exists
    expect(baleybots.isInternal).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/db && pnpm test -- --grep "isInternal"
```
Expected: FAIL - "isInternal" is undefined

**Step 3: Add isInternal column to schema**

In `packages/db/src/schema.ts`, inside the `baleybots` table definition, after line 595 (after `status`), add:

```typescript
    // Internal BaleyBots (system-managed, not user-created)
    isInternal: boolean('is_internal').default(false).notNull(),
```

**Step 4: Run test to verify it passes**

```bash
cd packages/db && pnpm test -- --grep "isInternal"
```
Expected: PASS

**Step 5: Generate and run migration**

```bash
cd packages/db && pnpm db:generate && pnpm db:push
```

**Step 6: Commit**

```bash
git add packages/db/src/schema.ts packages/db/src/__tests__/schema.test.ts packages/db/drizzle/
git commit -m "feat(db): add isInternal flag to baleybots schema"
```

---

### Task 1.2: Create system workspace concept

**Files:**
- Create: `apps/web/src/lib/system-workspace.ts`
- Test: `apps/web/src/lib/__tests__/system-workspace.test.ts`

**Step 1: Write the failing test**

Create: `apps/web/src/lib/__tests__/system-workspace.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getOrCreateSystemWorkspace, SYSTEM_WORKSPACE_SLUG } from '../system-workspace';

// Mock the database
vi.mock('@baleyui/db', () => ({
  db: {
    query: {
      workspaces: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'system-ws-id', slug: '__system__' }]),
      }),
    }),
  },
  workspaces: {},
  eq: vi.fn(),
  notDeleted: vi.fn(),
}));

describe('system-workspace', () => {
  it('exports SYSTEM_WORKSPACE_SLUG constant', () => {
    expect(SYSTEM_WORKSPACE_SLUG).toBe('__system__');
  });

  it('getOrCreateSystemWorkspace returns workspace id', async () => {
    const wsId = await getOrCreateSystemWorkspace();
    expect(typeof wsId).toBe('string');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm test -- --grep "system-workspace"
```
Expected: FAIL - module not found

**Step 3: Implement system workspace**

Create: `apps/web/src/lib/system-workspace.ts`

```typescript
/**
 * System Workspace
 *
 * A special workspace that owns all internal BaleyBots.
 * This workspace is not visible to users and is created automatically.
 */

import { db, workspaces, eq, notDeleted } from '@baleyui/db';

export const SYSTEM_WORKSPACE_SLUG = '__system__';
export const SYSTEM_WORKSPACE_NAME = 'System';
export const SYSTEM_OWNER_ID = '__system__';

// Cache the system workspace ID
let cachedSystemWorkspaceId: string | null = null;

/**
 * Get or create the system workspace.
 * Returns the workspace ID.
 */
export async function getOrCreateSystemWorkspace(): Promise<string> {
  // Return cached value if available
  if (cachedSystemWorkspaceId) {
    return cachedSystemWorkspaceId;
  }

  // Try to find existing system workspace
  const existing = await db.query.workspaces.findFirst({
    where: (ws, { and }) => and(
      eq(ws.slug, SYSTEM_WORKSPACE_SLUG),
      notDeleted(ws)
    ),
  });

  if (existing) {
    cachedSystemWorkspaceId = existing.id;
    return existing.id;
  }

  // Create the system workspace
  const [created] = await db
    .insert(workspaces)
    .values({
      name: SYSTEM_WORKSPACE_NAME,
      slug: SYSTEM_WORKSPACE_SLUG,
      ownerId: SYSTEM_OWNER_ID,
    })
    .returning();

  if (!created) {
    throw new Error('Failed to create system workspace');
  }

  cachedSystemWorkspaceId = created.id;
  return created.id;
}

/**
 * Check if a workspace ID is the system workspace
 */
export function isSystemWorkspace(workspaceId: string): boolean {
  return workspaceId === cachedSystemWorkspaceId;
}

/**
 * Clear the cached system workspace ID (for testing)
 */
export function clearSystemWorkspaceCache(): void {
  cachedSystemWorkspaceId = null;
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm test -- --grep "system-workspace"
```
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/system-workspace.ts apps/web/src/lib/__tests__/system-workspace.test.ts
git commit -m "feat: add system workspace for internal BaleyBots"
```

---

### Task 1.3: Create internal BaleyBot service

**Files:**
- Create: `apps/web/src/lib/baleybot/internal-baleybots.ts`
- Create: `apps/web/src/lib/baleybot/__tests__/internal-baleybots.test.ts`

**Step 1: Write the failing test**

Create: `apps/web/src/lib/baleybot/__tests__/internal-baleybots.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import {
  getInternalBaleybot,
  executeInternalBaleybot,
  INTERNAL_BALEYBOTS,
} from '../internal-baleybots';

describe('internal-baleybots', () => {
  describe('INTERNAL_BALEYBOTS', () => {
    it('defines creator_bot', () => {
      expect(INTERNAL_BALEYBOTS.creator_bot).toBeDefined();
      expect(INTERNAL_BALEYBOTS.creator_bot.name).toBe('creator_bot');
      expect(INTERNAL_BALEYBOTS.creator_bot.balCode).toContain('creator_bot');
    });

    it('defines all internal bots', () => {
      const expectedBots = [
        'creator_bot',
        'bal_generator',
        'pattern_learner',
        'execution_reviewer',
        'nl_to_sql_postgres',
        'nl_to_sql_mysql',
        'web_search_fallback',
      ];

      for (const name of expectedBots) {
        expect(INTERNAL_BALEYBOTS[name]).toBeDefined();
      }
    });
  });

  describe('getInternalBaleybot', () => {
    it('returns internal bot definition', async () => {
      const bot = await getInternalBaleybot('creator_bot');
      expect(bot).toBeDefined();
      expect(bot?.name).toBe('creator_bot');
    });

    it('returns null for unknown bot', async () => {
      const bot = await getInternalBaleybot('unknown_bot');
      expect(bot).toBeNull();
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm test -- --grep "internal-baleybots"
```
Expected: FAIL - module not found

**Step 3: Implement internal baleybots service**

Create: `apps/web/src/lib/baleybot/internal-baleybots.ts`

```typescript
/**
 * Internal BaleyBots Service
 *
 * Defines and manages internal BaleyBots that power the platform.
 * These are stored in the database with isInternal: true.
 */

import { db, baleybots, baleybotExecutions, eq, and, notDeleted } from '@baleyui/db';
import { getOrCreateSystemWorkspace } from '@/lib/system-workspace';
import { executeBaleybot, type ExecutorContext } from './executor';
import { createLogger } from '@/lib/logger';

const logger = createLogger('internal-baleybots');

// ============================================================================
// INTERNAL BALEYBOT DEFINITIONS (BAL CODE)
// ============================================================================

export interface InternalBaleybotDef {
  name: string;
  description: string;
  icon: string;
  balCode: string;
}

/**
 * All internal BaleyBot definitions.
 * These are seeded into the database on app startup.
 */
export const INTERNAL_BALEYBOTS: Record<string, InternalBaleybotDef> = {
  creator_bot: {
    name: 'creator_bot',
    description: 'Creates new BaleyBots from user descriptions through conversation',
    icon: '🤖',
    balCode: `
creator_bot {
  "goal": "You are a BaleyBot Creator. Help users build AI automation bots through natural conversation. Analyze their request, design entities with appropriate tools, and generate valid BAL code. Output structured data with: entities (id, name, icon, purpose, tools), connections (from, to), balCode, name, icon, and status (building/ready).",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "entities": "array",
    "connections": "array",
    "balCode": "string",
    "name": "string",
    "icon": "string",
    "status": "string",
    "message": "string"
  }
}
`,
  },

  bal_generator: {
    name: 'bal_generator',
    description: 'Converts natural language descriptions into BAL code',
    icon: '📝',
    balCode: `
bal_generator {
  "goal": "You are a BAL code generator. Convert user descriptions into valid BAL (Baleybots Assembly Language) code. Follow BAL v2 syntax: entity definitions with goal/model/tools/output, chain/parallel/if/loop compositions. Output balCode, explanation, entities array, toolRationale, suggestedName, and suggestedIcon.",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "balCode": "string",
    "explanation": "string",
    "entities": "array",
    "toolRationale": "object",
    "suggestedName": "string",
    "suggestedIcon": "string"
  }
}
`,
  },

  pattern_learner: {
    name: 'pattern_learner',
    description: 'Analyzes tool approvals and suggests patterns for auto-approval',
    icon: '🧠',
    balCode: `
pattern_learner {
  "goal": "You are an approval pattern learning assistant. Analyze tool call approvals and suggest safe patterns for auto-approval. Consider risk levels, appropriate constraints vs wildcards, and suggest trust levels (provisional/trusted/permanent) with clear explanations.",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "suggestions": "array",
    "warnings": "array",
    "recommendations": "array"
  }
}
`,
  },

  execution_reviewer: {
    name: 'execution_reviewer',
    description: 'Reviews BaleyBot executions and suggests improvements',
    icon: '🔍',
    balCode: `
execution_reviewer {
  "goal": "You are a BaleyBot Review Agent. Analyze execution results against original intent. Identify issues (errors, warnings, suggestions) across accuracy, completeness, performance, safety, clarity, efficiency. Propose specific BAL code improvements with reasoning.",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "overallAssessment": "string",
    "summary": "string",
    "issues": "array",
    "suggestions": "array",
    "metrics": "object"
  }
}
`,
  },

  nl_to_sql_postgres: {
    name: 'nl_to_sql_postgres',
    description: 'Translates natural language queries to PostgreSQL',
    icon: '🐘',
    balCode: `
nl_to_sql_postgres {
  "goal": "You are a SQL expert. Translate natural language queries to valid PostgreSQL. Output ONLY the SQL query. Use provided schema for exact table/column names. Add LIMIT 100 if not specified. Never generate destructive queries. Use PostgreSQL specifics: double quotes for identifiers, :: for casting, ILIKE for case-insensitive.",
  "model": "openai:gpt-4o-mini",
  "output": {
    "sql": "string"
  }
}
`,
  },

  nl_to_sql_mysql: {
    name: 'nl_to_sql_mysql',
    description: 'Translates natural language queries to MySQL',
    icon: '🐬',
    balCode: `
nl_to_sql_mysql {
  "goal": "You are a SQL expert. Translate natural language queries to valid MySQL. Output ONLY the SQL query. Use provided schema for exact table/column names. Add LIMIT 100 if not specified. Never generate destructive queries. Use MySQL specifics: backticks for identifiers, CONVERT() for casting, LOWER() with LIKE for case-insensitive.",
  "model": "openai:gpt-4o-mini",
  "output": {
    "sql": "string"
  }
}
`,
  },

  web_search_fallback: {
    name: 'web_search_fallback',
    description: 'AI-powered web search when no Tavily API key is configured',
    icon: '🔎',
    balCode: `
web_search_fallback {
  "goal": "You are a web search assistant. When asked to search, provide relevant results with title, url (use real commonly-known websites), and snippet. Return as JSON array.",
  "model": "openai:gpt-4o-mini",
  "output": {
    "results": "array"
  }
}
`,
  },
};

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Get an internal BaleyBot by name.
 * First checks database, falls back to definition.
 */
export async function getInternalBaleybot(
  name: string
): Promise<{ id: string; name: string; balCode: string } | null> {
  const def = INTERNAL_BALEYBOTS[name];
  if (!def) {
    return null;
  }

  const systemWorkspaceId = await getOrCreateSystemWorkspace();

  // Try to find in database
  const existing = await db.query.baleybots.findFirst({
    where: (bb, { and }) => and(
      eq(bb.workspaceId, systemWorkspaceId),
      eq(bb.name, name),
      eq(bb.isInternal, true),
      notDeleted(bb)
    ),
  });

  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      balCode: existing.balCode,
    };
  }

  // Create if not exists (auto-seed)
  const [created] = await db
    .insert(baleybots)
    .values({
      workspaceId: systemWorkspaceId,
      name: def.name,
      description: def.description,
      icon: def.icon,
      balCode: def.balCode.trim(),
      status: 'active',
      isInternal: true,
    })
    .returning();

  if (!created) {
    logger.error('Failed to create internal BaleyBot', { name });
    return null;
  }

  logger.info('Created internal BaleyBot', { name, id: created.id });

  return {
    id: created.id,
    name: created.name,
    balCode: created.balCode,
  };
}

/**
 * Ensure all internal BaleyBots exist in the database.
 * Called during app initialization.
 */
export async function seedInternalBaleybots(): Promise<void> {
  logger.info('Seeding internal BaleyBots...');

  for (const name of Object.keys(INTERNAL_BALEYBOTS)) {
    await getInternalBaleybot(name);
  }

  logger.info('Internal BaleyBots seeded', { count: Object.keys(INTERNAL_BALEYBOTS).length });
}

// ============================================================================
// EXECUTION
// ============================================================================

export interface InternalExecutionOptions {
  /** User's workspace ID (for context, not ownership) */
  userWorkspaceId?: string;
  /** Additional context to append to input */
  context?: string;
  /** Triggered by */
  triggeredBy?: 'manual' | 'schedule' | 'webhook' | 'other_bb' | 'internal';
}

/**
 * Execute an internal BaleyBot.
 * Creates execution record and runs through standard executor.
 */
export async function executeInternalBaleybot(
  name: string,
  input: string,
  options: InternalExecutionOptions = {}
): Promise<{ output: unknown; executionId: string }> {
  const internalBB = await getInternalBaleybot(name);
  if (!internalBB) {
    throw new Error(`Internal BaleyBot not found: ${name}`);
  }

  const systemWorkspaceId = await getOrCreateSystemWorkspace();

  // Create execution record
  const [execution] = await db
    .insert(baleybotExecutions)
    .values({
      baleybotId: internalBB.id,
      status: 'pending',
      input: { raw: input, context: options.context },
      triggeredBy: options.triggeredBy || 'internal',
      triggerSource: options.userWorkspaceId,
    })
    .returning();

  if (!execution) {
    throw new Error('Failed to create execution record');
  }

  const startTime = Date.now();

  try {
    // Update to running
    await db
      .update(baleybotExecutions)
      .set({ status: 'running', startedAt: new Date() })
      .where(eq(baleybotExecutions.id, execution.id));

    // Build full input with context
    const fullInput = options.context
      ? `${options.context}\n\n${input}`
      : input;

    // Execute through standard path
    const ctx: ExecutorContext = {
      workspaceId: systemWorkspaceId,
      availableTools: new Map(), // Internal BBs typically don't use tools
      workspacePolicies: null,
      triggeredBy: options.triggeredBy || 'internal',
      triggerSource: options.userWorkspaceId,
    };

    const result = await executeBaleybot(internalBB.balCode, fullInput, ctx);

    // Update execution record
    await db
      .update(baleybotExecutions)
      .set({
        status: result.status === 'completed' ? 'completed' : 'failed',
        output: result.output,
        error: result.error,
        segments: result.segments,
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
      })
      .where(eq(baleybotExecutions.id, execution.id));

    if (result.status !== 'completed') {
      throw new Error(result.error || 'Internal BaleyBot execution failed');
    }

    return {
      output: result.output,
      executionId: execution.id,
    };
  } catch (error) {
    // Update execution with error
    await db
      .update(baleybotExecutions)
      .set({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
      })
      .where(eq(baleybotExecutions.id, execution.id));

    throw error;
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm test -- --grep "internal-baleybots"
```
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/baleybot/internal-baleybots.ts apps/web/src/lib/baleybot/__tests__/internal-baleybots.test.ts
git commit -m "feat: add internal BaleyBots service with BAL definitions"
```

---

## Phase 2: Migrate Services to Internal BaleyBots

### Task 2.1: Migrate creator-bot to internal BaleyBot

**Files:**
- Modify: `apps/web/src/lib/baleybot/creator-bot.ts`
- Test: `apps/web/src/lib/baleybot/__tests__/creator-bot.test.ts`

**Step 1: Write the failing test**

Update: `apps/web/src/lib/baleybot/__tests__/creator-bot.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { processCreatorMessage } from '../creator-bot';

// Mock internal-baleybots
vi.mock('../internal-baleybots', () => ({
  executeInternalBaleybot: vi.fn().mockResolvedValue({
    output: {
      entities: [],
      connections: [],
      balCode: 'test {}',
      name: 'test',
      icon: '🤖',
      status: 'ready',
    },
    executionId: 'exec-123',
  }),
}));

describe('creator-bot', () => {
  it('uses internal BaleyBot for processing', async () => {
    const { executeInternalBaleybot } = await import('../internal-baleybots');

    await processCreatorMessage(
      { context: { workspaceId: 'ws-1', availableTools: [], existingBaleybots: [], workspacePolicies: null } },
      'Create a bot that...'
    );

    expect(executeInternalBaleybot).toHaveBeenCalledWith(
      'creator_bot',
      expect.any(String),
      expect.any(Object)
    );
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm test -- --grep "creator-bot"
```
Expected: FAIL - executeInternalBaleybot not called

**Step 3: Refactor creator-bot to use internal BaleyBot**

Modify: `apps/web/src/lib/baleybot/creator-bot.ts`

Replace the existing `processCreatorMessage` function with:

```typescript
/**
 * Creator Bot Service
 *
 * The Creator Bot is an internal BaleyBot that helps users build other BaleyBots
 * through natural conversation. It executes through the standard BaleyBot path.
 */

import {
  executeInternalBaleybot,
  INTERNAL_BALEYBOTS,
} from './internal-baleybots';
import {
  creatorOutputSchema,
  type CreatorOutput,
  type CreatorMessage,
} from './creator-types';
import type { GeneratorContext } from './types';
import {
  getToolCatalog,
  formatToolCatalogForCreatorBot,
} from './tools/catalog-service';

// ============================================================================
// TYPES
// ============================================================================

export interface CreatorBotOptions {
  context: GeneratorContext;
  conversationHistory?: CreatorMessage[];
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

function buildCreatorContext(options: CreatorBotOptions): string {
  const { context, conversationHistory = [] } = options;

  const lines: string[] = [];

  // Add tool catalog
  const fullCatalog = getToolCatalog({
    workspaceId: context.workspaceId,
    workspacePolicies: context.workspacePolicies,
    workspaceTools: context.availableTools,
  });
  lines.push(formatToolCatalogForCreatorBot(fullCatalog));

  // Add existing BaleyBots
  if (context.existingBaleybots.length > 0) {
    lines.push('');
    lines.push('## Existing BaleyBots in This Workspace');
    for (const bb of context.existingBaleybots) {
      lines.push(`- **${bb.name}** (${bb.id}): ${bb.description || 'No description'}`);
    }
  }

  // Add conversation history
  if (conversationHistory.length > 0) {
    lines.push('');
    lines.push('## Previous Conversation');
    for (const msg of conversationHistory) {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      lines.push(`${role}: ${msg.content}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Process a message through the Creator Bot.
 * Executes via the internal BaleyBot system with full tracking.
 */
export async function processCreatorMessage(
  options: CreatorBotOptions,
  userMessage: string
): Promise<CreatorOutput> {
  const context = buildCreatorContext(options);

  const { output, executionId } = await executeInternalBaleybot(
    'creator_bot',
    userMessage,
    {
      userWorkspaceId: options.context.workspaceId,
      context,
      triggeredBy: 'internal',
    }
  );

  // Validate and parse the result
  const parsed = creatorOutputSchema.parse(output);

  return parsed;
}

/**
 * @deprecated Use processCreatorMessage instead
 */
export function createCreatorBot(options: CreatorBotOptions) {
  console.warn('createCreatorBot is deprecated. Use processCreatorMessage instead.');
  // Return a minimal Processable-like interface for backwards compatibility
  return {
    async process(input: string) {
      return processCreatorMessage(options, input);
    },
  };
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm test -- --grep "creator-bot"
```
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/baleybot/creator-bot.ts apps/web/src/lib/baleybot/__tests__/creator-bot.test.ts
git commit -m "refactor(creator-bot): migrate to internal BaleyBot execution"
```

---

### Task 2.2: Migrate generator to internal BaleyBot

**Files:**
- Modify: `apps/web/src/lib/baleybot/generator.ts`

**Step 1: Write the failing test**

Create/update: `apps/web/src/lib/baleybot/__tests__/generator.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { generateBal } from '../generator';

vi.mock('../internal-baleybots', () => ({
  executeInternalBaleybot: vi.fn().mockResolvedValue({
    output: {
      balCode: 'test {}',
      explanation: 'Test bot',
      entities: [],
      toolRationale: {},
      suggestedName: 'test',
      suggestedIcon: '🤖',
    },
    executionId: 'exec-123',
  }),
}));

describe('generator', () => {
  it('uses internal BaleyBot for generation', async () => {
    const { executeInternalBaleybot } = await import('../internal-baleybots');

    await generateBal(
      { workspaceId: 'ws-1', availableTools: [], existingBaleybots: [], workspacePolicies: null },
      'Create a bot'
    );

    expect(executeInternalBaleybot).toHaveBeenCalledWith(
      'bal_generator',
      expect.any(String),
      expect.any(Object)
    );
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm test -- --grep "generator"
```
Expected: FAIL

**Step 3: Refactor generator to use internal BaleyBot**

Replace the `generateBal` function in `apps/web/src/lib/baleybot/generator.ts`:

```typescript
// At the top of the file, add import:
import { executeInternalBaleybot } from './internal-baleybots';

// Replace generateBal function:
/**
 * Generate BAL code from a user description.
 * Executes via the internal bal_generator BaleyBot.
 */
export async function generateBal(
  ctx: GeneratorContext,
  userDescription: string,
  conversationHistory?: GenerationMessage[]
): Promise<GenerateResult> {
  // Build context with tool catalog and existing BBs
  const toolCatalog = buildToolCatalog({
    availableTools: ctx.availableTools,
    policies: ctx.workspacePolicies,
  });

  const existingBBsSection =
    ctx.existingBaleybots.length > 0
      ? `\n## Existing BaleyBots\n${ctx.existingBaleybots.map((bb) => `- ${bb.name}: ${bb.description || 'No description'}`).join('\n')}`
      : '';

  const historySection =
    conversationHistory && conversationHistory.length > 0
      ? `\n## Previous conversation:\n${conversationHistory.map((msg) => `${msg.role}: ${msg.content}`).join('\n\n')}\n\nPlease refine based on this feedback.`
      : '';

  const context = `${BAL_SYNTAX_REFERENCE}\n\n${formatToolCatalogForAI(toolCatalog)}${existingBBsSection}`;

  const input = `${historySection}\n\nUser request: ${userDescription}`;

  const { output } = await executeInternalBaleybot('bal_generator', input, {
    userWorkspaceId: ctx.workspaceId,
    context,
    triggeredBy: 'internal',
  });

  // Validate the result
  const parsed = generateResultSchema.parse(output);

  // Validate tool assignments
  const validatedEntities = validateToolAssignments(ctx, parsed.entities);

  return {
    ...parsed,
    entities: validatedEntities,
  };
}

/**
 * @deprecated Use generateBal directly
 */
export function createBalGenerator(ctx: GeneratorContext) {
  console.warn('createBalGenerator is deprecated. Use generateBal instead.');
  return {
    async process(input: string) {
      return generateBal(ctx, input);
    },
  };
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm test -- --grep "generator"
```
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/baleybot/generator.ts apps/web/src/lib/baleybot/__tests__/generator.test.ts
git commit -m "refactor(generator): migrate to internal BaleyBot execution"
```

---

### Task 2.3: Migrate pattern-learner to internal BaleyBot

**Files:**
- Modify: `apps/web/src/lib/baleybot/pattern-learner.ts`

**Step 1: Write the failing test**

Create: `apps/web/src/lib/baleybot/__tests__/pattern-learner.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { proposePattern } from '../pattern-learner';

vi.mock('../internal-baleybots', () => ({
  executeInternalBaleybot: vi.fn().mockResolvedValue({
    output: {
      suggestions: [],
      warnings: [],
      recommendations: [],
    },
    executionId: 'exec-123',
  }),
}));

describe('pattern-learner', () => {
  it('uses internal BaleyBot for pattern proposals', async () => {
    const { executeInternalBaleybot } = await import('../internal-baleybots');

    await proposePattern(
      { tool: 'test', arguments: {}, entityName: 'test', entityGoal: 'test', reason: 'test' },
      { workspaceId: 'ws-1', existingPatterns: [], policies: null }
    );

    expect(executeInternalBaleybot).toHaveBeenCalledWith(
      'pattern_learner',
      expect.any(String),
      expect.any(Object)
    );
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm test -- --grep "pattern-learner"
```
Expected: FAIL

**Step 3: Refactor pattern-learner to use internal BaleyBot**

In `apps/web/src/lib/baleybot/pattern-learner.ts`, add import and replace functions:

```typescript
// Add import at top:
import { executeInternalBaleybot } from './internal-baleybots';

// Replace proposePattern function:
/**
 * Analyze a tool request and suggest patterns.
 * Executes via the internal pattern_learner BaleyBot.
 */
export async function proposePattern(
  request: ApprovalRequest,
  ctx: LearnerContext
): Promise<LearnPatternResult> {
  // Build context with workspace policies
  let contextStr = PATTERN_LEARNING_PROMPT;

  if (ctx.policies) {
    contextStr += `\n\n## Workspace Policies\n`;
    if (ctx.policies.maxAutoApproveAmount !== null) {
      contextStr += `- Max auto-approve amount: $${ctx.policies.maxAutoApproveAmount}\n`;
    }
    if (ctx.policies.reapprovalIntervalDays) {
      contextStr += `- Pattern reapproval interval: ${ctx.policies.reapprovalIntervalDays} days\n`;
    }
  }

  if (ctx.existingPatterns.length > 0) {
    contextStr += `\n\n## Existing Patterns\nThere are ${ctx.existingPatterns.length} existing patterns. Avoid duplicates.`;
  }

  const input = `Tool: ${request.tool}
Entity: ${request.entityName}
Entity Goal: ${request.entityGoal}
Reason: ${request.reason}
Arguments: ${JSON.stringify(request.arguments, null, 2)}

Suggest patterns for auto-approving similar requests.`;

  const { output } = await executeInternalBaleybot('pattern_learner', input, {
    userWorkspaceId: ctx.workspaceId,
    context: contextStr,
    triggeredBy: 'internal',
  });

  return output as LearnPatternResult;
}

// Similarly update analyzeRequestHistory, suggestGeneralization, validatePattern
// (apply same pattern - build context, call executeInternalBaleybot)
```

**Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm test -- --grep "pattern-learner"
```
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/baleybot/pattern-learner.ts apps/web/src/lib/baleybot/__tests__/pattern-learner.test.ts
git commit -m "refactor(pattern-learner): migrate to internal BaleyBot execution"
```

---

### Task 2.4: Migrate reviewer to internal BaleyBot

**Files:**
- Modify: `apps/web/src/lib/baleybot/reviewer.ts`

**Step 1: Write the failing test**

Create: `apps/web/src/lib/baleybot/__tests__/reviewer.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { quickReview } from '../reviewer';

vi.mock('../internal-baleybots', () => ({
  executeInternalBaleybot: vi.fn().mockResolvedValue({
    output: {
      overallAssessment: 'good',
      summary: 'Test review',
      issues: [],
      suggestions: [],
    },
    executionId: 'exec-123',
  }),
}));

describe('reviewer', () => {
  it('uses internal BaleyBot for reviews', async () => {
    const { executeInternalBaleybot } = await import('../internal-baleybots');

    await quickReview({
      baleybotId: 'bb-1',
      baleybotName: 'test',
      originalIntent: 'test',
      balCode: 'test {}',
      input: 'test',
      output: 'test',
    });

    expect(executeInternalBaleybot).toHaveBeenCalledWith(
      'execution_reviewer',
      expect.any(String),
      expect.any(Object)
    );
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm test -- --grep "reviewer"
```
Expected: FAIL

**Step 3: Refactor reviewer to use internal BaleyBot**

In `apps/web/src/lib/baleybot/reviewer.ts`:

```typescript
// Add import:
import { executeInternalBaleybot } from './internal-baleybots';

// Replace quickReview function:
/**
 * Quick review function using internal BaleyBot.
 */
export async function quickReview(ctx: ExecutionContext): Promise<ReviewResult> {
  const input = `## Original Intent
${ctx.originalIntent}

## BaleyBot: ${ctx.baleybotName}

## BAL Code
\`\`\`bal
${ctx.balCode}
\`\`\`

## Input
${typeof ctx.input === 'string' ? ctx.input : JSON.stringify(ctx.input, null, 2)}

## Output
${formatOutput(ctx.output)}

${ctx.error ? `## Error\n${ctx.error}` : ''}
${ctx.durationMs ? `## Execution Time: ${ctx.durationMs}ms` : ''}

Analyze this execution and provide improvement suggestions.`;

  try {
    const { output } = await executeInternalBaleybot('execution_reviewer', input, {
      triggeredBy: 'internal',
    });

    return validateReviewResult(output as Partial<ReviewResult>);
  } catch (error) {
    console.error('Review failed:', error);
    return {
      overallAssessment: 'needs_improvement',
      summary: 'Unable to complete automated review.',
      issues: [],
      suggestions: [],
    };
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm test -- --grep "reviewer"
```
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/baleybot/reviewer.ts apps/web/src/lib/baleybot/__tests__/reviewer.test.ts
git commit -m "refactor(reviewer): migrate to internal BaleyBot execution"
```

---

### Task 2.5: Migrate nl-to-sql-service to internal BaleyBot

**Files:**
- Modify: `apps/web/src/lib/baleybot/services/nl-to-sql-service.ts`

**Step 1: Write the failing test**

Create: `apps/web/src/lib/baleybot/services/__tests__/nl-to-sql-service.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createNLToSQLService } from '../nl-to-sql-service';

vi.mock('../../internal-baleybots', () => ({
  executeInternalBaleybot: vi.fn().mockResolvedValue({
    output: { sql: 'SELECT * FROM users LIMIT 100' },
    executionId: 'exec-123',
  }),
}));

describe('nl-to-sql-service', () => {
  it('uses internal BaleyBot for translation', async () => {
    const { executeInternalBaleybot } = await import('../../internal-baleybots');

    const service = createNLToSQLService({ databaseType: 'postgres' });
    await service.translate('Get all users', 'CREATE TABLE users (id INT)');

    expect(executeInternalBaleybot).toHaveBeenCalledWith(
      'nl_to_sql_postgres',
      expect.any(String),
      expect.any(Object)
    );
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm test -- --grep "nl-to-sql"
```
Expected: FAIL

**Step 3: Refactor nl-to-sql-service to use internal BaleyBot**

In `apps/web/src/lib/baleybot/services/nl-to-sql-service.ts`:

```typescript
// Replace Baleybot import with:
import { executeInternalBaleybot } from '../internal-baleybots';

// Replace createNLToSQLService implementation:
export function createNLToSQLService(config: NLToSQLConfig = {}): NLToSQLService {
  const { databaseType = 'postgres' } = config;
  const botName = databaseType === 'mysql' ? 'nl_to_sql_mysql' : 'nl_to_sql_postgres';

  const service: NLToSQLService = {
    async translate(query: string, schemaContext: string): Promise<string> {
      const input = `DATABASE SCHEMA:
${schemaContext}

USER QUERY:
${query}

Generate the SQL query:`;

      try {
        const { output } = await executeInternalBaleybot(botName, input, {
          triggeredBy: 'internal',
        });

        // Extract SQL from result
        let sql: string;
        if (typeof output === 'string') {
          sql = output;
        } else if (output && typeof output === 'object' && 'sql' in output) {
          sql = String((output as { sql: unknown }).sql);
        } else {
          sql = String(output);
        }

        // Clean up the result
        sql = sql.trim();
        if (sql.startsWith('```sql')) sql = sql.slice(6);
        else if (sql.startsWith('```')) sql = sql.slice(3);
        if (sql.endsWith('```')) sql = sql.slice(0, -3);
        sql = sql.trim();
        if (sql.endsWith(';')) sql = sql.slice(0, -1).trim();

        return sql;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`NL to SQL translation failed: ${message}`);
      }
    },
  };

  return service;
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm test -- --grep "nl-to-sql"
```
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/baleybot/services/nl-to-sql-service.ts apps/web/src/lib/baleybot/services/__tests__/nl-to-sql-service.test.ts
git commit -m "refactor(nl-to-sql): migrate to internal BaleyBot execution"
```

---

### Task 2.6: Migrate web-search-service fallback to internal BaleyBot

**Files:**
- Modify: `apps/web/src/lib/baleybot/services/web-search-service.ts`

**Step 1: Write the failing test**

Create: `apps/web/src/lib/baleybot/services/__tests__/web-search-service.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createWebSearchService } from '../web-search-service';

vi.mock('../../internal-baleybots', () => ({
  executeInternalBaleybot: vi.fn().mockResolvedValue({
    output: { results: [{ title: 'Test', url: 'https://test.com', snippet: 'Test result' }] },
    executionId: 'exec-123',
  }),
}));

describe('web-search-service', () => {
  it('uses internal BaleyBot for AI fallback', async () => {
    const { executeInternalBaleybot } = await import('../../internal-baleybots');

    const service = createWebSearchService({}); // No Tavily key
    await service.search('test query', 5);

    expect(executeInternalBaleybot).toHaveBeenCalledWith(
      'web_search_fallback',
      expect.any(String),
      expect.any(Object)
    );
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/web && pnpm test -- --grep "web-search"
```
Expected: FAIL

**Step 3: Refactor web-search-service to use internal BaleyBot**

In `apps/web/src/lib/baleybot/services/web-search-service.ts`:

```typescript
// Replace Baleybot import with:
import { executeInternalBaleybot } from '../internal-baleybots';

// Replace searchWithAI function:
async function searchWithAI(query: string, numResults: number): Promise<SearchResult[]> {
  try {
    const input = `Search the web for: ${query}
Return ${numResults} relevant search results.`;

    const { output } = await executeInternalBaleybot('web_search_fallback', input, {
      triggeredBy: 'internal',
    });

    // Parse the result
    const result = output as { results?: unknown[] } | unknown[];

    const results = Array.isArray(result) ? result : (result as { results?: unknown[] }).results;

    if (Array.isArray(results)) {
      return results.slice(0, numResults).map((item: unknown) => {
        const obj = item as Record<string, unknown>;
        return {
          title: String(obj.title || ''),
          url: String(obj.url || ''),
          snippet: String(obj.snippet || ''),
        };
      });
    }

    throw new Error('Invalid response format');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[web_search] AI fallback failed:', message);

    return [{
      title: 'Web Search Unavailable',
      url: 'https://tavily.com',
      snippet: `Web search unavailable. Add Tavily API key. Error: ${message}`,
    }];
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/web && pnpm test -- --grep "web-search"
```
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/baleybot/services/web-search-service.ts apps/web/src/lib/baleybot/services/__tests__/web-search-service.test.ts
git commit -m "refactor(web-search): migrate AI fallback to internal BaleyBot"
```

---

## Phase 3: App Initialization & Seeding

### Task 3.1: Add internal BaleyBot seeding to app startup

**Files:**
- Create: `apps/web/src/instrumentation.ts`
- Modify: `apps/web/next.config.ts` (if needed)

**Step 1: Create instrumentation file for server startup**

Create: `apps/web/src/instrumentation.ts`

```typescript
/**
 * Next.js Instrumentation
 *
 * This file runs once when the server starts.
 * Used to initialize internal BaleyBots and built-in tool services.
 */

export async function register() {
  // Only run on server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { seedInternalBaleybots } = await import('@/lib/baleybot/internal-baleybots');
    const { initializeBuiltInToolServices } = await import('@/lib/baleybot/services');

    try {
      // Initialize built-in tool services
      initializeBuiltInToolServices({
        tavilyApiKey: process.env.TAVILY_API_KEY,
      });

      // Seed internal BaleyBots
      await seedInternalBaleybots();

      console.log('[instrumentation] BaleyUI initialized successfully');
    } catch (error) {
      console.error('[instrumentation] Failed to initialize:', error);
    }
  }
}
```

**Step 2: Verify next.config allows instrumentation**

Check `apps/web/next.config.ts` has:
```typescript
experimental: {
  instrumentationHook: true,
}
```

**Step 3: Test startup**

```bash
cd apps/web && pnpm dev
```
Expected: Console shows "[instrumentation] BaleyUI initialized successfully"

**Step 4: Commit**

```bash
git add apps/web/src/instrumentation.ts apps/web/next.config.ts
git commit -m "feat: add app startup initialization for internal BaleyBots"
```

---

## Phase 4: Remove Legacy Code

### Task 4.1: Remove direct Baleybot.create() calls from migrated services

**Files:**
- Modify: `apps/web/src/lib/baleybot/creator-bot.ts`
- Modify: `apps/web/src/lib/baleybot/generator.ts`
- Modify: `apps/web/src/lib/baleybot/pattern-learner.ts`
- Modify: `apps/web/src/lib/baleybot/reviewer.ts`
- Modify: `apps/web/src/lib/baleybot/services/nl-to-sql-service.ts`
- Modify: `apps/web/src/lib/baleybot/services/web-search-service.ts`

**Step 1: Clean up imports**

Remove `import { Baleybot } from '@baleybots/core'` from all migrated files.

**Step 2: Remove deprecated factory functions**

Remove the `createCreatorBot`, `createBalGenerator`, `createPatternLearner`, `createReviewer` factory functions that were marked as deprecated.

**Step 3: Run full test suite**

```bash
cd apps/web && pnpm test
```
Expected: All tests pass

**Step 4: Run type check**

```bash
pnpm type-check
```
Expected: No type errors

**Step 5: Commit**

```bash
git add apps/web/src/lib/baleybot/
git commit -m "chore: remove legacy Baleybot.create() calls from migrated services"
```

---

## Phase 5: Verification & Documentation

### Task 5.1: Add integration test for internal BaleyBot execution

**Files:**
- Create: `apps/web/src/lib/baleybot/__tests__/internal-baleybots.integration.test.ts`

**Step 1: Create integration test**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { seedInternalBaleybots, getInternalBaleybot, INTERNAL_BALEYBOTS } from '../internal-baleybots';
import { db, baleybots, eq } from '@baleyui/db';
import { getOrCreateSystemWorkspace, clearSystemWorkspaceCache } from '@/lib/system-workspace';

describe('internal-baleybots integration', () => {
  beforeAll(async () => {
    clearSystemWorkspaceCache();
  });

  afterAll(async () => {
    // Clean up test data
    const systemWs = await getOrCreateSystemWorkspace();
    await db.delete(baleybots).where(eq(baleybots.workspaceId, systemWs));
  });

  it('seeds all internal BaleyBots to database', async () => {
    await seedInternalBaleybots();

    const systemWs = await getOrCreateSystemWorkspace();
    const internalBBs = await db.query.baleybots.findMany({
      where: (bb, { and }) => and(
        eq(bb.workspaceId, systemWs),
        eq(bb.isInternal, true)
      ),
    });

    expect(internalBBs.length).toBe(Object.keys(INTERNAL_BALEYBOTS).length);
  });

  it('getInternalBaleybot returns seeded bot', async () => {
    const bot = await getInternalBaleybot('creator_bot');

    expect(bot).not.toBeNull();
    expect(bot?.name).toBe('creator_bot');
    expect(bot?.balCode).toContain('creator_bot');
  });

  it('internal BaleyBots have valid BAL code', async () => {
    for (const name of Object.keys(INTERNAL_BALEYBOTS)) {
      const bot = await getInternalBaleybot(name);
      expect(bot).not.toBeNull();
      expect(bot?.balCode).toContain(name);
    }
  });
});
```

**Step 2: Run integration test**

```bash
cd apps/web && pnpm test -- --grep "integration"
```
Expected: All integration tests pass

**Step 3: Commit**

```bash
git add apps/web/src/lib/baleybot/__tests__/internal-baleybots.integration.test.ts
git commit -m "test: add integration tests for internal BaleyBots"
```

---

### Task 5.2: Update CLAUDE.md with internal BaleyBots documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add internal BaleyBots section**

Add to CLAUDE.md under "## Built-in Tools Reference":

```markdown
## Internal BaleyBots

BaleyUI uses BaleyBots internally ("eating our own cooking"). These are stored in the database with `isInternal: true`:

| Name | Purpose |
|------|---------|
| `creator_bot` | Creates new BaleyBots from user descriptions |
| `bal_generator` | Converts descriptions to BAL code |
| `pattern_learner` | Analyzes approvals, suggests patterns |
| `execution_reviewer` | Reviews executions, suggests improvements |
| `nl_to_sql_postgres` | Translates NL to PostgreSQL |
| `nl_to_sql_mysql` | Translates NL to MySQL |
| `web_search_fallback` | AI fallback when no Tavily key |

### Using Internal BaleyBots

```typescript
import { executeInternalBaleybot } from '@/lib/baleybot/internal-baleybots';

const { output, executionId } = await executeInternalBaleybot('creator_bot', userMessage, {
  userWorkspaceId: workspace.id,
  context: additionalContext,
});
```

All internal BaleyBot executions are tracked in `baleybotExecutions`.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add internal BaleyBots documentation to CLAUDE.md"
```

---

## Verification Checklist

After all tasks complete:

```bash
# 1. Type checking
pnpm type-check

# 2. Linting
pnpm lint

# 3. Run all tests
pnpm test

# 4. Start dev server and verify startup
cd apps/web && pnpm dev
# Check console for: "[instrumentation] BaleyUI initialized successfully"

# 5. Verify database has internal BaleyBots
# Connect to DB and run:
# SELECT name, is_internal FROM baleybots WHERE is_internal = true;
# Should see 7 internal BaleyBots

# 6. Test creator bot through UI
# - Open BaleyBot creator
# - Send a message
# - Verify execution is tracked in baleybotExecutions table
```

---

## Summary

| Phase | Tasks | Purpose |
|-------|-------|---------|
| 1 | 1.1-1.3 | Schema & Infrastructure |
| 2 | 2.1-2.6 | Migrate Services |
| 3 | 3.1 | App Initialization |
| 4 | 4.1 | Remove Legacy Code |
| 5 | 5.1-5.2 | Verification & Docs |

**Total: 12 tasks**

**Dependencies to add:** None (uses existing packages)

**Schema changes:**
- Add `isInternal: boolean` to `baleybots` table

**New files:**
- `apps/web/src/lib/system-workspace.ts`
- `apps/web/src/lib/baleybot/internal-baleybots.ts`
- `apps/web/src/instrumentation.ts`
- Various test files

**Modified files:**
- `packages/db/src/schema.ts`
- `apps/web/src/lib/baleybot/creator-bot.ts`
- `apps/web/src/lib/baleybot/generator.ts`
- `apps/web/src/lib/baleybot/pattern-learner.ts`
- `apps/web/src/lib/baleybot/reviewer.ts`
- `apps/web/src/lib/baleybot/services/nl-to-sql-service.ts`
- `apps/web/src/lib/baleybot/services/web-search-service.ts`
- `CLAUDE.md`
