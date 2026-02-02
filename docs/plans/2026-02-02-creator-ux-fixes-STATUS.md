# Creator UX Fixes - Implementation Status

> Last updated: 2026-02-02

## Progress Summary

| Phase | Description | Tasks | Completed | Remaining |
|-------|-------------|-------|-----------|-----------|
| **Phase 1** | Data Protection | 8 | 8 | 0 |
| **Phase 2** | Core Functionality | 10 | 5 | 5 |
| **Phase 3** | UX Polish | 8 | 1 | 7 |
| **Phase 4** | Responsive Design | 8 | 0 | 8 |
| **Phase 5** | Edge Cases | 6 | 0 | 6 |
| **Total** | | **40** | **14** | **26** |

---

## Phase 1: Data Protection - COMPLETE

All 8 tasks completed:

- [x] **1.1** Create useDirtyState hook
- [x] **1.2** Add beforeunload handler
- [x] **1.3** Add router navigation guard
- [x] **1.4** Create useDebounce hook
- [x] **1.5** Add debounce to Save button
- [x] **1.6** Add execution lock to Run button
- [x] **1.7** Add save indicator for auto-save on Run
- [x] **1.8** Add Save button disabled explanation (tooltip)

---

## Phase 2: Core Functionality - 5/10 Complete

### Completed:
- [x] **2.6** Preserve conversation history (DB + load/save)
- [x] **2.7** Add conversation thread display
- [x] **2.8** Show description in detail view (editable)
- [x] **2.9** Show execution history in detail view
- [x] **2.10** *(merged with 2.8)*

### Remaining (requires BAL compiler integration):

- [ ] **2.1** Implement real execution flow
  - Parse balCode using BAL compiler
  - Use Pipeline.from() to create executable
  - Execute with provided input and capture output
  - Update execution record with real results
  - **Files:** `apps/web/src/lib/trpc/routers/baleybots.ts`, `apps/web/src/lib/baleybot/executor.ts`

- [ ] **2.2** Add execution streaming integration
  - Create useBaleybotExecution hook wrapping useExecutionStream
  - Pass execution ID from execute mutation to stream
  - Display streaming output in ActionBar result area
  - **Files:** `apps/web/src/hooks/useBaleybotExecution.ts`, page.tsx

- [ ] **2.3** Add cancel mechanism for executions
  - Add Cancel button that appears during execution
  - Create API route to cancel execution
  - Update hook with cancel() function
  - **Files:** ActionBar.tsx, `apps/web/src/app/api/baleybots/[id]/executions/[execId]/cancel/route.ts`

- [ ] **2.4** Add execution timeout
  - Add default 5-minute timeout
  - Show elapsed time during execution
  - Auto-cancel and show timeout error
  - **Files:** baleybots.ts router, ActionBar.tsx

- [ ] **2.5** Add execution progress indicator
  - Track current entity ID from execution stream
  - Highlight active entity on Canvas
  - Show entity name in ActionBar progress
  - Animate connection paths
  - **Files:** Canvas.tsx, ActionBar.tsx

---

## Phase 3: UX Polish - 1/8 Complete

### Completed:
- [x] **3.7** Add copy code button

### Remaining:

- [ ] **3.1** Improve error messages
  - Create error mapping from tRPC codes to user messages
  - Parse API errors and map to friendly messages
  - Add specific handling for CONFLICT, NOT_FOUND, BAD_REQUEST
  - **Files:** Create `apps/web/src/lib/errors/creator-errors.ts`, page.tsx

- [ ] **3.2** Add change summary in AI responses
  - Compare previous entities with new ones
  - Generate human-readable summary
  - Include summary in assistant message
  - Highlight new entities briefly
  - **Files:** `apps/web/src/lib/baleybot/creator-bot.ts`, page.tsx

- [ ] **3.3** Add syntax highlighting to code viewer
  - Use lightweight syntax highlighter (Shiki or Prism)
  - Create BAL language definition
  - Apply to code viewer
  - Add line numbers
  - **Files:** ActionBar.tsx

- [ ] **3.4** Add multi-line test input
  - Replace input with auto-resizing textarea
  - Add toggle for "Simple" vs "JSON" mode
  - JSON mode validates input
  - Preserve input between runs
  - **Files:** ActionBar.tsx

- [ ] **3.5** Implement undo/redo
  - Create useHistory hook with state stack
  - Push snapshots on each AI response
  - Add Cmd/Ctrl+Z for undo, Cmd/Ctrl+Shift+Z for redo
  - Add undo/redo buttons in header
  - Limit to 20 states
  - **Files:** Create `apps/web/src/hooks/useHistory.ts`, page.tsx

- [ ] **3.6** Clarify building state
  - When 'building' and entities exist, dim current entities
  - Show skeleton placeholders
  - Animate smooth transition
  - Keep connections visible but faded
  - **Files:** Canvas.tsx

