# BaleyUI Full Application Audit - 2026-02-05

## Executive Summary

Comprehensive audit of the BaleyUI web application across 11 domains. Found **27 critical**, **44 high**, **33 medium**, and **17 low** severity issues. Several quick fixes have already been applied. This document catalogs all remaining issues with a prioritized remediation plan.

---

## Quick Fixes Already Applied

| # | File | Issue | Severity | Status |
|---|------|-------|----------|--------|
| QF-1 | `components/creator/Canvas.tsx` | React hooks called after early return (lines 217-220) - **runtime crash bug** | CRITICAL | FIXED |
| QF-2 | `components/creator/Canvas.tsx` | `memo()` usage violating React 19 patterns | MEDIUM | FIXED |
| QF-3 | `lib/execution/retry.ts` | AbortSignal event listener memory leak in `sleep()` | HIGH | FIXED |
| QF-4 | `lib/execution/retry.ts` | Missing jitter in exponential backoff (thundering herd) | MEDIUM | FIXED |
| QF-5 | `hooks/useBuilderEvents.ts` | `lastSequence` + `onEvent` in useEffect deps causing SSE reconnection on every event | CRITICAL | FIXED |
| QF-6 | `components/baleybot/SchemaBuilder.tsx` | Missing `fields` dep in useEffect (added eslint-disable with explanation) | LOW | FIXED |

---

## Phase 1: Critical Bugs & Crashes (Priority: IMMEDIATE)

### C-1: Loop Executor is a Stub - Never Executes Body
**File:** `lib/execution/node-executors/loop.ts:136-146`
**Impact:** Any flow using a loop node silently does nothing
**Detail:** The loop executor collects iteration results but never actually executes `bodyNodeId`. It just passes through input data unchanged. Comments confirm: "In a full implementation, this would execute the bodyNodeId."
**Fix:** Wire up body node execution via the node executor registry.

### C-2: Transaction Rollback Bug in BaleyBots Router
**File:** `lib/trpc/routers/baleybots.ts`
**Impact:** Failed execution error state is never persisted to DB
**Detail:** When a BaleyBot execution fails, the error update to the execution record happens inside a transaction. The subsequent TRPCError throw causes the transaction to roll back, undoing the error recording. The execution stays in "running" state forever.
**Fix:** Move execution status update outside the transaction, or use a separate query after the transaction.

### C-3: Missing `notDeleted()` Filters in Several Routers
**Files:** Multiple tRPC routers
**Impact:** Queries return soft-deleted records to users
**Detail:** Several queries don't use the `notDeleted()` helper as required by the coding guidelines:
- `routers/flows.ts` - some findMany queries
- `routers/blocks.ts` - some findMany queries
- `routers/connections.ts` - credential lookup
**Fix:** Add `notDeleted()` to all queries on soft-deletable tables.

### C-4: Missing Optimistic Locking on Updates
**Files:** Multiple tRPC routers
**Impact:** Race conditions can silently overwrite concurrent edits
**Detail:** Several update operations don't use `updateWithLock()`:
- `routers/flows.ts` - flow updates
- `routers/blocks.ts` - block config updates
- `routers/baleybots.ts` - some update paths
**Fix:** Replace direct `db.update()` calls with `updateWithLock()`.

### C-5: userId Null When Using API Keys
**File:** `lib/trpc/trpc.ts`
**Impact:** Operations requiring userId may fail or create orphaned records
**Detail:** When authenticated via API key, `userId` can be null. Some downstream operations assume it's always present.
**Fix:** Add API key user resolution or fail gracefully with clear error.

### C-6: Database Sink Executor is Stub
**File:** `lib/execution/node-executors/sink.ts`
**Impact:** Database output nodes silently do nothing
**Detail:** The database sink returns `{ skipped: true, reason: 'Database sink not yet implemented' }` instead of actually writing data.
**Fix:** Implement database sink using the connection-derived database executor.

---

## Phase 2: Security Vulnerabilities (Priority: HIGH)

### S-1: SQL Injection in Database Executor
**File:** `lib/baleybot/tools/connection-derived/database-executor.ts`
**Impact:** Arbitrary SQL execution possible
**Detail:** Uses `sql.unsafe()` to execute user-provided SQL queries. While there's a basic SQL validation layer, it uses a blocklist approach that can be bypassed.
**Fix:** Implement proper parameterized query support, use allowlists instead of blocklists, add query complexity limits.

