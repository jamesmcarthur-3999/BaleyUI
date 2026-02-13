# UX Consolidation & Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate duplicated UI patterns, fix the first-time user journey, refactor the editor monolith, and polish animations — delivering in 6 chunks with review gates between each.

**Architecture:** Bottom-up consolidation. Chunks 1-2 create shared components. Chunks 3-4 use them for terminology fixes and onboarding. Chunk 5 refactors the editor. Chunk 6 adds animation choreography.

**Tech Stack:** Next.js 15, React 19 (compiler — no manual memo), Tailwind CSS, CVA, Radix UI, tRPC, Vitest

**Design doc:** `docs/plans/2026-02-12-ux-consolidation-and-polish-design.md`

---

## Chunk 1: Design System Consolidation

### Task 1.1: Unified StatusBadge Component

**Files:**
- Create: `apps/web/src/components/ui/unified-status-badge.tsx`
- Test: `apps/web/src/components/ui/__tests__/unified-status-badge.test.tsx`

**Step 1: Write the failing tests**

```tsx
// apps/web/src/components/ui/__tests__/unified-status-badge.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { UnifiedStatusBadge } from '../unified-status-badge';

describe('UnifiedStatusBadge', () => {
  describe('execution domain', () => {
    it('renders pending status with clock icon', () => {
      render(<UnifiedStatusBadge status="pending" domain="execution" />);
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('renders running status with spinner animation', () => {
      const { container } = render(<UnifiedStatusBadge status="running" domain="execution" />);
      expect(screen.getByText('Running')).toBeInTheDocument();
      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });

    it('renders completed status', () => {
      render(<UnifiedStatusBadge status="completed" domain="execution" />);
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('renders failed status', () => {
      render(<UnifiedStatusBadge status="failed" domain="execution" />);
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    it('renders cancelled status', () => {
      render(<UnifiedStatusBadge status="cancelled" domain="execution" />);
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });
  });

  describe('lifecycle domain', () => {
    it('renders draft status', () => {
      render(<UnifiedStatusBadge status="draft" domain="lifecycle" />);
      expect(screen.getByText('Draft')).toBeInTheDocument();
    });

    it('renders active status', () => {
      render(<UnifiedStatusBadge status="active" domain="lifecycle" />);
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('renders paused status', () => {
      render(<UnifiedStatusBadge status="paused" domain="lifecycle" />);
      expect(screen.getByText('Paused')).toBeInTheDocument();
    });

    it('renders error status', () => {
      render(<UnifiedStatusBadge status="error" domain="lifecycle" />);
      expect(screen.getByText('Error')).toBeInTheDocument();
    });
  });

  describe('connection domain', () => {
    it('renders connected dot by default', () => {
      const { container } = render(<UnifiedStatusBadge status="connected" domain="connection" />);
      expect(container.querySelector('.rounded-full')).toBeInTheDocument();
    });

    it('renders error dot', () => {
      render(<UnifiedStatusBadge status="error" domain="connection" />);
      // Should render without crashing
    });
  });

  describe('variant prop', () => {
    it('renders dot variant without text', () => {
      render(<UnifiedStatusBadge status="completed" domain="execution" variant="dot" />);
      expect(screen.queryByText('Completed')).not.toBeInTheDocument();
    });

    it('renders icon-only variant without text', () => {
      render(<UnifiedStatusBadge status="completed" domain="execution" variant="icon-only" />);
      expect(screen.queryByText('Completed')).not.toBeInTheDocument();
    });

    it('renders badge variant with text', () => {
      render(<UnifiedStatusBadge status="completed" domain="execution" variant="badge" />);
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });
  });

  describe('size prop', () => {
    it('renders sm size', () => {
      const { container } = render(<UnifiedStatusBadge status="completed" domain="execution" size="sm" />);
      expect(container.firstChild).toHaveClass('text-[10px]');
    });

    it('renders default size', () => {
      const { container } = render(<UnifiedStatusBadge status="completed" domain="execution" />);
      expect(container.firstChild).toHaveClass('text-xs');
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/web/src/components/ui/__tests__/unified-status-badge.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement UnifiedStatusBadge**

```tsx
// apps/web/src/components/ui/unified-status-badge.tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  Clock, Loader2, CheckCircle, XCircle, Ban,
  FileQuestion, Zap, Pause, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// --- Status domain types ---
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type LifecycleStatus = 'draft' | 'active' | 'paused' | 'error';
export type ConnectionStatus = 'connected' | 'error' | 'unconfigured' | 'pending';
export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'complete' | 'error' | 'cancelled';
export type StatusDomain = 'execution' | 'lifecycle' | 'connection' | 'stream';

