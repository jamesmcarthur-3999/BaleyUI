# BaleyUI UX Consolidation & Polish Design

**Date:** 2026-02-12
**Status:** Approved
**Target Users:** Non-technical users first, power users second
**Approach:** Consolidation first, then UX improvements

## Context

14 deep-dive and validation agents audited every page, component, and interaction pattern. This document captures the validated findings and the 6-chunk implementation plan.

## Problem Statement

Seven validated problems, ordered by severity:

### P0: No AI Credentials in Onboarding (Critical)
Users sign up, create a workspace, see an empty BaleyBots list, click "New BaleyBot", type a description, and get a cryptic SDK error because no AI provider is configured. The readiness system checks for AI providers but the result isn't shown until after the user has already failed.

**Failure sequence:** Sign up -> Workspace name -> Empty bots list -> "New BaleyBot" -> Type description -> `resolveProviderConfig()` returns null -> SDK error -> User stuck.

**Files:** `onboarding/page.tsx`, `baleybots/page.tsx:785-796`, `ai-credentials-service.ts:89-173`, `creator/stream/route.ts:153-190`

### P1: Editor Monolith (High)
`baleybots/[id]/page.tsx` is 2,342 lines with 32 `useState` + 12 `useRef` = 44 state pieces. `startCreatorStream` alone is 268 lines. However, 14 UI components and 3 helper files are already extracted. The render function is clean.

**State clusters (validated):**
1. Core design state (6 vars) - entities, connections, balCode, name, description, icon
2. Conversation state (11 vars) - messages, streaming, agent events, guidance
3. Persistence state (5 vars) - save, conflict, abort
4. Navigation state (7 vars) - viewMode, builderMode, mobile
5. Lifecycle state (6 vars) - triggers, webhooks, go-live, test cases
6. Readiness state (3 vars) - readiness, specialist signals
7. Session recovery (4 vars) - initialization flags

### P2: Skeleton-to-Content Pops (High)
5 major transitions swap instantly with no fade:
1. BaleyBots card grid (`baleybots/page.tsx:639`)
2. Activity list (`activity/page.tsx:140`)
3. Recent activity feed (`RecentActivityFeed.tsx:82`)
4. Dynamic editor imports (`baleybots/[id]/page.tsx:18-34`)
5. Slide panel content

### P3: 12 Parallel Status Rendering Patterns (Medium)
**3 shared components:**
- `StatusBadge` (execution: pending/running/completed/failed/cancelled)
- `StatusIndicator` (connection: connected/error/unconfigured/pending)
- `Badge` with status variants (connected/error/unconfigured + block types + providers)

**9 inline implementations:**
- `BaleybotCard.tsx:44-65` - lifecycle: draft/active/paused/error
- `BotMonitorPanel.tsx:21-37` - execution statuses
- `baleybots/page.tsx:116-154` - execution status badges
- `baleybots/page.tsx:103-114` - lifecycle status tones
- `ExecutionHistory.tsx:30-61` - execution config
- `RecentActivityFeed.tsx:39-52` - status icons only
- `OrbMode.tsx:41,160-172` - activity statuses
- `StreamStatus.tsx:18-62` - stream statuses
- `ConnectionCard.tsx:24-32` - connection dot

### P4: 5 Skeleton Implementations + Dead Code (Medium)
**Shared components:**
- `Skeleton` (base, 20 files)
- `ListSkeleton` (card/row/table, 2 files)
- `LoadingDots` in `ui/` (3 files)
- `DetailSkeleton` (1 file)
- `DashboardSkeleton` (1 file)

**Dead code:**
- `creator/LoadingStates.tsx` (188 lines, **0 imports**) - contains InlineLoading, SkeletonBlock, NetworkStatus, LoadingDots (duplicate), RetryingIndicator
- Duplicate `LoadingDots` in `creator/LoadingStates.tsx` vs `ui/loading-dots.tsx`

**Ad-hoc patterns:** 38 Loader2 spinner instances, 4 custom inline dot patterns, 5+ inline Tailwind skeletons

### P5: 17 Orphaned CSS Animations (Medium)
37 keyframes defined, 20 used, 17 orphaned, 1 duplicate (`pulse-soft`). Stagger system capped at 6 items.

