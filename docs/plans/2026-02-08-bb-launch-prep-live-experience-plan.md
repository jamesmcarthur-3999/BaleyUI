# BaleyBot Build → Launch Prep → Live Experience Plan

> **Date:** 2026-02-08  
> **Status:** Proposed (Priority)  
> **Goal:** Evolve BB creation into a complete lifecycle where bots move from design to verified launch to daily operational use as mini-apps/tools.  
> **Principle:** Trigger configuration is an activation concern, not an always-visible editing concern.

---

## 1. Problem Statement

The current creator experience is strong at producing BAL, but weak at transitioning users from "design complete" to "operationally useful."

Current pain points:

- Trigger setup feels hidden/regressed because it is surfaced through readiness gating that does not match user intent.
- Users want to use BBs as mini-apps after verification, but the UI remains editor-first.
- Passing tests does not trigger a structured launch preparation flow.
- Cluster (multi-entity) BBs are not represented as operator-friendly runtime interfaces.

Target outcome:

- A clear lifecycle with mode defaults that match user behavior:
  1. Build when creating/changing.
  2. Launch Prep when quality is proven and activation must be decided.
  3. Live as the default for active BBs, with analytics beside usage.

---

## 2. Product Model

### 2.1 Modes

| Mode | Primary User Intent | Primary Surfaces |
|------|---------------------|------------------|
| Build | Design and verify bot behavior | Visual, Code, Connections, Tests |
| Launch Prep | Decide activation and runtime contract | Launch checklist, activation channels, generated interface preview |
| Live | Use the bot day-to-day | Runtime interface + analytics snapshot |

### 2.2 Lifecycle Stages

`draft -> verified -> launch_prepared -> live -> paused`

Definitions:

- `draft`: user is designing/changing behavior.
- `verified`: BAL valid, required connections met, tests passing at configured threshold.
- `launch_prepared`: LaunchKit generated and user-reviewed (activation + interface + monitoring plan).
- `live`: activation policy enabled and runtime interface is default entry.
- `paused`: live bot intentionally halted; interface still available for manual runs if desired.

---

## 3. Trigger Philosophy and UX Rules

### 3.1 Trigger Relevance

Triggers are relevant when execution should happen without direct user action.  
Triggers are not relevant when the BB is primarily a human-in-the-loop tool.

### 3.2 Channel Decision Matrix

| Channel | Use When | Avoid When | Notes |
|--------|----------|------------|-------|
| Manual | User-driven tool/mini-app usage | Fully autonomous workflows | Always available in Live |
| Schedule | Time-based checks/reports | Event-driven workflows with low latency needs | Cron validation + next run preview |
| API/Webhook | External systems push events | No external producer exists | First-class for integrations |
| BB Completion | Multi-BB orchestration | Single standalone bot | Existing capability; improve setup UX |
| DB Event | Data-change driven workflows | DB cannot emit event signals | If unavailable, degrade to schedule polling |
| MCP Event | MCP-connected source emits actionable events | No MCP source contract exists | Requires event contract schema |

### 3.3 UX Placement

- Build mode: no full trigger form tab by default.
- Launch Prep mode: "Activation Channels" is a dedicated step with recommendations.
- Live mode: "Automation Settings" drawer for edits without leaving runtime usage.

This keeps activation discoverable but process-driven.

---

## 4. Launch Prep Orchestration (Internal BB Driven)

Launch Prep starts automatically when verification criteria are met (or manually triggered by user).

### 4.1 Orchestration Pipeline

1. `test_results_analyzer` summarizes quality/risk from latest test suite.
2. `deployment_advisor` proposes activation channels and monitoring defaults.
3. `integration_builder` proposes external wiring steps/snippets (if applicable).
4. New internal BB: `interface_designer` generates runtime interface spec for single BB and cluster flows.
5. Optional new internal BB: `launch_orchestrator` synthesizes all outputs into one LaunchKit artifact.

### 4.2 LaunchKit Contract

