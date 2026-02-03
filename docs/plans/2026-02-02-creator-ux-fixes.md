# Creator UX Fixes - Comprehensive Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 26 UX issues discovered during the comprehensive user perspective review of the BaleyBot creation experience.

**Architecture:** React 19 (no manual memoization), Next.js 15 App Router, tRPC, Tailwind CSS, Framer Motion. Mobile-first responsive design approach.

**Tech Stack:** TypeScript, Zod validation, Clerk auth, existing streaming hooks

---

## Strategic Overview

This plan addresses 26 UX issues across the BaleyBot creation experience. The implementation order is carefully sequenced based on:

1. **Data Safety First**: Issues causing data loss must be fixed before any other work.
2. **Foundation Before Features**: Dirty state tracking enables navigation guards, beforeunload handlers, and better save UX.
3. **Core Before Polish**: Execution must work before we can add timeout handling, cancel mechanisms, or progress indicators.
4. **Dependencies Flow Downward**: Each phase builds on the previous.
5. **Edge Cases Last**: Large content handling and conflict resolution are rare scenarios.

---

## Phase 1: Data Protection (8 tasks)

**Goal**: Prevent all data loss scenarios

### Task 1.1: Create useDirtyState Hook

**Objective**: Track unsaved changes across the creation session.

**Files:**
- Create: `apps/web/src/hooks/useDirtyState.ts`
- Modify: `apps/web/src/hooks/index.ts`

**Implementation Steps:**
1. Create a hook that compares current state to last-saved state
2. Track entities, connections, balCode, name, and icon
3. Expose `isDirty`, `markClean()`, and `getChanges()`
4. Use `useRef` for saved state snapshot (avoid re-renders)

```typescript
export function useDirtyState<T>(currentState: T) {
  const savedStateRef = useRef<T>(currentState);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const dirty = !deepEqual(currentState, savedStateRef.current);
    setIsDirty(dirty);
  }, [currentState]);

  const markClean = useCallback(() => {
    savedStateRef.current = currentState;
    setIsDirty(false);
  }, [currentState]);

  return { isDirty, markClean };
}
```

**Test Criteria:**
- `isDirty` is `false` on initial load
- `isDirty` becomes `true` when any tracked field changes
- `isDirty` resets to `false` after `markClean()` is called
- Works with both new and existing BaleyBots

**Dependencies:** None

---

### Task 1.2: Add beforeunload Handler

**Objective**: Warn users before browser navigation loses unsaved work.

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Implementation Steps:**
1. Import and use `useDirtyState` from Task 1.1
2. Add `useEffect` that registers/unregisters `beforeunload` handler
3. Handler should show native browser confirmation when `isDirty` is true
4. Clean up handler on unmount

```typescript
useEffect(() => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [isDirty]);
```

**Test Criteria:**
- Closing browser tab shows confirmation when there are unsaved changes
- No confirmation when no changes
- Handler is removed on component unmount

**Dependencies:** Task 1.1

---

### Task 1.3: Add Router Navigation Guard

**Objective**: Prevent in-app navigation (Back button, link clicks) from losing unsaved work.

**Files:**
- Create: `apps/web/src/hooks/useNavigationGuard.ts`
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Implementation Steps:**
1. Create `useNavigationGuard` hook that intercepts navigation
2. Show confirmation dialog using AlertDialog component
3. Provide `confirmNavigation()` callback for save-then-navigate flow
4. Integrate with `useDirtyState`

```typescript
export function useNavigationGuard(isDirty: boolean, onSave: () => Promise<boolean>) {
  const [showDialog, setShowDialog] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const router = useRouter();

  const guardedNavigate = useCallback((path: string) => {
    if (isDirty) {
      setPendingPath(path);
      setShowDialog(true);
    } else {
      router.push(path);
    }
  }, [isDirty, router]);

  const handleDiscard = () => {
    setShowDialog(false);
    if (pendingPath) router.push(pendingPath);
  };

  const handleSaveAndLeave = async () => {
    const saved = await onSave();
    if (saved && pendingPath) router.push(pendingPath);
    setShowDialog(false);
  };

  return { guardedNavigate, showDialog, setShowDialog, handleDiscard, handleSaveAndLeave };
}
```

