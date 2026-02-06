# Creator Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all critical, important, and minor issues identified in the code audit of the conversational BaleyBot creation experience.

**Architecture:** Systematic fixes organized by priority - critical bugs first, then important issues, then minor polish. Each task is atomic and testable.

**Tech Stack:** Next.js 15, React 19, TypeScript, Zod, tRPC, Tailwind CSS

---

## Phase 1: Critical Fixes (Must Complete First)

### Task 1.1: Remove React 19 Guideline Violations - Page Component

**Files:**
- Modify: `apps/web/src/lib/baleybot/creator-types.ts`

**Step 1: Read current file**

Read the file to understand current state.

**Step 2: Add Zod validation constraints to schema**

Update the `creatorOutputSchema` to add proper validation:

```typescript
export const creatorOutputSchema = z.object({
  thinking: z.string().optional().describe('Brief explanation of what the AI is doing'),
  entities: z.array(z.object({
    id: z.string().min(1, 'Entity ID is required'),
    name: z.string().min(1, 'Entity name is required'),
    icon: z.string().min(1, 'Entity icon is required'),
    purpose: z.string().min(1, 'Entity purpose is required'),
    tools: z.array(z.string()),
  })).min(1, 'At least one entity is required').describe('Entities in the BaleyBot'),
  connections: z.array(z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    label: z.string().optional(),
  })).describe('Connections between entities'),
  balCode: z.string().min(1, 'BAL code is required').describe('The generated BAL code'),
  name: z.string().min(1, 'Name is required').max(255).describe('Suggested name for the BaleyBot'),
  icon: z.string().min(1, 'Icon is required').describe('Suggested emoji icon'),
  status: z.enum(['building', 'ready']).describe('Current status'),
});
```

**Step 3: Verify types compile**

Run: `cd apps/web && pnpm type-check`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/src/lib/baleybot/creator-types.ts
git commit -m "fix: add Zod validation constraints to creator output schema"
```

---

### Task 1.2: Remove useCallback from Page Component

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Step 1: Read current file**

Read the file to understand current state.

**Step 2: Remove useCallback import and all useCallback wrappers**

Change the import:
```typescript
// FROM:
import { useState, useCallback, useEffect } from 'react';
// TO:
import { useState, useEffect } from 'react';
```

Convert all handlers from useCallback to regular async functions:

```typescript
// FROM:
const handleSendMessage = useCallback(async (message: string) => {
  // ...
}, [creatorMutation, messages, savedBaleybotId]);

// TO:
const handleSendMessage = async (message: string) => {
  // ...
};
```

Do this for: `handleSendMessage`, `handleSave`, `handleRun`, `handleBack`

**Step 3: Verify types compile**

Run: `cd apps/web && pnpm type-check`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "fix: remove useCallback per React 19 guidelines"
```

---

### Task 1.3: Remove useMemo from Canvas Component

**Files:**
- Modify: `apps/web/src/components/creator/Canvas.tsx`

**Step 1: Read current file**

Read the file to understand current state.

**Step 2: Remove useMemo import and usage**

Find and remove the useMemo usage (around line 407):
```typescript
// FROM:
const sortedEntities = useMemo(() => {
  return [...entities].sort((a, b) => a.id.localeCompare(b.id));
}, [entities]);

// TO:
const sortedEntities = [...entities].sort((a, b) => a.id.localeCompare(b.id));
```

Remove useMemo from imports if no longer used.

**Step 3: Verify types compile**

