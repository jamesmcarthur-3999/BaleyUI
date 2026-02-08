# BaleyUI MCP Cluster - Implementation Plan

**Status:** Parked (Blocked on Foundation Contract Hardening)
**Date:** 2026-02-08
**Branch:** `codex/mcp-development`
**Spec:** `docs/reference/BALEYUI_MCP_CLUSTER_SPEC.md`
**Prerequisite:** `docs/reference/BALEYUI_FOUNDATION_CONTRACT_HARDENING_SPEC.md`
**Supersedes:** `docs/plans/2026-02-03-baleyui-mcp-server-design.md`

---

## 1. Goal

Deliver a robust, expandable MCP framework for BaleyUI that:

1. Supports an agentic cluster entrypoint for complex requests.
2. Exposes direct tools/resources/prompts for deterministic integrations.
3. Executes one or many BaleyBots in a single coordinated run.
4. Provides full traceability, policy enforcement, and analytics.

---

## 2. Current Baseline

BaleyUI already has key runtime building blocks:

1. BaleyBot execution and streaming paths.
2. Built-in tools including `spawn_baleybot`, `create_agent`, `create_tool`.
3. Trigger orchestration via `baleybot_triggers` and completion service.
4. Workspace API keys and permission checks.
5. Analytics routers and metrics services.

The missing piece is a first-class MCP server/orchestrator surface.

---

## 3. Major Recommendations

1. Build MCP inside `apps/web` to reuse auth, DB, and runtime services.
2. Implement a dedicated orchestrator run model (`mcp_cluster_*` tables).
3. Keep MCP tool names stable with `bb_` prefix from day 1.
4. Require explicit lifecycle semantics (`needs_input` + resume).
5. Enforce budget/policy limits before and during execution.

---

## 4. Delivery Phases

## Phase 0 - Spec Freeze and Risk Closure

### Objectives

1. Finalize tool/resource/prompt contracts.
2. Lock lifecycle, error model, and policy precedence.
3. Resolve open product and security decisions.

### Tasks

1. Approve `docs/reference/BALEYUI_MCP_CLUSTER_SPEC.md`.
2. Decide scope strategy:
   - Option A: `read/execute/admin` only in v1.
   - Option B: add fine-grained MCP scopes in v1.
3. Approve new DB tables for cluster runs and checkpoints.
4. Define default budget limits and override rules.

### Exit Criteria

1. No unresolved contract questions.
2. Spec marked approved.
3. Team aligned on migration strategy.

---

## Phase 1 - MCP Foundation

### Objectives

1. Create MCP server scaffolding and endpoint.
2. Add auth middleware and request context mapping.
3. Register empty tool/resource/prompt registries.

### Proposed Files

1. Create `apps/web/src/mcp/server.ts`
2. Create `apps/web/src/mcp/context.ts`
3. Create `apps/web/src/mcp/auth.ts`
4. Create `apps/web/src/mcp/registry.ts`
5. Create `apps/web/src/mcp/tools/index.ts`
6. Create `apps/web/src/mcp/resources/index.ts`
7. Create `apps/web/src/mcp/prompts/index.ts`
8. Create `apps/web/src/app/api/mcp/route.ts`
9. Update `apps/web/package.json` for `@modelcontextprotocol/sdk` server usage.

### Verification

1. Unit tests for auth and context resolution.
2. Integration tests for MCP handshake and listing tools/resources.
3. Type-check and lint pass.

### Exit Criteria

1. MCP endpoint is reachable and authenticated.
2. Tool/resource lists return deterministic empty or stubbed registries.

---

## Phase 2 - Direct Read/Action MCP Tools (Non-Agentic Core)

### Objectives

1. Expose direct BaleyBot operations via MCP.
2. Add core read resources for BBs and executions.
3. Reuse existing service paths (avoid duplicating runtime logic).

### Tool Set (v1)

1. `bb_list`
2. `bb_create`
3. `bb_update`
4. `bb_execute`
5. `bb_get_execution`
6. `bb_tools_list`
7. `bb_trigger_upsert`
8. `bb_trigger_list`

### Resource Set (v1)

1. `baleyui://baleybots`
2. `baleyui://baleybots/{id}`
3. `baleyui://executions`
4. `baleyui://executions/{id}`
5. `baleyui://catalog/tools`

### Proposed Files

1. Create `apps/web/src/mcp/tools/bb-direct.ts`
2. Create `apps/web/src/mcp/resources/bb-resources.ts`
3. Create `apps/web/src/mcp/adapters/baleybots-service.ts`

### Verification

1. Contract tests for tool schemas and outputs.
2. Permission matrix tests (`read` vs `execute` vs `admin`).
3. Workspace isolation tests for IDs/resources.

### Exit Criteria

1. MCP clients can create and execute BBs without orchestration mode.
2. Resource pagination works with cursor behavior.

---

## Phase 3 - Cluster Run Persistence and Lifecycle Engine

### Objectives

1. Introduce run/step/checkpoint persistence for orchestrated runs.
2. Implement lifecycle transitions and idempotency handling.
3. Add `bb_cluster_get` and timeline resource.

### Proposed Schema Changes

1. Add `mcp_cluster_runs` table.
2. Add `mcp_cluster_steps` table.
3. Add `mcp_cluster_checkpoints` table.
4. Add `mcp_cluster_events` table.

### Proposed Files

1. Modify `packages/db/src/schema.ts`
2. Add migrations in `packages/db/drizzle/`
3. Create `apps/web/src/lib/mcp/run-store.ts`
4. Create `apps/web/src/lib/mcp/lifecycle.ts`
5. Create `apps/web/src/mcp/tools/bb-cluster-state.ts`
6. Create `apps/web/src/mcp/resources/cluster-resources.ts`