**Test Criteria:**
- Clicking Back button shows confirmation when dirty
- Clicking "Discard" navigates away
- Clicking "Save & Leave" saves then navigates
- Clicking "Cancel" stays on page

**Dependencies:** Task 1.1

---

### Task 1.4: Create useDebounce Hook

**Objective**: Provide debouncing utility for preventing rapid action conflicts.

**Files:**
- Create: `apps/web/src/hooks/useDebounce.ts`
- Modify: `apps/web/src/hooks/index.ts`

**Implementation Steps:**
1. Create `useDebounce(value, delay)` for value debouncing
2. Create `useDebouncedCallback(callback, delay)` for action debouncing
3. Support cancellation and immediate execution options

```typescript
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const debouncedFn = useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  }, [delay]);

  const cancel = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  return { debouncedFn, cancel };
}
```

**Test Criteria:**
- Multiple rapid calls result in single execution
- Cleanup on unmount prevents memory leaks
- Cancel stops pending execution

**Dependencies:** None

---

### Task 1.5: Add Debounce to Save Button

**Objective**: Prevent concurrent save conflicts from rapid Save clicks.

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Implementation Steps:**
1. Import `useDebouncedCallback` from Task 1.4
2. Wrap `handleSave` with 500ms debounce
3. Add `isSavePending` state for immediate visual feedback

**Test Criteria:**
- Rapid clicks result in single save
- Button shows saving state immediately
- No concurrent API calls

**Dependencies:** Task 1.4

---

### Task 1.6: Add Execution Lock to Run Button

**Objective**: Prevent race conditions from rapid Run clicks.

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`
- Modify: `apps/web/src/components/creator/ActionBar.tsx`

**Implementation Steps:**
1. Add `isRunLocked` state to prevent concurrent executions
2. Set lock before auto-save, release after execution completes/fails
3. Update `handleRun` to check lock before proceeding

```typescript
const [isRunLocked, setIsRunLocked] = useState(false);

const handleRun = async (input: string) => {
  if (isRunLocked) return;
  setIsRunLocked(true);

  try {
    // ... existing run logic
  } finally {
    setIsRunLocked(false);
  }
};
```

**Test Criteria:**
- Rapid clicks result in single execution
- Lock is released on success and error
- Auto-save + run are atomic

**Dependencies:** None

---

### Task 1.7: Add Save Indicator for Auto-Save on Run

**Objective**: Make auto-save visible to users when Run triggers save.

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`
- Modify: `apps/web/src/components/creator/ActionBar.tsx`

**Implementation Steps:**
1. Add `autoSaveStatus` state: `'idle' | 'saving' | 'saved'`
2. Show inline "Saving..." badge when auto-save triggers
3. Show "Saved" badge briefly after success
4. Pass status to ActionBar for display

**Test Criteria:**
- "Saving..." appears when Run triggers auto-save
- "Saved" appears briefly after successful save
- Status clears after 2 second timeout

**Dependencies:** None

---

### Task 1.8: Add Save Button Disabled Explanation

**Objective**: Tell users why Save is disabled.

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Implementation Steps:**
1. Add Tooltip wrapper to Save button
2. Compute tooltip message based on reason
3. Keep button visually disabled but provide context

```typescript
const saveDisabledReason = !balCode || !name
  ? "Build something first"
  : !isDirty
  ? "No changes to save"
  : null;

<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <span tabIndex={0}>
        <Button disabled={!!saveDisabledReason || isSaving}>
          Save
        </Button>
      </span>
    </TooltipTrigger>
    {saveDisabledReason && (
      <TooltipContent>{saveDisabledReason}</TooltipContent>
    )}
  </Tooltip>
</TooltipProvider>
```

**Test Criteria:**
- Tooltip shows on hover when disabled
- Correct message based on reason
- No tooltip when enabled

**Dependencies:** Task 1.1

---

## Phase 2: Core Functionality (10 tasks)

**Goal**: Make execution and history actually work

### Task 2.1: Implement Real Execution Flow

