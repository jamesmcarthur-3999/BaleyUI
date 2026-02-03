# Production Hardening Plan (Post-Workstream)

> **Goal:** Address cross-cutting production readiness gaps that are not covered by the tool-ecosystem or UI overhaul plans.

**Scope:** API v1 readiness, SSE scalability, middleware access controls, and operational safety on Vercel.

**Timing:** Execute after the current tool-ecosystem and UI overhaul workstreams merge, or isolate changes in a dedicated hardening branch.

---

## Task H1: Unblock API v1 Behind Clerk Middleware

**Problem:** `/api/v1/*` requires API-key auth but is currently blocked by Clerk middleware, preventing external API clients from accessing these endpoints.

**Files:**
- Modify: `apps/web/src/middleware.ts`
- Modify: `apps/web/src/lib/api/validate-api-key.ts` (if used in middleware)

**Expected Outcome:**
- API v1 endpoints can be accessed with valid API keys, without Clerk session cookies

**Implementation Details:**
1. Exempt `/api/v1(.*)` from Clerk protection OR implement a middleware branch that validates API keys and bypasses Clerk when valid.
2. Keep `/api` and `/trpc` protected by Clerk unless explicitly intended for public access.

**Verification:**
- External client can call `/api/v1/blocks` with a valid API key
- Invalid or missing API key returns 401 without Clerk redirect

---

## Task H2: Make API v1 Execute Endpoints Actually Run

**Problem:** API v1 run/execute endpoints create records but do not execute blocks or flows.

**Files:**
- Modify: `apps/web/src/app/api/v1/blocks/[id]/run/route.ts`
- Modify: `apps/web/src/app/api/v1/flows/[id]/execute/route.ts`
- Modify: `apps/web/src/lib/execution/*` (if wiring is required)

**Expected Outcome:**
- `/api/v1/blocks/[id]/run` starts a real block execution
- `/api/v1/flows/[id]/execute` starts a real flow execution

**Implementation Details:**
1. Use the same executor(s) used by authenticated UI routes.
2. Update execution records with real status transitions.
3. Ensure API key permissions and workspace scoping remain enforced.

**Verification:**
- API call produces actual execution output and status transitions
- Execution records show `running` -> `completed/failed`

---

## Task H3: Implement or Deprecate API v1 SSE Streaming

**Problem:** `/api/v1/executions/[id]/stream` is stubbed and does not stream real events.

**Files:**
- Modify: `apps/web/src/app/api/v1/executions/[id]/stream/route.ts`

**Expected Outcome:**
- API v1 streaming either works end-to-end or is formally deprecated with clear messaging

**Implementation Details:**
1. Option A: Bridge to the existing execution events used by `/api/executions/[id]/stream`.
2. Option B: Deprecate and return a clear error with migration guidance.

**Verification:**
- Streaming endpoint returns real-time events for an execution
- If deprecated, returns a consistent error with a docs link

---

## Task H4: Reduce SSE DB Polling Load

**Problem:** `/api/executions/[id]/stream` polls the database every 100ms, which is likely to overload DB connections under load.

**Files:**
- Modify: `apps/web/src/app/api/executions/[id]/stream/route.ts`

**Expected Outcome:**
- Streaming scales without excessive DB load on Vercel

**Implementation Details:**
1. Increase polling interval and batch events.
2. Avoid N+1 queries per tick by consolidating queries where possible.
3. Prefer event-driven streaming if event store supports it.

**Verification:**
- Load test shows stable DB connection usage
- Streaming latency remains acceptable

---

## Task H5: Document Vercel Runtime Constraints

**Problem:** Some endpoints assume long-running work that may exceed Vercel limits.

**Files:**
- Add: `docs/PRODUCTION_READINESS.md`

**Expected Outcome:**
- Clear documentation of Vercel runtime limits, time budgets, and operational constraints

**Implementation Details:**
1. Document max duration limits, cron expectations, and background execution guidance.
2. Record which endpoints are time-sensitive and what mitigations are used.

**Verification:**
- Docs provide a clear go-live checklist for the team

---

## Coordination Notes

- H1–H4 should be scheduled after the tool-ecosystem and UI overhaul workstreams merge, unless explicitly requested to do earlier.
- H2 and H3 depend on final execution semantics, so merging workstreams first reduces churn.