### Verification

1. DB tests for transactional lifecycle transitions.
2. Idempotency tests for run creation.
3. Replay/checkpoint reconstruction tests.

### Exit Criteria

1. Any run has durable state and event timeline.
2. Crashed/retried requests do not duplicate runs for same idempotency key.

---

## Phase 4 - Agentic Orchestrator Cluster

### Objectives

1. Implement `bb_cluster_run` planning + execution.
2. Implement `needs_input` and `bb_cluster_resume`.
3. Support multi-BB execution in one run.

### Orchestrator Model

1. Entrypoint internal BB: `mcp_orchestrator` (new).
2. Reuse internal BBs: `creator_bot`, `integration_builder`, `execution_reviewer`.
3. Execution delegation via `spawn_baleybot` and direct executor/service calls.

### Proposed Files

1. Create `apps/web/src/lib/mcp/orchestrator.ts`
2. Create `apps/web/src/lib/mcp/planner.ts`
3. Create `apps/web/src/lib/mcp/executor.ts`
4. Create `apps/web/src/lib/mcp/needs-input.ts`
5. Create `apps/web/src/mcp/tools/bb-cluster-run.ts`
6. Update `apps/web/src/lib/baleybot/internal-baleybots.ts` (new internal orchestrator definition)

### Verification

1. End-to-end tests for:
   - Plan-only path
   - Execute path
   - Needs-input resume path
2. Multi-BB step sequence validation.
3. Policy-block and approval-needed behavior validation.

### Exit Criteria

1. A single MCP call can create/modify/execute a multi-BB flow.
2. Missing inputs are requested in structured form and can be resumed.

---

## Phase 5 - Policy, Budget, and Safety Enforcement

### Objectives

1. Enforce budgets and runtime limits per run.
2. Implement policy precedence and denial responses.
3. Integrate approval-required tool handling with `needs_input`.

### Proposed Files

1. Create `apps/web/src/lib/mcp/budget-guard.ts`
2. Create `apps/web/src/lib/mcp/policy-guard.ts`
3. Create `apps/web/src/lib/mcp/error-mapper.ts`
4. Optional: add workspace MCP policy table in `packages/db/src/schema.ts`

### Verification

1. Budget breach tests (`BUDGET_EXCEEDED`).
2. Step/time/depth limit tests.
3. Permission and forbidden-tool tests.

### Exit Criteria

1. Every run is bounded by enforced policy and budget constraints.
2. Error responses map to canonical MCP error model.

---

## Phase 6 - Analytics and Observability Surface

### Objectives

1. Expose run analytics and timeline resources.
2. Add analytics tools for summary and breakdown.
3. Ensure traceability across MCP -> run -> step -> BB execution.

### Tool/Resource Additions

1. `bb_analytics_summary`
2. `bb_analytics_run_breakdown`
3. `baleyui://analytics/overview`
4. `baleyui://runs/{runId}/timeline`

### Proposed Files

1. Create `apps/web/src/mcp/tools/bb-analytics.ts`
2. Create `apps/web/src/mcp/resources/analytics-resources.ts`
3. Create `apps/web/src/lib/mcp/trace.ts`

### Verification

1. Metrics correctness tests against fixture runs.
2. Timeline ordering and correlation ID tests.

### Exit Criteria

1. MCP clients can inspect run quality, cost, and failures without leaving MCP context.

---

## Phase 7 - Hardening, Performance, and GA Readiness

### Objectives

1. Improve reliability under load and failures.
2. Validate reconnection/resume behavior.
3. Finalize documentation and rollout checklist.

### Tasks

1. Rate-limit MCP endpoints.
2. Add chaos tests for partial failures and retry logic.
3. Add load tests for concurrent runs.
4. Create operator runbook and troubleshooting guide.
5. Add MCP quickstart docs for client setup.

### Verification

1. Stress test for concurrent run execution.
2. Recovery tests for interrupted runs.
3. Security review for tenant isolation and secret handling.

### Exit Criteria

1. Release checklist complete.
2. MCP v1 marked production ready.

---

## 5. Testing Strategy

1. **Contract tests**
   - Tool schemas and result envelopes.
2. **Authorization tests**
   - `read`, `execute`, `admin` matrix.
3. **Lifecycle tests**
   - State transition validity and immutability for terminal states.
4. **Integration tests**
   - End-to-end multi-BB orchestrated workflows.
5. **Reliability tests**
   - Idempotency, retries, checkpoints, and resume after interruption.

---

## 6. Key Risks and Mitigations

1. **Risk:** orchestration drift from existing runtime behavior.
   - **Mitigation:** route all execution through current executor/service paths.
2. **Risk:** uncontrolled recursive spawn chains.
   - **Mitigation:** strict depth/step/time/budget guards.
3. **Risk:** ambiguous error handling for clients.
   - **Mitigation:** canonical error mapper and strict contract tests.
4. **Risk:** run-state corruption during partial failures.
   - **Mitigation:** transaction-based transitions + checkpoints.

---

## 7. Decisions Needed Before Implementation Starts

1. Scope granularity: keep `read/execute/admin` only, or add MCP-specific scopes now.
2. Confirm new `mcp_cluster_*` tables in v1.
3. Confirm default budget and duration limits.
4. Confirm whether SSE transport ships in v1 or after streamable HTTP.

---

## 8. Rollout Strategy

1. Internal alpha with one workspace.
2. Early access with feature flag per workspace.
3. GA after reliability and policy audit passes.

---

## 9. Immediate Next Step

Start Phase 1 only after:
1. Phase 0 signoff for this plan, and
2. P0 completion from `docs/plans/2026-02-08-foundation-contract-hardening-and-propagation-plan.md`.

This prevents contract churn and rework while implementing MCP server infrastructure.
