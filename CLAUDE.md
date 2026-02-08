# BaleyUI - AI Development Context

Essential context for AI-assisted development on this project.

## Project Overview

BaleyUI is a visual platform for building AI-powered workflows using BaleyBots. The core abstraction is the **BaleyBot (BB)** - an AI agent defined in BAL (Baleybots Assembly Language) that can use tools, chain with other BBs, and be triggered automatically.

## Current Development Focus

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
Types are re-exported from `@/lib/streaming/types/events` (source: @baleybots/core).

**Key event field names:**
- `text_delta`: `{ type, content }`
- `tool_call_stream_start`: `{ type, id, toolName }`
- `tool_call_arguments_delta`: `{ type, id, argumentsDelta }`
- `tool_call_stream_complete`: `{ type, id, toolName, arguments }`
- `tool_execution_start`: `{ type, id, toolName, arguments }`
- `tool_execution_output`: `{ type, id, toolName, result, error? }`
- `tool_execution_stream`: `{ type, toolName, nestedEvent, childBotName?, toolCallId? }`
- `done`: `{ type, reason, agent_id, parent_agent_id?, timestamp, duration_ms, ... }`

**DoneReason values:** `turn_yielded`, `out_of_iterations`, `max_tokens_reached`, `error`, `interrupted`, `no_applicable_tools`, `max_depth_reached`, `graceful_shutdown`

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
| Stream Events | `apps/web/src/lib/streaming/types/events.ts` (re-exports from @baleybots/core) |
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

## BAL Output Type Rules

### Supported types in `"output": { ... }` blocks:
| BAL type | Zod schema | Use for |
|----------|-----------|---------|
| `"string"` | `z.string()` | Text fields |
| `"number"` | `z.number()` | Numeric fields |
| `"boolean"` | `z.boolean()` | True/false fields |
| `"array"` | `z.array(z.string())` | Arrays of strings |
| `"array<object>"` | `z.array(z.record(z.string(), z.unknown()))` | Arrays of objects |
| `"array<number>"` | `z.array(z.number())` | Arrays of numbers |
| `"array<string>"` | `z.array(z.string())` | Same as bare `"array"` |
| `"array<boolean>"` | `z.array(z.boolean())` | Arrays of booleans |
| `"object"` | `z.record(z.string(), z.unknown())` | Nested objects |

### When to use `"array"` vs `"array<object>"`
- Use `"array"` for simple string lists (e.g., `warnings`, `recommendations`, `nextSteps`)
- Use `"array<object>"` for arrays of structured items (e.g., `entities`, `tests`, `suggestions` with inner fields)

### The `resolveOutput()` pattern
Internal bot callers should wrap `output` in a `resolveOutput()` helper before `.parse()`:
```typescript
// Handles: object passthrough, JSON string, markdown-fenced JSON
const resolved = resolveOutput(output);
const result = schema.parse(resolved);
```
See `creator-bot.ts:resolveCreatorOutput()` and `pattern-learner.ts:resolveOutput()` for examples.

## BAL Syntax Reference

```bal
# Single BaleyBot with all properties
assistant {
  "goal": "Help users with questions",
  "model": "anthropic:claude-sonnet-4-20250514",
  "tools": ["web_search", "fetch_url"],
  "can_request": ["schedule_task"],
  "temperature": 0.7,
  "reasoning": "high",
  "stopWhen": "stepCount:10",
  "retries": 2,
  "maxTokens": 4096
}

# Compositions
chain { a b }                                    # Sequential
parallel { a b }                                 # Concurrent
if ("result.score > 0.8") { a } else { b }      # Conditional
loop ("until": "result.done", "max": 5) { a }   # Iteration
try ("retries": 3) { a } catch { b }            # Error handling
route(classifier) { "type1": h1, "type2": h2 }  # Multi-way routing
gate("result.needsReview") { reviewer }          # Conditional gate
filter("item.score > 0.5") { enricher }          # Array filter
processor("extract") { "result.data" }           # Data transform
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
| `docs/getting-started.md` | Quick-start guide |
| `docs/reference/` | BAL language, type system, events, design system |
| `docs/guides/` | Developer guide, testing |
| `docs/plans/` | Implementation plans |
| `docs/architecture/` | Technical deep-dives |
