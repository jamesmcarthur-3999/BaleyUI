# BaleyUI - AI Development Context

Essential context for AI-assisted development on this project.

## Critical Rules

- When implementing fixes or changes, ALWAYS verify you are editing the correct file that is actually used at runtime. Check build configs, bundler resolution (e.g., Vite, webpack), and dist vs source paths before making edits. Never assume the source file you find via grep is the one being loaded.
- Do NOT give superficial fixes or declare victory prematurely. When debugging, trace the FULL execution path from entry point to failure before proposing a fix. If the user pushes back, it means your analysis was too shallow — go deeper, don't just try another surface-level patch.

## Project Overview

BaleyUI is a visual platform for building AI-powered workflows using BaleyBots. The core abstraction is the **BaleyBot (BB)** - an AI agent defined in BAL (Baleybots Assembly Language) that can use tools, chain with other BBs, and be triggered automatically.

## Design Philosophy: AI-First

BaleyUI builds **AI-controlled systems**, not hard-coded software. Every feature should default to BaleyBot intelligence over deterministic code.

### Decision Framework (in priority order)

1. **Can an existing internal BaleyBot do this?** — Internal bots cover creation, testing, deployment, review, NL-to-SQL, pattern learning, and more (see Internal BaleyBots table below)
2. **Can a new BaleyBot via BAL composition handle it?** — chain, parallel, if/else, loop, map, select, merge
3. **Can a built-in tool empower a BaleyBot to do it?** — Built-in tools like web_search, spawn_baleybot, schedule_task, store_memory, etc. (see Built-in Tools Reference below)
4. **Does this need a new tool that BaleyBots use?** — Extend capability, not logic
5. **Only if none of the above:** write deterministic code (DB operations, auth, streaming infrastructure, HTTP routing)

### Anti-Patterns (never do these)

- Hard-coded if/else trees for decisions a BaleyBot should make
- Multi-step wizards where a conversational BaleyBot should guide the user
- Static routing tables where BAL `if/else` + classifier output should dispatch
- Manual review forms where `execution_reviewer` should analyze and suggest
- Rigid pipelines where adaptive BAL chains should self-correct

**See the `baleyui-feature-design` skill for detailed design guidance, anti-pattern tables, and before/after examples.**

## Current Development Focus

**Active Work:** Implementing the complete tool ecosystem (35 tasks across 8 phases)
- See: `docs/plans/2026-02-03-tool-ecosystem-complete-implementation.md`
- Prompt: `docs/plans/execution-prompt.md`

### Future Work: SSO Activation (GitHub + Google)

**Status:** Code complete, waiting on OAuth credentials from user.

The SSO code is fully wired and conditional — buttons only appear when `NEXT_PUBLIC_AUTH_*` flags are set to `"true"`.

**Files already implemented:**
- `apps/web/src/lib/auth/server.ts` — conditional `socialProviders` config
- `apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx` — social sign-in buttons
- `apps/web/src/app/(auth)/sign-up/[[...sign-up]]/page.tsx` — social sign-up buttons
- `apps/web/.env.example` — documents all 6 env vars

**To activate (when ready):**

1. **GitHub OAuth App** — Create at https://github.com/settings/developers
   - Callback URL: `https://baley-ui-web.vercel.app/api/auth/callback/github`

2. **Google OAuth** — Create at https://console.cloud.google.com/apis/credentials
   - Callback URL: `https://baley-ui-web.vercel.app/api/auth/callback/google`

3. **Add env vars to Vercel:**
   ```bash
   printf 'YOUR_GITHUB_CLIENT_ID' | vercel env add GITHUB_CLIENT_ID preview
   printf 'YOUR_GITHUB_CLIENT_SECRET' | vercel env add GITHUB_CLIENT_SECRET preview
   printf 'YOUR_GOOGLE_CLIENT_ID' | vercel env add GOOGLE_CLIENT_ID preview
   printf 'YOUR_GOOGLE_CLIENT_SECRET' | vercel env add GOOGLE_CLIENT_SECRET preview
   printf 'true' | vercel env add NEXT_PUBLIC_AUTH_GITHUB preview
   printf 'true' | vercel env add NEXT_PUBLIC_AUTH_GOOGLE preview
   ```

4. Redeploy: `vercel --prod` (or push to main)

