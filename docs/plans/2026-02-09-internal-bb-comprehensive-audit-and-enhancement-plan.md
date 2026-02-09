# Internal BB Comprehensive Audit and Enhancement Plan

Status: Proposed
Date: 2026-02-09
Scope: All internal BaleyBots (16 total)

## 1. Executive Summary

This audit confirms your core direction is correct:

1. Internal BB BAL/prompt assets are too monolithic and over-embedded in code.
2. Shared guidance should move into reusable `.md` skill files.
3. Prompt structure, tool reasoning, and user-facing outputs need stricter alignment.
4. Several internal BBs are under-used or un-used and should be either integrated or retired.

Primary recommendation: implement a contract-first internal BB framework where BAL remains the executable contract, and `.md` skills provide reusable behavior modules compiled into each internal BB definition.

## 2. Verified Baseline (Current Code)

### 2.1 Internal BB inventory

The repository defines 16 internal BBs in `apps/web/src/lib/baleybot/internal-baleybots.ts`.

1. `creator_discovery`
2. `creator_bot`
3. `creator_action_advisor`
4. `bal_generator`
5. `pattern_learner`
6. `execution_reviewer`
7. `nl_to_sql_postgres`
8. `nl_to_sql_mysql`
9. `web_search_fallback`
10. `connection_advisor`
11. `test_orchestrator`
12. `test_generator`
13. `deployment_advisor`
14. `test_validator`
15. `test_results_analyzer`
16. `integration_builder`

### 2.2 Runtime facts

1. Internal BBs are seeded on server startup via `apps/web/src/instrumentation.ts`.
2. Internal BB definitions are auto-updated from code unless `adminEdited=true`.
3. Execution routes through standard executor via `executeInternalBaleybot()` with execution records.

### 2.3 Real usage map

Active in runtime flow:

1. Creator lifecycle: `creator_discovery`, `creator_bot`, `creator_action_advisor`
2. Testing lifecycle: `test_orchestrator`, `test_generator`, `test_validator`, `test_results_analyzer`
3. Launch lifecycle: `deployment_advisor`
4. Connections lifecycle: `connection_advisor`
5. Tool services: `nl_to_sql_postgres`, `nl_to_sql_mysql`, `web_search_fallback`

Defined but effectively not wired into current user flows:

1. `integration_builder`
2. `execution_reviewer` (service exists, not wired in product flow)
3. `pattern_learner` (service exists, not wired in product flow)
4. `bal_generator` (service exists, creator uses `creator_bot` path)

### 2.4 Verification commands executed

Targeted tests were run and currently pass:

1. `pnpm --filter @baleyui/web test src/lib/baleybot/__tests__/internal-baleybots.test.ts src/lib/baleybot/__tests__/internal-baleybots.integration.test.ts src/lib/baleybot/__tests__/creator-bot.test.ts`
2. `pnpm --filter @baleyui/web test src/lib/baleybot/__tests__/generator.test.ts src/lib/baleybot/__tests__/pattern-learner.test.ts src/lib/baleybot/__tests__/reviewer.test.ts src/lib/baleybot/services/__tests__/web-search-service.test.ts src/lib/baleybot/services/__tests__/nl-to-sql-service.test.ts src/lib/trpc/routers/__tests__/admin.test.ts`

## 3. Agreement and One Technical Disagreement

I agree with your recommendations on clarity, skill modularization, and alignment.

One technical disagreement: do not move all critical constraints out of BAL.

1. Keep hard runtime contracts and required output schema in BAL.
2. Move reusable reasoning and style guidance to `.md` skills.
3. Keep deterministic guardrails in code (validation, fallback, policy checks).

Reason: BAL is the executable boundary and must remain self-validating even if skill composition evolves.

## 4. Major Findings

## 4.1 Prompt/contract drift risk

`internal-baleybots.ts` currently contains very large inline `goal` strings with overlapping instructions and schema examples, creating drift risk and hard-to-review changes.

## 4.2 Cross-layer duplication in creator UX

Creator messaging is assembled in multiple places:

1. Internal BB response (`creator_bot` / `creator_discovery`)
2. Server-side lifecycle synthesis in `creator-bot.ts`
3. Page-level metadata synthesis in `page.tsx`
4. Additional layer rendering + quick actions in `ConversationThread.tsx` and `LeftPanel.tsx`

This causes repetitive messaging and inconsistent "next action" guidance.

## 4.3 Contract mismatches

`deployment_advisor` prompt uses trigger value `bb_completion`, while router schema expects `other_bb`.