**Objective**: Make the Run button actually execute the BaleyBot.

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts`
- Modify: `apps/web/src/lib/baleybot/executor.ts`

**Implementation Steps:**
1. In the `execute` procedure, parse `balCode` using BAL compiler
2. Use `Pipeline.from()` to create executable
3. Execute with provided input and capture output
4. Update execution record with real results
5. Handle execution errors

**Test Criteria:**
- Simple BaleyBot executes and returns output
- Output is captured in execution record
- Errors are caught and recorded
- Execution time is accurate

**Dependencies:** None

---

### Task 2.2: Add Execution Streaming Integration

**Objective**: Stream execution progress to the UI.

**Files:**
- Create: `apps/web/src/hooks/useBaleybotExecution.ts`
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Implementation Steps:**
1. Create `useBaleybotExecution` hook wrapping `useExecutionStream`
2. Pass execution ID from `execute` mutation to stream
3. Display streaming output in ActionBar result area

**Test Criteria:**
- Output streams in real-time
- Status updates as execution progresses
- Final result matches execution record

**Dependencies:** Task 2.1

---

### Task 2.3: Add Cancel Mechanism for Executions

**Objective**: Let users stop long-running executions.

**Files:**
- Modify: `apps/web/src/components/creator/ActionBar.tsx`
- Create: `apps/web/src/app/api/baleybots/[id]/executions/[execId]/cancel/route.ts`

**Implementation Steps:**
1. Add Cancel button that appears during execution
2. Create API route to cancel execution
3. Update hook with `cancel()` function
4. Handle cancellation in UI

**Test Criteria:**
- Cancel button appears during execution
- Clicking cancel stops execution
- Status updates to 'cancelled'

**Dependencies:** Task 2.2

---

### Task 2.4: Add Execution Timeout

**Objective**: Prevent stuck executions.

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts`
- Modify: `apps/web/src/components/creator/ActionBar.tsx`

**Implementation Steps:**
1. Add default 5-minute timeout
2. Show elapsed time during execution
3. Auto-cancel and show timeout error

**Test Criteria:**
- Execution auto-cancels after timeout
- Elapsed time shows during execution
- Timeout error is user-friendly

**Dependencies:** Task 2.3

---

### Task 2.5: Add Execution Progress Indicator

**Objective**: Show which entity is currently executing.

**Files:**
- Modify: `apps/web/src/components/creator/Canvas.tsx`
- Modify: `apps/web/src/components/creator/ActionBar.tsx`

**Implementation Steps:**
1. Track current entity ID from execution stream
2. Highlight active entity on Canvas
3. Show entity name in ActionBar progress
4. Animate connection paths

**Test Criteria:**
- Active entity is highlighted
- Highlight moves as execution progresses
- Completes gracefully

**Dependencies:** Task 2.2

---

### Task 2.6: Preserve Conversation History

**Objective**: Save and restore conversation history.

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts`
- Modify DB schema: Add `conversationHistory` column

**Implementation Steps:**
1. Save messages array when saving BaleyBot
2. Load messages when opening existing BaleyBot
3. Limit history to 50 messages

**Test Criteria:**
- Messages persist after save
- Messages reload when returning
- Old messages truncated

**Dependencies:** None

---

### Task 2.7: Add Conversation Thread Display

**Objective**: Show previous messages in the UI.

**Files:**
- Create: `apps/web/src/components/creator/ConversationThread.tsx`
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Implementation Steps:**
1. Create ConversationThread component
2. User messages right-aligned, assistant left-aligned
3. Auto-scroll to bottom on new messages
4. Collapsible for space

**Test Criteria:**
- Messages display correctly
- Thread scrolls smoothly
- Collapse/expand works

**Dependencies:** Task 2.6

---

### Task 2.8: Show Description in Detail View

**Objective**: Display BaleyBot description prominently.

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Implementation Steps:**
1. Add description below name in header
2. Make description editable inline
3. Save with debounce
4. Truncate with "Show more"

**Test Criteria:**
- Description displays when present
- Inline editing works
- Long descriptions truncate

**Dependencies:** None

---

### Task 2.9: Show Execution History in Detail View

**Objective**: Display recent executions for the BaleyBot.

**Files:**
- Create: `apps/web/src/components/creator/ExecutionHistory.tsx`
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Implementation Steps:**
1. Create ExecutionHistory component
2. Query last 10 executions
3. Show collapsible list
4. Link to execution detail

**Test Criteria:**
- Recent executions display
- Status indicators correct
- Click navigates to detail

**Dependencies:** None

---

### Task 2.10: Complete Entity Visualization When Editing

**Objective**: Show tools and purposes for all entities.

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts`