type AnyStatus = ExecutionStatus | LifecycleStatus | ConnectionStatus | StreamStatus;

// --- Config ---
interface StatusConfig {
  icon: typeof Clock;
  label: string;
  badgeClass: string;
  dotClass: string;
  animate?: string;
}

const STATUS_CONFIGS: Record<string, StatusConfig> = {
  // Execution
  pending:   { icon: Clock, label: 'Pending', badgeClass: 'bg-muted text-muted-foreground', dotClass: 'bg-muted-foreground' },
  running:   { icon: Loader2, label: 'Running', badgeClass: 'bg-blue-500 text-white', dotClass: 'bg-blue-500', animate: 'animate-spin' },
  completed: { icon: CheckCircle, label: 'Completed', badgeClass: 'bg-emerald-500 text-white', dotClass: 'bg-emerald-500' },
  failed:    { icon: XCircle, label: 'Failed', badgeClass: 'bg-destructive text-destructive-foreground', dotClass: 'bg-red-500' },
  cancelled: { icon: Ban, label: 'Cancelled', badgeClass: 'bg-amber-500 text-white', dotClass: 'bg-amber-500' },
  // Lifecycle
  draft:     { icon: FileQuestion, label: 'Draft', badgeClass: 'bg-muted text-muted-foreground', dotClass: 'bg-muted-foreground' },
  active:    { icon: Zap, label: 'Active', badgeClass: 'bg-emerald-500 text-white', dotClass: 'bg-emerald-500' },
  paused:    { icon: Pause, label: 'Paused', badgeClass: 'bg-amber-500 text-white', dotClass: 'bg-amber-500' },
  error:     { icon: AlertCircle, label: 'Error', badgeClass: 'bg-destructive text-destructive-foreground', dotClass: 'bg-red-500' },
  // Connection
  connected:    { icon: CheckCircle, label: 'Connected', badgeClass: 'bg-emerald-500 text-white', dotClass: 'bg-emerald-500' },
  unconfigured: { icon: Clock, label: 'Unconfigured', badgeClass: 'bg-muted text-muted-foreground', dotClass: 'bg-muted-foreground' },
  // Stream
  idle:       { icon: Clock, label: 'Ready', badgeClass: 'bg-muted text-muted-foreground', dotClass: 'bg-muted-foreground' },
  connecting: { icon: Loader2, label: 'Connecting', badgeClass: 'bg-amber-500 text-white', dotClass: 'bg-amber-500', animate: 'animate-spin' },
  streaming:  { icon: Zap, label: 'Streaming', badgeClass: 'bg-blue-500 text-white', dotClass: 'bg-blue-500', animate: 'animate-pulse' },
  complete:   { icon: CheckCircle, label: 'Complete', badgeClass: 'bg-emerald-500 text-white', dotClass: 'bg-emerald-500' },
};

// --- Variants ---
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border border-transparent font-semibold transition-colors',
  {
    variants: {
      size: {
        xs: 'px-1.5 py-0 text-[10px]',
        sm: 'px-2 py-0 text-[10px]',
        default: 'px-2.5 py-0.5 text-xs',
      },
    },
    defaultVariants: { size: 'default' },
  }
);

// --- Component ---
export interface UnifiedStatusBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  status: AnyStatus;
  domain?: StatusDomain;
  variant?: 'badge' | 'dot' | 'icon-only';
  size?: 'xs' | 'sm' | 'default';
}