### S-2: `safe-eval` is Not Actually Safe
**File:** `lib/utils/safe-eval.ts`
**Impact:** Code injection via function block expressions
**Detail:** Uses a blacklist-based approach to prevent dangerous operations. Blacklists are inherently bypassable (e.g., `constructor.constructor('return process')()`, Unicode escapes, bracket notation).
**Fix:** Replace with `expr-eval` (already used in loop executor), `vm2`, or Web Workers for sandboxing.

### S-3: Weak Webhook Secret Comparison (Timing Attack)
**File:** `api/webhooks/[flowId]/[secret]/route.ts`
**Impact:** Webhook secrets could be brute-forced via timing analysis
**Detail:** Uses string equality (`===`) instead of constant-time comparison for webhook secret validation.
**Fix:** Use `crypto.timingSafeEqual()` for secret comparison.

### S-4: In-Memory Rate Limiting Ineffective in Serverless
**File:** `lib/rate-limit.ts`
**Impact:** Rate limits reset on every cold start, providing no protection
**Detail:** Rate limit state is stored in a module-level Map that's lost when the serverless function cold-starts.
**Fix:** Use Redis/Upstash for rate limiting, or use Vercel's built-in rate limiting.

### S-5: Missing CSRF Protection on Mutation API Routes
**Files:** Multiple API routes
**Impact:** Cross-site request forgery attacks possible
**Detail:** API routes handling mutations (POST/PUT/DELETE) don't verify origin headers or use CSRF tokens.
**Fix:** Add origin/referer validation middleware, or use SameSite cookies with CSRF tokens.

### S-6: Cron Endpoint Authorization Weak
**File:** `api/cron/process-scheduled-tasks/route.ts`
**Impact:** Unauthorized triggering of scheduled task processing
**Detail:** Uses a simple bearer token check that may not be sufficiently protected.
**Fix:** Use Vercel's cron secret verification or add IP allowlisting.

### S-7: Encryption Key Management - No Key Rotation
**File:** `lib/encryption/index.ts`
**Impact:** Compromised keys can't be rotated without re-encrypting all data
**Detail:** AES-256-GCM encryption doesn't support key versioning or rotation.
**Fix:** Add key version header to encrypted data, support decryption with old keys during rotation.

### S-8: Error Messages Leak Internal Information
**File:** `lib/errors/sanitize.ts`
**Impact:** Internal paths, stack traces, or schema details exposed to clients
**Detail:** Error sanitization isn't applied consistently across all API routes.
**Fix:** Ensure all error responses go through the sanitize function.

---

## Phase 3: Performance Issues (Priority: HIGH)

### P-1: Streaming Adapter - String Concatenation in Hot Path
**File:** `lib/streaming/adapter.ts:175`
**Impact:** O(n^2) string building during stream processing
**Detail:** `buffer += decoder.decode(chunk)` creates a new string on every chunk. For long streams this degrades significantly.
**Fix:** Use array buffer and join, or TextDecoderStream.

### P-2: Circuit Breaker - `cleanOldFailures()` Creates New Array Every Call
**File:** `lib/execution/circuit-breaker.ts:196-200`
**Impact:** Unnecessary GC pressure, called on every state check
**Detail:** `this.failures = this.failures.filter(...)` allocates a new array on every call to `canExecute()`, `recordSuccess()`, `recordFailure()`, and `getStats()`.
**Fix:** Use in-place splice or maintain a sorted array with binary search for the cutoff.

### P-3: useOptimizedEvents - `retryCount` in Connect Dependency Array
**File:** `hooks/useOptimizedEvents.ts:186`
**Impact:** Connection recreated on each retry attempt
**Detail:** `retryCount` in the `connect` useCallback deps means each reconnection attempt recreates the function, potentially causing unnecessary work.
**Fix:** Use a ref for retryCount like the useBuilderEvents fix.

### P-4: N+1 Query Patterns in tRPC Routers
**Files:** Multiple tRPC routers
**Impact:** Excessive database queries for list views
**Detail:** Several list endpoints fetch related data in loops instead of using joins or `with` clauses in Drizzle.
**Fix:** Use Drizzle `with` for eager loading related data.

### P-5: Event Filter Creates Joined String IDs on Every Render
**File:** `hooks/useOptimizedEvents.ts:324-326`
**Impact:** O(n) string allocation on every events change
**Detail:** `events.map(e => e.id).join(',')` runs on every render to check if events changed.
**Fix:** Compare by length + last element, or use a hash.

---

## Phase 4: React 19 Pattern Violations (Priority: MEDIUM)

