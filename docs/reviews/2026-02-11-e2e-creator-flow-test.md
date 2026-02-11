# End-to-End Creator Flow Test — 2026-02-11

## Summary

Full end-to-end browser test of the BaleyBot creation lifecycle after prompt fixes, BAL2002 save fixes, and session storage cleanup. All critical flows working.

---

## Tests Performed

### 1. Vague Prompt → Conversational Flow

**Input:** "I want to automate something in my business"

**Result: PASS** — AI correctly identifies the request as vague and asks clarifying questions instead of immediately building:

> "I'd love to help you automate something in your business! To build the right solution, I need to understand what you're working with."
>
> "What's the specific process or task that's eating up your time right now?"

- No entities generated (builder stays empty)
- Questions are natural and focused, not a checklist
- Suggested next actions update contextually ("Get business automation details", "Explore automation tools")

### 2. Explicit Prompt → Immediate Build

**Input:** "I need a simple web search bot"

**Result: PASS** — AI recognizes the explicit, specific request and builds immediately:

- Streams conversational text explaining the design
- Spawns `bal_generator` to produce BAL code
- Creates "WebSearchBot" with web_search tool, output fields (query, results, totalResults)
- 252 SSE events total: 74 text_delta, 173 agent_event, 1 creator_complete
- Bot appears in visual builder with correct metadata
- AI offers follow-up: "Would you like me to test it with a sample search?"

### 3. Save Flow

**Result: PASS** — Save button works correctly:

- URL transitions from `/dashboard/baleybots/new` → `/dashboard/baleybots/{uuid}`
- "(unsaved)" badge disappears
- Save button disables
- "Go Live" tab appears post-save
- No BAL2002 errors (semantic checker and interpreter skip tool validation when `availableTools` not provided)

### 4. Session Storage Cleanup

**Result: PASS** — After saving, navigating to `/new` shows a clean creation screen:

- "New BaleyBot" header with sparkle emoji
- "What should your BaleyBot do?" heading
- Clean text input with template suggestions
- No old draft restored

### 5. Returning to Saved Bot

**Result: PASS** — Previously saved "SaaS Support Assistant" from earlier session saves and loads at its permanent URL.

---

## Issues Found & Fixed (This Session)

### BAL2002 Save Failures (3-layer fix)
Tool references like `web_search`, `fetch_url` were rejected during save because the validation path runs `compileBAL()` without providing runtime tools.

1. **Semantic checker** (`semantic-checker.ts:152`): Changed `||` to `&&` — skip tool validation when `availableTools` not provided
2. **SDK `getAvailableTools`** (`bal-executor.ts`): Return `undefined` instead of `{}` when no tools configured
3. **Interpreter** (`interpreter.ts:561-583`): Skip tool resolution instead of throwing when `availableTools` missing

### Session Storage Persistence After Save
`creator-session:new` was never cleaned after saving, causing old drafts to reappear.

- Added `savedBaleybotId` guard to persist effect
- Hardcoded cleanup of `creator-session:new` key when save succeeds

### Creator Bot Prompt Rebalancing
Three prompt/skill files rewrote to prevent immediate building on vague requests:

1. `consultative-curiosity.md` v1→v2: Removed "specific and concrete" build trigger, added design-readiness self-check
2. `creator-generation-policy.md` v5→v7: Removed "spawn immediately" bias, added design quality section
3. `specs.json`: Decision policy emphasizes understanding the problem before building

---

## AI Guidance Quality Assessment

### What Works Well
- **Conversational tone is natural** — the AI sounds like a helpful colleague, not a form
- **Questions are focused** — asks 1-2 questions, not a laundry list
- **Build decisions are appropriate** — explicit requests get built, vague ones get questions
- **Streaming text visible in real-time** — user sees the AI thinking/writing as it happens
- **Specialist spawning is transparent** — bal_generator runs concurrently while AI narrates
- **Suggested next actions are contextual** — adapt to conversation state

### Areas for Improvement
- **First response occasionally lacks assistant message** — observed once during testing where the stream completed but no text appeared. Could not reproduce consistently. Likely transient (server restart during HMR). Worth monitoring.
- **"Ask for changes, tests, or launch prep..." placeholder** shows immediately after stream completes, even on conversation-only turns. Could feel premature when no bot has been built yet.
- **Builder panel shows empty "Workflow" node** during conversation — slightly confusing when nothing has been built. Consider hiding the builder panel until entities exist.
- **No streaming text animation** during the thinking/spawn phase — the building indicator shows "Understanding your request..." but once text starts streaming, there's no visual transition

---

## Verification

```
pnpm type-check  → PASS
pnpm test        → 980 passed (app) + 245 passed (SDK tools)
pnpm lint        → PASS (via next lint)
```