## 4.4 Non-obvious coupling

Custom NL-powered workspace tool execution currently routes through `creator_bot` (not a dedicated tool executor), which couples creator behavior to runtime tool execution.

## 4.5 Coverage gaps

Internal BB tests still carry TODOs that skip broad parser/contract checks for most bots.

## 4.6 Documentation drift

`CLAUDE.md` internal BB inventory is outdated and lists only a subset.

## 5. Target Architecture: BAL + Skill Files

## 5.1 Design goals

1. Keep executable contracts in BAL.
2. Move reusable reasoning and communication guidance to markdown skills.
3. Compile skills into internal BB prompts deterministically.
4. Make each BB definition auditable, versioned, and testable.

## 5.2 Proposed structure

Create a new internal BB source layout:

1. `apps/web/src/lib/baleybot/internal-bb/catalog.ts`
2. `apps/web/src/lib/baleybot/internal-bb/contracts/`
3. `apps/web/src/lib/baleybot/internal-bb/skills/common/*.md`
4. `apps/web/src/lib/baleybot/internal-bb/skills/domain/*.md`
5. `apps/web/src/lib/baleybot/internal-bb/bots/<bot-id>/SPEC.md`
6. `apps/web/src/lib/baleybot/internal-bb/compiler.ts`
7. `apps/web/src/lib/baleybot/internal-bb/generated-definitions.ts`

## 5.3 Skill format

Each skill markdown file should use frontmatter:

1. `id`
2. `version`
3. `appliesTo` (bot IDs)
4. `section` (`reasoning`, `user_communication`, `tool_selection`, `safety`, `output_rules`)

Body should be concise instructions only, no duplicated JSON contract examples unless skill-specific.

## 5.4 Bot spec format

Each bot `SPEC.md` should define:

1. Purpose
2. Inputs and context assumptions
3. Output contract identifier
4. Skill list (ordered)
5. Model policy
6. Fallback policy
7. User-facing quality bar

## 5.5 Compiler behavior

Compiler should:

1. Resolve bot spec + skill modules
2. Build final BAL `goal` text in deterministic section order
3. Attach canonical `output` schema
4. Emit `generated-definitions.ts`
5. Fail build on missing skill/contract references

## 6. Shared Contract Standard (Internal BB v1)

Adopt standardized sections for every internal BB prompt:

1. Role and outcome
2. Inputs available
3. Output contract (single canonical shape)
4. Decision policy and constraints
5. Failure behavior (what to do when uncertain)
6. User communication style (if user-visible)

Adopt standardized runtime wrapper:

1. Typed runner per BB with Zod parse
2. Structured fallback policy (`empty`, `deterministic`, `retry`)
3. Parse-failure metrics and logs with BB name/version

## 6.1 Inter-BB collaboration and loop intelligence (explicit)

### Collaboration topology (current, verified)

1. Creator loop:
   - `creator_discovery` decides readiness/blockers.
   - `creator_bot` generates/repairs design output.
   - `creator_action_advisor` suggests next user actions after each stage.
2. Testing loop:
   - `test_orchestrator` (primary) or `test_generator` (fallback) creates suite.
   - `test_validator` arbitrates pass/fail on non-deterministic cases.
   - `test_results_analyzer` summarizes patterns and next steps.
3. Launch loop:
   - `deployment_advisor` contributes trigger/monitoring guidance used in LaunchKit generation.

### Tool-loop behavior (current)

1. Internal BB execution currently sets `availableTools` to an empty map in `executeInternalBaleybot()`, so most internal BBs are reasoning-only and not doing runtime tool-calling loops today.
2. Macro-level loop intelligence still exists via deterministic orchestration around BB calls (retry/repair/fallback), especially in creator flow.
3. Exception: NL-powered workspace tool execution currently calls `creator_bot`; this is a coupling smell and should be replaced with a dedicated internal tool-executor BB.

### Stage/thinking behavior (current)

1. Creator has explicit multi-cycle orchestration (`runInternalOrchestrationLoop`) with repeat-signature and budget guards.
2. Testing has staged logic too:
   - deterministic precheck first in `test_validator`
   - AI semantic adjudication only when needed
3. User-visible stage guidance is synthesized across backend + UI metadata layers (strong capability, but currently duplicated).

### How this plan preserves and improves \"the smarts\"