- [ ] **3.8** Add keyboard shortcuts help
  - Create dialog showing shortcuts
  - Trigger with ? or Cmd/Ctrl+/
  - Group by category
  - Show platform-appropriate modifiers
  - **Files:** Create `apps/web/src/components/creator/KeyboardShortcutsDialog.tsx`, page.tsx
  - **Depends on:** 3.5

---

## Phase 4: Responsive Design - 0/8 Complete

- [ ] **4.1** Make Canvas responsive
  - Remove fixed CANVAS_WIDTH constant
  - Use container-relative positioning
  - Calculate positions based on actual container size
  - Use ResizeObserver to update on resize
  - **Files:** Canvas.tsx

- [ ] **4.2** Increase touch targets
  - Audit all buttons and interactive elements
  - Add min-h-11 min-w-11 (44px)
  - Increase padding on touch areas
  - **Files:** ActionBar.tsx, ChatInput.tsx, page.tsx

- [ ] **4.3** Add horizontal scroll for Canvas
  - Detect when entities overflow horizontally
  - Add horizontal scroll indicators
  - Swipe gestures on mobile
  - **Files:** Canvas.tsx

- [ ] **4.4** Stack controls on mobile
  - Convert horizontal button row to vertical on narrow screens
  - Move Run button to bottom for thumb reach
  - Collapse secondary actions into menu
  - **Files:** ActionBar.tsx

- [ ] **4.5** Add mobile-specific chat input
  - Full-width input on mobile
  - Auto-focus with virtual keyboard
  - Handle keyboard appearance
  - **Files:** ChatInput.tsx

- [ ] **4.6** Create adaptive header
  - Collapse to icon-only on mobile
  - Show full on desktop
  - Truncate long names appropriately
  - **Files:** page.tsx

- [ ] **4.7** Add swipe gestures
  - Swipe down to dismiss dialogs
  - Swipe left/right on entity cards for actions
  - **Files:** page.tsx, Canvas.tsx

- [ ] **4.8** Test and fix tablet layout
  - Verify layout at 768px-1024px
  - Ensure touch and mouse both work
  - Fix any overflow issues
  - **Files:** Various

---

## Phase 5: Edge Cases - 0/6 Complete

- [ ] **5.1** Handle very long bot names
  - Truncate with ellipsis in header
  - Show full name on hover/focus
  - Limit input to 100 characters
  - **Files:** page.tsx

- [ ] **5.2** Handle large BAL code
  - Add virtual scrolling in code viewer
  - Limit display to first 1000 lines
  - Show "truncated" warning
  - **Files:** ActionBar.tsx

- [ ] **5.3** Handle many entities
  - Canvas auto-zoom to fit all
  - Add zoom controls (+/-)
  - Mini-map for navigation (optional)
  - **Files:** Canvas.tsx

- [ ] **5.4** Handle save conflicts
  - Detect version mismatch from optimistic lock
  - Show conflict resolution dialog
  - Options: force save, reload, merge (future)
  - **Files:** page.tsx

- [ ] **5.5** Handle execution that produces large output
  - Truncate output display
  - Add "Download full output" button
  - Show output size warning
  - **Files:** ActionBar.tsx

- [ ] **5.6** Add loading states for slow networks
  - Skeleton for initial load
  - Inline loading for mutations
  - Optimistic updates where safe
  - **Files:** page.tsx, ActionBar.tsx

---

## Recommended Next Steps

### Quick Wins (can be done independently):
1. **3.1** Improve error messages - straightforward, improves UX
2. **3.3** Syntax highlighting - visual polish, easy to add
3. **3.4** Multi-line test input - improves testing experience
4. **3.6** Clarify building state - visual feedback improvement

### High Impact (requires more effort):
1. **2.1-2.5** Execution flow - critical for app to actually work
2. **3.5** Undo/redo - power user feature
3. **4.1-4.6** Responsive design - mobile support

### Dependencies:
- 2.2 depends on 2.1
- 2.3 depends on 2.2
- 2.4 depends on 2.3
- 2.5 depends on 2.2
- 3.8 depends on 3.5

---

## Files Created/Modified Summary

### New Files Created:
- `apps/web/src/hooks/useDirtyState.ts`
- `apps/web/src/hooks/useDebounce.ts`
- `apps/web/src/hooks/useNavigationGuard.ts`
- `apps/web/src/components/creator/ConversationThread.tsx`
- `apps/web/src/components/creator/ExecutionHistory.tsx`

### Files Modified:
- `apps/web/src/hooks/index.ts`
- `apps/web/src/app/dashboard/baleybots/[id]/page.tsx` (major)
- `apps/web/src/components/creator/ActionBar.tsx`
- `apps/web/src/components/creator/index.ts`
- `apps/web/src/lib/trpc/routers/baleybots.ts`
- `packages/db/src/schema.ts` (added conversationHistory column)