**Note:** `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `NEXT_PUBLIC_BETTER_AUTH_URL` are already set on Vercel for preview.

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

#### Raw SSE Events
Types re-exported from `@/lib/streaming/types/events` (source: `@baleybots/core`). Key fields: use `content` (NOT `delta`) for text events, `id` for tool call ID, `reason` (NOT `result`) for done events.

**See the `baleyui-development` skill or `docs/reference/STREAMING_EVENT_SCHEMA.md` for the complete, authoritative streaming events reference.**

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
| `creator_action_advisor` | Suggests next creator actions based on context |
| `bal_generator` | Converts descriptions to BAL code |
| `pattern_learner` | Analyzes approvals, suggests patterns |
| `execution_reviewer` | Reviews executions, suggests improvements |
| `nl_to_sql_postgres` | Translates NL to PostgreSQL |
| `nl_to_sql_mysql` | Translates NL to MySQL |
| `web_search_fallback` | AI fallback when no Tavily key |
| `connection_advisor` | Advises on connection requirements |
| `test_orchestrator` | Topology-aware test designer |
| `test_generator` | Generates test cases from BB goal |
| `test_validator` | Validates test output semantically |
| `test_results_analyzer` | Analyzes test run results |
| `deployment_advisor` | Advises on triggers/scheduling/activation |
| `integration_builder` | Conversational integration guide |
| `test_interface_designer` | Designs optimal test UI for a BB |
| `tool_executor` | Executes NL-defined workspace tools |
| `context_processor` | Processes and enriches context for BB execution |
| `design_analyzer` | Extracts design signals from URLs/assets/text |
| `design_dossier_synthesizer` | Merges source evidence into canonical brand dossier |
| `design_generator` | Generates full multi-surface design package |
| `design_refiner` | Refines existing design package with feedback |

### Using Internal BaleyBots

```typescript
import { executeInternalBaleybot } from '@/lib/baleybot/internal-baleybots';

const { output, executionId } = await executeInternalBaleybot('bal_generator', userMessage, {
  userWorkspaceId: workspace.id,
  context: additionalContext,
});
```

All internal BaleyBot executions are tracked in `baleybotExecutions`.

## Internal BB Contract Rules

### BAL output blocks (`"output": { ... }`) are scalar-safe only
- Keep BAL output fields to concrete scalar-safe types where possible (`string`, `number`, `boolean`, `array<string>`, `array<number>`, `array<boolean>`).
- Do **not** use generic `"object"` or `"array<object>"` in BAL structured output paths.
- If a bot needs rich nested output, omit BAL `output` and enforce shape in the app-layer contract gateway with Zod schemas.

### Why
- Provider structured-output contracts reject empty/generic object schemas in strict modes.
- BaleyUI enforces typed parsing in `contract-gateway.ts`, with repair retries and deterministic fallback.

### The `normalizeOutputCandidate()` pattern
Internal bot callers should wrap `output` in `normalizeOutputCandidate()` before `.parse()`:
```typescript
// Handles: object passthrough, JSON string, markdown-fenced JSON, balanced JSON extraction
const resolved = normalizeOutputCandidate(output);
const result = schema.parse(resolved);
```
See `runner.ts:normalizeOutputCandidate()` for the implementation.

## BAL Syntax Reference

```bal
# Single BaleyBot with all properties
assistant {
  "goal": "Help users with questions",
  "model": "anthropic:claude-sonnet-4-20250514",
  "tools": { "web_search", "fetch_url" },
  "maxTokens": 4096
}
# NOTE: temperature, reasoning, stopWhen, retries, can_request are NOT YET SUPPORTED in BAL syntax

# Compositions
chain { a b }                                    # Sequential
parallel { a b }                                 # Concurrent
if ("result.score > 0.8") { a } else { b }      # Conditional
loop ("until": "result.done", "max": 5) { a }   # Iteration
map result.items { enricher }                    # Per-item mapping
select { "summary": "result.summary" }           # Output reshaping
merge { "combined": "result.branch_0" }          # Merge branch outputs
```

## Testing & Verification

After implementing changes, verify the app ACTUALLY WORKS end-to-end, not just that lint/types/tests pass. Passing CI checks do not mean the app is functional. Launch the app or test the real user flow when possible.

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

## Git Operations

Before any git stash pop or branch merge, list all uncommitted changes and verify they will survive the operation. After the operation, diff to confirm no changes were silently dropped. If a stash pop has conflicts, stop and report before proceeding.

## Documentation

| Doc | Purpose |
|-----|---------|
| `PLAN.md` | Architecture, vision, database schema |
| `CODING_GUIDELINES.md` | React 19, Next.js 15 patterns |
| `AGENTS.md` | Task assignments |
| `docs/getting-started.md` | Quick-start guide |
| `docs/reference/` | BAL language, type system, builder events, streaming events, design system |
| `docs/reference/STREAMING_EVENT_SCHEMA.md` | SSE event format (raw events from SDK) |
| `docs/guides/` | Developer guide, testing |
| `docs/plans/` | Implementation plans |
| `docs/architecture/` | Technical deep-dives |

### Streaming Reference Hierarchy
1. **This file (CLAUDE.md)** — How to use the streaming system (SDK-aligned)
2. **`@baleybots/chat` types** — Canonical `StreamSegment` types, `reduceStreamEvent()`
3. **`@/components/chat/`** — React rendering layer for segments
4. **`docs/reference/STREAMING_EVENT_SCHEMA.md`** — Raw SSE event format (if building server-side)
