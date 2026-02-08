# BaleyUI Foundation Contract Hardening Spec

**Status:** Proposed  
**Date:** 2026-02-08  
**Owner:** Platform Runtime + Product  
**Purpose:** Define cross-cutting contract improvements that must ship before MCP cluster implementation resumes.

---

## 1. Why This Exists

BaleyUI currently has strong runtime primitives, but contract behavior is split across routers, tools, and UI surfaces.  
Before full MCP cluster delivery, we should harden and unify:

1. Discovery (`what can this workspace/key do?`)
2. Control (`what limits/policies apply right now?`)
3. Recoverability (`how should clients resume/retry/fix failures?`)
4. Traceability (`how to connect requests to executions to analytics?`)

This spec defines those shared primitives so benefits propagate across:
1. MCP clients
2. tRPC/internal APIs
3. Dashboard UX
4. Internal BaleyBots (creator, integration, testing, review)

---

## 2. Scope

### In Scope

1. Contract and schema additions for capabilities, constraints, approvals, and errors.
2. Cross-surface propagation into backend services, frontend pages, and internal BaleyBots.
3. Backward-compatible migration strategy for current API keys, policies, and execution records.

### Out of Scope

1. Full MCP orchestration feature build.
2. New transports.
3. Multi-workspace federation.

---

## 3. Priority Levels

## P0 (Required before MCP implementation resumes)

1. Capability discovery contract.
2. Standard response envelope fields for progress and correlation.
3. Structured `needs_input` question and approval payload contracts.
4. Policy/constraints schema expansion for budget and execution limits.
5. Canonical error details for deterministic client recovery.
6. Frontend surfacing of new limits/scopes and approval context.

## P1 (Strongly recommended next)

1. Plan-only and simulation preflight APIs.
2. Bulk operation APIs.
3. Dedicated run approval/artifact resources and pages.

---

## 4. Contract Additions

### 4.1 Capability Discovery

Add `bb_capabilities_get` (and equivalent internal service) with:

1. `toolsetVersion`
2. `supportedTools`
3. `supportedResources`
4. `supportedPromptTemplates`
5. Effective limits (`maxDurationMs`, `maxSteps`, `maxBudgetUsd`, `maxToolCalls`, `maxSpawnDepth`, `maxParallelBranches`)
6. Effective auth scope matrix for this key
7. Feature flags relevant to the caller

### 4.2 Response Envelope Extensions

All run-like responses should support:

1. `correlation`: `requestId`, `runId`, `stepId`, `executionId`
2. `progress`: `completedSteps`, `totalSteps`, `estimatedRemainingMs`
3. `nextActions`: machine-friendly action hints
4. `links`: canonical resource URIs and optional dashboard URLs
5. `warnings`: non-fatal policy/runtime warnings

### 4.3 Constraints Object

Standardize constraints across interfaces:

1. `maxBudgetUsd`
2. `maxDurationMs`
3. `maxSteps`
4. `maxToolCalls`
5. `maxSpawnDepth`
6. `maxParallelBranches`
7. `allowedTools`
8. `deniedTools`
9. `approvalPolicy` (`auto`, `manual`, `hybrid`)

### 4.4 Needs Input Schema

Strengthen `needsInput.questions[]`:

1. `id` (stable across retries)
2. `prompt`
3. `type` (`text`, `single_select`, `multi_select`, `confirmation`)
4. `required`
5. `default`
6. `options` (when applicable)
7. `validation` (pattern/range/schema hints)
8. `sensitive` (mask in logs/telemetry)
9. `expiresAt`

### 4.5 Approval Item Schema

When `reason=approval_required`, each item must include:

1. `approvalId`
2. `tool`
3. `action`
4. `riskLevel`
5. `reason`
6. `preview`
7. `expiresAt`
8. `proposedArguments` (redacted by policy where needed)

### 4.6 Canonical Error Detail Additions

Keep canonical codes and add:

1. `retryAfterMs`
2. `resolutionHint`
3. `fieldIssues` (for validation errors)
4. `retryable` (authoritative)

### 4.7 Concurrency Guards

For mutation contracts, require optional optimistic guard fields:

1. `ifVersion` (entity version check)
2. `idempotencyKey` (where semantic retries exist)

---

## 5. Data Model Requirements

## 5.1 API Keys

Add optional finer-grained `scopes` on top of existing permissions:

1. `mcp:read`
2. `mcp:run`
3. `mcp:manage`
4. `mcp:analytics`
5. `bb:read`
6. `bb:write`
7. `bb:execute`
8. `policy:read`
9. `policy:write`