```ts
interface LaunchKit {
  generatedAt: string;
  confidenceScore: number; // 0-1
  verificationSummary: {
    passRate: number;
    topology: 'single' | 'chain' | 'parallel' | 'complex';
    keyRisks: string[];
  };
  activationPlan: {
    recommendedPrimary: 'manual' | 'schedule' | 'webhook' | 'other_bb' | 'db_event' | 'mcp_event';
    channels: Array<{
      type: 'manual' | 'schedule' | 'webhook' | 'other_bb' | 'db_event' | 'mcp_event';
      enabledByDefault: boolean;
      config: Record<string, unknown>;
      rationale: string;
    }>;
  };
  runtimeInterface: InterfaceSpec;
  monitoringPlan: {
    alerts: string[];
    metrics: string[];
  };
  goLiveChecklist: string[];
}
```

### 4.3 Gating Rules

Launch Prep can auto-open when all are true:

- BAL parses successfully.
- Required connections are satisfied.
- Test suite pass-rate >= threshold (configurable; default `0.8`).
- No blocking high-severity issues from analyzer.

---

## 5. Runtime Interface (Mini-App) Design

### 5.1 Live Default

When stage is `live`, open in Live mode by default:

- Left: `Use` interface (prompt/form + output + entity trace for clusters).
- Right: analytics snapshot (success rate, latency, failures, run count).
- Quick actions: `Run`, `Automation Settings`, `Open Full Analytics`, `Edit`.

### 5.2 InterfaceSpec Contract

```ts
interface InterfaceSpec {
  version: 1;
  mode: 'chat' | 'form' | 'hybrid';
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  components: Array<
    | { type: 'chat_input'; id: string; label: string }
    | { type: 'json_form'; id: string; schema: Record<string, unknown> }
    | { type: 'file_input'; id: string; accept: string[] }
    | { type: 'run_button'; id: string; label: string }
    | { type: 'result_view'; id: string; format: 'text' | 'json' | 'table' | 'mixed' }
    | { type: 'cluster_trace'; id: string; showEntityTiming: boolean }
  >;
}
```

### 5.3 Cluster Runtime Behavior

For chain/parallel/complex topologies, runtime view includes:

- Final output panel.
- Step trace panel (entity outputs, duration, failures).
- Retry controls by stage where safe.

---

## 6. Information Architecture and Navigation

### 6.1 Top-Level View Switch

At BB detail route, mode switch:

- `Build`
- `Launch Prep` (visible once stage >= verified)
- `Live` (visible once stage >= launch_prepared; default when stage=live)

### 6.2 Build Surface

Existing tabs remain in Build:

- Visual
- Code
- Connections
- Tests

Trigger config is removed as a top-level Build tab and moved into Launch Prep activation step.

### 6.3 Launch Prep Surface

Guided checklist sections:

1. Verification summary
2. Runtime interface preview
3. Activation channels
4. Monitoring defaults
5. Go-live confirmation

### 6.4 Live Surface

Persistent layout:

- Runtime interface + quick actions
- Embedded analytics snapshot
- Link to full analytics panel

---

## 7. Technical Architecture Changes

### 7.1 Data Model

Add to `baleybots`:

- `lifecycleStage` (`draft|verified|launch_prepared|live|paused`)
- `launchKit` (`jsonb`, nullable)
- `runtimeInterfaceSpec` (`jsonb`, nullable)
- `launchPreparedAt` (`timestamp`, nullable)
- `liveAt` (`timestamp`, nullable)

Enhance trigger persistence model:

- keep `baleybotTriggers` as operational source of truth.
- extend trigger schema to support `db_event` and `mcp_event` configs.
- allow multiple active channels per target BB.

### 7.2 Internal BBs

Existing reused:

- `test_results_analyzer`
- `deployment_advisor`
- `integration_builder`

New:

- `interface_designer` (generate InterfaceSpec)
- `launch_orchestrator` (optional synthesis bot if we want one-call assembly)

### 7.3 API/tRPC

Add lifecycle endpoints in `baleybots` router:

- `evaluateLaunchReadiness`
- `generateLaunchKit`
- `approveLaunchPlan`
- `promoteToLive`
- `pauseLiveBot`
- `getRuntimeInterface`

### 7.4 UI Components

New components:

