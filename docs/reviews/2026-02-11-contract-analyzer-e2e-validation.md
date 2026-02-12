# SaaS Contract Analyzer — End-to-End Platform Validation

**Date:** 2026-02-11
**Scope:** Full pipeline validation — bot creation, API integration, CLI consumer app
**Bot:** SaaS Contract Analyzer (8 entities: orchestrator + 6 parallel extractors + validator)

---

## What We Built

A real-world SaaS contract analysis pipeline that:
1. Created an 8-entity BaleyBot via the creator UI (chain + parallel composition)
2. Built a Node.js CLI app (`apps/contract-analyzer/`) that calls the execute-stream API
3. Parses structured output, stores results in SQLite, displays color-coded terminal report

## What Works Well

### Bot Creation
- Creator successfully generated 8 entities with correct BAL structure
- `chain { orchestrator parallel { 6 extractors } validator }` composition works
- Output blocks with `array<object>`, `string`, `number` types all function correctly
- Test execution completed in 38.2s with structured output from all entities

### API Integration
- Execute-stream SSE endpoint works from external Node.js client
- API key authentication (`Bearer bui_live_*`) passes through middleware correctly
- SSE frame parsing reliable — `execution_result` event contains full structured output
- Successful execution in 2m 16s with 7.2/10 risk score, 7 red flags, 13 missing clauses

### Activity Tracking
- All 4 executions registered in Activity page (3 completed, 1 failed)
- Bot name, status, duration, trigger type, error messages all display correctly
- Execution detail pages accessible via links

---

## Bugs Found & Fixed During Session

### 1. CSRF Middleware Blocks CLI API Calls (Critical)
- **File:** `apps/web/src/middleware.ts`
- **Issue:** POST requests without `Origin`/`Referer` headers blocked by CSRF protection
- **Fix:** Added `/api/baleybots(.*)` to `isCsrfExempt` route matcher
- **Status:** Fixed

### 2. Validator Output Format Mismatch
- **File:** `apps/contract-analyzer/lib/db.mjs`, `lib/display.mjs`
- **Issue:** `consolidated_results` is an object keyed by category, not an array
- **Fix:** Added normalization via `Object.entries().map()` to handle both formats
- **Status:** Fixed in CLI app (not a platform bug — the validator is free to return either format)

---

## UX Issues & Gaps (Next Sprint)

### P1: Active Integrations Doesn't Detect API Usage
- **Location:** `IntegrationDashboard.tsx:216`
- **Issue:** Only shows webhook/schedule/chain triggers. API key usage (the most common integration method) is invisible
- **Root Cause:** `hasWebhook || hasSchedule || hasChain` check only — no `hasApi` path
- **Impact:** Users who've successfully integrated via API still see "No integrations yet"
- **Fix:** Track `triggeredBy: 'api'` in execution history, show API card when detected

### P1: Lifecycle Doesn't Auto-Advance on API Usage
- **Location:** `readiness.ts:100`, `page.tsx:1543`
- **Issue:** `integrated` readiness dimension checks `!!triggerConfig` — API calls don't set a trigger config
- **Impact:** Go Live prerequisites feel broken when the bot is actually working in production
- **Fix:** Consider API execution history as evidence of integration

### P2: Test Tab Input Not Suited for Long Documents
- **Issue:** Single-line text input in Test tab can't handle multi-page contract text
- **Impact:** Testing document-processing bots requires external tools (our CLI app)
- **Fix:** Add textarea/file-upload option, or detect output schema complexity and offer appropriate input mode

### P2: Analytics Page Timeout
- **Issue:** Analytics page hangs on navigation in dev (likely heavy aggregation query)
- **Impact:** Can't verify if execution metrics appear in analytics dashboard
- **Fix:** Investigate query performance, add pagination/lazy loading

### P3: Parallel Execution Output Interleaving
- **Issue:** When 6 extractors run in parallel, their streaming output interleaves in the test panel
- **Impact:** Hard to follow which extractor is producing which output
- **Fix:** Group streaming output by entity, or add collapsible sections per entity

### P3: Failed Execution — "Controller is already closed"
- **Execution:** `5a652911-937c-40bf-aa73-d012b67db338` (29s, failed)
- **Issue:** SSE stream controller closed prematurely during execution
- **Impact:** Intermittent failure on long-running pipelines
- **Fix:** Investigate stream lifecycle management in execute-stream handler

---

## Key Architecture Insights

### Integration Detection Model
Current model only recognizes **configured triggers** (webhook URL, cron schedule, chain reference). It should also recognize **observed usage patterns**:
- API key was used → show "API Integration" card with last-used timestamp
- Webhook was called → show "Webhook" card even if trigger wasn't pre-configured
- Execution count > N → auto-suggest lifecycle advancement

### Go Live Prerequisites (Current)
1. Valid BAL code (no parse errors)
2. Connected AI provider (OpenAI/Anthropic/Ollama)
3. Required tool connections present
4. At least 1 completed test
5. Test pass rate >= 80%

**Missing:** No requirement for actual integration proof — a bot can "Go Live" without ever being called externally.

---

## Files Created/Modified

### New Files (CLI App)
- `apps/contract-analyzer/package.json`
- `apps/contract-analyzer/analyze.mjs`
- `apps/contract-analyzer/lib/sse-client.mjs`
- `apps/contract-analyzer/lib/pdf-reader.mjs`
- `apps/contract-analyzer/lib/db.mjs`
- `apps/contract-analyzer/lib/display.mjs`
- `apps/contract-analyzer/sample-contract.txt`
- `apps/contract-analyzer/.gitignore`

### Modified Files
- `apps/web/src/middleware.ts` — Added `/api/baleybots(.*)` to CSRF exempt routes
