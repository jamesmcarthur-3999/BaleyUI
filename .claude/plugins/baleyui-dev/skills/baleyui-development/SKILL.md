---
name: baleyui-development
description: Complete BaleyUI platform development reference - BAL language, architecture, database patterns, BaleyBot execution, internal bots, creator flow, streaming UI, and testing. Use for ANY work in the BaleyUI codebase.
---

# BaleyUI Development

## 1. Quick Reference

### Built-in Tools

| Tool | Category | Approval | Description |
|------|----------|----------|-------------|
| `web_search` | information | No | Web search via Tavily API |
| `fetch_url` | information | No | Fetch URL content (HTML/text/JSON) |
| `spawn_baleybot` | orchestration | No | Execute another BB, return result |
| `send_notification` | notification | No | In-app notification to user |
| `store_memory` | storage | No | Persist key-value data across executions |
| `shared_storage` | storage | No | Workspace-scoped cross-BB shared data |
| `request_user_input` | interaction | No | Ask user a question mid-execution |
| `schedule_task` | orchestration | **Yes** | Schedule BB for future/cron execution |
| `create_agent` | orchestration | **Yes** | Create ephemeral agent for current run |
| `create_tool` | orchestration | **Yes** | Define custom NL-described tool |

### Key File Locations

| Area | Path |
|------|------|
| DB Schema | `packages/db/src/schema.ts` |
| tRPC Routers | `apps/web/src/lib/trpc/routers/` |
| Executor | `apps/web/src/lib/baleybot/executor.ts` |
| Built-in Tools | `apps/web/src/lib/baleybot/tools/built-in/` |
| Tool Catalog | `apps/web/src/lib/baleybot/tools/catalog-service.ts` |
| Connection Tools | `apps/web/src/lib/baleybot/tools/connection-derived/` |
| Internal BBs | `apps/web/src/lib/baleybot/internal-bb/` |
| Internal BB Specs | `apps/web/src/lib/baleybot/internal-bb/source/specs.json` |
| Stream Events | `apps/web/src/lib/streaming/types/events.ts` |
| Readiness | `apps/web/src/lib/baleybot/readiness.ts` |
| Session Context | `apps/web/src/lib/baleybot/session-context.ts` |
| Creator Helpers | `apps/web/src/lib/baleybot/creator-helpers.ts` |
| Connections | `apps/web/src/lib/connections/` |
| Components | `apps/web/src/components/` |
| Pages/Routes | `apps/web/src/app/` |
| API Routes | `apps/web/src/app/api/` |

### Core Database Tables

| Table | Purpose |
|-------|---------|
| `workspaces` | User workspaces |
| `baleybots` | BaleyBot definitions (BAL code, status, lifecycle) |
| `baleybotExecutions` | Execution records with input/output/segments |
| `connections` | AI providers, databases, external services |
| `scheduledTasks` | Cron/scheduled BB executions |
| `toolApprovalPatterns` | Learned auto-approval rules |

### BaleyBot Lifecycle Stages

```
draft -> verified -> launch_prepared -> live -> paused
```

- `draft`: Being built, BAL code may be incomplete
- `verified`: Tests passed, design reviewed
- `launch_prepared`: LaunchKit generated, triggers configured
- `live`: Active and accepting executions
- `paused`: Temporarily disabled

---

## 2. BAL Language Essentials

### Entity Syntax (6 supported properties)

```bal
my_entity {
  "goal": "What this entity should accomplish",
  "model": "anthropic:powerful",
  "tools": { "web_search", "fetch_url" },
  "output": {
    "summary": "string",
    "items": "array<object>",
    "count": "number"
  },
  "maxTokens": 4096,
  "history": "inherit"
}
```

**Supported properties:** `goal`, `model`, `tools`, `output`, `maxTokens`, `history` - that's it.

**NOT supported yet:** `temperature`, `reasoning`, `stopWhen`, `retries`, `needsApproval`, `can_request`

### Output Types

| BAL type | Zod result | Use for |
|----------|-----------|---------|
| `"string"` | `z.string()` | Text fields |
| `"number"` | `z.number()` | Numeric fields |
| `"boolean"` | `z.boolean()` | True/false |
| `"array"` | `z.array(z.string())` | String lists |
| `"array<string>"` | `z.array(z.string())` | Same as `"array"` |
| `"array<number>"` | `z.array(z.number())` | Number lists |
| `"array<boolean>"` | `z.array(z.boolean())` | Boolean lists |
| `"array<object>"` | `z.array(z.record(z.string(), z.unknown()))` | Structured arrays |
| `"object"` | `z.record(z.string(), z.unknown())` | Nested objects |