- `LaunchPrepPanel`
- `ActivationChannelsEditor`
- `RuntimeInterfaceRenderer`
- `ClusterTracePanel`
- `LiveAnalyticsSnapshot`

Refactor:

- Move current `TriggerConfig` usage from Build tab to Launch Prep step container.

---

## 8. Implementation Plan

## Phase 1: Lifecycle Contract and Mode Router

Goal: establish state machine and top-level mode switching.

Tasks:

1. Add lifecycle fields and migration.
2. Implement stage derivation + persistence.
3. Add Build/Launch Prep/Live mode switch on BB detail page.
4. Default to `Live` when stage is `live`.

Acceptance:

- Existing BBs migrate to `draft` safely.
- No loss of existing editor functionality.

## Phase 2: Launch Prep Generation Pipeline

Goal: create LaunchKit automatically after verification.

Tasks:

1. Add readiness evaluator endpoint.
2. Wire internal BB orchestration for LaunchKit generation.
3. Persist LaunchKit and interface spec.
4. Render Launch Prep checklist UI.

Acceptance:

- Launch Prep can be generated for both single and multi-entity bots.
- LaunchKit can be regenerated after changes.

## Phase 3: Activation Channels and Trigger Consolidation

Goal: process-driven trigger setup.

Tasks:

1. Build `ActivationChannelsEditor` using channel matrix.
2. Support multiple channels (manual + automation channels).
3. Extend DB/API/MCP trigger config contracts.
4. Keep BB completion flow first-class.

Acceptance:

- User can configure schedule, webhook, BB completion in Launch Prep.
- DB/MCP channels degrade gracefully when capability is unavailable.

## Phase 4: Live Runtime Interface and Analytics-by-Default

Goal: shift active BBs to use-first experience.

Tasks:

1. Implement `RuntimeInterfaceRenderer` from InterfaceSpec.
2. Add cluster trace panel.
3. Embed analytics snapshot in Live surface.
4. Add quick transition to Edit.

Acceptance:

- Promoted BB opens in Live mode by default.
- User can run/test from Live without returning to Build.

## Phase 5: Hardening and Rollout

Goal: ensure reliability and adoption.

Tasks:

1. Add comprehensive test suite for lifecycle transitions.
2. Add observability for LaunchKit generation failures and latencies.
3. Add fallback behavior when internal BB outputs are malformed.
4. Add migration/backfill jobs for old trigger configs.

Acceptance:

- No blocking regressions in existing BB creation tests.
- Lifecycle transition errors are visible and recoverable.

---

## 9. Test Strategy

### 9.1 Unit

- lifecycle stage transitions
- channel recommendation rules
- InterfaceSpec rendering logic

### 9.2 Integration

- Build -> verified -> Launch Prep generation
- Launch Prep -> live promotion
- trigger persistence and hydration across reloads

### 9.3 E2E

- single-entity bot live flow
- multi-entity cluster live flow
- webhook and schedule activation
- BB completion chain activation

---

## 10. Rollout Strategy

1. Ship behind workspace feature flag: `bb_launch_prep_live_mode`.
2. Enable for internal/staging workspaces first.
3. Compare usage metrics:
   - time-to-first-live
   - percentage of BBs reaching live
   - live run frequency vs editor-only usage
4. Roll out to all workspaces after 1 week stable.

---

## 11. Success Criteria

Product outcomes:

- Users can move from build to live without leaving BB detail flow.
- Live BBs default to runtime interface + analytics, not editor tabs.
- Trigger setup is discovered in Launch Prep with recommendation quality.
- Cluster BBs are operable as mini-apps with trace visibility.

Engineering outcomes:

- Existing creator/test/analytics flows remain green.
- Lifecycle states are explicit and queryable.
- Internal BB orchestration failures degrade gracefully.

---

## 12. Open Design Questions

1. Should "manual-only live" be allowed without Launch Prep, or should Launch Prep always run once?
2. For DB triggers, do we support native CDC first, or polling-only first with CDC later?
3. Should users be able to customize generated runtime interface before going live, or only after first launch?
4. Do we promote to `live` automatically when LaunchKit confidence exceeds threshold, or always require explicit confirmation?

---

## 13. File Targets (Initial)