**Implementation Steps:**
1. Parse BAL code on load to extract entity details
2. Populate entities with tools[] and purpose
3. Store parsed structure in `structure` column
4. Display on Canvas entity cards

**Test Criteria:**
- Existing bots show all entity details
- Tools badges display
- Connections are restored

**Dependencies:** Task 2.6

---

## Phase 3: UX Polish (8 tasks)

**Goal**: Improve error handling, feedback, and power features

### Task 3.1: Improve Error Messages

**Objective**: Replace vague errors with actionable messages.

**Files:**
- Create: `apps/web/src/lib/errors/creator-errors.ts`
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Implementation Steps:**
1. Create error mapping from tRPC codes to user messages
2. Parse API errors and map to friendly messages
3. Add specific handling for CONFLICT, NOT_FOUND, BAD_REQUEST

**Test Criteria:**
- Version conflict shows specific message
- Network errors show retry option
- All errors are actionable

**Dependencies:** None

---

### Task 3.2: Add Change Summary in AI Responses

**Objective**: Explain what changed after each request.

**Files:**
- Modify: `apps/web/src/lib/baleybot/creator-bot.ts`
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Implementation Steps:**
1. Compare previous entities with new ones
2. Generate human-readable summary
3. Include summary in assistant message
4. Highlight new entities briefly

**Test Criteria:**
- Summary accurately describes changes
- Canvas highlights new entities
- Summary is concise

**Dependencies:** None

---

### Task 3.3: Add Syntax Highlighting to Code Viewer

**Objective**: Make BAL code readable.

**Files:**
- Modify: `apps/web/src/components/creator/ActionBar.tsx`

**Implementation Steps:**
1. Use lightweight syntax highlighter (Shiki or Prism)
2. Create BAL language definition
3. Apply to code viewer
4. Add line numbers

**Test Criteria:**
- Keywords are highlighted
- Strings colored differently
- Line numbers optional

**Dependencies:** None

---

### Task 3.4: Add Multi-line Test Input

**Objective**: Allow complex JSON test inputs.

**Files:**
- Modify: `apps/web/src/components/creator/ActionBar.tsx`

**Implementation Steps:**
1. Replace input with auto-resizing textarea
2. Add toggle for "Simple" vs "JSON" mode
3. JSON mode validates input
4. Preserve input between runs

**Test Criteria:**
- Textarea expands to fit content
- JSON mode shows syntax errors
- Input persists across runs

**Dependencies:** None

---

### Task 3.5: Implement Undo/Redo

**Objective**: Let users undo mistakes.

**Files:**
- Create: `apps/web/src/hooks/useHistory.ts`
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Implementation Steps:**
1. Create `useHistory` hook with state stack
2. Push snapshots on each AI response
3. Add Cmd/Ctrl+Z for undo, Cmd/Ctrl+Shift+Z for redo
4. Add undo/redo buttons in header
5. Limit to 20 states

**Test Criteria:**
- Undo reverts to previous state
- Redo restores undone state
- Keyboard shortcuts work
- Buttons disabled at limits

**Dependencies:** None

---

### Task 3.6: Clarify Building State

**Objective**: Show difference between current and pending state during rebuild.

**Files:**
- Modify: `apps/web/src/components/creator/Canvas.tsx`

**Implementation Steps:**
1. When 'building' and entities exist, dim current entities
2. Show skeleton placeholders
3. Animate smooth transition
4. Keep connections visible but faded

**Test Criteria:**
- Current entities dimmed during rebuild
- New entities animate in
- Smooth transition when complete

**Dependencies:** None

---

### Task 3.7: Add Copy Code Button

**Objective**: Let users copy BAL code to clipboard.

**Files:**
- Modify: `apps/web/src/components/creator/ActionBar.tsx`

**Implementation Steps:**
1. Add copy button next to code toggle
2. Show "Copied!" toast
3. Use navigator.clipboard API

**Test Criteria:**
- Click copies code
- Toast confirms copy
- Works in all browsers

**Dependencies:** None

---

### Task 3.8: Add Keyboard Shortcuts Help

**Objective**: Educate users about shortcuts.

**Files:**
- Create: `apps/web/src/components/creator/KeyboardShortcutsDialog.tsx`
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Implementation Steps:**
1. Create dialog showing shortcuts
2. Trigger with ? or Cmd/Ctrl+/
3. Group by category
4. Show platform-appropriate modifiers