Run: `cd apps/web && pnpm type-check`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/src/components/creator/Canvas.tsx
git commit -m "fix: remove useMemo per React 19 guidelines"
```

---

### Task 1.4: Fix Race Condition in handleRun

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Step 1: Read current file**

Read the file to understand current handleSave and handleRun implementations.

**Step 2: Make handleSave return the ID**

Update handleSave to return the saved ID:

```typescript
const handleSave = async (): Promise<string | null> => {
  if (!balCode || !name) return null;

  setIsSaving(true);

  try {
    const result = await saveMutation.mutateAsync({
      baleybotId: savedBaleybotId ?? undefined,
      name,
      description: messages[0]?.content,
      icon: icon || undefined,
      balCode,
      conversationHistory: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      })),
    });

    // If new, update savedBaleybotId and URL
    if (!savedBaleybotId) {
      setSavedBaleybotId(result.id);
      window.history.replaceState(null, '', ROUTES.baleybots.detail(result.id));
    }

    // Invalidate queries
    utils.baleybots.list.invalidate();
    if (savedBaleybotId) {
      utils.baleybots.get.invalidate({ id: savedBaleybotId });
    }

    return result.id;
  } catch (error) {
    console.error('Save failed:', error);
    return null;
  } finally {
    setIsSaving(false);
  }
};
```

**Step 3: Update handleRun to use returned ID**

```typescript
const handleRun = async (input: string) => {
  let baleybotIdToRun = savedBaleybotId;

  // Auto-save if not saved yet
  if (!baleybotIdToRun) {
    const newId = await handleSave();
    if (!newId) {
      setRunResult({
        success: false,
        output: null,
        error: 'Failed to save BaleyBot before running',
      });
      return;
    }
    baleybotIdToRun = newId;
  }

  // Set status to 'running'
  setStatus('running');

  try {
    const result = await executeMutation.mutateAsync({
      id: baleybotIdToRun,
      input: input || undefined,
      triggeredBy: 'manual',
    });

    setRunResult({
      success: true,
      output: result,
    });
    setStatus('ready');
  } catch (error) {
    console.error('Execution failed:', error);
    setRunResult({
      success: false,
      output: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    setStatus('error');
  }
};
```

**Step 4: Verify types compile**

Run: `cd apps/web && pnpm type-check`
Expected: No errors

**Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "fix: resolve race condition in handleRun by returning ID from handleSave"
```

---

### Task 1.5: Add Soft-Delete Filter to Connections Query

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts`

**Step 1: Read current sendCreatorMessage procedure**

Read lines around 758-760 to see current connections query.

**Step 2: Add notDeleted filter**

```typescript
// FROM:
const workspaceConnections = await ctx.db.query.connections.findMany({
  where: eq(connections.workspaceId, ctx.workspace.id),
});

// TO:
const workspaceConnections = await ctx.db.query.connections.findMany({
  where: and(
    eq(connections.workspaceId, ctx.workspace.id),
    notDeleted(connections)
  ),
});
```

Ensure `and` and `notDeleted` are imported at the top of the file.

**Step 3: Verify types compile**

Run: `cd apps/web && pnpm type-check`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/src/lib/trpc/routers/baleybots.ts
git commit -m "fix: add soft-delete filter to connections query in sendCreatorMessage"
```

---

### Task 1.6: Add Missing Metadata Fields in saveFromSession Create Path

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts`

**Step 1: Read current saveFromSession procedure**

Read lines around 876-890 to see current create operation.

**Step 2: Add missing fields to create operation**

```typescript
// Update the insert to include missing fields:
const [baleybot] = await ctx.db
  .insert(baleybots)
  .values({
    workspaceId: ctx.workspace.id,
    name: input.name,
    description: input.description,
    icon: input.icon,
    status: 'draft',
    balCode: input.balCode,
    // Add these missing fields:
    structure: null,  // Will be populated when we parse BAL
    entityNames: [],  // Could extract from balCode in future
    dependencies: [], // Could extract from balCode in future
    executionCount: 0,
    createdBy: ctx.userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  .returning();
```

**Step 3: Verify types compile**

Run: `cd apps/web && pnpm type-check`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/src/lib/trpc/routers/baleybots.ts
git commit -m "fix: add missing metadata fields in saveFromSession create path"
```

---

## Phase 2: Important Fixes

### Task 2.1: Fix Missing Effect Dependency

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Step 1: Read current effect (lines 118-123)**

**Step 2: Add handleSendMessage to dependency array**

Note: After removing useCallback, handleSendMessage will be a new function on each render. We need to use a ref to track if we've already sent the initial prompt to avoid infinite loops.

```typescript
// Add ref at top of component:
const initialPromptSentRef = useRef(false);

// Update the effect:
useEffect(() => {
  if (isNew && initialPrompt && !initialPromptSentRef.current && status === 'empty') {
    initialPromptSentRef.current = true;
    handleSendMessage(initialPrompt);
  }
}, [isNew, initialPrompt, status, handleSendMessage]);
```

Also remove the `initialPromptSent` state since we're using a ref now.

**Step 3: Verify types compile**

Run: `cd apps/web && pnpm type-check`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "fix: use ref for initial prompt tracking to fix effect dependency"
```

---

### Task 2.2: Add Error Handling for Save Operations

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Step 1: Read current handleSave function**

**Step 2: Add user-facing error handling**

```typescript
const handleSave = async (): Promise<string | null> => {
  if (!balCode || !name) return null;

  setIsSaving(true);

  try {
    const result = await saveMutation.mutateAsync({
      baleybotId: savedBaleybotId ?? undefined,
      name,
      description: messages[0]?.content,
      icon: icon || undefined,
      balCode,
      conversationHistory: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      })),
    });

    if (!savedBaleybotId) {
      setSavedBaleybotId(result.id);
      window.history.replaceState(null, '', ROUTES.baleybots.detail(result.id));
    }

    utils.baleybots.list.invalidate();
    if (savedBaleybotId) {
      utils.baleybots.get.invalidate({ id: savedBaleybotId });
    }

    return result.id;
  } catch (error) {
    console.error('Save failed:', error);

    // Add error message to conversation for user feedback
    const errorMessage: CreatorMessage = {
      id: `msg-${Date.now()}-save-error`,
      role: 'assistant',
      content: `Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, errorMessage]);
    setStatus('error');

    return null;
  } finally {
    setIsSaving(false);
  }
};
```

**Step 3: Verify types compile**

Run: `cd apps/web && pnpm type-check`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "fix: add user-facing error handling for save operations"
```

---

### Task 2.3: Add OptimisticLockError Handling in tRPC

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts`

**Step 1: Read current saveFromSession update path**

**Step 2: Wrap updateWithLock in try-catch**

```typescript
// In saveFromSession, wrap the update in try-catch:
try {
  const updated = await updateWithLock(baleybots, input.baleybotId, existing.version, {
    name: input.name,
    description: input.description,
    icon: input.icon,
    balCode: input.balCode,
  });
  return updated;
} catch (error) {
  if (error instanceof OptimisticLockError) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'This BaleyBot was modified by another user. Please refresh and try again.',
    });
  }
  throw error;
}
```

Ensure `OptimisticLockError` is imported from the appropriate module.

**Step 3: Verify types compile**

Run: `cd apps/web && pnpm type-check`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/src/lib/trpc/routers/baleybots.ts
git commit -m "fix: add OptimisticLockError handling in saveFromSession"
```

---

### Task 2.4: Remove Unused sessionId Parameter

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts`

**Step 1: Read current sendCreatorMessage input schema**

**Step 2: Remove sessionId from input schema**

```typescript
// FROM:
.input(
  z.object({
    sessionId: z.string().uuid().optional(),
    baleybotId: z.string().uuid().optional(),
    // ...
  })
)

// TO:
.input(
  z.object({
    baleybotId: z.string().uuid().optional(),
    // ...
  })
)
```

**Step 3: Verify types compile**

Run: `cd apps/web && pnpm type-check`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/src/lib/trpc/routers/baleybots.ts
git commit -m "fix: remove unused sessionId parameter from sendCreatorMessage"
```

---

### Task 2.5: Add Accessibility Labels to Canvas

**Files:**
- Modify: `apps/web/src/components/creator/Canvas.tsx`

**Step 1: Read current file**

**Step 2: Add ARIA labels and semantic improvements**

1. Mark decorative SVG as aria-hidden:
```typescript
<svg className="absolute inset-0 w-full h-full" aria-hidden="true">
```

2. Mark decorative emoji as aria-hidden:
```typescript
<motion.span className="text-6xl mb-4" aria-hidden="true">✨</motion.span>
```

3. Add aria-label to the main canvas container:
```typescript
<div
  className={cn('relative w-full h-full min-h-[500px] rounded-2xl', className)}
  role="region"
  aria-label={`BaleyBot canvas with ${entities.length} entities`}
>
```

4. Add semantic structure to entity cards:
```typescript
<article
  className="card-playful rounded-2xl p-4 min-w-[200px] max-w-[280px]"
  aria-label={`Entity: ${entity.name}`}
>
```

5. Mark connection SVG layer as decorative:
```typescript
<svg
  className="absolute inset-0 w-full h-full pointer-events-none"
  aria-hidden="true"
>
```

**Step 3: Verify types compile**

Run: `cd apps/web && pnpm type-check`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/src/components/creator/Canvas.tsx
git commit -m "fix: add accessibility labels and semantic structure to Canvas"
```

---

### Task 2.6: Add Accessibility Labels to ChatInput

**Files:**
- Modify: `apps/web/src/components/creator/ChatInput.tsx`

**Step 1: Read current file**

**Step 2: Add ARIA labels**

1. Add aria-label to textarea:
```typescript
<textarea
  ref={textareaRef}
  value={value}
  onChange={(e) => setValue(e.target.value)}
  onKeyDown={handleKeyDown}
  onFocus={() => setIsFocused(true)}
  onBlur={() => setIsFocused(false)}
  placeholder={getPlaceholder(status)}
  disabled={isDisabled}
  rows={1}
  aria-label="Chat message input"
  aria-describedby="chat-hint"
  className={cn(/* ... */)}
/>
```

2. Add id to hint text:
```typescript
<p id="chat-hint" className="text-center text-xs text-muted-foreground mt-2">
  Press Enter to send, Shift+Enter for new line
</p>
```

3. Add aria-label to send button:
```typescript
<Button
  onClick={handleSend}
  disabled={!hasContent || isDisabled}
  size="icon"
  aria-label={isProcessing ? "Sending message" : "Send message"}
  className={cn(/* ... */)}
>
```

**Step 3: Verify types compile**

Run: `cd apps/web && pnpm type-check`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/src/components/creator/ChatInput.tsx
git commit -m "fix: add accessibility labels to ChatInput"
```

---

### Task 2.7: Add Accessibility Labels to ActionBar

**Files:**
- Modify: `apps/web/src/components/creator/ActionBar.tsx`

**Step 1: Read current file**

**Step 2: Add ARIA labels**

1. Add aria-label to test input:
```typescript
<input
  type="text"
  value={testInput}
  onChange={(e) => setTestInput(e.target.value)}
  placeholder="Test input (optional)..."
  disabled={isRunning}
  aria-label="Test input for BaleyBot execution"
  className={cn(/* ... */)}
/>
```

2. Add aria-label to run button:
```typescript
<Button
  onClick={handleRun}
  disabled={isRunning}
  aria-label={isRunning ? "Running BaleyBot" : "Run BaleyBot"}
  aria-busy={isRunning}
  className="btn-playful text-white rounded-xl px-6"
>
```

3. Add aria-label to code toggle:
```typescript
<Button
  variant="ghost"
  onClick={() => setShowCode(!showCode)}
  aria-label={showCode ? "Hide BAL code" : "View BAL code"}
  aria-expanded={showCode}
  className={cn(/* ... */)}
>
```

4. Add aria-live to results section:
```typescript
<motion.div
  initial={{ opacity: 0, height: 0 }}
  animate={{ opacity: 1, height: 'auto' }}
  exit={{ opacity: 0, height: 0 }}
  transition={{ duration: 0.2 }}
  role="status"
  aria-live="polite"
>
```

**Step 3: Verify types compile**

Run: `cd apps/web && pnpm type-check`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/src/components/creator/ActionBar.tsx
git commit -m "fix: add accessibility labels to ActionBar"
```

---

### Task 2.8: Add Safe JSON Stringify in ActionBar

**Files:**
- Modify: `apps/web/src/components/creator/ActionBar.tsx`

**Step 1: Read current JSON.stringify usage**

**Step 2: Add safe stringify helper**

Add at top of file after imports:
```typescript
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
```

Update the usage:
```typescript
// FROM:
{JSON.stringify(runResult.output, null, 2)}

// TO:
{safeStringify(runResult.output)}
```

**Step 3: Verify types compile**

Run: `cd apps/web && pnpm type-check`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/src/components/creator/ActionBar.tsx
git commit -m "fix: add safe JSON stringify to handle non-serializable output"
```

---

### Task 2.9: Add Discriminated Union for Stream Chunks

**Files:**
- Modify: `apps/web/src/lib/baleybot/creator-types.ts`

**Step 1: Read current CreatorStreamChunk type**

**Step 2: Replace with discriminated union**

```typescript
// FROM:
export interface CreatorStreamChunk {
  type: 'thinking' | 'entity_add' | 'entity_remove' | 'connection_add' | 'connection_remove' | 'status' | 'complete' | 'error';
  data: unknown;
}

// TO:
export type CreatorStreamChunk =
  | { type: 'status'; data: { message: string } }
  | { type: 'thinking'; data: { content: string } }
  | { type: 'entity'; data: VisualEntity }
  | { type: 'entity_remove'; data: { id: string } }
  | { type: 'connection'; data: Connection }
  | { type: 'connection_remove'; data: { id: string } }
  | { type: 'complete'; data: CreatorOutput }
  | { type: 'error'; data: { message: string; code?: string } };
```

**Step 3: Update streamCreatorMessage in creator-bot.ts to use new types**

Update the yields to match the new type structure.

**Step 4: Verify types compile**

Run: `cd apps/web && pnpm type-check`
Expected: No errors

**Step 5: Commit**

```bash
git add apps/web/src/lib/baleybot/creator-types.ts apps/web/src/lib/baleybot/creator-bot.ts
git commit -m "fix: add discriminated union for type-safe stream chunks"
```

---

## Phase 3: Minor Fixes and Polish

### Task 3.1: Extract Magic Numbers to Constants in Canvas

**Files:**
- Modify: `apps/web/src/components/creator/Canvas.tsx`

**Step 1: Read current magic numbers**

**Step 2: Extract to named constants**

Add at top of file after imports:
```typescript
// Canvas layout constants
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 800;
const ENTITY_CARD_HEIGHT = 80;  // Approximate height for connection calculations
const ENTITY_VERTICAL_OFFSET = 40;  // Half of card height for connection endpoints
const SPRING_STIFFNESS = 300;
const SPRING_DAMPING = 25;
const STAGGER_DELAY = 0.1;
```

Update usages throughout the file to use these constants.

**Step 3: Verify types compile**

Run: `cd apps/web && pnpm type-check`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/src/components/creator/Canvas.tsx
git commit -m "refactor: extract magic numbers to named constants in Canvas"
```

---

### Task 3.2: Remove Unused containerRef in Canvas

**Files:**
- Modify: `apps/web/src/components/creator/Canvas.tsx`

**Step 1: Find containerRef usage**

**Step 2: Remove if unused**

If `containerRef` is only declared but never used, remove it:
```typescript
// Remove this line if unused:
const containerRef = useRef<HTMLDivElement>(null);
```

Also remove from the JSX if it's being assigned to a ref prop.

**Step 3: Verify types compile**

Run: `cd apps/web && pnpm type-check`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/src/components/creator/Canvas.tsx
git commit -m "refactor: remove unused containerRef in Canvas"
```

---

### Task 3.3: Add Cmd/Ctrl+Enter Shortcut to ChatInput

**Files:**
- Modify: `apps/web/src/components/creator/ChatInput.tsx`

**Step 1: Read current handleKeyDown**

**Step 2: Add Cmd/Ctrl+Enter support**

```typescript
const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  // Send on Enter (without shift) or Cmd/Ctrl+Enter
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    handleSend();
  }
};
```

**Step 3: Update hint text**

```typescript
<p id="chat-hint" className="text-center text-xs text-muted-foreground mt-2">
  Press Enter or {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to send
</p>
```

**Step 4: Verify types compile**

Run: `cd apps/web && pnpm type-check`
Expected: No errors

**Step 5: Commit**

```bash
git add apps/web/src/components/creator/ChatInput.tsx
git commit -m "feat: add Cmd/Ctrl+Enter shortcut for power users"
```

---

### Task 3.4: Remove Redundant isLoading State

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Step 1: Read current isLoading usage**

**Step 2: Derive from isLoadingBaleybot instead**

Remove the `isLoading` state:
```typescript
// REMOVE:
const [isLoading, setIsLoading] = useState(!isNew);
```

Remove the effect that sets it:
```typescript
// REMOVE from useEffect:
setIsLoading(false);
```

Update the loading check:
```typescript
// FROM:
if (!isNew && (isLoadingBaleybot || isLoading)) {

// TO:
if (!isNew && isLoadingBaleybot) {
```

**Step 3: Verify types compile**

Run: `cd apps/web && pnpm type-check`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "refactor: derive loading state from isLoadingBaleybot"
```

---

### Task 3.5: Standardize Animation Durations

**Files:**
- Modify: `apps/web/src/components/creator/ActionBar.tsx`

**Step 1: Read current animation durations**

**Step 2: Standardize to 200ms**

Find all `transition={{ duration: X }}` and standardize:
- Code viewer: 200ms (keep)
- Results panel: 200ms (keep)
- Entrance animation: Change from 300ms to 200ms

```typescript
// Standardize entrance:
transition={{ duration: 0.2 }}
```

**Step 3: Verify types compile**

Run: `cd apps/web && pnpm type-check`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/src/components/creator/ActionBar.tsx
git commit -m "refactor: standardize animation durations to 200ms"
```

---

### Task 3.6: Fix Inconsistent Null/Undefined in createSession

**Files:**
- Modify: `apps/web/src/lib/baleybot/creator-types.ts`

**Step 1: Read createSession function**

**Step 2: Use consistent null handling**

Update the function signature and implementation to be consistent:
```typescript
export function createSession(
  workspaceId: string,
  baleybotId: string | null = null
): CreationSession {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    baleybotId,
    workspaceId,
    messages: [],
    canvasState: createInitialCanvasState(),
    name: null,
    icon: null,
    createdAt: now,
    updatedAt: now,
  };
}
```

**Step 3: Verify types compile**

Run: `cd apps/web && pnpm type-check`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/src/lib/baleybot/creator-types.ts
git commit -m "fix: use consistent null handling in createSession"
```

---

## Phase 4: Final Verification

### Task 4.1: Run Full Type Check

**Step 1: Run type check**

```bash
cd apps/web && pnpm type-check
```
Expected: No errors

**Step 2: Fix any remaining type errors**

Address any errors that appear.

**Step 3: Commit if fixes made**

```bash
git add -A
git commit -m "fix: address remaining type errors"
```

---

### Task 4.2: Run Linting

**Step 1: Run lint**

```bash
cd apps/web && pnpm lint
```
Expected: No errors (warnings acceptable)

**Step 2: Fix any lint errors**

Address any errors that appear.

**Step 3: Commit if fixes made**

```bash
git add -A
git commit -m "fix: address lint errors"
```

---

### Task 4.3: Run Production Build

**Step 1: Run build**

```bash
cd apps/web && pnpm build
```
Expected: Build succeeds

**Step 2: Fix any build errors**

Address any errors that appear.

**Step 3: Commit if fixes made**

```bash
git add -A
git commit -m "fix: address build errors"
```

---

### Task 4.4: Manual Smoke Test

**Step 1: Start dev server**

```bash
cd apps/web && pnpm dev
```

**Step 2: Test critical flows**

1. Navigate to `/dashboard/baleybots/new`
2. Type a message and press Enter
3. Verify entities appear
4. Click Save
5. Verify URL updates
6. Click Run
7. Verify results appear

**Step 3: Document any issues**

Create follow-up tasks if issues found.

---

## Summary

**Total Tasks: 22**

**Phase 1 - Critical Fixes (6 tasks)**
- 1.1: Add Zod validation constraints
- 1.2: Remove useCallback from page
- 1.3: Remove useMemo from Canvas
- 1.4: Fix race condition in handleRun
- 1.5: Add soft-delete filter
- 1.6: Add missing metadata fields

**Phase 2 - Important Fixes (9 tasks)**
- 2.1: Fix missing effect dependency
- 2.2: Add error handling for save
- 2.3: Add OptimisticLockError handling
- 2.4: Remove unused sessionId
- 2.5: Add accessibility to Canvas
- 2.6: Add accessibility to ChatInput
- 2.7: Add accessibility to ActionBar
- 2.8: Add safe JSON stringify
- 2.9: Add discriminated union for streams

**Phase 3 - Minor Fixes (6 tasks)**
- 3.1: Extract magic numbers
- 3.2: Remove unused containerRef
- 3.3: Add Cmd/Ctrl+Enter shortcut
- 3.4: Remove redundant isLoading
- 3.5: Standardize animation durations
- 3.6: Fix null/undefined consistency

**Phase 4 - Verification (4 tasks)**
- 4.1: Type check
- 4.2: Linting
- 4.3: Production build
- 4.4: Manual smoke test

**Estimated commits: 20-25**
