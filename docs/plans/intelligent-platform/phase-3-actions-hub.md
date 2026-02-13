# Phase 3: Actions Hub

**Status:** Pending Review
**Dependencies:** Phase 1 (recommendations table), best after Phase 2 (so there's data to display)
**Estimated Scope:** ~600 LOC across 5 new files + 3 modified files

## Overview

The Actions Hub is the **core differentiating feature** of BaleyUI. It's a central page that aggregates all BB-generated recommendations, proposed fixes, and insights into an actionable feed. Users accept, reject, or dismiss items. It replaces the passive notification bell with an interactive, action-oriented system.

---

## 3.1 — Actions Hub Page (`/dashboard/actions`)

### Route

Create `apps/web/src/app/dashboard/actions/page.tsx`

### Layout

```
┌─────────────────────────────────────────────────────┐
│ Actions Hub                              [Filter ▾]  │
├──────────┬──────────┬──────────┬───────────────────┤
│ Pending  │ Applied  │ All      │                    │
│ (12)     │ (34)     │ (58)     │                    │
├──────────┴──────────┴──────────┴───────────────────┤
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │ 🔍 Pattern: Auto-approve "web_search" for...   │ │
│  │ From: pattern_learner → research_bot            │ │
│  │ Confidence: 92%              [Accept] [Reject]  │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │ 🔧 Fix: Missing error handler in data_bot      │ │
│  │ From: execution_reviewer · Critical             │ │
│  │ [View Diff]                   [Apply] [Dismiss] │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │ 📊 Insight: research_bot 2x slower than median  │ │
│  │ From: execution_reviewer · Warning              │ │
│  │                              [View] [Dismiss]   │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  [Load more...]                                      │
└─────────────────────────────────────────────────────┘
```

### Filters

- **Status tabs:** Pending | Applied | All (default: Pending)
- **Filter dropdown:**
  - Source type: pattern_learner, execution_reviewer, analytics_interpreter, manual
  - Severity: info, warning, critical
  - Target bot: dropdown of workspace BBs
- **Sort:** Most recent first (default), severity (critical first), confidence (highest first)

### Components

| Component | File | Purpose |
|---|---|---|
| `ActionsHubPage` | `app/dashboard/actions/page.tsx` | Server component, page shell |
| `ActionsHubContent` | `components/actions/ActionsHubContent.tsx` | Client component, tabs + filters + list |
| `ActionCard` | `components/actions/ActionCard.tsx` | Single recommendation card |
| `ActionDiffView` | `components/actions/ActionDiffView.tsx` | Split-view BAL diff for `bal_patch` type |
| `ActionFilters` | `components/actions/ActionFilters.tsx` | Filter controls |

### Data Fetching

Uses the `recommendations.list` tRPC procedure from Phase 1.1 with cursor-based pagination.

### Actions

Each card has action buttons based on `targetType`:

| targetType | Primary Action | Secondary |
|---|---|---|
| `approval_pattern` | "Accept Pattern" → calls `recommendations.accept` | "Reject" |
| `bal_patch` | "View Diff" → opens diff modal, then "Apply Fix" | "Dismiss" |
| `configuration` | "Apply Change" | "Dismiss" |
| `insight` | "Acknowledge" (dismiss) | — |
| `performance` | "View Execution" link + "Re-run with longer timeout" | "Dismiss" |

**Design notes:**
- All cards that open dialogs should use `SlidePanel` instead of modal (`PromotionDialog.tsx` pattern should migrate to SlidePanel for design system consistency).

---

## 3.2 — Widgets on Bot Detail + Dashboard

### Bot Detail Page Widget

On the bot detail page's integrate tab, add an "Actions" card:

```
┌─────────────────────────────────────┐
│ Actions (3 pending)                  │
│                                      │
│ • Auto-approve "web_search"    [→]   │
│ • Fix: error handler missing   [→]   │
│ • 2x slower than median        [→]   │
│                                      │
│ [View all in Actions Hub →]          │
└─────────────────────────────────────┘
```

**File:** Modify the integrate tab component to include this card.
**Data:** `recommendations.list({ targetBaleybotId: bbId, status: 'pending', limit: 5 })`

### Dashboard Overview Widget

On the main dashboard page, add an "Actions" summary card:

```
┌─────────────────────────────────────┐
│ Actions                    [View →]  │
│                                      │
│ 12 pending · 3 critical · 34 total   │
│ ████████░░ 74% addressed             │
└─────────────────────────────────────┘
```

**File:** Modify `apps/web/src/app/dashboard/page.tsx` (or its dashboard content component).
**Data:** `recommendations.counts()`

---

## 3.3 — ActionsIndicator (Replaces NotificationBell)

### Current State

`NotificationBell.tsx` exists and shows unread notification count from the `notifications` table.

### New Component: `ActionsIndicator`

**File:** `apps/web/src/components/ActionsIndicator.tsx`

- Replaces `NotificationBell` in the app header/sidebar
- Shows pending recommendation count as a badge
- Clicking navigates to `/dashboard/actions`
- Badge turns red if any `severity: 'critical'` recommendations are pending
- Visible on ALL dashboard pages (placed in the dashboard layout)

```typescript
// Simplified structure:
export function ActionsIndicator() {
  const { data: counts } = trpc.recommendations.counts.useQuery();
  const hasCritical = (counts?.critical ?? 0) > 0;

  return (
    <Link href="/dashboard/actions">
      <Button variant="ghost" size="icon" className="relative">
        <Zap className="h-5 w-5" />
        {counts?.pending > 0 && (
          <Badge className={hasCritical ? 'bg-red-500' : 'bg-blue-500'}>
            {counts.pending}
          </Badge>
        )}
      </Button>
    </Link>
  );
}
```

### Integration

- Add `ActionsIndicator` to the dashboard layout header (replace `NotificationBell`)
- The layout file is likely at `apps/web/src/app/dashboard/layout.tsx`

---

## 3.4 — Deprecate Old Notifications System

### Approach

Do NOT delete the `notifications` table or `send_notification` tool yet — they serve a different purpose (BB-to-user messages). Instead:

1. Remove `NotificationBell` component from the layout (replaced by `ActionsIndicator`)
2. Route `send_notification` outputs to the Actions Hub as `sourceType: 'manual'` recommendations
3. Keep the `notifications` table for backwards compatibility but stop rendering it in UI

### Migration Path

Later (Phase 9 or beyond), merge `notifications` into `recommendations` fully if the Actions Hub proves sufficient.

---

## Verification

```bash
pnpm type-check
pnpm test
pnpm lint
```

### Manual Testing
1. Navigate to `/dashboard/actions` — page renders with empty state
2. Create test recommendations in DB → they appear in the list
3. Click "Accept" on a pattern recommendation → status changes, row appears in `approvalPatterns`
4. Click "Apply Fix" on a BAL patch → diff view opens, applying updates BB
5. ActionsIndicator shows correct count in header
6. Bot detail page shows per-bot actions widget

## Files Created/Modified

| Action | File |
|---|---|
| **Create** | `apps/web/src/app/dashboard/actions/page.tsx` |
| **Create** | `apps/web/src/components/actions/ActionsHubContent.tsx` |
| **Create** | `apps/web/src/components/actions/ActionCard.tsx` |
| **Create** | `apps/web/src/components/actions/ActionDiffView.tsx` |
| **Create** | `apps/web/src/components/actions/ActionFilters.tsx` |
| **Create** | `apps/web/src/components/ActionsIndicator.tsx` |
| **Modify** | `apps/web/src/app/dashboard/layout.tsx` — replace NotificationBell with ActionsIndicator |
| **Modify** | Bot detail integrate tab — add actions widget |
| **Modify** | `apps/web/src/app/dashboard/page.tsx` — add actions summary card |