function UnifiedStatusBadge({
  status,
  domain,
  variant = 'badge',
  size = 'default',
  className,
  ...props
}: UnifiedStatusBadgeProps) {
  const config = STATUS_CONFIGS[status];
  if (!config) return null;

  const Icon = config.icon;
  const iconSize = size === 'xs' ? 'h-2.5 w-2.5' : size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  // Dot variant
  if (variant === 'dot') {
    return (
      <span
        className={cn('inline-block h-2 w-2 rounded-full', config.dotClass, config.animate, className)}
        title={config.label}
        {...props}
      />
    );
  }

  // Icon-only variant
  if (variant === 'icon-only') {
    return (
      <span className={cn('inline-flex', className)} title={config.label} {...props}>
        <Icon className={cn(iconSize, config.animate)} />
      </span>
    );
  }

  // Badge variant (default)
  return (
    <div className={cn(badgeVariants({ size }), config.badgeClass, className)} {...props}>
      <Icon className={cn(iconSize, config.animate)} />
      <span>{config.label}</span>
    </div>
  );
}

export { UnifiedStatusBadge };
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run apps/web/src/components/ui/__tests__/unified-status-badge.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/ui/unified-status-badge.tsx apps/web/src/components/ui/__tests__/unified-status-badge.test.tsx
git commit -m "feat: add UnifiedStatusBadge component covering all status domains"
```

---

### Task 1.2: Migrate Inline Status Badges to UnifiedStatusBadge

**Files to modify (one by one, test after each):**
- `apps/web/src/components/baleybots/BaleybotCard.tsx` — replace inline statusConfig with `<UnifiedStatusBadge domain="lifecycle" />`
- `apps/web/src/components/monitor/BotMonitorPanel.tsx` — replace local StatusBadge function with `<UnifiedStatusBadge domain="execution" size="xs" />`
- `apps/web/src/app/dashboard/baleybots/page.tsx` — replace `getExecutionStatusBadge()` and `getStatusTone()` with UnifiedStatusBadge
- `apps/web/src/components/creator/ExecutionHistory.tsx` — replace statusConfig with UnifiedStatusBadge
- `apps/web/src/components/baleybots/RecentActivityFeed.tsx` — replace StatusIcon with `<UnifiedStatusBadge variant="icon-only" />`
- `apps/web/src/components/companion/OrbMode.tsx` — replace statusIcons/statusColors with UnifiedStatusBadge
- `apps/web/src/components/capabilities/ConnectionCard.tsx` — replace StatusDot with `<UnifiedStatusBadge variant="dot" domain="connection" />`

**For each file:**

**Step 1:** Read the file and identify the inline status pattern
**Step 2:** Replace with `<UnifiedStatusBadge status={...} domain={...} variant={...} />`
**Step 3:** Delete the local statusConfig/StatusBadge/StatusDot function
**Step 4:** Run `pnpm type-check` to verify
**Step 5:** Run `pnpm vitest run` to verify no test regressions
**Step 6:** Commit after each 2-3 files migrated

---

### Task 1.3: Delete Dead Skeleton Code

**Files:**
- Delete: `apps/web/src/components/creator/LoadingStates.tsx`
- Verify: No imports exist

**Step 1: Verify no imports**

Run: `grep -r "LoadingStates" apps/web/src/ --include="*.tsx" --include="*.ts" -l`
Expected: Only `LoadingStates.tsx` itself (or nothing)

Also run: `grep -r "from.*creator/LoadingStates" apps/web/src/ --include="*.tsx" --include="*.ts"`
Expected: No matches

**Step 2: Delete the file**

Delete `apps/web/src/components/creator/LoadingStates.tsx`

**Step 3: Move loading components to ui/**

Move `components/loading/DetailSkeleton.tsx` and `components/loading/DashboardSkeleton.tsx` into `components/ui/`.
Update `components/loading/index.ts` to re-export from new locations (backward compat).
Update any direct imports.

**Step 4: Run type-check and tests**

Run: `pnpm type-check && pnpm vitest run`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: delete dead LoadingStates module, consolidate skeleton components"
```

---

### Task 1.4: Dialog Size Standardization

**Files:**
- Modify: `apps/web/src/components/ui/dialog.tsx`

**Step 1: Add size prop to DialogContent**

Add a `size` prop that maps to standard max-w classes. Default remains `max-w-lg`.

```tsx
// In dialog.tsx, update DialogContent:
interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const DIALOG_SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
} as const;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, size = 'lg', ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-full translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200',
        'max-h-[85vh]',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg',
        DIALOG_SIZES[size],
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
```

