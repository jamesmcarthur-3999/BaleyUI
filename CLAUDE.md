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

### Streaming Architecture (SDK-Aligned)

**The canonical streaming system uses `@baleybots/chat`'s `StreamSegment` types and `reduceStreamEvent()` reducer.** Do NOT build custom stream accumulators or invent new streaming state types.

**Pipeline:** SSE events → `ServerStreamEvent` wrapper → `reduceStreamEvent()` → `StreamSegmentState` → `SegmentRenderer`

#### State Management
```typescript
// Use AppStreamState (wraps SDK's StreamSegmentState)
import { streamReducer, createInitialAppStreamState, type AppStreamState } from '@/hooks/useStreamState';

const [state, dispatch] = useReducer(streamReducer, createInitialAppStreamState());

// Start stream
dispatch({ type: 'START_STREAM', botId, botName });

// Process each SSE event
dispatch({ type: 'PROCESS_EVENT', event: serverStreamEvent });

// Access segments for rendering
const { segments, isDone, fullTextContent } = state.segmentState;
```

#### UI Rendering
```typescript
// Use the unified chat component library
import { SegmentRenderer, ChatThread, ChatBubble, CREATOR_CONFIG, COMPANION_CONFIG } from '@/components/chat';

// Render segments directly
<SegmentRenderer segments={state.segmentState.segments} config={CREATOR_CONFIG} />

// Or use full chat thread
<ChatThread messages={messages} config={COMPANION_CONFIG} />
```

#### SDK Segment Types (9 types)
| Segment | Type | Status Values | Key Fields |
|---------|------|---------------|------------|
| `TextSegment` | `'text'` | — | `content`, `isStreaming` |
| `ToolCallSegment` | `'tool_call'` | `'running' \| 'completed' \| 'failed'` | `name`, `args`, `result`, `error` |
| `ReasoningSegment` | `'reasoning'` | — | `content`, `isStreaming` |
| `SpawnAgentSegment` | `'spawn_agent'` | `'running' \| 'completed' \| 'failed'` | `goal`, `childSegments`, `agentType` |
| `SequentialThinkingSegment` | `'sequential_thinking'` | `'running' \| 'completed'` | `thoughts: ThoughtItem[]` |
| `DSLPipelineSegment` | `'dsl_pipeline'` | `'streaming' \| 'parsing' \| 'running' \| 'completed' \| 'failed'` | `definedBots`, `code` |
| `StructuredOutputSegment` | `'structured_output'` | — | `content`, `isStreaming` |
| `ErrorSegment` | `'error'` | — | `message`, `details` |
| `DoneSegment` | `'done'` | — | `reason`, `duration_ms`, `reasonDisplay` |

**IMPORTANT:** Tool call status values are `'running'` / `'completed'` / `'failed'` (NOT the old `'executing'` / `'complete'` / `'error'`).

#### Chat Component Library (`@/components/chat`)
| Export | Purpose |
|--------|---------|
| `ChatThread` | Full scrollable message list with auto-scroll |
| `ChatBubble` | Single message wrapper (avatar, copy, retry) |
| `SegmentRenderer` | Renders `StreamSegment[]` with filtering and grouping |
| `CREATOR_CONFIG` | Full-page config (all segment types enabled) |
| `COMPANION_CONFIG` | Floating panel config (text, tool_call, error only) |
| `getToolLabel()` | Human-readable tool labels ("Searching the web for X") |
| `deriveSegments()` | Extract renderable segments from `StreamSegmentState` |
| `textToSegments()` | Convert plain text to `TextSegment[]` for stored messages |

#### Legacy Compatibility
Old `StreamState` / `ToolCallState` / `ToolCallStatus` types in `@/lib/streaming/types/state` are **deprecated but still exported** for backward compat. Adapters available:
- `toOldToolCallStatus()` — converts SDK status to legacy status
- `getToolCallStates()` — extracts legacy `ToolCallState[]` from SDK segments

**Do NOT use legacy types for new features.** They will be removed once all consumers migrate.

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
| **Chat Components** | `apps/web/src/components/chat/` (unified library) |
| **Stream Reducer** | `apps/web/src/hooks/useStreamState.ts` (SDK-aligned) |
| Stream Events | `apps/web/src/lib/streaming/types/events.ts` (re-exports from @baleybots/core) |
| Stream Types (legacy) | `apps/web/src/lib/streaming/types/state.ts` (deprecated, use SDK) |
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

### Resilient Schemas for BAL Output
BAL `array<object>` produces `z.array(z.record(z.string(), z.unknown()))` — the model doesn't know which inner fields are required. When consuming BAL output in caller schemas, use Zod `.default()` coercions for non-critical fields instead of strict `.min(1)` requirements. Only keep `.min(1)` on truly unrecoverable fields (e.g., `name`, `balCode`).

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

### Build a Streaming Feature

Any feature that displays real-time BaleyBot execution output follows this pattern:

1. **State:** Use `AppStreamState` + `streamReducer` from `@/hooks/useStreamState`
2. **Events:** Feed `ServerStreamEvent`s via `dispatch({ type: 'PROCESS_EVENT', event })`
3. **Segments:** Read `state.segmentState.segments` — this is the ordered `StreamSegment[]`
4. **Render:** Use `<SegmentRenderer segments={...} config={...} />` from `@/components/chat`
5. **Config:** Pick `CREATOR_CONFIG` (all segments) or `COMPANION_CONFIG` (minimal), or define custom
6. **Tool labels:** They're automatic — `SegmentRenderer` uses `getToolLabel()` internally
7. **Stored messages:** Convert text to segments with `textToSegments(content)` for consistency

**Do NOT:**
- Build a custom reducer that accumulates text/toolCalls separately (the SDK handles interleaving)
- Use the old `StreamState` type for new features
- Invent new segment types — extend `SystemBlock` or contribute to the SDK

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
| `docs/reference/STREAMING_EVENT_SCHEMA.md` | SSE event format (raw events from SDK) |
| `docs/guides/` | Developer guide, testing |
| `docs/plans/` | Implementation plans |
| `docs/architecture/` | Technical deep-dives |

### Streaming Reference Hierarchy
1. **This file (CLAUDE.md)** — How to use the streaming system (SDK-aligned)
2. **`@baleybots/chat` types** — Canonical `StreamSegment` types, `reduceStreamEvent()`
3. **`@/components/chat/`** — React rendering layer for segments
4. **`docs/reference/STREAMING_EVENT_SCHEMA.md`** — Raw SSE event format (if building server-side)