**NOT supported:** `array<object{...}>`, `enum(...)`, `?type`, `unknown`

### Composition Blocks

```bal
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

### Critical BAL Gotchas

1. **Tools use BRACE syntax**, NOT brackets:
   ```bal
   "tools": { "web_search", "fetch_url" }   # CORRECT
   "tools": ["web_search", "fetch_url"]      # WRONG - lexer has no bracket tokens
   ```

2. **Output fields are REQUIRED** (not optional). The SDK's `buildZodSchema()` produces required fields. **NEVER re-add `.optional()` to `buildZodSchema` field loop** - it breaks all internal bots with output blocks.

3. **Model strings** use `provider:model` format: `"anthropic:powerful"`, `"openai:fast"`, `"anthropic:claude-sonnet-4-20250514"`

---

## 3. Architecture Overview

### Data Flow

```
User Request
  -> Creator Bot (conversational architect)
    -> BAL Generator (produces BAL code)
    -> Connection Advisor (checks tool requirements)
    -> Test Orchestrator (designs tests)
    -> Deployment Advisor (evaluates readiness)
  -> Saved BaleyBot (BAL code + metadata in DB)
  -> Executor (parse -> compile -> execute)
    -> Streaming Events -> UI
```

### Core Abstractions

- **BaleyBot**: AI agent defined in BAL, stored in `baleybots` table
- **BAL**: Baleybots Assembly Language - DSL for defining entities and compositions
- **Entity**: A single AI agent within BAL code (has goal, model, tools, output)
- **Composition**: How entities connect (chain, parallel, if/else, loop, etc.)
- **Tool**: Capability a BB can use (built-in, connection-derived, workspace, ephemeral)
- **Connection**: External service binding (AI provider, database, API)

### Tool Source Hierarchy

Tools are assembled at execution time from multiple sources:

1. **Built-in** - Always available, defined in `tools/built-in/index.ts`
2. **Connection-derived** - Generated from workspace connections (e.g., postgres connection -> `query_postgres` tool)
3. **MCP tools** - From connected MCP servers
4. **Workspace tools** - User-defined tools stored in DB
5. **Ephemeral tools** - Created at runtime via `create_tool`

The `catalog-service.ts` assembles the full tool catalog per workspace.

---

## 4. Database Patterns

### Always Use Soft Deletes

```typescript
import { notDeleted, softDelete } from '@baleyui/db';

// Query - ALWAYS filter deleted records
const items = await db.query.baleybots.findMany({
  where: and(eq(baleybots.workspaceId, wsId), notDeleted(baleybots))
});

// Delete
await softDelete(baleybots, itemId, userId);
```

### Always Use Optimistic Locking

```typescript
import { updateWithLock, OptimisticLockError } from '@baleyui/db';

try {
  await updateWithLock(baleybots, id, currentVersion, { name: 'New' });
} catch (e) {
  if (e instanceof OptimisticLockError) {
    // Refresh and retry
  }
}
```

### Always Use Transactions for Multi-Table Ops

```typescript
import { withTransaction } from '@baleyui/db';

await withTransaction(async (tx) => {
  const [bot] = await tx.insert(baleybots).values(data).returning();
  await tx.insert(auditLogs).values({ baleybotId: bot.id, ... });
});
```

### Schema Changes

1. Add table definition in `packages/db/src/schema.ts`
2. Add relations if needed
3. Export from `packages/db/src/index.ts`
4. Run `pnpm db:push` (dev) or `pnpm db:generate && pnpm db:migrate` (prod)

---

## 5. Execution Flow

### Parse -> Compile -> Execute Pipeline

```
BAL Code (string)
  -> tokenize() (@baleybots/tools/dsl/lexer)
  -> parse() (@baleybots/tools/dsl/parser)
  -> ProgramNode AST (cached via BALParseCache, 5min TTL)
  -> compileBALCode() (@baleyui/sdk)
  -> executeBALCode() (@baleyui/sdk)
  -> ExecutionResult { executionId, status, output, segments, durationMs }
