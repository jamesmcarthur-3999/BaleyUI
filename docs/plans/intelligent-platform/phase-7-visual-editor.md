# Phase 7: Visual Editor Completion

**Status:** Pending Review
**Dependencies:** None (7.2 needs Phase 1.1 recommendations table)
**Estimated Scope:** ~350 LOC across 4 files

## Overview

The visual editor has working bidirectional sync (BAL ↔ visual nodes). This phase adds undo/redo and a recommendation diff view.

**Existing code (DO NOT rebuild):**
- `apps/web/src/lib/baleybot/visual-to-bal.ts` — visual nodes → BAL code
- `apps/web/src/lib/baleybot/bal-to-nodes.ts` — BAL code → visual nodes

---

## 7.1 — Undo/Redo Stack

### Design

Implement a snapshot-based undo/redo system for the visual editor and BAL code editor.

### State Management

**Reuse existing hook:** `apps/web/src/hooks/useHistory.ts`

Do NOT create a new `undo-redo.ts` — the `useHistory` hook already supports everything needed:
- Snapshot-based undo/redo with configurable max (50 states)
- Keyboard shortcuts: Cmd+Z / Cmd+Shift+Z / Cmd+Y (opt-in via `enableKeyboardShortcuts: true`)
- `push(state, description?)` / `undo()` / `redo()` / `canUndo` / `canRedo`
- `replace(state)` for in-progress edits without history push

```typescript
const { state, push, undo, redo, canUndo, canRedo } = useHistory<string>({
  initialState: baleybot.balCode,
  maxHistory: 50,
  enableKeyboardShortcuts: true,
});
```

### Snapshot Triggers

Capture a snapshot on:
- Any visual editor node change (add/remove/move entity, add/remove connection)
- Any BAL code editor save (debounced — don't snapshot every keystroke)
- BAL generation from creator_bot

### Keyboard Shortcuts

**File:** Modify the visual editor or page-level keyboard handler

| Shortcut | Action |
|---|---|
| `Cmd+Z` / `Ctrl+Z` | Undo |
| `Cmd+Shift+Z` / `Ctrl+Shift+Z` | Redo |

### UI Integration

Add undo/redo buttons to the visual editor toolbar:

```
┌─────────────────────────────────────────────────┐
│ [← Undo] [Redo →]   Visual Editor    [Zoom ±]  │
├─────────────────────────────────────────────────┤
│                                                  │
│        (visual graph canvas)                     │
│                                                  │
└─────────────────────────────────────────────────┘
```

Also add to the code editor toolbar if one exists.

### Bidirectional Sync

When undo/redo restores a BAL code snapshot:
1. Update the BAL code in state
2. The existing `bal-to-nodes.ts` automatically converts it back to visual nodes
3. The visual editor re-renders

When undo/redo restores from a visual change:
1. The snapshot contains the BAL code at that point
2. Restore that BAL code → visual nodes regenerate via sync

**Key insight:** We only store BAL code in snapshots. Visual nodes are always derived from BAL code via the existing sync. This keeps the undo/redo system simple and correct.

---

## 7.2 — Recommendation Diff View

**Dependency:** Phase 1.1 (recommendations with `bal_patch` type)

### Purpose

When the execution reviewer (Phase 2) proposes a BAL patch, the user needs to see a clear before/after diff before deciding to accept or reject.

### Component

**File:** Create `apps/web/src/components/actions/ActionDiffView.tsx`

This was listed as a Phase 3 component but the implementation details are here since it's fundamentally a visual editor feature.

### UI: Split-View Diff

```
┌──────────────────────┬──────────────────────┐
│ Current BAL Code     │ Proposed BAL Code     │
│                      │                       │
│ researcher {         │ researcher {          │
│   "goal": "Search…", │   "goal": "Search…",  │
│ - "tools": {         │ + "tools": {          │
│ -   "web_search"     │ +   "web_search",     │
│ - }                  │ +   "fetch_url"       │
│                      │ + }                   │
│ }                    │ }                     │
│                      │                       │
├──────────────────────┴──────────────────────┤
│              [Apply Fix]  [Dismiss]          │
└─────────────────────────────────────────────┘
```

### Implementation

Use a simple line-by-line diff algorithm (or a lightweight diff library already in the project's dependencies). Don't add a heavy dependency — a basic implementation is sufficient:

```typescript
function computeLineDiff(current: string, proposed: string): DiffLine[] {
  const currentLines = current.split('\n');
  const proposedLines = proposed.split('\n');
  // Simple LCS-based or Myers diff
  // Returns: Array<{ type: 'same' | 'added' | 'removed', content: string }>
}
```

### Visual Preview (Optional Enhancement)

Below the text diff, show side-by-side visual editor previews:
- Left: current BAL → visual nodes
- Right: proposed BAL → visual nodes

This leverages the existing `bal-to-nodes.ts` to render both versions as visual graphs, making structural changes (added entities, changed connections) visually obvious.

### Integration Points

1. **Actions Hub (Phase 3):** `ActionCard` for `bal_patch` type opens this diff view
2. **Bot detail page:** If a pending `bal_patch` recommendation exists, show a banner with "View Proposed Fix" link

---

## Verification

```bash
pnpm type-check
pnpm test
pnpm lint
```

### Manual Testing (7.1)
1. Open visual editor, add an entity → Cmd+Z → entity disappears → Cmd+Shift+Z → entity reappears
2. Edit BAL code, save → Cmd+Z → code reverts → visual editor updates
3. Make 51 changes → only last 50 are undoable (oldest dropped)
4. After undo, make a new change → redo stack is cleared

### Manual Testing (7.2)
1. Create a test `bal_patch` recommendation in DB
2. Click "View Diff" → split view shows current vs proposed
3. Click "Apply Fix" → BB's BAL code updates, visual editor reflects change
4. Verify undo after applying fix works (restores previous BAL)

### Accessibility

Chat messages in `ConversationThread.tsx` should use `role="log"` and `aria-live="polite"` to auto-announce new messages to screen readers.

---

## Files Created/Modified

| Action | File |
|---|---|
| **Reuse** | `apps/web/src/hooks/useHistory.ts` — existing undo/redo hook (no new file needed) |
| **Modify** | Visual editor component — add undo/redo buttons + wire `useHistory` |
| **Modify** | Code editor component — add undo/redo integration |
| **Create** | `apps/web/src/components/actions/ActionDiffView.tsx` — split diff view |
| **Create** | `apps/web/src/lib/baleybot/diff.ts` — line diff computation |