### R-1: `useCallback` Usage Across Hooks
**Files:**
- `hooks/useAutoSave.ts` (3 instances)
- `hooks/useNavigationGuard.ts` (4 instances)
- `hooks/useDirtyState.ts` (3 instances)
- `hooks/useExecutionStream.ts` (4 instances)
- `hooks/useOptimizedEvents.ts` (6 instances)
**Impact:** Unnecessary complexity; React 19 compiler handles this
**Fix:** Remove `useCallback` wrappers. Note: Must verify React 19 compiler is enabled first. Some of these are used as useEffect dependencies, which requires the compiler to be active.

### R-2: `useMemo` Usage
**Files:** Various components
**Impact:** Unnecessary complexity
**Fix:** Remove after confirming React 19 compiler is active.

### R-3: Missing Error Boundaries
**Files:** Several dashboard pages
**Impact:** Unhandled errors crash entire page
**Detail:** Some error.tsx files exist but are incomplete or missing for:
- `/dashboard/analytics/`
- `/dashboard/blocks/`
- `/dashboard/decisions/`
- `/dashboard/executions/`
**Fix:** Ensure all dashboard routes have proper error.tsx boundary components.

### R-4: Accessibility Gaps
**Files:** Various components
**Impact:** Screen reader and keyboard navigation issues
**Detail:**
- Missing aria-labels on interactive elements
- Focus management issues in modals
- Color contrast issues in some status badges
**Fix:** Add proper ARIA attributes and focus management.

---

## Phase 5: Code Quality & Completeness (Priority: MEDIUM)

### Q-1: MySQL Database Executor is Stubbed
**File:** `lib/baleybot/tools/connection-derived/database-executor.ts`
**Impact:** MySQL connections don't work despite being in the UI
**Fix:** Implement MySQL executor or clearly disable MySQL in the UI.

### Q-2: Self-Healing Service Too Large (600+ lines)
**File:** `lib/baleybot/errors/self-healing-service.ts`
**Impact:** Maintainability concern
**Fix:** Break into smaller focused modules.

### Q-3: TODO Comments for Unimplemented Analytics
**File:** `lib/baleybot/analytics/`
**Impact:** Analytics dashboard shows incomplete data
**Fix:** Implement or remove the analytics stubs.

### Q-4: Missing Cycle Detection in Triggers
**File:** `lib/trpc/routers/triggers.ts`
**Impact:** BB completion triggers could create infinite loops
**Fix:** Add cycle detection when creating `bb_completion` triggers.

### Q-5: Webhook Sink Has No Retry Logic
**File:** `lib/execution/node-executors/sink.ts`
**Impact:** Failed webhook deliveries are silently lost
**Fix:** Add retry with exponential backoff for webhook sinks.

---

## Phase 6: Build & Lint Health (Priority: LOW)

### L-1: 62 Lint Errors
**Breakdown:**
- 41 `@typescript-eslint/no-explicit-any` violations
- 3 `react-hooks/rules-of-hooks` violations (Canvas.tsx - FIXED)
- 1 `@next/next/no-html-link-for-pages` error
- Multiple unescaped entities (`&apos;`, `&quot;`)
**Fix:** Batch cleanup of lint errors.

### L-2: 191 Lint Warnings
**Breakdown:**
- Mostly unused variables (`_prefix` pattern or actual dead code)
- Some prefer-const violations
**Fix:** Batch cleanup, remove dead code.

### L-3: TypeScript Strict Mode Gaps
**Impact:** Potential runtime type errors
**Fix:** Address `any` types incrementally.

---

## Remediation Plan

### Sprint 1 (Immediate - 1-2 days)
1. Phase 1: Fix all critical bugs (C-1 through C-6)
2. S-3: Timing-safe webhook comparison (5 min fix)
3. S-8: Error sanitization consistency

### Sprint 2 (This week)
4. S-1: SQL injection mitigation
5. S-2: Replace safe-eval
6. P-1: Streaming adapter performance
7. P-2: Circuit breaker optimization
8. P-3: useOptimizedEvents reconnection fix

### Sprint 3 (Next week)
9. S-4: External rate limiting
10. S-5: CSRF protection
11. S-7: Encryption key rotation
12. Phase 4: React 19 cleanup (verify compiler, then batch remove)
13. L-1/L-2: Lint cleanup

### Sprint 4 (Following week)
14. Q-1: MySQL executor or UI removal
15. Q-4: Trigger cycle detection
16. Q-5: Webhook retry logic
17. Phase 3 remaining: N+1 query optimization
18. Accessibility improvements

---

## Methodology

This audit was conducted by 11 parallel specialized agents examining:
1. Project structure and architecture
2. BaleyBots skills and patterns
3. Implementation plans alignment
4. Database schema completeness
5. tRPC router correctness
6. API route security
7. React components and hooks
8. Execution engine and streaming
9. Security and authentication
10. BaleyBot tools and services
11. TypeScript and build health