1. Keep orchestration loops and staged reasoning as first-class behavior.
2. Move reusable stage-reasoning heuristics into shared skills (`stage_transition`, `repair_strategy`, `confidence_policy`).
3. Add structured step-trace outputs per active BB (internal diagnostics), so we can audit stage decisions without increasing user-facing noise.
4. Keep deterministic gates before/after AI reasoning in every loop (`precheck -> AI -> validator -> fallback`).

## 7. Per-BB Enhancement Matrix

| BB | Current State | Issues | Enhancement Plan |
|---|---|---|---|
| `creator_discovery` | Active, critical | Question duplication and mixed urgency can leak through across layers | Add strict `requiredNow` decision rubric skill, return explicit `blockingQuestions`/`optionalQuestions`, reduce downstream remapping in page layer |
| `creator_bot` | Active, critical | Prompt is overloaded; instructions reference `thinking` but BAL output schema omits it; heavy repair loop indicates contract instability | Split into skills (`bal-syntax`, `tool-selection`, `user-narrative`), include explicit narrative fields in contract, tighten first-pass schema adherence, keep repair loop but lower fallback frequency |
| `creator_action_advisor` | Active | Suggestions rely on long transcript text and can become generic | Feed structured session snapshot payload (stage, blockers, test status, connection state) and add anti-repeat action filter keyed by recent prompts |
| `bal_generator` | Exported service, not in main flow | Duplicates creator capabilities; drift risk | Decide: deprecate or repurpose as code-only mode. If retained, align with same skill/contract framework and add explicit owner flow |
| `pattern_learner` | Service exists, not product-wired | Latent capability with no user loop; stale risk | Integrate into approval UI workflow or retire. If integrated, add conservative trust-level policy and review thresholds |
| `execution_reviewer` | Service exists, not product-wired | No operational surface in lifecycle | Wire to execution detail / monitor panel with "Review this run" action and structured remediation output |
| `nl_to_sql_postgres` | Active service | Lacks workspace-aware context in call site; safety validator has weak regex edge case | Pass workspace context consistently, strengthen SQL safety checker, add schema reference validation and denied-operation explainability |
| `nl_to_sql_mysql` | Active service | Same issues as Postgres variant | Same remediation as Postgres variant with dialect-specific deterministic checks |
| `web_search_fallback` | Active fallback | Fallback may return plausible-but-unverified URLs; result normalization is permissive | Add URL validity checks, dedupe and quality scoring, explicit fallback labeling to user, and optional deterministic "unavailable" mode when confidence is low |
| `connection_advisor` | Active | Advice can duplicate deterministic scanner results | Merge deterministic requirements scan first, ask BB only for ranked recommendations and migration guidance |
| `test_orchestrator` | Active primary | Good topology idea, but contract and UI expectations still broad | Add deterministic topology extraction as ground truth; BB focuses on test intent and edge-case generation |
| `test_generator` | Active fallback | Redundant with orchestrator | Keep as controlled fallback only, minimize prompt surface, or remove after orchestrator reliability reaches target |
| `deployment_advisor` | Active | Trigger enum mismatch (`bb_completion` vs `other_bb`) can cause parse failure/fallbacks | Unify trigger vocabulary via shared enum constants reused by prompt compiler and router schema |
| `test_validator` | Active | Hybrid deterministic/AI is good but confidence calibration is static | Add calibration dataset and confidence bucketing; produce reason codes for failure classes |
| `test_results_analyzer` | Active | Structured summary useful, but pipeline insights may be noisy | Anchor with deterministic stats first (pass/fail clusters, duration outliers), use BB only for high-value explanations |
| `integration_builder` | Defined only | No runtime call sites | Decide integrate vs retire. If integrate, add explicit entry point in Triggers/Launch guidance workflow |

## 8. Implementation Phases

## Phase 0: Freeze and inventory (2-3 days)

1. Add `internal-bb-audit` script to generate inventory: definitions, call-sites, tests, docs references.
2. Create canonical internal BB ownership table (owner, stage, SLA, deprecation decision).
3. Update stale docs (`CLAUDE.md` internal BB list).

Exit criteria:

1. Inventory report generated in CI.
2. Every BB has owner and disposition (`active`, `legacy`, `retire`, `integrate`).

## Phase 1: Contract normalization (3-5 days)

1. Extract shared enums/constants for topology, trigger types, match strategies.
2. Resolve `deployment_advisor` trigger-type mismatch.
3. Add typed runtime wrappers per BB with parse/fallback metrics.

Exit criteria:

1. No stringly-typed enum duplication across prompt + parser + router.
2. All active BB call sites use typed wrappers.

