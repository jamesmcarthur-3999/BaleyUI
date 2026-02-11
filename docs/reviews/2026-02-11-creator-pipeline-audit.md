# Creator Pipeline End-to-End Audit
**Date:** 2026-02-11
**Branch:** feat/bal-native-creator
**Status:** FIXES APPLIED — ready for launch

## Adversarial Review Verdict

Two adversarial agents debated the findings (Ship-It Advocate vs Quality Gatekeeper). They agreed on **3 consensus fixes** that were implemented:

1. **bal_generator maxTokens: 8192** — prevents JSON truncation on complex bots (was defaulting to 4096)
2. **Dead bal_syntax_reference removed** — creator_generation_policy no longer references a skill creator_bot doesn't have
3. **Spawn failures handled by AI** — creator_bot's decision policy instructs it to honestly communicate failures; adapter passes through model text instead of injecting hardcoded fallback messages

### Additional Fixes (from earlier session)
4. **creator_bot maxTokens: 16384** — prevents token-limit truncation of tool calls
5. **creator_bot decision policy rewritten** — "NEVER generate BAL code yourself" + spawn-first instructions
6. **bal_syntax_reference skill removed from creator_bot** — saves ~1500 tokens of irrelevant context

### Post-Launch Backlog (v1.1)
- Stream cancellation button (UI only, infrastructure ready)
- Single retry on bal_generator failure
- Explicit entity field names in bal_generator contract
- Auto-save draft after generation
- BAL validation on save

## End-to-End Flow Map

```
User types message
  |
  v
ChatInput.handleSend()
  |
  v
page.tsx:handleSendMessage(msg)
  |-- sanitize input
  |-- add user message to state
  |-- set status='building'
  |
  v
startCreatorStream() ──SSE POST──> /api/baleybots/creator/stream/route.ts
  |                                   |-- authenticate (Clerk)
  |                                   |-- rate limit check
  |                                   |-- build creator context (tools, connections, history)
  |                                   |-- ReadableStream + heartbeat (2s)
  |                                   |
  |                                   v
  |                                 executeCreatorPipeline()  [creator-pipeline-adapter.ts]
  |                                   |-- buildPipelineInput(context + history)
  |                                   |-- executeInternalBaleybot('creator_bot', input)
  |                                   |     |-- creator_bot streams text_delta → forwarded as creator_text_delta
  |                                   |     |-- creator_bot calls spawn_baleybot('bal_generator', designSpec)
  |                                   |     |     |-- spawn tracked via pendingSpawnNames Map
  |                                   |     |     |-- bal_generator executes (nested, maxTokens=8192)
  |                                   |     |     |-- tool_execution_output captured → spawnResults Map
  |                                   |     |-- creator_bot may also spawn connection_advisor, test_orchestrator
  |                                   |     |-- done event fires
  |                                   |
  |                                   v
  |                                 buildCreatorOutput(accumulatedText, spawnResults)
  |                                   |-- if bal_generator result: status='ready', parse entities + balCode
  |                                   |-- if no spawn result: status='building', conversation-only turn
  |                                   |-- validate through creatorOutputSchema (Zod, resilient defaults)
  |                                   |
  |                                   v
  |                                 send creator_complete event (SSE)
  |                                   |-- optional: background validation (non-blocking)
  |
  v (back on client)
applyCreatorResult(result)
  |-- if status='building': add assistant message to chat, set status='ready'
  |-- if status='ready': update entities, connections, balCode, name, icon on canvas
  |     |-- animate entities 'appearing' → 'stable' (600ms)
  |     |-- push to undo/redo history
  |     |-- set isDesignConfirmed=false
  |
  v
User reviews design on canvas
  |
  v
handleSave() → tRPC saveFromSession mutation
  |-- validates input (Zod)
  |-- INSERT (new) or UPDATE with optimistic locking (existing)
  |-- sanitize + truncate conversation history
  |-- returns { id, version, name, ... }
  |
  v
URL updates, dirty state cleared
```

## Findings by Layer

### Layer 1: Frontend (page.tsx, components/creator/*)

**Strengths:**
- RAF-throttled streaming (200ms batches, not per-token)
- Undo/redo with history snapshots
- Graceful degradation: SSE → tRPC mutation fallback
- Navigation guard prevents accidental loss

