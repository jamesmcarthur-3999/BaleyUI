# Phase 3: Actions Hub — AI-First Design

**Status:** Complete
**Dependencies:** Phase 1 (recommendations table), Phase 2 (data producers)
**Implemented:** 5 tasks across 4 new files + 7 modified files

## Overview

The Actions Hub is the **core differentiating feature** of BaleyUI. Rather than a passive notification feed, it surfaces AI-generated recommendations as an actionable, prioritized interface. The design is AI-first: Baley (the companion assistant) is aware of pending actions and can manage them conversationally, while the `/dashboard/actions` page provides the visual hub.

---

## Implementation Summary

### Task 1: Baley Recommendation Awareness

Baley's system prompt now includes pending critical actions on first message. The workspace health hook surfaces critical recommendation counts, and the companion's initial context mentions items requiring attention.

**Files modified:**
- `apps/web/src/hooks/useWorkspaceHealth.ts` — includes recommendation counts
- `apps/web/src/lib/baleybot/tools/companion/index.ts` — registers action tools

### Task 2: Companion Action Tools

Two new tools for Baley to manage recommendations conversationally:

| Tool | Purpose |
|------|---------|
| `list_pending_actions` | Lists pending recommendations with optional severity filter and SQL count |
| `apply_action` | Applies safe actions directly; redirects to Actions page for code changes (bal_patch) |

**Guardrails:**
- Code changes (`bal_patch`, `error_review` with hardening steps) redirect to the Actions page for visual diff review
- Race condition protection via `status = 'pending'` WHERE clause on update
- Approval patterns insert with `trustLevel: 'provisional'`

**File:** `apps/web/src/lib/baleybot/tools/companion/actions.ts`

### Task 3: ActionCard Component

A collapsible card that renders severity-specific styling, type-specific action buttons, and proposed action previews:

| targetType | Primary Button | Preview |
|------------|---------------|---------|
| `approval_pattern` | "Accept Rule" | Natural language description of the pattern |
| `bal_patch` | "Apply Fix" | Side-by-side current/proposed BAL code blocks |
| `error_review` | — (informational) | Root cause + hardening steps |
| `configuration` | "Apply" | — |
| `insight` | — | — |
| `performance` | — | — |

Includes removal animation (opacity + scale transition) with focus management to next sibling.

**File:** `apps/web/src/components/actions/ActionCard.tsx`

### Task 4: Actions Page (`/dashboard/actions`)

Three-section layout:
1. **Needs Attention** — critical items in a red-bordered section (collapsible after 5)
2. **Suggestions** — paginated warning/info items with type filter dropdown
3. **Recently Resolved** — collapsible section showing accepted/dismissed items

Features:
- `?highlight={id}` scrolls to and pulses a specific card
- `?sourceType={type}` filters suggestions by source (e.g., `analytics_interpreter`)
- Server-side severity exclusion via `excludeSeverity` tRPC parameter
- Pagination via cursor-based loading with accumulated suggestions
- "All caught up" empty state when resolved items exist but no pending

**File:** `apps/web/src/app/dashboard/actions/page.tsx`

### Task 5: ActionsIndicator + Sidebar Integration

Replaced the notification bell with a recommendation-aware indicator:
- Shows pending count badge
- Badge turns red when critical items exist
- Links to `/dashboard/actions`
- Polls every 30 seconds
- Accessible aria-label with count and critical breakdown

**File:** `apps/web/src/components/actions/ActionsIndicator.tsx`

---

## tRPC Enhancements

The `recommendations.list` input schema was extended with:
- `excludeSeverity` — exclude items of a given severity (used by suggestions query to avoid fetching critical items redundantly)

---

## Test Coverage

| File | Tests |
|------|-------|
| `ActionCard.test.tsx` | 17 tests — severity rendering, type buttons, expanded content, proposed action previews, click handlers |
| `ActionsIndicator.test.tsx` | 9 tests — count badge, critical red styling, aria-labels, polling interval |
| `companion-actions.test.ts` | 11 tests — list filtering, count query, apply routing, race condition detection, pattern insertion |

---

## Files Created/Modified

| Action | File |
|--------|------|
| **Create** | `apps/web/src/app/dashboard/actions/page.tsx` |
| **Create** | `apps/web/src/components/actions/ActionCard.tsx` |
| **Create** | `apps/web/src/components/actions/ActionsIndicator.tsx` |
| **Create** | `apps/web/src/components/actions/index.ts` (barrel) |
| **Create** | `apps/web/src/lib/baleybot/tools/companion/actions.ts` |
| **Create** | `apps/web/src/components/actions/__tests__/ActionCard.test.tsx` |
| **Create** | `apps/web/src/components/actions/__tests__/ActionsIndicator.test.tsx` |
| **Create** | `apps/web/src/lib/baleybot/__tests__/companion-actions.test.ts` |
| **Modify** | `apps/web/src/lib/trpc/routers/recommendations.ts` — `excludeSeverity` filter |
| **Modify** | `apps/web/src/hooks/useWorkspaceHealth.ts` |
| **Modify** | `apps/web/src/lib/baleybot/tools/companion/index.ts` |
| **Modify** | `apps/web/src/components/layout/sidebar.tsx` — ActionsIndicator integration |
| **Modify** | `apps/web/src/components/layout/app-shell.tsx` |
| **Modify** | `apps/web/src/lib/routes.ts` — `actions.list` route constant |

---

## Design Decisions

1. **AI-first, not notification-first.** Baley proactively mentions critical actions. The page is for review, not discovery.
2. **Code change guardrails.** `bal_patch` and hardening-step recommendations redirect to the visual page — Baley can't silently modify BAL code.
3. **No separate diff modal.** Phase 7.2 will upgrade the inline `<pre>` blocks to a line-by-line diff view. Current implementation uses side-by-side code blocks.
4. **Server-side severity exclusion.** The suggestions query uses `excludeSeverity: 'critical'` to avoid pagination skew from client-side filtering.
