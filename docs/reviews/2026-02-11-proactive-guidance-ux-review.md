# Proactive AI Guidance — E2E UX Review (2026-02-11)

## Test Flow

Tested the full creation lifecycle with proactive advisor suggestions.
Two bots created: "AI News Summarizer" (first, lost to HMR crash) and "Clean Joke Teller" (full lifecycle test).

## UX Score: 7.5/10 (up from 7 after Go Live fix)

## What Worked

1. **Contextual advisor evolution** — chips adapt to lifecycle stage:
   - Empty: "Automate research", "Monitor & alert", "Process data", "Help me brainstorm"
   - Post-build: "Test with AI news search", "Set up daily schedule"
   - Post-test prompt: "Test latest AI news", "Set up integration", "Add monitoring"
   - Post-save: "Test with joke request", "Set up webhook" (inline system message)
   - Integrate tab: "Set up a webhook", "Schedule recurring runs", "Chain from another bot", "Show API endpoint"

2. **Inline advisor actions in conversation** — system message with pill buttons appears after save and test completion, prominently in chat flow

3. **Progressive tab disclosure** — Builder only → +Test after build → +Integrate after save

4. **Updated example prompts** — outcome-focused, no jargon, no duplicate pills

5. **Post-test advisor injection works** — after running "Tell me a joke about programming" (5.7s, passed), advisor injected "Here's what I'd suggest next:" with contextual actions

6. **Integrate tab is rich** — lifecycle indicators (designed/connected/tested/integrated/monitored), API access with endpoint + code snippets (JS + Python), code copy buttons

7. **Creator bot is lifecycle-aware** — when asked to set up a webhook, it acknowledged the bot's readiness state ("designed, connected, and tested") and gave relevant webhook configuration steps

## Issues Found

### P0 — Must Fix
1. ~~**Go Live blocked after testing**~~ — **FIXED.** Auto-persist test results to DB after test execution + auto-generate LaunchKit on Go Live.

2. **Creator bot describes actions instead of taking them** — says "I'll navigate to test tab" but doesn't call `navigate_tab('test')`. Says "I'll check your connections" but doesn't call any connection tools. Need to strengthen skill prompt or ensure tools are wired correctly.

3. **Webhook setup is descriptive, not actionable** — When user clicks "Set up a webhook" advisor chip, creator bot explains how to set up a webhook (3 bullet points of instructions) instead of actually doing it. Expected: creator bot should ask for webhook details, then call the appropriate tool to configure the webhook. **This is the same root issue as #2** — creator bot knows what to do but defaults to describing rather than acting.

### P1 — Should Fix
4. **Duplicate user message after retry** — when creation fails and is retried, user message appears twice in conversation.

5. **Message paragraph run-on** — "...yourself.Perfect!" — no line break between conversational response and build confirmation. Should be two paragraphs or separate message blocks.

6. **Generic post-save advisor wording** — "Here's what I'd suggest next:" could be contextual: "Bot saved! Here's how to bring it to life:" or "Test complete! Ready for the next step:"

7. **Advisor chips easy to miss** — small, no entrance animation. Could use subtle slide-in animation on update.

### P2 — Polish
8. System message ("Built 'AI News Summarizer'") could have distinct visual treatment (border-left accent, checkmark icon)
9. Tab appearance could animate in
10. Progress breadcrumbs (Build -> Test -> Integrate -> Go Live)
11. Lifecycle indicators on Integrate tab — "integrated" and "monitored" remain unchecked even after setting up webhook discussion (because no actual integration was configured)

## Pre-existing Issues (Not Our Changes)
- **Database schema mismatch**: `column "model" of relation "baleybot_executions"` — required `pnpm db:push`
- **Next.js HMR instability**: routes returning 404 after `_not-found` recompilation
- **tRPC 404 on save** during HMR instability — resolved by server restart

## Accessibility Notes
- Advisor pill buttons need keyboard accessibility (`tabIndex`, `onKeyDown`)
- Chip updates should use `aria-live="polite"` region
- Verify contrast ratio on primary/5 background pills

## Screenshots
- `02-new-baleybot-page.png` — empty creation page with updated prompts
- `03-bot-created-with-advisor-actions.png` — post-build with advisor chips
- `04-advisor-actions-updated.png` — advisor chips updated after test prompt
- `05-post-save-advisor-injection.png` — post-save inline advisor system message
- `06-test-completed-with-advisor.png` — test completed with post-test advisor injection
- `07-integrate-tab.png` — full integration dashboard with lifecycle, API access, code snippets
- `08-go-live-blocked-no-tests.png` — Go Live blocked toast "No completed tests found"

## Test Checklist
- [x] Empty creation page — updated prompts, no duplicate pills
- [x] Bot creation — advisor suggestions appear post-build
- [x] Save — post-save advisor injection works
- [x] Test tab execution — "Tell me a joke about programming" passed in 5.7s
- [x] Post-test advisor injection — "Here's what I'd suggest next:" with actions
- [x] Integrate tab — lifecycle indicators, API access, code snippets
- [x] Webhook setup via advisor — creator bot gives instructions (but doesn't act)
- [x] Go Live flow — FIXED: auto-persist test results + auto-generate LaunchKit. Works end-to-end.
- [x] Post-go-live advisor injection — "Set up webhook", "Create API endpoint", "Schedule daily jokes"
- [x] Post-go-live lifecycle update — badge shows "live", Pause/Revert buttons appear, analytics dashboard visible

## Root Cause Analysis

### Why Go Live failed after testing — FIXED
**Problem:**
```
Test tab → onExecutionComplete → setTestCases([...prev, newCase]) → React state only
Go Live → refetchLaunchReadiness → evaluateLaunchReadiness(testCasesJson from DB) → empty → blocked
```
**Fix:** Auto-persist test results to DB via `saveTestCasesMutation` in `onExecutionComplete` handler. Also aligned `TestCase.matchStrategy` type with tRPC schema (was `string`, now union of literals).

### Why Go Live failed without LaunchKit — FIXED
**Problem:** `promoteToLive` requires `launchKit` to exist, but `confirmPromoteToLive` didn't generate one.
**Fix:** Added auto-generation of LaunchKit in `confirmPromoteToLive` when `!existingBaleybot?.launchKit`. The full pipeline is now: readiness check → auto-generate LaunchKit (AI advisor call) → promote to live. Takes ~10s for the AI call.

### Why creator bot describes instead of acting — REMAINING
The `creator-proactive-guidance.md` skill tells the bot WHEN to guide and to use `navigate_tab`, but the bot defaults to natural language descriptions of what it would do. The skill needs stronger "ALWAYS call the tool, NEVER just describe what you would do" language. May also need to verify tool availability in the creator_bot's BAL definition.

## Fixes Applied During This Review

| Fix | File | What Changed |
|-----|------|-------------|
| Auto-persist test results | `page.tsx:2171-2190` | `onExecutionComplete` now calls `saveTestCasesMutation.mutate()` after updating state, with `onSuccess: refetchLaunchReadiness` |
| Align matchStrategy type | `creator-types.ts:486` | `matchStrategy?: string` → `matchStrategy?: 'exact' \| 'contains' \| 'semantic' \| 'schema' \| 'structured'` |
| Auto-generate LaunchKit on Go Live | `page.tsx:1290-1296` | `confirmPromoteToLive` auto-calls `generateLaunchKitMutation` when `!existingBaleybot?.launchKit` |

## Screenshots
- `09-bot-is-live.png` — Bot fully live with analytics, Pause/Revert controls, post-go-live advisor actions