```

Key executor file: `apps/web/src/lib/baleybot/executor.ts`

### Tool Approval Flow

Tools with `approvalRequired: true` (`schedule_task`, `create_agent`, `create_tool`) trigger the approval flow:

1. Entity requests tool use -> `onToolCallApproval` callback fires
2. `ApprovalRequest` sent to UI with tool name, arguments, entity goal
3. User approves/denies/modifies -> `ApprovalResponse` returned
4. Approved patterns can be remembered via `toolApprovalPatterns` table

### Streaming Events Reference

From `@baleybots/core` (re-exported via `@/lib/streaming/types/events`):

```typescript
// Text streaming - use 'content' (NOT 'delta')
{ type: 'text_delta', content: string }
{ type: 'structured_output_delta', content: string }
{ type: 'reasoning', content: string }

// Tool call streaming - use 'id' for tool call ID
{ type: 'tool_call_stream_start', id: string, toolName: string }
{ type: 'tool_call_arguments_delta', id: string, argumentsDelta: string }
{ type: 'tool_call_stream_complete', id: string, toolName: string, arguments: unknown }

// Tool execution
{ type: 'tool_execution_start', id: string, toolName: string, arguments: unknown }
{ type: 'tool_execution_output', id: string, toolName: string, result: unknown, error?: string }
{ type: 'tool_execution_stream', toolCallId: string, toolName: string, nestedEvent: BaleybotStreamEvent, childBotName?: string }

// Errors
{ type: 'tool_validation_error', toolName: string, validationErrors: unknown, receivedArguments: unknown }
{ type: 'error', error: Error | { message: string, name?: string, stack?: string } }

// Done - use 'reason' (NOT 'result')
{ type: 'done', reason: DoneReason, timestamp: number, duration_ms: number, agent_id: string, parent_agent_id?: string }

type DoneReason = 'turn_yielded' | 'out_of_iterations' | 'max_tokens_reached' | 'error' | 'interrupted' | 'no_applicable_tools' | 'max_depth_reached' | 'graceful_shutdown';
```

### Post-Execution Services (non-blocking)

After execution completes, the executor fires (all wrapped in try/catch, failures don't affect result):
- **BB Completion Triggers** - fires downstream BBs configured with `other_bb` trigger
- **Metrics Recording** - default + custom analytics metrics
- **Usage Tracking** - token/cost recording from execution segments
- **Alert Evaluation** - checks error rate thresholds on failure

---

## 6. Internal BaleyBots

BaleyUI "eats its own cooking" - internal operations use BaleyBots stored with `isInternal: true`.

### Internal Bots

| ID | Icon | Role | Model |
|----|------|------|-------|
| `baley` | `bot` | Conversational architect, delegates to specialists | anthropic:powerful |
| `creator_action_advisor` | `puzzle` | Suggests next creator actions based on context | anthropic:powerful |
| `bal_generator` | `memo` | Converts descriptions to BAL code | anthropic:powerful |
| `pattern_learner` | `brain` | Analyzes approvals, suggests auto-approval patterns | anthropic:powerful |
| `execution_reviewer` | `search` | Reviews executions, suggests improvements | anthropic:powerful |
| `nl_to_sql_postgres` | `elephant` | NL to PostgreSQL translation | openai:fast |
| `nl_to_sql_mysql` | `dolphin` | NL to MySQL translation | openai:fast |
| `web_search_fallback` | `magnifier` | AI search when no Tavily key | openai:fast |
| `connection_advisor` | `plug` | Advises on connection requirements | anthropic:powerful |
| `test_orchestrator` | `microscope` | Topology-aware test designer | anthropic:powerful |
| `test_generator` | `test_tube` | Generates test cases from BB goal | anthropic:powerful |
| `test_validator` | `check` | Validates test output semantically | anthropic:powerful |
| `test_results_analyzer` | `chart` | Analyzes test run results | anthropic:powerful |
| `deployment_advisor` | `rocket` | Advises on triggers/scheduling/activation | anthropic:powerful |
| `integration_builder` | `link` | Conversational integration guide | anthropic:powerful |
| `test_interface_designer` | `target` | Designs optimal test UI for a BB | anthropic:powerful |
| `tool_executor` | `wrench` | Executes NL-defined workspace tools | openai:fast |
| `context_processor` | `gear` | Processes and enriches context for BB execution | anthropic:powerful |

### Calling Internal BaleyBots

```typescript
import { executeInternalBaleybot } from '@/lib/baleybot/internal-baleybots';