**Step 2: Update dialog usages to use the new size prop**

Replace explicit `max-w-*` classes with `size` prop:
- `KeyboardShortcutsDialog.tsx`: `max-w-md` → `size="md"`
- `ApproveAndRememberDialog.tsx`: `max-w-lg` → `size="lg"` (default, can remove)
- `MCPCustomDialog.tsx`: `max-w-md` → `size="md"`
- `MCPLibraryDialog.tsx`: `max-w-2xl` → `size="xl"`
- `AddConnectionDialog.tsx`: `max-w-2xl` → `size="xl"`
- `api-keys/page.tsx` (create): `max-w-md` → `size="md"`
- `api-keys/page.tsx` (show): `max-w-2xl` → `size="xl"`
- `tools/page.tsx`: `max-w-lg` → `size="lg"` (default)

Also remove any `max-h-[90vh]` or `max-h-[80vh]` overrides — the base now handles this.

**Step 3: Run type-check and tests**

Run: `pnpm type-check && pnpm vitest run`

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: standardize dialog sizes with size prop (sm/md/lg/xl)"
```

---

### Task 1.5: PageShell Component

**Files:**
- Create: `apps/web/src/components/layout/page-shell.tsx`
- Test: `apps/web/src/components/layout/__tests__/page-shell.test.tsx`

**Step 1: Write tests**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PageShell } from '../page-shell';

describe('PageShell', () => {
  it('renders title and description', () => {
    render(
      <PageShell title="BaleyBots" description="Manage your bots">
        <div>Content</div>
      </PageShell>
    );
    expect(screen.getByText('BaleyBots')).toBeInTheDocument();
    expect(screen.getByText('Manage your bots')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders actions in header', () => {
    render(
      <PageShell title="Test" actions={<button>New</button>}>
        <div>Content</div>
      </PageShell>
    );
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('renders without header when no title/description', () => {
    render(
      <PageShell>
        <div>Content only</div>
      </PageShell>
    );
    expect(screen.getByText('Content only')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('applies constrained container', () => {
    const { container } = render(
      <PageShell container="constrained">
        <div>Content</div>
      </PageShell>
    );
    expect(container.firstChild).toHaveClass('max-w-2xl');
  });
});
```

**Step 2: Implement PageShell**

```tsx
// apps/web/src/components/layout/page-shell.tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const CONTAINERS = {
  standard: 'container py-8 md:py-10',
  constrained: 'max-w-2xl space-y-6 py-8 md:py-10 px-4',
  none: '',
} as const;

export interface PageShellProps {
  title?: string | React.ReactNode;
  titleSize?: '3xl' | '2xl';
  description?: string | React.ReactNode;
  actions?: React.ReactNode;
  container?: keyof typeof CONTAINERS;
  className?: string;
  children: React.ReactNode;
}

export function PageShell({
  title,
  titleSize = '3xl',
  description,
  actions,
  container = 'standard',
  className,
  children,
}: PageShellProps) {
  const hasHeader = title || description;
  const titleClass = titleSize === '3xl' ? 'text-3xl' : 'text-2xl';

  return (
    <div className={cn(CONTAINERS[container], className)}>
      <div className="flex flex-col gap-6 md:gap-8">
        {hasHeader && (
          <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              {title && (
                <h1 className={cn(titleClass, 'font-bold tracking-tight')}>
                  {title}
                </h1>
              )}
              {description && (
                <p className="text-muted-foreground">{description}</p>
              )}
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
          </header>
        )}
        {children}
      </div>
    </div>
  );
}
```

**Step 3: Run tests**

Run: `pnpm vitest run apps/web/src/components/layout/__tests__/page-shell.test.tsx`

**Step 4: Migrate first page (Activity) as proof of concept**

Replace the manual layout in `apps/web/src/app/dashboard/activity/page.tsx` with PageShell.

**Step 5: Run full type-check and tests**