**Test Criteria:**
- Dialog opens with shortcut
- Shows correct modifiers
- All shortcuts listed

**Dependencies:** Task 3.5

---

## Phase 4: Responsive Design (8 tasks)

**Goal**: Make the creator work on all devices

### Task 4.1: Make Canvas Responsive

**Objective**: Remove fixed 600px width, adapt to container.

**Files:**
- Modify: `apps/web/src/components/creator/Canvas.tsx`

**Implementation Steps:**
1. Remove fixed CANVAS_WIDTH constant
2. Use container-relative positioning
3. Calculate positions based on actual container size
4. Use ResizeObserver to update on resize

**Test Criteria:**
- Canvas fills available width
- Entities reposition on resize
- Works 320px to 1920px

**Dependencies:** None

---

### Task 4.2: Increase Touch Targets

**Objective**: Make all interactive elements at least 44px.

**Files:**
- Modify: `apps/web/src/components/creator/ActionBar.tsx`
- Modify: `apps/web/src/components/creator/ChatInput.tsx`
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Implementation Steps:**
1. Audit all buttons and interactive elements
2. Add min-h-11 min-w-11 (44px)
3. Increase padding on touch areas

**Test Criteria:**
- All buttons at least 44x44px
- Meets WCAG 2.5.5
- No accidental taps

**Dependencies:** None

---

### Task 4.3: Make ActionBar Wrap on Mobile

**Objective**: Stack controls vertically on narrow screens.

**Files:**
- Modify: `apps/web/src/components/creator/ActionBar.tsx`

**Implementation Steps:**
1. Use flex-wrap with gap-2
2. Stack input above buttons at sm breakpoint
3. Full-width buttons on mobile

**Test Criteria:**
- Controls stack at < 640px
- Touch targets remain large
- No content overflow

**Dependencies:** Task 4.2

---

### Task 4.4: Add Mobile Canvas Scroll/Zoom

**Objective**: Let mobile users pan and zoom the canvas.

**Files:**
- Modify: `apps/web/src/components/creator/Canvas.tsx`

**Implementation Steps:**
1. Wrap canvas in scrollable container on mobile
2. Add pinch-to-zoom gesture support
3. Add visible pan/zoom controls
4. Show zoom level indicator

**Test Criteria:**
- Pinch gesture zooms
- Pan works with one-finger drag
- Reset button works

**Dependencies:** Task 4.1

---

### Task 4.5: Create Breakpoint System

**Objective**: Establish consistent responsive breakpoints.

**Files:**
- Create: `apps/web/src/lib/responsive.ts`

**Implementation Steps:**
1. Define breakpoint constants
2. Create `useBreakpoint()` hook
3. Document usage
4. Match Tailwind defaults

**Test Criteria:**
- Hook returns current breakpoint
- Updates on resize
- Server-side safe

**Dependencies:** None

---

### Task 4.6: Add Collapsible Canvas on Mobile

**Objective**: Allow users to hide canvas to focus on chat.

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Implementation Steps:**
1. Add toggle button to collapse/expand
2. Canvas collapses to mini preview
3. Expand shows full canvas
4. Remember preference in localStorage

**Test Criteria:**
- Toggle collapses smoothly
- Mini preview shows entity count
- Preference persists

**Dependencies:** Task 4.5

---

### Task 4.7: Optimize Header for Mobile

**Objective**: Make header functional on narrow screens.

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Implementation Steps:**
1. Truncate long bot names
2. Move Save to dropdown on small screens
3. Use icon-only buttons
4. Keep essential actions visible

**Test Criteria:**
- Header fits 320px screen
- All actions accessible
- Touch targets 44px

**Dependencies:** Task 4.2

---

### Task 4.8: Handle Long Content Overflow

**Objective**: Prevent long content from breaking UI.

**Files:**
- Modify: `apps/web/src/components/creator/ConversationThread.tsx`
- Modify: `apps/web/src/components/creator/ActionBar.tsx`

**Implementation Steps:**
1. Truncate long messages with "Show more"
2. Virtualize long message lists
3. Limit output display with expansion
4. Add word-break for long strings

**Test Criteria:**
- 10K char message doesn't break layout
- Show more expands content
- No horizontal overflow

**Dependencies:** Task 2.7

---

## Phase 5: Edge Cases & Hardening (6 tasks)

