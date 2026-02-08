# Pre-MCP Two-Phase Plan: Foundation Hardening + Model Intelligence

**Status:** Proposed (Primary Execution Plan)  
**Date:** 2026-02-08  
**Branch:** `codex/pre-mcp-foundation-model-intel`  
**Supersedes Execution Order Of:**  
1. `docs/plans/2026-02-08-baleyui-mcp-cluster-implementation-plan.md` (temporarily parked)  
2. `docs/plans/2026-02-08-mcp-cluster-use-cases-and-ux-validation.md` (temporarily blocked)

**References:**  
1. `docs/reference/BALEYUI_FOUNDATION_CONTRACT_HARDENING_SPEC.md`  
2. `docs/reference/BALEYUI_MODEL_INTELLIGENCE_AND_BAL_COMPAT_SPEC.md`

---

## 1. Goal

Complete two major phases before MCP build resumes:

1. **Phase 1:** Foundation contract hardening and system-wide propagation.
2. **Phase 2:** Model Intelligence Catalog + BAL compatibility resolver + operator UI + admin BB cluster modernization.

Then return to MCP implementation on stable foundations.

---

## 2. Phase 1 - Foundation Hardening (Pre-MCP Mandatory)

### Objectives

1. Standardize contracts for capabilities, constraints, approvals, progress, correlation, and errors.
2. Propagate those contracts to backend, frontend, and internal BaleyBots.

### Primary Workstreams

1. **Schema and DB**
   - Add API key scopes.
   - Add default policy limits.
   - Add correlation/origin fields where needed.
2. **Backend contracts**
   - Add `bb_capabilities_get`.
   - Add shared response envelope mappers.
   - Harden optimistic concurrency and idempotency fields.
3. **Frontend propagation**
   - Settings/API keys scopes and risk warnings.
   - Approvals visibility with richer risk context.
   - Activity/analytics traceability improvements.
4. **Internal BB propagation**
   - Make creator/generator/reviewer patterns policy-aware and capability-aware.

### Exit Criteria

1. Backward compatibility preserved.
2. P0 hardening spec items complete.
3. Operator can diagnose policy/approval/cost failures without raw logs.

---

## 3. Phase 2 - Model Intelligence + Admin Cluster Modernization

### Objectives

1. Build daily-maintained model intelligence database.
2. Add BAL compatibility and invocation support matrix.
3. Add a Models page and change-impact visibility.
4. Ensure admin internal BB experience uses modern BAL + visual editor flows.

### Workstream A: Model Intelligence Pipeline

1. Implement catalog tables and snapshot/event model.
2. Build internal BB cluster jobs for collection, normalization, verification, enrichment, and impact analysis.
3. Add alias semantics (`family:latest`) with verified promotion rules.

### Workstream B: BAL Compatibility Layer

1. Implement `bal_model_support_matrix`.
2. Implement `bal_invocation_profiles`.
3. Add compatibility canary test runs and last-known-good fallback logic.

### Workstream C: Runtime + Skills Integration

1. Add `skill_model_contracts`.
2. Implement `skill_model_resolver`.
3. Route internal BB model selection through resolver instead of static prompt assumptions.

### Workstream D: Frontend Models UX

1. Add routes:
   - `/dashboard/models`
   - `/dashboard/models/[provider]/[model]`
   - `/dashboard/models/changes`
2. Show:
   - model catalog and alias mappings
   - compatibility badges
   - price/context/capability diffs
   - impact feed

### Workstream E: Admin BB Cluster Modernization

1. Upgrade admin internal BB pages to align with current visual editor and BAL-first workflow.
2. Ensure internal BB cluster controls are available in admin surfaces:
   - run/inspect cluster maintenance jobs
   - view compatibility canary results
   - review and approve catalog promotions
3. Align admin execution traces with new correlation standards from Phase 1.

### Exit Criteria

1. Daily model intelligence pipeline is running.
2. Internal BBs consume resolver outputs for model choice.
3. Models page is available and actionable.
4. Admin area can operate and inspect internal cluster health.

---

## 4. Return-to-MCP Gate

MCP build resumes only after:

1. Phase 1 complete and validated.
2. Phase 2 core components complete:
   - model catalog + compatibility resolver
   - admin cluster operability
   - baseline Models UI

When these conditions are true, unpark:

1. `docs/plans/2026-02-08-baleyui-mcp-cluster-implementation-plan.md`
2. `docs/plans/2026-02-08-mcp-cluster-use-cases-and-ux-validation.md`

---

## 5. Implementation Sequence (Pragmatic)

1. Phase 1, vertical slice:
   - scopes + policy defaults + capabilities endpoint + envelope standardization.
2. Phase 1, broad propagation:
   - settings/activity/analytics/admin traceability updates.
3. Phase 2, backend-first:
   - model catalog schema + ingestion cluster + compatibility matrix.
4. Phase 2, runtime and internal BB integration:
   - resolver and skill contracts.
5. Phase 2, UI and admin:
   - Models pages + admin cluster operations.
6. MCP unpark and continue.

---

## 6. Immediate Next Step

Start coding **Phase 1 vertical slice**:

1. API key scopes + legacy mapping.
2. Workspace policy default limits.
3. `bb_capabilities_get`.
4. Shared response envelope fields for correlation/progress/errors.