Run: `pnpm type-check && pnpm vitest run`

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add PageShell layout component, migrate Activity page"
```

---

### Task 1.6: Migrate Remaining Pages to PageShell

**Files to modify (one by one):**
- `apps/web/src/app/dashboard/baleybots/page.tsx` — wrap in PageShell (keep sidebar content as children)
- `apps/web/src/app/dashboard/analytics/page.tsx` — PageShell with `titleSize="2xl"`
- `apps/web/src/app/dashboard/admin/baleybots/page.tsx` — PageShell with icon in title
- `apps/web/src/app/dashboard/admin/shared-context/page.tsx` — PageShell
- `apps/web/src/app/dashboard/settings/approvals/page.tsx` — PageShell with smaller title

For each: replace, type-check, test, commit.

---

### Task 1.7: CSS Animation Cleanup

**Files:**
- Modify: `apps/web/src/app/globals.css`

**Step 1: Identify orphaned keyframes**

Search for each keyframe name in component files. Remove from globals.css if unused:
- `slide-in-right`, `bounce-subtle`, `progress-slide`, `wiggle`, `sparkle`
- `orb-pulse`, `orb-pulse-sm`, `orb-glow`, `sparkle-burst`
- `typing-shimmer`, `phase-pulse`, `meter-fill`, `pulse-validation`
- Duplicate `pulse-soft` (remove second definition)

**Step 2: Remove from globals.css and tailwind.config.ts**

Delete the `@keyframes` blocks and corresponding `animate-*` utility classes.

**Step 3: Add animate-fade-in to 5 worst transitions**

Add `animate-fade-in` class to:
1. BaleyBot card grid content (after loading): `baleybots/page.tsx`
2. Activity list items: `activity/page.tsx`
3. Recent activity feed wrapper: `RecentActivityFeed.tsx`
4. BaleyBot table view wrapper: `baleybots/page.tsx`
5. Dynamic import wrappers in editor: `baleybots/[id]/page.tsx`

**Step 4: Run type-check and tests**

Run: `pnpm type-check && pnpm vitest run`

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove 17 orphaned CSS keyframes, add fade-in transitions"
```

---

### Task 1.8: Chunk 1 Review Gate

**Step 1: Run full verification**

```bash
pnpm type-check && pnpm test && pnpm lint && pnpm build
```

**Step 2: Review all changes**

Verify:
- UnifiedStatusBadge replaces all inline patterns
- Dead LoadingStates code is gone
- Dialog sizes are standardized
- PageShell is used on 6+ pages
- Orphaned animations are removed
- Fade-in transitions work on skeleton-to-content swaps

**Step 3: Get user approval before proceeding to Chunk 2**

---

## Chunk 2: Forms, Filters & Shared Patterns

### Task 2.1: FilterBar Component

**Files:**
- Create: `apps/web/src/components/ui/filter-bar.tsx`
- Test: `apps/web/src/components/ui/__tests__/filter-bar.test.tsx`

**Step 1: Write tests for FilterBar**

Test that it renders search input, filter dropdowns, action buttons, view mode toggle, and results summary.

**Step 2: Implement FilterBar**

A compound component with search, filters, actions, viewMode, and resultsSummary props. Two variants: `card` (bordered wrapper) and `inline` (no wrapper).

**Step 3: Migrate BaleyBots page filters to FilterBar**
**Step 4: Migrate Activity page filters to FilterBar**
**Step 5: Run verification, commit**

---

### Task 2.2: Button Loading State

**Files:**
- Modify: `apps/web/src/components/ui/button.tsx`

**Step 1: Add `loading` prop to Button**

```tsx
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

// In render: when loading is true, prepend Loader2 icon and set disabled
```

**Step 2: Replace manual `{isSaving ? <Loader2 .../> : ...}` patterns across the codebase**
**Step 3: Run verification, commit**

---

### Task 2.3: FormFieldGroup Component

**Files:**
- Create: `apps/web/src/components/ui/form-field-group.tsx`
- Test: `apps/web/src/components/ui/__tests__/form-field-group.test.tsx`

Wrapper component providing consistent label + description + error + children layout. Supports `vertical` and `horizontal` (for switches) layouts.

**Step 1: Write tests**
**Step 2: Implement**
**Step 3: Migrate 2-3 forms as proof of concept**
**Step 4: Run verification, commit**

---

### Task 2.4: Chunk 2 Review Gate

Run full verification. Get user approval.

---

## Chunk 3: Terminology & Navigation

