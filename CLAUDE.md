# BaleyUI - AI Development Context

Essential context for AI-assisted development on this project.

## Project Overview

BaleyUI is a visual platform for building AI-powered workflows using BaleyBots. The core abstraction is the **BaleyBot (BB)** - an AI agent defined in BAL (Baleybots Assembly Language) that can use tools, chain with other BBs, and be triggered automatically.

## Current Development Focus

**Branch:** `feature/tool-ecosystem`

**Active Work:** Implementing the complete tool ecosystem (35 tasks across 8 phases)
- See: `docs/plans/2026-02-03-tool-ecosystem-complete-implementation.md`
- Prompt: `docs/plans/execution-prompt.md`

## Critical Patterns

### React 19 - No Manual Memoization
The React 19 compiler handles optimization automatically:
```typescript
// DON'T do this
const memoized = useMemo(() => expensive(), [deps]);
const callback = useCallback(() => {}, [deps]);
export default React.memo(Component);

// DO this - just write normal code
const result = expensive();
const handler = () => {};
export default Component;
```

### Database Helpers (Always Use These)
```typescript
import { notDeleted, updateWithLock, withTransaction } from '@baleyui/db';

// All queries must filter soft-deleted records
const items = await db.query.baleybots.findMany({
  where: notDeleted(baleybots)
});

// Updates must use optimistic locking
await updateWithLock(baleybots, id, version, { name: 'new' });

// Multi-table operations use transactions
await withTransaction(async (tx) => {
  await tx.insert(tableA).values({...});
  await tx.insert(tableB).values({...});
});
```

### BaleyBot Streaming Events
Use exact field names from the @baleybots/core package:
- `text_delta` event: use `content` (NOT `delta`)
- Tool events: use `id` (NOT `toolCallId`)
- `done` event: use `reason` (NOT `result`)

### Streaming UI Performance
- Use RAF batching + direct DOM manipulation
- Don't update React state per token
- Use CSS animations, not Framer Motion for high-frequency updates

## Key File Locations

| Area | Path |
|------|------|
| Database Schema | `packages/db/src/schema.ts` |
| tRPC Routers | `apps/web/src/lib/trpc/routers/` |
| BaleyBot Executor | `apps/web/src/lib/baleybot/executor.ts` |
| Built-in Tools | `apps/web/src/lib/baleybot/tools/built-in/` |
| Tool Catalog | `apps/web/src/lib/baleybot/tools/catalog-service.ts` |
| Connection Tools | `apps/web/src/lib/baleybot/tools/connection-derived/` |
| Services | `apps/web/src/lib/baleybot/services/` |
| Internal BaleyBots | `apps/web/src/lib/baleybot/internal-baleybots.ts` |
| Stream Events | `apps/web/src/lib/streaming/types/events.ts` |
| Connections | `apps/web/src/lib/connections/` |

## Built-in Tools Reference

| Tool | Purpose | Approval |
|------|---------|----------|
| `web_search` | Search the web | No |
| `fetch_url` | Fetch URL content | No |
| `spawn_baleybot` | Execute another BB | No |
| `send_notification` | Notify user | No |
| `store_memory` | Persist key-value data | No |
| `schedule_task` | Schedule future execution | Yes |
| `create_agent` | Create ephemeral agent | Yes |
| `create_tool` | Create ephemeral tool | Yes |

## Internal BaleyBots

BaleyUI uses BaleyBots internally ("eating our own cooking"). These are stored in the database with `isInternal: true` and execute through the standard BaleyBot path with full tracking:

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

## BAL Syntax Reference

```bal
# Single BaleyBot
assistant {
  "goal": "Help users with questions",
  "model": "anthropic:claude-sonnet-4-20250514",
  "tools": ["web_search", "fetch_url"],
  "can_request": ["schedule_task"]
}

# BB Cluster (multiple BBs)
analyzer {
  "goal": "Analyze data",
  "trigger": "webhook"
}

reporter {
  "goal": "Generate report",
  "trigger": "bb_completion:analyzer"
}

chain { analyzer reporter }
```

## Testing

```bash
pnpm test              # Run all tests
pnpm test:watch        # Watch mode
pnpm type-check        # TypeScript checking
pnpm lint              # ESLint
```

## Common Tasks

### Add a Database Table
1. Add table definition in `packages/db/src/schema.ts`
2. Add relations if needed
3. Export from `packages/db/src/index.ts`
4. Run `pnpm db:push` (dev) or `pnpm db:generate && pnpm db:migrate` (prod)

### Add a tRPC Router
1. Create router in `apps/web/src/lib/trpc/routers/`
2. Add to `apps/web/src/lib/trpc/routers/index.ts`
3. Router is automatically available at `/api/trpc`

### Add a Built-in Tool
1. Add schema to `tools/built-in/index.ts`
2. Add metadata to `BUILT_IN_TOOLS_METADATA`
3. Add implementation to `tools/built-in/implementations.ts`
4. Wire up in `getBuiltInRuntimeTools()`

## Documentation

| Doc | Purpose |
|-----|---------|
| `PLAN.md` | Architecture, vision, database schema |
| `CODING_GUIDELINES.md` | React 19, Next.js 15 patterns |
| `AGENTS.md` | Task assignments |
| `docs/plans/` | Implementation plans |
| `docs/architecture/` | Technical deep-dives |