Compatibility rule:
1. Existing `permissions` continue to work.
2. Missing `scopes` derive from legacy permissions.

## 5.2 Workspace Policies

Extend policy model with default execution constraints:

1. `defaultMaxBudgetUsd`
2. `defaultMaxDurationMs`
3. `defaultMaxSteps`
4. `defaultMaxToolCalls`
5. `defaultMaxSpawnDepth`
6. `defaultMaxParallelBranches`
7. `approvalModeDefault`

## 5.3 Execution Correlation

Add correlation fields to execution/run records as needed:

1. `requestId`
2. `runId`
3. `stepId`
4. `origin` (`ui`, `api`, `mcp`, `trigger`, `internal`)

## 5.4 Approvals and Artifacts (recommended)

Add first-class tables:

1. `approval_decisions` (request, decision, actor, reason, timestamp)
2. `run_artifacts` (typed outputs with retention metadata)

---

## 6. Backend Propagation Requirements

### 6.1 Routers/Services

Must propagate contracts in:

1. `apps/web/src/lib/trpc/routers/api-keys.ts`
2. `apps/web/src/lib/trpc/routers/policies.ts`
3. `apps/web/src/lib/trpc/routers/baleybots.ts`
4. `apps/web/src/lib/baleybot/executor.ts`
5. `apps/web/src/lib/baleybot/tool-catalog.ts`
6. `apps/web/src/lib/baleybot/tools/catalog-service.ts`

### 6.2 Internal API Consistency

1. Every run/execution API returns consistent correlation and progress fields.
2. Approval flows use shared DTOs; no route-specific ad-hoc payloads.
3. Policy evaluation order is deterministic and documented.

---

## 7. Frontend Propagation Requirements

### 7.1 API Keys UX

In `apps/web/src/app/dashboard/settings/api-keys/page.tsx`:

1. Add scope presets and advanced scope picker.
2. Show effective permissions summary.
3. Warn on over-privileged keys.

### 7.2 Approvals UX

In `apps/web/src/app/dashboard/settings/approvals/page.tsx`:

1. Show risk level and expiration per approval pattern.
2. Show policy conflicts and why pattern did or did not auto-apply.
3. Add test/simulate pattern matching helper.

### 7.3 Tools UX

In `apps/web/src/app/dashboard/tools/page.tsx`:

1. Surface capability tags and danger levels from shared metadata.
2. Show policy impact badges (`forbidden`, `approval`, `allowed override`).
3. Show estimated cost/risk class where available.

### 7.4 Activity/Analytics UX

In:
1. `apps/web/src/app/dashboard/activity/page.tsx`
2. `apps/web/src/app/dashboard/activity/executions/[id]/page.tsx`
3. `apps/web/src/app/dashboard/analytics/page.tsx`

Add:

1. Correlation IDs and origin filters.
2. Budget/policy failure counters.
3. Faster root-cause path from execution to policy/approval context.

---

## 8. Internal BaleyBot Propagation Requirements

Update definitions in `apps/web/src/lib/baleybot/internal-baleybots.ts`:

1. `creator_bot` and `bal_generator`:
   - Consume richer tool metadata and policy constraints.
   - Emit rationale that references approval/cost/risk constraints.
2. `integration_builder`:
   - Produce plans aware of approval, schedule, and budget policy bounds.
3. `test_orchestrator`:
   - Generate tests for policy and approval paths, not only happy path.
4. `execution_reviewer`:
   - Report policy/budget root causes separately from logic failures.
5. `pattern_learner`:
   - Incorporate new policy limits and scope context.

---

## 9. Testing and Validation Requirements

1. Contract tests for every new schema field and backward compatibility behavior.
2. Permission/scope matrix tests for legacy and fine-grained key modes.
3. Policy/approval simulation tests with deterministic fixtures.
4. UI tests for new key scopes, policy badges, and correlation visibility.
5. Regression tests for internal BaleyBot outputs with updated prompts/contracts.

---

## 10. Acceptance Criteria

1. Existing clients continue working unchanged.
2. New clients can reliably discover capabilities and limits before execution.
3. Approval and `needs_input` payloads are structured, stable, and resumable.
4. Operators can trace failures from UI and receive actionable remediation hints.
5. Internal BaleyBots reflect the same policy/capability reality exposed to users.

---

## 11. Dependency Rule for MCP Work

MCP cluster implementation work remains parked until P0 in this spec is complete and verified.  
MCP docs and plans should reference this spec as a prerequisite.