### P6: Developer-Centric Terminology (Medium)
- "Capabilities" section label (rename to "Integrations")
- "Execution" in user-facing text (simplify to "Run")
- BAL/Code tab already hidden behind "Advanced Mode" toggle (no change needed)

### P7: Inconsistent Dialog Sizes (Low-Medium)
13 dialogs using 3 width classes (max-w-md, max-w-lg, max-w-2xl). Height handling varies: 80vh, 85vh, 90vh, or none.

## What's Good (Don't Touch)

- Design system foundations (HSL tokens, warm palette, dark mode)
- `ConfirmButton` and `InlineEdit` components (exemplary)
- Reduced-motion support (9/10)
- Animation performance (8/10, CSS-only)
- 14 already-extracted editor UI components
- ReadinessChecklist with progress ring
- BAL/Code tab already behind progressive disclosure

---

## Implementation Plan: 6 Chunks

### Chunk 1: Design System Consolidation

**Goal:** Unify duplicated component patterns so all subsequent work builds on clean foundations.

#### 1a. Unified StatusBadge

Create a single `StatusBadge` component covering all domains:

```typescript
type StatusDomain = 'execution' | 'lifecycle' | 'connection' | 'stream';

interface UnifiedStatusBadgeProps {
  status: string; // domain-specific status value
  domain?: StatusDomain; // auto-inferred when possible
  variant?: 'badge' | 'dot' | 'icon-only';
  size?: 'xs' | 'sm' | 'default';
  animate?: boolean;
  className?: string;
}
```

**Status mapping (validated):**
| Domain | Statuses | Default Variant |
|--------|----------|-----------------|
| execution | pending, running, completed, failed, cancelled | badge |
| lifecycle | draft, active, paused, error | badge |
| connection | connected, error, unconfigured, pending | dot |
| stream | idle, connecting, streaming, complete, error, cancelled | badge |

**Migration:** Replace 9 inline implementations. Keep backward-compatible exports for `StatusBadge` and `StatusIndicator` during transition.

**Files to create:** `components/ui/unified-status-badge.tsx`
**Files to modify:** BaleybotCard, BotMonitorPanel, baleybots/page.tsx, ExecutionHistory, RecentActivityFeed, OrbMode, ConnectionCard
**Files to deprecate:** Eventually `status-badge.tsx`, `status-indicator.tsx` (after all consumers migrate)

#### 1b. Skeleton Consolidation

1. **Delete dead code:** `components/creator/LoadingStates.tsx` (188 lines, 0 imports)
2. **Remove duplicate:** `LoadingDots` from LoadingStates (keep `ui/loading-dots.tsx`)
3. **Move to ui/:** `DetailSkeleton` and `DashboardSkeleton` from `components/loading/` to `components/ui/`
4. **Create `LoadingIndicator`:** Unified spinner/dots component

```typescript
interface LoadingIndicatorProps {
  variant: 'dots' | 'spinner';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  text?: string;
  className?: string;
}
```

**Files to delete:** `components/creator/LoadingStates.tsx`, `components/loading/` directory
**Files to create:** `components/ui/loading-indicator.tsx`

#### 1c. Dialog Size Standardization

Add size prop to DialogContent:

```typescript
const dialogSizes = {
  sm: 'max-w-sm',   // 384px - confirmations
  md: 'max-w-md',   // 448px - simple forms
  lg: 'max-w-lg',   // 512px - DEFAULT, standard forms
  xl: 'max-w-2xl',  // 672px - complex forms
} as const;
```

Standardize all dialogs to `max-h-[85vh] overflow-y-auto` when they contain scrollable content.

**Files to modify:** `components/ui/dialog.tsx` (add size prop), then update all 13 dialog usages

#### 1d. PageShell Extraction

Extract for the 6-7 pages that benefit:

```typescript
interface PageShellProps {
  title?: string | ReactNode;
  titleSize?: '3xl' | '2xl';
  description?: string | ReactNode;
  actions?: ReactNode;
  container?: 'standard' | 'constrained' | 'none';
  children: ReactNode;
}
```

**Pages that benefit:** BaleyBots list, Activity, Analytics, Admin BaleyBots, Admin Shared Context, Approvals
**Pages that DON'T:** Tools, Connections, API Keys, Settings/General, Settings/Team (too unique)

