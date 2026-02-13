# Intelligent Platform — Master Plan Index

## Vision

Build a cohesive system where internal BaleyBots detect issues, maintain a recommendations database, propose fixes with accept/reject workflows, and can actually implement changes when approved. The **Actions Hub** is the core differentiating feature.

## Phases

| # | Phase | File | Status | Dependencies |
|---|-------|------|--------|-------------|
| 0 | Security & Data Integrity | [`phase-0-security.md`](phase-0-security.md) | Pending Review | None |
| 1 | Foundation (Recommendations DB + Shared Context) | [`phase-1-foundation.md`](phase-1-foundation.md) | Pending Review | Phase 0 |
| 2 | Internal BB Intelligence (Pattern Learner + Execution Reviewer) | [`phase-2-internal-bb-intelligence.md`](phase-2-internal-bb-intelligence.md) | Pending Review | Phase 1 |
| 3 | Actions Hub — AI-First Design | [`phase-3-actions-hub.md`](phase-3-actions-hub.md) | **Complete** | Phase 1, Phase 2 |
| 4 | Wire 5 tRPC Routes | [`phase-4-wire-trpc-routes.md`](phase-4-wire-trpc-routes.md) | Pending Review | None |
| 4.5 | Centralized Config | [`phase-4.5-centralized-config.md`](phase-4.5-centralized-config.md) | Pending Review | None |
| 5 | Operational Storage | [`phase-5-operational-storage.md`](phase-5-operational-storage.md) | Pending Review | None (5.5 needs Phase 1.2) |
| 6 | Trigger/Testing UX Redesign | [`phase-6-trigger-testing-ux.md`](phase-6-trigger-testing-ux.md) | Pending Review | None |
| 6.5 | BB-Driven UI Framework | [`phase-6.5-bb-driven-ui.md`](phase-6.5-bb-driven-ui.md) | Pending Review | Phase 6 |
| 7 | Visual Editor Completion | [`phase-7-visual-editor.md`](phase-7-visual-editor.md) | Pending Review | None (7.2 needs Phase 1.1) |
| 8 | Analytics with AI Interpretation | [`phase-8-analytics-ai.md`](phase-8-analytics-ai.md) | Pending Review | Phase 1 |
| 8.5 | Integration Builder | [`phase-8.5-integration-builder.md`](phase-8.5-integration-builder.md) | Pending Review | Phase 6.5, Phase 8 |
| 9 | Baley Expansion | [`phase-9-baley-expansion.md`](phase-9-baley-expansion.md) | Deferred | Phases 1-8 |

## Execution Sequence

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 4.5 → Phase 5 → Phase 6 → Phase 6.5 → Phase 7 → Phase 8 → Phase 8.5 → Phase 9
  ↑ Security    ↑ Foundation    ↑ Populates data  ↑ Core feature       ↑ Independent (parallel-safe)
```

Phases 4, 4.5, 5, 6, 7 are independent and can be reordered or parallelized after Phase 3.
Phase 6.5 requires Phase 6. Phase 8.5 requires Phases 6.5 and 8.

## Verification (Every Phase)

```bash
pnpm type-check    # No TypeScript errors
pnpm test          # All tests pass
pnpm lint          # No lint errors
```

## Review Process

1. Read the phase plan file
2. Approve or request changes
3. Implement approved phase
4. Verify with test commands
5. Move to next phase