## Phase 2: Skill modularization (5-8 days)

1. Implement skill markdown format and compiler.
2. Migrate creator trio first (`creator_discovery`, `creator_bot`, `creator_action_advisor`).
3. Generate BAL definitions from specs + skills.

Exit criteria:

1. Creator trio no longer stores giant inline goals in `internal-baleybots.ts`.
2. Generated BAL diff is deterministic and snapshot-tested.

## Phase 3: Lifecycle BB migration (5-8 days)

Migrate and align:

1. `connection_advisor`
2. `test_orchestrator`
3. `test_generator`
4. `test_validator`
5. `test_results_analyzer`
6. `deployment_advisor`

Exit criteria:

1. End-to-end lifecycle flows pass with new prompts.
2. Malformed-output fallback rate reduced versus baseline.

## Phase 4: Service BB hardening (4-6 days)

Migrate/harden:

1. `nl_to_sql_postgres`
2. `nl_to_sql_mysql`
3. `web_search_fallback`

Exit criteria:

1. Deterministic safety checks are enforced before returning output.
2. Error and fallback behavior is user-safe and explicit.

## Phase 5: Latent BB decision implementation (3-5 days)

1. Integrate or retire `bal_generator`, `pattern_learner`, `execution_reviewer`, `integration_builder`.
2. Remove dead definitions if retired.

Exit criteria:

1. No orphan internal BBs remain.
2. Every seeded internal BB has at least one supported runtime pathway.

## 9. UX Alignment Plan (Creator Flow)

1. Define a single source of truth for lifecycle message composition.
2. Limit message layering to: one primary assistant message + one optional structured card.
3. Keep `creator_action_advisor` suggestions stage-aware and non-repetitive.
4. Keep discovery intake rendering deterministic from `requiredNow`/`optional` only.

Success metric targets:

1. Fewer repeated discovery turns per creation session.
2. Higher rate of first-pass "ready" outputs.
3. Higher quick-action usefulness (click-through with successful continuation).

## 10. Testing and Quality Gates

## 10.1 Required tests per active BB

1. Contract parse success tests
2. Malformed output recovery tests
3. Golden snapshot tests for compiled prompt sections
4. Call-site integration tests with typed wrapper behavior

## 10.2 CI gates

1. Fail if active BB has no contract test.
2. Fail if active BB has no runtime call-site and is not marked `legacy`.
3. Fail if prompt compiler output is non-deterministic.

## 10.3 Observability

Track per BB:

1. execution count
2. parse failure rate
3. fallback path rate
4. retry-loop count
5. time to successful response

## 11. Risks and Mitigations

1. Risk: over-fragmenting prompts into too many tiny skills.
Mitigation: cap skill count per BB and maintain ordered composition.

2. Risk: behavior regressions during migration.
Mitigation: phase rollout by BB family with baseline metrics before cutover.

3. Risk: hidden dependencies on legacy wording.
Mitigation: snapshot prompt diffs and run creator/lifecycle regression scenarios.

4. Risk: retirement of latent BBs breaks external code paths.
Mitigation: grep-based dependency checks + deprecation window + runtime warnings.

## 12. Immediate Implementation Order (Recommended)

1. Phase 0 now (inventory + ownership + doc sync)
2. Phase 1 enum/contract normalization (fix known mismatches first)
3. Phase 2 creator trio skill migration
4. Phase 3 lifecycle BB migration
5. Phase 4 service BB hardening
6. Phase 5 latent BB integrate/retire decisions

## 13. Evidence References (Audit Anchors)

1. Internal BB definitions and seed/update behavior:
   - `apps/web/src/lib/baleybot/internal-baleybots.ts`
2. Creator orchestration, discovery merge, repair loop:
   - `apps/web/src/lib/baleybot/creator-bot.ts`
3. Internal BB output schemas and call-sites in router:
   - `apps/web/src/lib/trpc/routers/baleybots.ts`
4. Creator UX layering and lifecycle metadata synthesis:
   - `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`
   - `apps/web/src/components/creator/LeftPanel.tsx`
   - `apps/web/src/components/creator/ConversationThread.tsx`
5. NL-powered custom tool execution coupling:
   - `apps/web/src/lib/baleybot/services/execution-tools-loader.ts`
6. Web search and NL-to-SQL service wrappers:
   - `apps/web/src/lib/baleybot/services/web-search-service.ts`
   - `apps/web/src/lib/baleybot/services/nl-to-sql-service.ts`
