# Phase 6.5: BB-Driven UI Framework

**Status:** Pending Review
**Dependencies:** Phase 6
**Estimated Scope:** ~500 LOC across 6 files

## Overview

Build a framework where internal BaleyBots can drive UI updates via SSE events. This enables conversational workflows where BB output is rendered as interactive components, not just text.

---

## 6.5.1 — SSE Event Vocabulary

Define a set of `bb_fn_*` events that BBs can emit to control the UI:

| Event Type | Payload | UI Effect |
|---|---|---|
| `bb_fn_show_options` | `{ options: { label, value, description }[] }` | Render selectable cards |
| `bb_fn_show_form` | `{ fields: { name, type, label, required }[] }` | Render inline form |
| `bb_fn_show_progress` | `{ step, total, label }` | Render progress bar |
| `bb_fn_show_diff` | `{ current, proposed, language }` | Render code diff |
| `bb_fn_show_table` | `{ columns, rows }` | Render data table |
| `bb_fn_show_confirmation` | `{ title, message, actions }` | Render confirmation card |

Events flow through the existing streaming infrastructure. The UI intercepts `bb_fn_*` events and renders appropriate components.

---

## 6.5.2 — Shared Components

| Component | File | Purpose |
|---|---|---|
| `BBFunctionLayout` | `components/bb-functions/BBFunctionLayout.tsx` | Container for BB-driven UI |
| `BBOptionsCard` | `components/bb-functions/BBOptionsCard.tsx` | Selectable option cards |
| `BBInlineForm` | `components/bb-functions/BBInlineForm.tsx` | Dynamically generated form |
| `BBProgressBar` | `components/bb-functions/BBProgressBar.tsx` | Step progress indicator |
| `DiscoveryPanel` | `components/bb-functions/DiscoveryPanel.tsx` | Sidebar for BB suggestions |

---

## 6.5.3 — Integration Points

- **Creator chat:** BB-driven forms for collecting bot requirements
- **Test panel:** BB-driven result display (tables, diffs)
- **Actions Hub:** BB-driven confirmation flows for applying patches

---

## Files Created/Modified

| Action | File |
|---|---|
| **Create** | `apps/web/src/lib/streaming/types/bb-function-events.ts` — event type definitions |
| **Create** | `apps/web/src/components/bb-functions/BBFunctionLayout.tsx` |
| **Create** | `apps/web/src/components/bb-functions/BBOptionsCard.tsx` |
| **Create** | `apps/web/src/components/bb-functions/BBInlineForm.tsx` |
| **Create** | `apps/web/src/components/bb-functions/BBProgressBar.tsx` |
| **Create** | `apps/web/src/components/bb-functions/DiscoveryPanel.tsx` |
| **Modify** | Streaming event handler — intercept `bb_fn_*` events |