### Task 3.1: Rename "Capabilities" to "Integrations"

**Files:**
- Modify: `apps/web/src/components/layout/sidebar.tsx:200` — change label
- Modify: `apps/web/src/app/dashboard/capabilities/layout.tsx` — change heading text (if exists)
- Leave route paths unchanged to avoid URL breakage

**Step 1: Update sidebar label**

In `sidebar.tsx:200`, change `"Capabilities"` to `"Integrations"`.

**Step 2: Update any page headings that reference "Capabilities"**

**Step 3: Run tests, commit**

---

### Task 3.2: Simplify "Execution" to "Run" in User-Facing Text

**Files to modify (text-only changes):**
- `apps/web/src/app/dashboard/activity/page.tsx` — heading, description, filter labels
- `apps/web/src/app/dashboard/activity/executions/[id]/page.tsx` — heading
- `apps/web/src/app/dashboard/analytics/page.tsx` — card titles
- Keep internal variable names as `execution`

**Step 1: Find and replace user-facing text**
**Step 2: Run tests, commit**

---

### Task 3.3: Chunk 3 Review Gate

Run full verification. Get user approval.

---

## Chunk 4: Onboarding & First-Run Experience

### Task 4.1: AI Credentials Step in Onboarding

**Files:**
- Modify: `apps/web/src/app/(onboarding)/onboarding/page.tsx`

**Step 1: Add new step type and state**

Add `'connect-ai'` to the `Step` type. After workspace creation succeeds, transition to `'connect-ai'` instead of redirecting.

**Step 2: Create the connect-ai step UI**

Render a simple form: provider select (OpenAI/Anthropic) + API key input + "Connect" button + "Skip for now" link.

**Step 3: Wire up the connection creation**

Use the existing tRPC `connections.create` mutation to create the AI connection.

**Step 4: Update progress indicator**

Change from 2 dots to 3 dots, highlighting the active step.

**Step 5: Handle skip**

"Skip for now" navigates to BaleyBots list with a toast warning: "You'll need to connect an AI provider before creating your first BaleyBot."

**Step 6: Write tests, run verification, commit**

---

### Task 4.2: Pre-Flight Check on BaleyBots Empty State

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/page.tsx`

**Step 1: Query workspace connections for AI providers**

Add a tRPC query checking if the workspace has any AI provider connections (openai, anthropic, ollama).

**Step 2: Show warning banner when no AI provider**

Above the empty state, show a prominent banner:
```tsx
<div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
  <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
  <div className="flex-1">
    <p className="text-sm font-medium">Connect an AI provider to start building</p>
    <p className="text-xs text-muted-foreground">BaleyBots need an AI provider like OpenAI or Anthropic to work.</p>
  </div>
  <Button size="sm" asChild>
    <Link href={ROUTES.capabilities.connections}>Set Up</Link>
  </Button>
</div>
```

**Step 3: Run verification, commit**

---

### Task 4.3: Actionable Creator Error Messages

**Files:**
- Modify: `apps/web/src/app/api/baleybots/creator/stream/route.ts`
- Modify: `apps/web/src/lib/baleybot/services/ai-credentials-service.ts`

**Step 1: Detect missing-credentials error specifically**

In `ai-credentials-service.ts`, when no provider config is found, throw a typed error: `new MissingCredentialsError('No AI provider configured')`.

**Step 2: Catch and return user-friendly error in stream route**

In the creator stream route error handler, check for `MissingCredentialsError` and send a specific SSE event with an actionable message and a link to the Connections page.

**Step 3: Run verification, commit**

---

### Task 4.4: Chunk 4 Review Gate

Run full verification. Get user approval.

---

## Chunk 5: Editor Refactor

### Task 5.1: Extract Streaming Logic

**Files:**
- Create: `apps/web/src/lib/baleybot/creator-streaming.ts`
- Create: `apps/web/src/lib/baleybot/creator-response-handler.ts`
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`
- Test: `apps/web/src/lib/baleybot/__tests__/creator-streaming.test.ts`

**Step 1: Extract `startCreatorStream` (lines ~580-848)**

Move to `creator-streaming.ts` as a pure async function that:
- Accepts state values and callbacks (onStreamingText, onAgentEvent, onComplete, etc.)
- Returns an abort function
- Does NOT call setState directly