7. BAL parser/type constraints:
   - `packages/baleybots/typescript/packages/tools/src/baleybots-dsl-v2/parser.ts`
   - `packages/baleybots/typescript/packages/tools/src/baleybots-dsl-v2/type-builder.ts`
8. Internal BB test coverage/TODO gaps:
   - `apps/web/src/lib/baleybot/__tests__/internal-baleybots.test.ts`
9. Documentation drift:
   - `CLAUDE.md`

## 14. Necessity Audit vs `@baleybots` Heavy Lifting (2026-02-09)

This section verifies which plan items are truly required at the app layer vs already handled by package runtime.

### 14.1 Package capabilities already covering core runtime concerns

Verified in `@baleybots/core`:

1. Tool-loop orchestration, including parallel execution, per-tool approvals, output shaping/capping:
   - `packages/baleybots/typescript/packages/core/src/core/tool-orchestrator.ts`
2. Iteration controls and loop bounds:
   - `packages/baleybots/typescript/packages/core/src/core/iteration-controller.ts`
3. Main process loop with stop conditions, tool execution cycle, schema validation, and retry-ready flow:
   - `packages/baleybots/typescript/packages/core/src/baleybot.ts`
4. Canonical BAL parsing and output schema building:
   - `packages/baleybots/typescript/packages/tools/src/baleybots-dsl-v2/parser.ts`
   - `packages/baleybots/typescript/packages/tools/src/baleybots-dsl-v2/type-builder.ts`

Implication: app-side reimplementation of tool-loop mechanics, iteration engine, approval primitives, parser/type builder logic is duplicate work and should not be added.

### 14.2 Keep/Cut matrix for proposed changes

| Proposed change family | Necessity | Why |
|---|---|---|
| Internal BB prompt modularization into shared `.md` skills + deterministic prompt compiler | **Required** | Package runtime does not provide app-specific internal BB prompt authoring/composition system. |
| Per-BB contract normalization and typed wrappers at call sites | **Required** | Package validates model outputs, but app still needs stable router/service-level contracts and fallback semantics. |
| Fix enum/contract drifts (ex: deployment trigger vocabulary) | **Required** | Drift exists between internal BB prompt contracts and router schemas. |
| Active/latent BB ownership + integrate/retire decisions | **Required** | Seeding/definitions are app-owned and include latent bots without product pathways. |
| Creator/test/launch UX message alignment (dedupe stage/next-action synthesis) | **Required** | User experience layering is app-specific and currently duplicated across backend + UI. |
| Add app-level observability/CI gates for internal BB quality | **Required** | Package emits runtime events, but BB-level quality policy and ownership gates are app responsibilities. |
| Build new app-side generic tool loop / iteration framework | **Cut (Duplicate)** | Already implemented in `@baleybots/core`; keep existing package runtime path. |
| Build custom parser/type-builder for BAL or output schema | **Cut (Duplicate)** | Already implemented in `@baleybots/tools`; app should consume canonical parser/builders only. |
| Add another macro-loop framework outside targeted orchestration use cases | **Cut (Duplicate risk)** | Creator already has bounded macro orchestration; broad new framework likely duplicates package/app behavior with little gain. |
| Add step-trace diagnostics per BB | **Optional** | Useful for debugging, but not required for correctness if schema/fallback metrics are in place. |
| Retain `test_generator` long-term alongside orchestrator | **Optional** | Keep as controlled fallback now; revisit once orchestrator reliability metrics are stable. |

### 14.3 Latest-code verification notes

1. Internal BB execution currently passes empty runtime tools (`availableTools: new Map()`), so most internal BBs are reasoning-only:
   - `apps/web/src/lib/baleybot/internal-baleybots.ts`
2. Creator macro-orchestration is already implemented with deterministic stop rules:
   - `apps/web/src/lib/baleybot/internal-orchestration.ts`
   - `apps/web/src/lib/baleybot/creator-bot.ts`
3. Lifecycle/internal BBs are actively used in router flows (creator actions, tests, connections, launch):
   - `apps/web/src/lib/trpc/routers/baleybots.ts`
4. NL-powered workspace tool execution currently couples to `creator_bot` and should move to a dedicated executor BB:
   - `apps/web/src/lib/baleybot/services/execution-tools-loader.ts`

### 14.4 Decision

Not all previously proposed changes are necessary.

Proceed with app-layer contract/skill/UX/integration hardening and explicitly avoid runtime-loop or parser reimplementation already provided by `@baleybots`.