const { output, executionId } = await executeInternalBaleybot(
  'baley',
  userMessage,
  {
    userWorkspaceId: workspace.id,
    context: additionalContext,  // Optional string context
  }
);
```

All internal BB executions are tracked in `baleybotExecutions` with `triggeredBy: 'internal'`.

### The `resolveOutput()` Pattern

Internal bot output can be: raw object, JSON string, or markdown-fenced JSON. Always normalize before parsing:

```typescript
// runner.ts normalizeOutputCandidate() handles:
// 1. Object passthrough
// 2. Direct JSON.parse()
// 3. Markdown ```json ... ``` extraction
// 4. Balanced JSON segment extraction from mixed text
const resolved = normalizeOutputCandidate(output);
const result = schema.parse(resolved);
```

### Resilient Schemas for BAL Output Consumers

BAL `array<object>` produces `z.array(z.record(z.string(), z.unknown()))` - the model doesn't know which inner fields are required. **Caller schemas must use `.default()` for non-critical fields:**

```typescript
const schema = z.object({
  name: z.string().min(1),                              // Required - unrecoverable
  balCode: z.string().min(1),                           // Required - unrecoverable
  id: z.string().min(1).default(() => crypto.randomUUID()), // Has fallback
  icon: z.string().default('bot_face'),                      // Has fallback
  tools: z.array(z.string()).default([]),               // Has fallback
});
```

---

## 7. Creator & Readiness

### Creator Pipeline

The creator flow uses a team of specialist internal BBs:

```
User describes what they want
  -> baley (conversational architect)
    -> Understands intent, asks clarifying questions
    -> spawn_baleybot('bal_generator', designSpec)  // Produces BAL code
    -> spawn_baleybot('connection_advisor', ...)     // Checks connections
    -> spawn_baleybot('test_orchestrator', ...)      // Designs tests
    -> spawn_baleybot('deployment_advisor', ...)     // Evaluates readiness
  -> BaleyBot saved to DB with generated BAL + metadata
```

**Key rule:** `baley` NEVER generates BAL code itself. It always delegates to `bal_generator` via `spawn_baleybot`.

### 5 Readiness Dimensions

Tracked in `readiness.ts` - each dimension is `incomplete` | `in-progress` | `complete` | `not-applicable`:

| Dimension | What it checks | How it completes |
|-----------|---------------|-----------------|
| `designed` | BAL code exists and has entities | `hasBalCode && hasEntities` |
| `connected` | Required connections are met | `connectionsMet` OR `connection_advisor` ran |
| `tested` | Tests have passed | `testsPassed` OR `test_orchestrator` ran |
| `integrated` | Trigger is configured | `hasTrigger` OR `deployment_advisor` ran |
| `monitored` | Monitoring is set up | `hasMonitoring` |

`connected`, `integrated`, and `monitored` can be `not-applicable` based on tool usage.

### Applicability Rules

```typescript
// connected: needed if BB uses schedule_task, send_notification, spawn_baleybot, or has connections
// integrated: needed if BB uses schedule_task
// monitored: needed if BB uses schedule_task
```

### Session Context

Shared context passed to specialist BBs so they understand the current build:

```typescript
interface SessionContext {
  botName: string;
  balCode: string;
  entities: Array<{ name: string; tools: string[]; purpose: string }>;
  readiness: ReadinessState;
  connectedProviders: string[];
  connectedDatabases: string[];
  testSummary?: { total: number; passed: number; failed: number };
}

// Format for BB input:
const contextStr = formatSessionContext(ctx);
```

### Adaptive Tabs

The detail page shows tabs based on readiness state:
- Always visible: `visual`, `code`
- After design: `test`
- After save: `integrate`

---

## 8. Streaming UI

### Performance targets: 60fps, <50ms TTFT

### Core Pattern: RAF Batching

```typescript
// DON'T update React state per token
const [text, setText] = useState(''); // BAD - re-renders per token