**Files to create:** `components/layout/page-shell.tsx`

#### 1e. CSS Animation Cleanup

1. Remove 17 orphaned keyframes from `globals.css`
2. Remove duplicate `pulse-soft` definition
3. Add `animate-fade-in` to 5 worst skeleton-to-content transitions
4. No new CSS needed

---

### Chunk 2: Forms, Filters & Shared Patterns

#### 2a. FilterBar Component

```typescript
interface FilterBarProps {
  variant?: 'card' | 'inline';
  search?: { value: string; onChange: (v: string) => void; placeholder: string; maxWidth?: 'sm' | 'xs' | 'full' };
  filters?: Array<{ value: string; onChange: (v: string) => void; placeholder: string; width?: string; options: Array<{ value: string; label: string }> }>;
  actions?: ReactNode;
  viewMode?: { value: 'cards' | 'list'; onChange: (mode: string) => void };
  resultsSummary?: { total: number; filtered: number; onClearFilters?: () => void };
}
```

**Would unify:** BaleyBots filter bar, Activity filters, Tools action bar, Approvals search
**Files to create:** `components/ui/filter-bar.tsx`

#### 2b. EntityCard Component

```typescript
interface EntityCardProps {
  icon: { element: ReactNode; size?: 'sm' | 'md' | 'lg'; background?: 'gradient' | 'muted' };
  statusBar?: { color: string };
  header: { title: string; badges?: Array<{ label: string; variant: string }> };
  description?: string;
  footer?: { stats?: Array<{ icon: ReactNode; label: string }> };
  actions?: { menu?: ReactNode };
  onClick?: () => void;
  href?: string;
}
```

**Would unify:** BaleybotCard, ToolCard structures
**Files to create:** `components/ui/entity-card.tsx`

#### 2c. FormFieldGroup Component

```typescript
interface FormFieldGroupProps {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  layout?: 'vertical' | 'horizontal';
  children: ReactNode;
}
```

**Would unify:** Connection forms, API key forms, tool dialog forms, settings forms

#### 2d. Button Loading States

Add `loading` prop to Button component:
```typescript
<Button loading={isSaving}>Save</Button>
// Renders spinner icon replacing the leading icon during loading
```

---

### Chunk 3: Terminology & Navigation

#### 3a. Rename "Capabilities" to "Integrations"

**Files to change:**
- `sidebar.tsx:200` - section label
- `capabilities/layout.tsx:11,13` - heading and description
- Route paths stay the same (avoid URL breakage) or add redirects

#### 3b. Simplify "Execution" to "Run"

User-facing text changes only:
- `activity/page.tsx:94` - "View all BaleyBot runs" (was "executions")
- `activity/page.tsx:111` - "Filter by status" (was "execution status")
- `activity/page.tsx:128` - "Recent Runs" (was "Recent Executions")
- `analytics/page.tsx:133,136` - "Avg Cost Per Run", "Cost per Run"
- Execution detail pages: "Run Details" (was "Execution Details")

Code/variable names stay as `execution` internally.

#### 3c. Contextual Tooltips

Add first-encounter tooltips for key concepts on the Connections page and BaleyBots creation page, explaining what AI providers are and why they're needed.

---

### Chunk 4: Onboarding & First-Run Experience

#### 4a. AI Credentials Step in Onboarding

After workspace creation, add a new step:
- Title: "Connect an AI Provider"
- Description: "BaleyBots need an AI provider to think. Add your API key for OpenAI or Anthropic."
- Quick-add form for API key (provider select + key input)
- "Skip for now" option with clear warning: "You'll need this before creating your first BaleyBot"
- On success: redirect to BaleyBots with celebratory state

**Files to modify:** `onboarding/page.tsx`

#### 4b. Pre-Flight Check on Empty State

On the BaleyBots list page, when no AI provider is configured:
- Show a warning banner above the empty state
- Banner text: "Connect an AI provider to start building" with button linking to Connections
- "New BaleyBot" button should show tooltip explaining prerequisite

**Files to modify:** `baleybots/page.tsx` (empty state section)

#### 4c. Actionable Error Messages