**Issues Found:**
1. **No stream cancellation** — user can't abort a long-running generation
2. **Race condition on rapid sends** — `status='building'` disables UI input, but no server-side dedup
3. **Streaming text ref leak risk** — if stream aborts mid-text, stale ref could bleed into next turn
4. **No auto-save after generation** — user can close tab and lose generated bot

### Layer 2: API Route (stream/route.ts)

**Strengths:**
- Heartbeat keeps connection alive (2s)
- Clean SSE event types with timestamps
- Error events forwarded to client

**Issues Found:**
5. **Heartbeat interval cleanup** — if controller.close() throws, interval may leak
6. **No request deduplication** — concurrent POSTs could cause parallel pipelines

### Layer 3: Creator Pipeline Adapter (creator-pipeline-adapter.ts)

**Strengths:**
- Clean spawn tracking via pendingSpawnNames + spawnResults Maps
- Resilient output construction with Zod schema defaults
- Background validation is non-blocking

**Issues Found:**
7. **bal_generator has no maxTokens** — defaults to ~4096, could truncate complex BAL code
8. **Unstructured entity schema** — bal_generator's `entities` is `array<object>` with no inner type enforcement; adapter relies on defensive mapping + fallbacks
9. **Single-spawn assumption** — if creator_bot spawns bal_generator multiple times in one turn, only the last result is captured (Map overwrites)
10. **No retry on bal_generator failure** — if bal_generator returns invalid output, the turn silently degrades to `status='building'`

### Layer 4: Internal Bot Definitions

**Strengths (post-fix):**
- creator_bot has maxTokens: 16384
- "NEVER generate BAL code yourself" appears 4 times in goal
- bal_syntax_reference removed from creator_bot (saves ~1500 tokens)
- Clean skill-based modular prompting

**Issues Found:**
11. **Contradictory dead reference** — creator_generation_policy skill still says "BAL syntax rules are defined in the bal_syntax_reference skill. Follow them exactly." but creator_bot doesn't have that skill. Harmless but misleading.
12. **Both bots use same model tier** (anthropic:powerful → claude-sonnet-4) — bal_generator could use a cheaper model since it has structured output
13. **No explicit designSpec format documentation** — creator_bot knows to pass a "designSpec" string to bal_generator, but what bal_generator expects isn't formally specified

### Layer 5: Post-Generation / Saving

**Strengths:**
- Optimistic locking prevents concurrent save conflicts
- Conversation history sanitized + truncated before storage
- Lifecycle stage resets to 'draft' when BAL code changes

**Issues Found:**
14. **BAL code not validated before save** — invalid BAL is stored as-is; fails only at execution time
15. **No auto-save draft** — generation completes but DB write requires manual "Save" button
16. **Structure cache can diverge** — `structure` field is passed from client, not recomputed server-side

## Risk-Ranked Issue Summary

| # | Issue | Severity | Impact | Fix Effort |
|---|-------|----------|--------|------------|
| 7 | ~~bal_generator no maxTokens~~ | ~~**HIGH**~~ | **FIXED** — maxTokens: 8192 added | Done |
| 10 | No retry on bal_generator failure | **HIGH→MEDIUM** | **MITIGATED** — failure now surfaced to user with clear message | v1.1 for auto-retry |
| 15 | No auto-save draft | **MEDIUM** | User loses work on tab close after generation | Medium |
| 1 | No stream cancellation | **MEDIUM** | User stuck waiting on long generation | Low |
| 14 | No BAL validation on save | **MEDIUM** | Invalid BAL stored, fails at execution | Low |
| 8 | Unstructured entity schema | **MEDIUM** | Fragile mapping, silent data loss on unexpected shapes | High (SDK change) |
| 13 | No designSpec format doc | **LOW** | bal_generator may misunderstand complex specs | Low |
| 11 | Dead bal_syntax_reference ref | **LOW** | Misleading instruction, no functional impact | Trivial |
| 9 | Single-spawn assumption | **LOW** | Edge case: multiple spawns overwrite | Low |
| Others | Cleanup items (2,3,5,6,12,16) | **LOW** | Polish, not blocking launch | Varies |