**Goal**: Handle rare scenarios gracefully

### Task 5.1: Handle Large Entity Counts

**Objective**: Make canvas usable with 50+ entities.

**Files:**
- Modify: `apps/web/src/components/creator/Canvas.tsx`

**Implementation Steps:**
1. Switch to grid/flow layout for >20 entities
2. Add virtualization for >50 entities
3. Provide zoom controls for overview
4. Consider grouped/collapsed view

**Test Criteria:**
- 50 entities render without lag
- Layout remains readable
- Zoom out shows full picture

**Dependencies:** Task 4.4

---

### Task 5.2: Add Auth Token Refresh Handling

**Objective**: Handle token expiration during long sessions.

**Files:**
- Modify: `apps/web/src/lib/trpc/client.ts`
- Create: `apps/web/src/hooks/useAuthRefresh.ts`

**Implementation Steps:**
1. Detect 401 errors from tRPC
2. Trigger Clerk token refresh
3. Retry failed request automatically
4. Redirect to login if refresh fails

**Test Criteria:**
- Expired token triggers refresh
- Request retries after refresh
- Failed refresh redirects to login

**Dependencies:** None

---

### Task 5.3: Add Conflict Resolution UI

**Objective**: Handle version conflicts gracefully.

**Files:**
- Create: `apps/web/src/components/creator/ConflictDialog.tsx`
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Implementation Steps:**
1. Catch CONFLICT errors from save
2. Show dialog: "Keep mine", "Load theirs", "Compare"
3. Compare view shows diff
4. Implement resolution actions

**Test Criteria:**
- Conflict shows dialog
- "Keep mine" forces save
- "Load theirs" reloads latest

**Dependencies:** None

---

### Task 5.4: Add Offline Handling

**Objective**: Gracefully handle network disconnection.

**Files:**
- Create: `apps/web/src/hooks/useOnlineStatus.ts`
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Implementation Steps:**
1. Create hook to track online/offline
2. Show banner when offline
3. Queue actions for retry
4. Auto-retry on reconnection

**Test Criteria:**
- Offline banner appears
- Actions are queued
- Reconnection triggers retry

**Dependencies:** None

---

### Task 5.5: Add Rate Limit Handling

**Objective**: Handle AI rate limits gracefully.

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Implementation Steps:**
1. Catch rate limit errors
2. Show user-friendly message with wait time
3. Add countdown timer
4. Auto-retry after wait

**Test Criteria:**
- Rate limit shows informative message
- Countdown shows remaining wait
- Auto-retry works

**Dependencies:** Task 1.4

---

### Task 5.6: Add Error Boundary for Creator

**Objective**: Prevent crashes from breaking the experience.

**Files:**
- Create: `apps/web/src/components/creator/CreatorErrorBoundary.tsx`
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Implementation Steps:**
1. Create error boundary component
2. Catch rendering errors
3. Show recovery UI with "Reload"
4. Log errors for debugging
5. Preserve unsaved work in localStorage

**Test Criteria:**
- Rendering error shows recovery UI
- Reload button works
- Error is logged
- Unsaved work can be recovered

**Dependencies:** Task 1.1

---

## Summary

| Phase | Tasks | Focus Area | Estimated Effort |
|-------|-------|------------|------------------|
| 1 | 8 | Data Protection | 2-3 days |
| 2 | 10 | Core Functionality | 4-5 days |
| 3 | 8 | UX Polish | 3-4 days |
| 4 | 8 | Responsive Design | 3-4 days |
| 5 | 6 | Edge Cases | 2-3 days |

**Total Tasks:** 40
**Estimated Total Effort:** 2-3 weeks

**Critical Path:**
- Tasks 1.1 → 1.2 → 1.3 (navigation guards)
- Tasks 2.1 → 2.2 → 2.3 (execution flow)
- Tasks 4.1 → 4.4 (responsive canvas)

**Key Files:**
- `apps/web/src/app/dashboard/baleybots/[id]/page.tsx` - Main page, most changes
- `apps/web/src/components/creator/Canvas.tsx` - Visual rendering, responsive
- `apps/web/src/components/creator/ActionBar.tsx` - Run controls, results
- `apps/web/src/hooks/` - New hooks for state management
- `apps/web/src/lib/trpc/routers/baleybots.ts` - Backend mutations