// DO use RAF batching with direct DOM manipulation
const containerRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const textNode = document.createTextNode('');
  containerRef.current?.appendChild(textNode);

  let buffer = '';
  let rafId = 0;

  const flush = () => {
    textNode.textContent += buffer;
    buffer = '';
    rafId = 0;
  };

  stream.on('text_delta', (event) => {
    buffer += event.content;
    if (!rafId) rafId = requestAnimationFrame(flush);
  });

  return () => { if (rafId) cancelAnimationFrame(rafId); };
}, [stream]);
```

### Animations: CSS Only

```css
/* DON'T use Framer Motion for high-frequency updates */
/* DO use CSS animations */
.streaming-cursor {
  animation: pulse 1s ease-in-out infinite;
}
```

### SSE Reconnection

Always implement exponential backoff for EventSource connections.

---

## 9. React 19 & Next.js 15

### No Manual Memoization

The React 19 compiler (`experimental: { reactCompiler: true }` in next.config.ts) handles optimization automatically.

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

### Server Components Default

In Next.js 15 App Router, components are server components by default. Only add `'use client'` when you need browser APIs, hooks, or event handlers.

### eslint-disable-next-line Placement

For `react-hooks/exhaustive-deps`, the disable comment must go directly above the **dependency array line**, NOT above `useEffect`.

---

## 10. Common Tasks

### Add a Built-in Tool

1. Add JSON schema to `tools/built-in/index.ts`
2. Add metadata to `BUILT_IN_TOOLS_METADATA` array
3. Add implementation to `tools/built-in/implementations.ts`
4. Wire up in `getBuiltInRuntimeTools()`

### Add a tRPC Router

1. Create router in `apps/web/src/lib/trpc/routers/`
2. Add to `apps/web/src/lib/trpc/routers/index.ts`
3. Router is automatically available at `/api/trpc`

### Add a Database Table

1. Add table definition in `packages/db/src/schema.ts`
2. Add relations if needed
3. Export from `packages/db/src/index.ts`
4. Run `pnpm db:push` (dev) or `pnpm db:generate && pnpm db:migrate` (prod)

### Add an Internal BaleyBot

1. Add spec to `internal-bb/source/specs.json`
2. Add contract to `internal-bb/source/contracts.json`
3. Add any domain skill policies to `internal-bb/skills/domain/`
4. Regenerate definitions: the generated-definitions are derived from specs+contracts
5. Wire up caller code using `executeInternalBaleybot()`

---

## 11. Testing

### Commands

```bash
pnpm test              # Run all tests (Vitest, 900+ tests)
pnpm test:watch        # Watch mode
pnpm type-check        # TypeScript checking across all packages
pnpm lint              # ESLint via next lint (web app)
pnpm build             # Full build with ESLint enabled
```

### Test Patterns

- Tests live alongside source files as `__tests__/*.test.ts`
- Use Vitest with `vi.mock()` for module mocking
- Internal BB tests mock `executeInternalBaleybot` to avoid real AI calls
- BAL parser tests use direct `tokenize()` + `parse()` calls
- Vitest aliases needed for deep SDK imports: `@baleybots/tools/dsl/lexer` and `@baleybots/tools/dsl/parser` point to `dist/esm/baleybots-dsl-v2/{lexer,parser}.js`

### SDK Submodule

After `git submodule update`, you must rebuild the SDK:
```bash
cd packages/baleybots/typescript/packages/tools && pnpm build
```
The `dist/` directory is gitignored in the SDK submodule.

---

## 12. Troubleshooting

### BAL Parser Errors

- **"Unexpected token LBRACKET"**: You used `["tool"]` instead of `{ "tool" }` for tools
- **"Unknown property"**: You used an unsupported property (e.g., `temperature`, `reasoning`)
- **"Expected STRING"**: Missing quotes around property values

### Output Schema Bugs

- **Model skipping output fields**: Check that `buildZodSchema()` is NOT adding `.optional()` to fields
- **"incomplete response" from internal bot**: Caller schema is too strict - add `.default()` to non-critical fields
- **Output parse failure**: Use `normalizeOutputCandidate()` before `.parse()` - handles JSON strings and markdown fences

### Streaming Issues

- **Choppy text rendering**: You're updating React state per token - use RAF batching + direct DOM
- **Missing entity name on events**: Check `__entityName` tag added by executor's `onEvent` callback
- **SSE disconnects**: Implement exponential backoff reconnection

### Build / Deploy

- **`GITHUB_TOKEN` errors on Vercel**: Use `GH_PACKAGES_TOKEN` in `.npmrc`, not `GITHUB_TOKEN`
- **Cron not running**: Vercel Hobby plan only supports daily crons; per-minute requires Pro
- **Type errors after submodule update**: Rebuild SDK (`cd packages/baleybots/typescript/packages/tools && pnpm build`)