- `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`
- `apps/web/src/lib/baleybot/readiness.ts`
- `apps/web/src/components/baleybots/TriggerConfig.tsx` (repurposed into Launch Prep)
- `apps/web/src/components/creator/MonitorPanel.tsx`
- `apps/web/src/hooks/useTestExecution.ts`
- `apps/web/src/lib/trpc/routers/baleybots.ts`
- `apps/web/src/lib/baleybot/internal-baleybots.ts`
- `packages/db/src/schema.ts`

---

## 14. Baleybots Tool Loop Deep Dive (Findings)

This section captures what is currently true in code so loop planning is grounded in implementation reality.

### 14.1 Core Runtime Capabilities (Already Available)

- `@baleybots/core` supports v6 tool-loop stop controls via `stopWhen` and helpers such as `stepCountIs`, `hasToolResult`, `noToolCalls`, `combine`, and `all`.
- Default loop behavior is bounded (`stepCountIs(20)` equivalent default) and forces a final no-tools response near loop boundary.
- Tool failures are already handled with `toolFailMode` semantics (`returnToAI` default), which enables in-call self-correction before returning to caller.
- Tool execution supports parallel execution of multiple approved tool calls in one loop turn.

### 14.2 Current BaleyUI Integration Gaps

- BaleyUI internal BB execution currently routes through BAL DSL (`executeBALCode` -> `@baleybots/tools` interpreter), which does not expose advanced per-entity runtime fields like `stopWhen` and `toolFailMode` in BAL syntax today.
- Internal BB execution currently passes `availableTools: new Map()` by default, so internal bots are effectively one-shot structured-output generators, not tool-orchestrating agents.
- Creator and test flows are currently app-level single pass calls:
  - Creator: one `creator_bot` call + local parse/validation.
  - Tests: sequential test execution with no remediation loop beyond manual retries.

### 14.3 Practical Implication

We can leverage loop behavior immediately without changing Baleybots core by adding a BaleyUI orchestration layer and tool-enabled internal orchestrator bots.  
Baleybots-core changes are optional for phase 2, not required for phase 1.

---

## 15. Loop-Orchestration Architecture

### 15.1 Two-Layer Model

1. **Micro loop (inside one internal bot call):** Use Baleybots native tool loop to perform multiple tool steps in one run.
2. **Macro loop (service-level):** Deterministic BaleyUI wrapper that repeats orchestrator runs with strict budgets and progress checks.

This gives us agentic flexibility with deterministic safety rails.

### 15.2 New Internal Orchestrator Bots

Add internal bots that are explicitly tool-enabled:

- `creator_orchestrator`
  - Goal: turn a user request into a valid, visualizable, test-ready candidate.
  - Tools it can call:
    - `draft_candidate` (wraps existing creator/generator behavior)
    - `validate_candidate` (parse + compile + visual parse check)
    - `repair_candidate` (targeted fix prompt)
    - `finalize_candidate` (commit final structured output)
- `test_healer`
  - Goal: improve pass rate using bounded safe actions.
  - Tools it can call:
    - `run_test_subset`
    - `analyze_failures`
    - `adjust_test_expectation` (guarded)
    - `propose_bal_patch` (guarded, not auto-applied unless policy allows)
    - `finalize_healing_report`

### 15.3 Macro Loop Contract

Every orchestrated workflow gets a shared policy contract:

- `maxCycles`: hard cap (initial: 3 for testing, 4 for creator).
- `maxDurationMs`: wall-clock cap (initial: 90s testing, 120s creator).
- `minImprovementDelta`: stop if no measurable improvement.
- `maxRepeatSignature`: stop if same failure signature repeats.
- `maxEstimatedCostUsd`: optional cost guard.

Stop reasons are explicit and persisted:

- `success`
- `no_progress`
- `budget_exceeded`
- `non_healable_blocker`
- `operator_abort`

---

## 16. Self-Healing Testing Design

### 16.1 Scope

Target: reduce manual intervention for expected failure classes while keeping risky code changes gated.

### 16.2 Healing Taxonomy

Auto-healable (phase 1):

- transient timeout/rate-limit failures (bounded retry with jitter)
- semantic mismatch where validator confidence is high
- fixture preload/setup drift where deterministic fix exists