When creator bot fails due to missing credentials:
- Replace cryptic SDK error with: "No AI provider connected. Add your OpenAI or Anthropic API key to get started."
- Include inline button: "Go to Integrations" linking to Connections page

**Files to modify:** `creator/stream/route.ts` (error handler), `LeftPanel.tsx` or `ConversationThread.tsx` (error rendering)

#### 4d. Better Connections Empty State

When Connections page is empty:
- Show guided setup: "Start here: Add your first AI provider"
- Recommend OpenAI or Anthropic with brief instructions on getting an API key
- One-click "Add OpenAI" / "Add Anthropic" shortcuts

**Files to modify:** `capabilities/connections/page.tsx`

---

### Chunk 5: Editor Refactor

Validated 4-PR approach targeting state management:

#### 5a. Extract Streaming Logic (~450 lines)

Move `startCreatorStream` (lines 580-848) and `applyCreatorResult` (lines 850-1030) to dedicated files.

**Create:**
- `lib/baleybot/creator-streaming.ts` - SSE connection, event handling
- `lib/baleybot/creator-response-handler.ts` - AI response processing

Both become pure functions accepting state and returning updates. State setters stay in the page component.

#### 5b. Extract Persistence Logic (~200 lines)

Create `useBaleybotPersistence` hook:
- `handleSave`, `handleConflictAction`, auto-save logic
- Returns `{ save, isDirty, isSaving, conflictDialog }`

Create `useSessionRecovery` hook:
- Session persist/restore/cleanup
- Lines 1491-1590

#### 5c. Extract Navigation State (~150 lines)

Create `useEditorNavigation` hook:
- `viewMode`, `builderMode`, `mobileView`, tab computation
- Returns `{ viewMode, setViewMode, navigateToTab, availableTabs }`

#### 5d. Readiness as Derived State (~80 lines)

Create `useReadiness` hook:
- Computes readiness on each render (React 19 compiler handles memoization)
- Remove `setReadiness` state - make it fully derived
- Simplify readiness effects (lines 1592-1644)

**Result:** Page drops from 2,342 to ~1,460 lines (38% reduction)

**What NOT to refactor:**
- Core design state (entities, balCode, name) - golden path, keep in page
- Data initialization logic (lines 1769-1860) - runs once on mount
- Already-extracted 14 UI components

#### 5e. Adaptive UI Additions

- AI processing feedback: replace infinite sliding bar with stage messages ("Understanding your request...", "Generating code...", "Validating...")
- Lazy-load `IntegrationDashboard`, `BotMonitorPanel`, `AdaptiveTestSurface` (~30KB bundle reduction)

---

### Chunk 6: Animation Choreography & Polish

#### 6a. Choreography System (~100 lines TS)

```typescript
// lib/animations/choreography.ts
type ChoreographyStep = {
  selector: string;
  animation: string; // existing CSS class
  delay?: number;
  stagger?: number;
};

// hooks/useAnimationSequence.ts
function useAnimationSequence(sequence: ChoreographyStep[], trigger: boolean): void;
```

Uses existing CSS animation classes. Zero new CSS.

#### 6b. Extend Stagger System

Replace hardcoded `.stagger-1` through `.stagger-6` with dynamic inline `animationDelay` via the choreography system. Removes the 6-item cap.

#### 6c. Predefined Sequences

- `cardGridSequence` - staggered fade-in for card grids
- `listLoadSequence` - staggered fade-in for list items
- `heroSequence` - landing page entrance

#### 6d. Final Polish Pass

- Save confirmation feedback (brief success state on save button)
- Tab switch transitions
- Panel open/close animations
- Confirm all skeleton-to-content transitions use fade-in

---

## Execution Order

```
Chunk 1 (Design System)  ──→  Chunk 2 (Forms/Filters)
         │                              │
         └──────── Chunk 3 (Terminology) ──→ Chunk 4 (Onboarding)
                                                      │
                                              Chunk 5 (Editor Refactor)
                                                      │
                                              Chunk 6 (Polish)
```

Each chunk delivers as a complete unit with passing tests, type-check, and lint. User reviews and approves before next chunk begins.

## Verification

After each chunk:
```bash
pnpm type-check    # TypeScript
pnpm test          # Vitest
pnpm lint          # ESLint
pnpm build         # Full build
```
