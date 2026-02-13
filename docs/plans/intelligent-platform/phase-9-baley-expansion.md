# Phase 9: Baley Expansion (Deferred)

**Status:** Deferred — evaluate after Phases 1-8 mature
**Dependencies:** Phases 1-8
**Estimated Scope:** TBD based on evaluation

## Overview

Evaluate whether Baley (the workspace assistant) should absorb `creator_bot` capabilities, gain direct access to the recommendations system, and become the primary interaction mode for the platform.

This phase is intentionally left as an evaluation framework, not a concrete implementation plan. The decisions here depend on how Phases 1-8 play out in practice.

---

## Evaluation Criteria

After Phases 1-8 are complete, assess:

### 1. Should Baley absorb creator_bot?

**Current state:** `creator_bot` is a separate internal BB that handles BB creation via conversational chat. Baley is the workspace sidebar assistant with 30+ companion tools.

**Evaluate:**
- Do users prefer creating BBs through Baley (sidebar) vs the dedicated creator page?
- Would merging reduce confusion about "which AI do I talk to?"
- Would merging make the creator experience worse (too many tools, diluted focus)?

**If YES:** Merge creator_bot's BAL generation capability into Baley as a companion tool (`create_baleybot`). The dedicated `/new` page remains but routes through Baley.

**If NO:** Keep them separate. Baley can still delegate to creator_bot via `spawn_baleybot`.

### 2. Should Baley access recommendations?

**Current state:** Baley has no awareness of the recommendations system (Phase 1-3).

**Possible tools to add:**
- `list_recommendations` — show pending actions
- `accept_recommendation` — apply a recommendation
- `dismiss_recommendation` — dismiss an action
- `explain_recommendation` — provide context on why something was recommended

**Evaluate:**
- Do users want to manage recommendations conversationally ("accept all pattern suggestions")?
- Or is the Actions Hub UI sufficient?
- Risk: Baley accepting recommendations without the user seeing the full context

### 3. Should Baley become the primary interaction mode?

**Current state:** Baley is a sidebar assistant. The main UI is the dashboard + bot detail pages.

**Possible expansion:**
- Baley as the default landing experience (instead of dashboard)
- "Tell Baley what you want" as the primary way to interact with everything
- All dashboard pages become secondary, detail views

**Evaluate:**
- User preference: GUI-first or conversation-first?
- Power users likely want both
- Consider a toggle: "Baley-first mode" vs "Dashboard-first mode"

---

## Preparation (Done by Earlier Phases)

These phases prepare the ground for Baley expansion:

| Phase | Preparation |
|---|---|
| Phase 1.1 | Recommendations table — Baley can read/write it |
| Phase 1.2 | Shared context — Baley already receives it in system prompt |
| Phase 2 | Pattern learner + reviewer generate data Baley can surface |
| Phase 3 | Actions Hub exists as the GUI alternative to conversational management |
| Phase 8 | Analytics interpreter generates insights Baley can narrate |

---

## Potential Implementation (Sketched, Not Committed)

### New Companion Tools

If evaluation favors expansion:

```typescript
// Add to apps/web/src/lib/baleybot/tools/companion/index.ts

// Recommendations access
list_recommendations: { /* list pending/all recommendations */ },
accept_recommendation: { /* accept by ID */ },
dismiss_recommendation: { /* dismiss by ID */ },

// Analytics narration
get_analytics_insights: { /* fetch recent AI insights */ },
explain_metric: { /* explain a specific metric trend */ },

// Creator integration (if absorbing creator_bot)
create_baleybot_from_description: { /* full BB creation flow */ },
modify_baleybot_bal: { /* edit BAL code of an existing BB */ },
```

### Baley System Prompt Expansion

Add recommendations awareness to the `BALEY_GOAL` in `internal-baleybots.ts`:

```
## Actions & Recommendations
You have access to the Actions Hub. When users ask about their BBs, proactively check for pending recommendations and surface relevant ones. You can help users understand, accept, or dismiss recommendations conversationally.
```

---

## Decision Timeline

- **When to evaluate:** After Phase 8 is deployed and has been used for at least 2 weeks
- **Who decides:** Product/user feedback
- **Reversibility:** All changes are additive (new tools, prompt updates) — easy to roll back

---

## No Files Created

This phase is an evaluation framework. No code changes until after evaluation.
