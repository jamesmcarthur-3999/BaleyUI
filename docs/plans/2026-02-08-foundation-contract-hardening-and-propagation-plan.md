# Foundation Contract Hardening and Propagation Plan

**Status:** Proposed  
**Date:** 2026-02-08  
**Branch:** `codex/pre-mcp-foundation-model-intel`  
**Spec:** `docs/reference/BALEYUI_FOUNDATION_CONTRACT_HARDENING_SPEC.md`  
**Blocks:** `docs/plans/2026-02-08-baleyui-mcp-cluster-implementation-plan.md`

---

## 1. Goal

Ship the foundational contract improvements first, and propagate them across:

1. Backend services and schemas
2. Frontend UX and operator controls
3. Internal BaleyBots
4. MCP-facing contracts (as a downstream consumer)

---

## 2. Delivery Strategy

### Principles

1. Keep backward compatibility for current API keys and existing tRPC consumers.
2. Introduce contracts once, consume everywhere.
3. Prioritize operator clarity and deterministic client recovery.

### Execution Order

1. P0 contract + schema baseline
2. Backend service integration
3. Frontend propagation
4. Internal BaleyBot propagation
5. MCP plan unpark and implementation resume

---

## 3. Phase Plan

## Phase 0 - Contract Freeze (P0)

### Objectives

1. Freeze schemas for capabilities, constraints, `needs_input`, approvals, and error details.
2. Decide legacy permission-to-scope mapping behavior.

### Tasks

1. Approve `docs/reference/BALEYUI_FOUNDATION_CONTRACT_HARDENING_SPEC.md`.
2. Define exact JSON schemas in shared TypeScript contracts.
3. Approve canonical field names for correlation and progress.

### Exit Criteria

1. No unresolved naming/shape questions.
2. Shared contract module is ready for implementation.

---

## Phase 1 - Schema and Data Layer

### Objectives

1. Add data model support for scopes, default limits, and richer correlation.
2. Keep legacy behavior operational.

### Proposed DB Work

1. Update `packages/db/src/schema.ts`:
   - Add optional `scopes` on `api_keys`.
   - Add default runtime limit fields on `workspace_policies`.
   - Add correlation/origin fields on execution records as needed.
   - Add approval/artifact tables if included in P0.
2. Add migrations in `packages/db/drizzle/`.

### Verification

1. Migration up/down test in local dev DB.
2. Backward compatibility query tests for old rows (null scopes/limits).

### Exit Criteria

1. All schema changes are deployed and readable by services.

---

## Phase 2 - Backend Contract and Service Wiring

### Objectives

1. Expose new contracts through routers/services.
2. Enforce policy precedence and return structured recovery hints.

### Proposed Files

1. Update `apps/web/src/lib/trpc/routers/api-keys.ts`
2. Update `apps/web/src/lib/trpc/routers/policies.ts`
3. Update `apps/web/src/lib/trpc/routers/baleybots.ts`
4. Update `apps/web/src/lib/baleybot/executor.ts`
5. Update `apps/web/src/lib/baleybot/types.ts`
6. Update `apps/web/src/lib/baleybot/tool-catalog.ts`
7. Update `apps/web/src/lib/baleybot/tools/catalog-service.ts`

### New Additions

1. Add `bb_capabilities_get` (or equivalent internal capabilities endpoint).
2. Add shared mappers for:
   - progress envelope
   - correlation envelope
   - canonical error payload
3. Add optimistic concurrency fields where missing.

### Verification

1. Unit tests for new schema validation and permission mapping.
2. Router tests for enriched responses and errors.
3. Policy simulation tests for approval paths.

### Exit Criteria

1. Backend can emit full enriched contracts for clients and UI.

---

## Phase 3 - Frontend Propagation

### Objectives

1. Make new backend capabilities understandable and actionable in UI.
2. Improve operator control and debugging speed.

### Proposed Files

1. Update `apps/web/src/app/dashboard/settings/api-keys/page.tsx`
2. Update `apps/web/src/app/dashboard/settings/approvals/page.tsx`
3. Update `apps/web/src/app/dashboard/tools/page.tsx`
4. Update `apps/web/src/app/dashboard/activity/page.tsx`
5. Update `apps/web/src/app/dashboard/activity/executions/[id]/page.tsx`
6. Update `apps/web/src/app/dashboard/analytics/page.tsx`

### UI Additions

1. Scope presets and over-privilege warnings.
2. Approval/policy conflict visibility and risk display.
3. Tool metadata badges for capability/danger/policy impact.
4. Correlation IDs and origin filters in activity/detail views.

### Verification

1. Playwright coverage for key flows:
   - create scoped key
   - inspect approval pattern impact
   - trace failed execution with correlation data
2. Accessibility checks for new controls.

### Exit Criteria

1. Operator can identify cause and next action from UI without raw logs.

---

## Phase 4 - Internal BaleyBot Propagation

### Objectives

1. Align internal BaleyBots with new policy/capability contracts.
2. Improve generation/testing/review behavior using richer context.

### Proposed Files

1. Update `apps/web/src/lib/baleybot/internal-baleybots.ts`
2. Update `apps/web/src/lib/baleybot/generator.ts`
3. Update `apps/web/src/lib/baleybot/creator-bot.ts`
4. Update `apps/web/src/lib/baleybot/pattern-learner.ts`

### Verification

1. Snapshot tests for internal BaleyBot outputs.
2. Regression tests for creator and test-generation routes.

### Exit Criteria

1. Internal assistants surface policy-aware recommendations and failure analysis.

---

## Phase 5 - Stabilization and MCP Unpark Gate

### Objectives

1. Validate broad compatibility.
2. Re-enable MCP implementation phases once foundations are stable.

### Tasks

1. Run full `pnpm type-check`, `pnpm lint`, `pnpm test`.
2. Run targeted e2e for updated settings/activity UX.
3. Publish migration notes for existing workspaces.
4. Update MCP docs to switch from parked to active.

### Exit Criteria

1. P0 items complete and verified.
2. MCP implementation can resume on top of hardened contracts.

---

## 4. Risks and Mitigations

1. **Risk:** Scope/permission confusion and accidental lockouts.
   - **Mitigation:** explicit legacy mapping and UI warnings before save.
2. **Risk:** Contract drift between routes.
   - **Mitigation:** shared DTO modules and schema tests.
3. **Risk:** Prompt regressions in internal BaleyBots.
   - **Mitigation:** snapshot + scenario tests for creator/test/review bots.
4. **Risk:** Overly broad rollout blast radius.
   - **Mitigation:** feature flags for scope enforcement and enriched envelopes.

---

## 5. Decisions Needed Before Coding

1. Which fields are mandatory vs optional in P0 envelopes.
2. Whether approval/artifact tables are P0 or P1.
3. Final scope list and default presets for new API keys.
4. Whether correlation IDs are generated at API gateway or service layer.

---

## 6. Immediate Next Step

Implement Phase 1 and Phase 2 first in a narrow vertical slice:

1. API keys with scopes
2. policy default limits
3. `bb_capabilities_get`
4. canonical error + correlation envelope

Then propagate those exact primitives into frontend and internal BaleyBots.