**Step 2: Extract `applyCreatorResult` (lines ~850-1030)**

Move to `creator-response-handler.ts` as a pure function that:
- Accepts the raw result and current state
- Returns a state update object `{ entities, balCode, messages, name, ... }`

**Step 3: Update page to call the extracted functions**

Replace inline logic with calls to the extracted functions, wiring state setters as callbacks.

**Step 4: Write unit tests for the pure functions**
**Step 5: Run full verification, commit**

---

### Task 5.2: Extract Persistence Logic

**Files:**
- Create: `apps/web/src/hooks/useBaleybotPersistence.ts`
- Create: `apps/web/src/hooks/useSessionRecovery.ts`
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Step 1:** Extract `handleSave`, `handleConflictAction`, auto-save effect into `useBaleybotPersistence` hook.
**Step 2:** Extract session persist/restore/cleanup into `useSessionRecovery` hook.
**Step 3:** Wire hooks into page component.
**Step 4:** Run verification, commit.

---

### Task 5.3: Extract Navigation State

**Files:**
- Create: `apps/web/src/hooks/useEditorNavigation.ts`
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Step 1:** Extract `viewMode`, `builderMode`, `mobileView`, tab computation, `navigateToTab` into `useEditorNavigation` hook.
**Step 2:** Wire hook into page.
**Step 3:** Run verification, commit.

---

### Task 5.4: Readiness as Derived State

**Files:**
- Create: `apps/web/src/hooks/useReadiness.ts`
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Step 1:** Create `useReadiness` hook that computes readiness from inputs on every render (React 19 compiler handles memoization).
**Step 2:** Remove `setReadiness` state and readiness effects from page.
**Step 3:** Run verification, commit.

---

### Task 5.5: Lazy-Load Editor Panels

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Step 1:** Add dynamic imports for `IntegrationDashboard`, `BotMonitorPanel`, `AdaptiveTestSurface`.
**Step 2:** Run build to verify bundle splitting.
**Step 3:** Commit.

---

### Task 5.6: Chunk 5 Review Gate

Run full verification. Confirm page size reduced by ~38%. Get user approval.

---

## Chunk 6: Animation Choreography & Polish

### Task 6.1: Choreography System

**Files:**
- Create: `apps/web/src/lib/animations/choreography.ts`
- Create: `apps/web/src/hooks/useAnimationSequence.ts`
- Create: `apps/web/src/lib/animations/sequences.ts`
- Test: `apps/web/src/lib/animations/__tests__/choreography.test.ts`

**Step 1: Write tests for choreography utilities**
**Step 2: Implement `applySequence()` and `useAnimationSequence` hook**
**Step 3: Define preset sequences (cardGrid, listLoad, hero)**
**Step 4: Migrate RecentActivityFeed stagger to use choreography**
**Step 5: Migrate landing page hero to use heroSequence**
**Step 6: Run verification, commit**

---

### Task 6.2: Final Polish Pass

**Files:** Various

**Step 1:** Add save feedback animation (brief green flash on save button)
**Step 2:** Add smooth tab switch transitions in editor
**Step 3:** Verify all skeleton-to-content transitions have fade-in
**Step 4:** Final full verification

```bash
pnpm type-check && pnpm test && pnpm lint && pnpm build
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: animation choreography system and final polish pass"
```

---

### Task 6.3: Chunk 6 Review Gate

Run full verification. Get user approval. Ship it.

---

## Summary

| Chunk | Tasks | Estimated Commits | Key Deliverable |
|-------|-------|-------------------|-----------------|
| 1 | 1.1-1.8 | 6-8 | Unified status badges, clean skeletons, dialog sizes, PageShell, animation cleanup |
| 2 | 2.1-2.4 | 3-4 | FilterBar, button loading, FormFieldGroup |
| 3 | 3.1-3.3 | 2-3 | "Integrations" rename, "Run" terminology |
| 4 | 4.1-4.4 | 3-4 | Onboarding AI step, pre-flight check, actionable errors |
| 5 | 5.1-5.6 | 5-6 | Editor 38% reduction, lazy loading |
| 6 | 6.1-6.3 | 2-3 | Choreography system, final polish |