Guarded (proposal only in phase 1):

- BAL code changes
- tool set changes
- trigger/activation changes

Non-healable (fail fast):

- missing required connections
- permission/policy denials
- schema-contract hard violations

### 16.3 Healing Cycle

1. Execute baseline suite.
2. Classify failures by category + signature.
3. Run `test_healer` with current failures and policy.
4. Apply safe actions allowed by policy.
5. Re-run affected subset.
6. Evaluate progress and either continue or stop.
7. Persist `HealingReport` and show cycle timeline in UI.

### 16.4 UX Updates

- Add `Run with Self-Heal` action in test panel.
- Show per-cycle decisions, actions taken, and confidence.
- Provide one-click apply for guarded proposals (e.g., BAL patch) with diff preview.

---

## 17. Creator Multi-Step Orchestration Design

### 17.1 Goal

Make creator responses resilient by default:

- valid BAL
- visualizer-compatible parse
- composition completeness for multi-entity designs
- optional quick verification readiness checks

### 17.2 Creator Orchestration Cycle

1. Generate initial candidate.
2. Validate parse + visual conversion.
3. Validate structure rules (e.g., multi-entity requires composition).
4. If invalid, run targeted repair prompt with exact diagnostics.
5. Repeat until success or loop policy stop condition.
6. Return final candidate + structured diagnostics trace.

### 17.3 Safety Rules

- Never emit unsupported entity properties in final BAL (`temperature`, `reasoning`, `stopWhen`, `retries`, `can_request`, `trigger`) until BAL DSL support is expanded.
- Always normalize tools syntax to BAL set form.
- Require successful parser + visual conversion before marking creator response ready.

---

## 18. Data, API, and Observability Additions

### 18.1 Data Contracts

Add workflow artifacts:

- `OrchestrationRun`
  - `id`, `kind` (`creator|testing`), `status`, `stopReason`, `cycles`, `startedAt`, `completedAt`
- `OrchestrationCycle`
  - `runId`, `index`, `inputs`, `actions`, `metrics`, `result`
- `HealingReport`
  - `passRateBefore`, `passRateAfter`, `actionsApplied`, `proposals`, `residualFailures`

Storage can start in JSON columns attached to execution records, then move to dedicated tables if query needs increase.

### 18.2 API Endpoints

Add tRPC procedures:

- `creator.runOrchestratedMessage`
- `tests.runWithSelfHealing`
- `tests.applyHealingProposal`
- `orchestration.getRun`

### 18.3 Telemetry

Track:

- cycles per run
- stop reason distribution
- pass-rate lift from healing
- creator first-pass validity vs repaired validity
- latency/cost deltas vs current one-shot approach

---

## 19. Delivery Plan (Loop Feature Track)

### Track A (Immediate, no Baleybots-core changes)

1. Add macro loop service (`internal-orchestration.ts`) with policy enforcement.
2. Add tool-enabled internal orchestrator bots and runtime tool registry for internal execution.
3. Integrate creator orchestration path behind feature flag.
4. Integrate test self-heal path behind feature flag.
5. Add observability + UI timelines.

### Track B (Optional, only if needed later)

If we need finer loop control than default DSL path allows:

1. Extend BAL DSL parser/interpreter support for advanced entity runtime fields (`stopWhen`, `toolFailMode`) in Baleybots tools package.
2. Or add a direct `Baleybot.create` execution path for internal orchestrator bots only.

Track B is not required for phase-1 outcomes.

---

## 20. Updated File Targets (Loop Track)

- `apps/web/src/lib/baleybot/internal-baleybots.ts`
- `apps/web/src/lib/baleybot/internal-orchestration.ts` (new)
- `apps/web/src/lib/baleybot/creator-bot.ts`
- `apps/web/src/lib/trpc/routers/baleybots.ts`
- `apps/web/src/hooks/useTestExecution.ts`
- `apps/web/src/components/creator/TestPanel.tsx`
- `apps/web/src/lib/baleybot/bal-parser-pure.ts`
- `packages/db/src/schema.ts` (if dedicated orchestration tables are added)
