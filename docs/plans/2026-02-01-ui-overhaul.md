# UI Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform BaleyUI from a cluttered feature-oriented interface to a clean, job-oriented experience following the "Invisible UI" and "Stay in Place" design principles.

**Architecture:** Build new design system components first (ConfirmButton, InlineEdit, SlidePanel, etc.), then overhaul the shell (minimal nav, enhanced command palette), then update each feature area to use the new patterns. All changes follow the interaction hierarchy: inline → transform → popover → panel → modal.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Radix UI primitives, class-variance-authority, Lucide icons

**Reference:** `docs/reference/design-system.md` for all design patterns and component specifications.

---

## Phase 1: Core Design System Components

Build the foundational components that enforce our interaction patterns.

---

### Task 1: Create ConfirmButton Component

Transform pattern for destructive actions - no modals for delete.

**Files:**
- Create: `apps/web/src/components/ui/confirm-button.tsx`
- Modify: `apps/web/src/components/ui/index.ts`

**Step 1: Create the component file**

```tsx
'use client';

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from './button';
import { X } from 'lucide-react';

interface ConfirmButtonProps extends Omit<ButtonProps, 'onClick'> {
  /** Label shown in default state */
  label: string;
  /** Label shown in confirming state */
  confirmLabel?: string;
  /** Called when user confirms (second click) */
  onConfirm: () => void | Promise<void>;
  /** Keyboard shortcut hint shown on hover */
  shortcut?: string;
  /** Time in ms before reverting to default state */
  timeout?: number;
  /** Icon to show in default state */
  icon?: React.ReactNode;
}

type ConfirmState = 'default' | 'confirming' | 'loading';

const ConfirmButton = React.forwardRef<HTMLButtonElement, ConfirmButtonProps>(
  (
    {
      label,
      confirmLabel = 'Confirm',
      onConfirm,
      shortcut,
      timeout = 3000,
      icon,
      variant = 'ghost',
      size = 'sm',
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const [state, setState] = useState<ConfirmState>('default');
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Clear timeout on unmount
    useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, []);

    // Reset to default after timeout
    useEffect(() => {
      if (state === 'confirming') {
        timeoutRef.current = setTimeout(() => {
          setState('default');
        }, timeout);
      }
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, [state, timeout]);

    const handleClick = async () => {
      if (state === 'default') {
        setState('confirming');
      } else if (state === 'confirming') {
        setState('loading');
        try {
          await onConfirm();
        } finally {
          setState('default');
        }
      }
    };

    const handleCancel = (e: React.MouseEvent) => {
      e.stopPropagation();
      setState('default');
    };

    // Handle click outside to cancel
    const buttonRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      if (state !== 'confirming') return;

      const handleClickOutside = (e: MouseEvent) => {
        if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
          setState('default');
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [state]);

    if (state === 'confirming') {
      return (
        <div ref={buttonRef} className="inline-flex items-center gap-1">
          <Button
            variant="ghost"
            size={size}
            onClick={handleCancel}
            className={cn('text-muted-foreground', className)}
          >
            {label}?
            <X className="h-3 w-3 ml-1" />
          </Button>
          <Button
            ref={ref}
            variant="destructive"
            size={size}
            onClick={handleClick}
            className={className}
            {...props}
          >
            {confirmLabel}
          </Button>
        </div>
      );
    }

    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        onClick={handleClick}
        disabled={disabled || state === 'loading'}
        className={cn(
          'group relative',
          variant === 'ghost' && 'text-muted-foreground hover:text-destructive',
          className
        )}
        title={shortcut ? `${label} (${shortcut})` : label}
        {...props}
      >
        {state === 'loading' ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          icon
        )}
        <span>{label}</span>
        {shortcut && (
          <kbd className="hidden group-hover:inline-flex ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground">
            {shortcut}
          </kbd>
        )}
      </Button>
    );
  }
);

ConfirmButton.displayName = 'ConfirmButton';

export { ConfirmButton, type ConfirmButtonProps };
```

**Step 2: Export from index**

Add to `apps/web/src/components/ui/index.ts`:

```typescript
// After "Buttons & Actions" section
export { ConfirmButton, type ConfirmButtonProps } from './confirm-button';
```

**Step 3: Test manually**

Run dev server and test the component:
- First click shows confirmation state
- Second click executes action
- Click outside reverts to default
- Timeout reverts to default
- Keyboard shortcut shows on hover

**Step 4: Commit**

```bash
git add apps/web/src/components/ui/confirm-button.tsx apps/web/src/components/ui/index.ts
git commit -m "feat(ui): add ConfirmButton with transform pattern

Implements two-click delete without modal dialogs.
Follows design system interaction hierarchy."
```

---

### Task 2: Create InlineEdit Component

Click-to-edit pattern for text fields without modals.

**Files:**
- Create: `apps/web/src/components/ui/inline-edit.tsx`
- Modify: `apps/web/src/components/ui/index.ts`

**Step 1: Create the component file**

```tsx
'use client';

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Input } from './input';
import { Button } from './button';
import { Check, X, Pencil } from 'lucide-react';

interface InlineEditProps {
  /** Current value */
  value: string;
  /** Called when value is saved */
  onSave: (value: string) => void | Promise<void>;
  /** Placeholder when empty */
  placeholder?: string;
  /** Additional class for the container */
  className?: string;
  /** Additional class for the display text */
  textClassName?: string;
  /** Additional class for the input */
  inputClassName?: string;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Maximum length */
  maxLength?: number;
  /** Validate input, return error message or undefined */
  validate?: (value: string) => string | undefined;
}

type EditState = 'display' | 'editing' | 'saving';

function InlineEdit({
  value,
  onSave,
  placeholder = 'Click to edit...',
  className,
  textClassName,
  inputClassName,
  disabled = false,
  maxLength,
  validate,
}: InlineEditProps) {
  const [state, setState] = useState<EditState>('display');
  const [editValue, setEditValue] = useState(value);
  const [error, setError] = useState<string | undefined>();
  const [showFlash, setShowFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update edit value when prop changes
  useEffect(() => {
    if (state === 'display') {
      setEditValue(value);
    }
  }, [value, state]);

  // Focus and select on edit
  useEffect(() => {
    if (state === 'editing' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [state]);

  const startEditing = () => {
    if (disabled) return;
    setEditValue(value);
    setError(undefined);
    setState('editing');
  };

  const handleSave = async () => {
    const trimmed = editValue.trim();

    // Validate
    if (validate) {
      const validationError = validate(trimmed);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    // No change
    if (trimmed === value) {
      setState('display');
      return;
    }

    setState('saving');
    try {
      await onSave(trimmed);
      setState('display');
      // Show save flash
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 400);
    } catch {
      setError('Failed to save');
      setState('editing');
    }
  };

  const handleCancel = () => {
    setEditValue(value);
    setError(undefined);
    setState('display');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  if (state === 'editing' || state === 'saving') {
    return (
      <div className={cn('inline-flex items-center gap-1', className)}>
        <div className="relative">
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => {
              setEditValue(e.target.value);
              setError(undefined);
            }}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            disabled={state === 'saving'}
            maxLength={maxLength}
            className={cn(
              'h-8 py-1 px-2',
              error && 'border-destructive focus-visible:ring-destructive',
              inputClassName
            )}
            aria-invalid={!!error}
          />
          {error && (
            <p className="absolute -bottom-5 left-0 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleSave}
          disabled={state === 'saving'}
        >
          {state === 'saving' ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Check className="h-3.5 w-3.5 text-green-600" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleCancel}
          disabled={state === 'saving'}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={disabled}
      className={cn(
        'group inline-flex items-center gap-2 rounded px-1 -mx-1 transition-colors',
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        showFlash && 'animate-pulse bg-green-500/10',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <span
        className={cn(
          'text-sm',
          !value && 'text-muted-foreground italic',
          textClassName
        )}
      >
        {value || placeholder}
      </span>
      <Pencil
        className={cn(
          'h-3 w-3 text-muted-foreground opacity-0 transition-opacity',
          'group-hover:opacity-100 group-focus-visible:opacity-100'
        )}
      />
    </button>
  );
}

export { InlineEdit, type InlineEditProps };
```

**Step 2: Export from index**

Add to `apps/web/src/components/ui/index.ts`:

```typescript
// After ConfirmButton
export { InlineEdit, type InlineEditProps } from './inline-edit';
```

**Step 3: Test manually**

- Click text to enter edit mode
- Enter saves, Escape cancels
- Click outside saves (blur)
- Validation shows error inline
- Green flash on successful save

**Step 4: Commit**

```bash
git add apps/web/src/components/ui/inline-edit.tsx apps/web/src/components/ui/index.ts
git commit -m "feat(ui): add InlineEdit for click-to-edit pattern

Enables editing text values without opening modals.
Includes validation, save flash, and keyboard shortcuts."
```

---

### Task 3: Create SlidePanel Component

Right-sliding panel for configuration without full modals.

**Files:**
- Create: `apps/web/src/components/ui/slide-panel.tsx`
- Modify: `apps/web/src/components/ui/index.ts`

**Step 1: Create the component file**

```tsx
'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SlidePanelProps {
  /** Whether the panel is open */
  open: boolean;
  /** Called when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Panel title */
  title: string;
  /** Optional description below title */
  description?: string;
  /** Panel content */
  children: React.ReactNode;
  /** Footer content (typically action buttons) */
  footer?: React.ReactNode;
  /** Panel width: 'narrow' (420px), 'default' (560px), 'wide' (720px) */
  width?: 'narrow' | 'default' | 'wide';
  /** Additional class for the panel */
  className?: string;
}

const widthClasses = {
  narrow: 'max-w-[420px]',
  default: 'max-w-[560px]',
  wide: 'max-w-[720px]',
};

function SlidePanel({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 'default',
  className,
}: SlidePanelProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Backdrop */}
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/50',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        />

        {/* Panel */}
        <DialogPrimitive.Content
          className={cn(
            'fixed right-0 top-0 z-50 h-full w-full',
            widthClasses[width],
            'flex flex-col bg-background shadow-xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
            'duration-200',
            className
          )}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
            <div className="space-y-1">
              <DialogPrimitive.Title className="text-lg font-semibold">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-sm text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              className={cn(
                'rounded-sm opacity-70 ring-offset-background transition-opacity',
                'hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                'disabled:pointer-events-none'
              )}
            >
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// Convenience components for common footer patterns
function SlidePanelFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-end gap-2', className)}>
      {children}
    </div>
  );
}

// Close button that auto-connects to panel
const SlidePanelClose = DialogPrimitive.Close;

export { SlidePanel, SlidePanelFooter, SlidePanelClose, type SlidePanelProps };
```

**Step 2: Export from index**

Add to `apps/web/src/components/ui/index.ts`:

```typescript
// After Cards & Containers section
export { SlidePanel, SlidePanelFooter, SlidePanelClose, type SlidePanelProps } from './slide-panel';
```

**Step 3: Test manually**

- Opens from right edge with animation
- Backdrop dims main content
- Escape or click outside closes
- Scrollable content area
- Sticky footer

**Step 4: Commit**

```bash
git add apps/web/src/components/ui/slide-panel.tsx apps/web/src/components/ui/index.ts
git commit -m "feat(ui): add SlidePanel for contextual configuration

Right-sliding panel preserves main context visibility.
Three width options: narrow, default, wide."
```

---

### Task 4: Create ActionPopover Component

Contextual menu anchored to trigger element.

**Files:**
- Create: `apps/web/src/components/ui/action-popover.tsx`
- Modify: `apps/web/src/components/ui/index.ts`

**Step 1: Create the component file**

```tsx
'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';
import { Input } from './input';
import { Search } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface ActionItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  destructive?: boolean;
  onSelect: () => void;
}

interface ActionGroup {
  label?: string;
  items: ActionItem[];
}

interface ActionPopoverProps {
  /** Trigger element */
  trigger: React.ReactNode;
  /** Actions to display (flat list or grouped) */
  actions: ActionItem[] | ActionGroup[];
  /** Whether to show search input */
  searchable?: boolean;
  /** Search placeholder */
  searchPlaceholder?: string;
  /** Alignment relative to trigger */
  align?: 'start' | 'center' | 'end';
  /** Side relative to trigger */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Additional class for the content */
  className?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function isGrouped(actions: ActionItem[] | ActionGroup[]): actions is ActionGroup[] {
  return actions.length > 0 && 'items' in actions[0];
}

function flattenActions(actions: ActionItem[] | ActionGroup[]): ActionItem[] {
  if (isGrouped(actions)) {
    return actions.flatMap(group => group.items);
  }
  return actions;
}

// ============================================================================
// COMPONENTS
// ============================================================================

function ActionPopover({
  trigger,
  actions,
  searchable = false,
  searchPlaceholder = 'Search...',
  align = 'start',
  side = 'bottom',
  className,
}: ActionPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

  // Filter actions based on search
  const filteredActions = React.useMemo(() => {
    if (!search) return actions;

    const query = search.toLowerCase();

    if (isGrouped(actions)) {
      return actions
        .map(group => ({
          ...group,
          items: group.items.filter(item =>
            item.label.toLowerCase().includes(query)
          ),
        }))
        .filter(group => group.items.length > 0);
    }

    return actions.filter(item =>
      item.label.toLowerCase().includes(query)
    );
  }, [actions, search]);

  // Reset search when closing
  React.useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const handleSelect = (item: ActionItem) => {
    item.onSelect();
    setOpen(false);
  };

  const allItems = flattenActions(actions);
  const showSearch = searchable && allItems.length > 5;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        {trigger}
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          side={side}
          sideOffset={4}
          className={cn(
            'z-50 min-w-[180px] max-w-[280px] rounded-md border bg-popover p-1 shadow-md',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2',
            'data-[side=left]:slide-in-from-right-2',
            'data-[side=right]:slide-in-from-left-2',
            'data-[side=top]:slide-in-from-bottom-2',
            className
          )}
        >
          {/* Search */}
          {showSearch && (
            <div className="px-1 pb-1 mb-1 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-8 pl-8 text-sm"
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Actions */}
          {isGrouped(filteredActions) ? (
            filteredActions.map((group, groupIndex) => (
              <div key={group.label || groupIndex}>
                {group.label && (
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    {group.label}
                  </div>
                )}
                {group.items.map((item) => (
                  <ActionMenuItem
                    key={item.id}
                    item={item}
                    onSelect={() => handleSelect(item)}
                  />
                ))}
                {groupIndex < filteredActions.length - 1 && (
                  <div className="my-1 h-px bg-border" />
                )}
              </div>
            ))
          ) : (
            filteredActions.map((item) => (
              <ActionMenuItem
                key={item.id}
                item={item}
                onSelect={() => handleSelect(item)}
              />
            ))
          )}

          {flattenActions(filteredActions).length === 0 && (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              No actions found
            </div>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function ActionMenuItem({
  item,
  onSelect,
}: {
  item: ActionItem;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={item.disabled}
      className={cn(
        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
        'outline-none transition-colors',
        'focus:bg-accent focus:text-accent-foreground',
        'hover:bg-accent hover:text-accent-foreground',
        item.disabled && 'opacity-50 cursor-not-allowed',
        item.destructive && 'text-destructive focus:text-destructive hover:text-destructive'
      )}
    >
      {item.icon && (
        <span className="h-4 w-4 shrink-0">{item.icon}</span>
      )}
      <span className="flex-1 text-left">{item.label}</span>
      {item.shortcut && (
        <kbd className="ml-2 text-xs text-muted-foreground font-mono">
          {item.shortcut}
        </kbd>
      )}
    </button>
  );
}

export { ActionPopover, type ActionPopoverProps, type ActionItem, type ActionGroup };
```

**Step 2: Install Radix Popover if needed**

```bash
cd apps/web && pnpm add @radix-ui/react-popover
```

**Step 3: Export from index**

Add to `apps/web/src/components/ui/index.ts`:

```typescript
// After Navigation & Menus section
export { ActionPopover, type ActionPopoverProps, type ActionItem, type ActionGroup } from './action-popover';
```

**Step 4: Test manually**

- Opens anchored to trigger
- Keyboard navigation works
- Search filters items (when searchable)
- Destructive items styled differently
- Click outside closes

**Step 5: Commit**

```bash
git add apps/web/src/components/ui/action-popover.tsx apps/web/src/components/ui/index.ts package.json pnpm-lock.yaml
git commit -m "feat(ui): add ActionPopover for contextual menus

Anchored popover with search, grouping, and keyboard shortcuts.
Replaces dropdown menus with better UX."
```

---

### Task 5: Create Kbd Component

Consistent keyboard shortcut display.

**Files:**
- Create: `apps/web/src/components/ui/kbd.tsx`
- Modify: `apps/web/src/components/ui/index.ts`

**Step 1: Create the component file**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  /** The key or key combination to display */
  children: React.ReactNode;
}

/**
 * Keyboard shortcut display component.
 * Automatically converts modifier keys based on OS.
 */
function Kbd({ children, className, ...props }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5',
        'text-[10px] font-mono font-medium text-muted-foreground',
        'shadow-[0_1px_0_1px_rgba(0,0,0,0.04)]',
        className
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}

/**
 * Hook to detect if user is on Mac
 */
function useIsMac() {
  const [isMac, setIsMac] = React.useState(false);

  React.useEffect(() => {
    setIsMac(navigator.platform.toLowerCase().includes('mac'));
  }, []);

  return isMac;
}

/**
 * Renders a keyboard shortcut with proper modifier for the OS.
 * Pass shortcut like "mod+k" and it renders ⌘K on Mac, Ctrl+K on Windows.
 */
function KeyboardShortcut({
  shortcut,
  className,
}: {
  shortcut: string;
  className?: string;
}) {
  const isMac = useIsMac();

  const formatted = React.useMemo(() => {
    return shortcut
      .replace(/mod/gi, isMac ? '⌘' : 'Ctrl')
      .replace(/alt/gi, isMac ? '⌥' : 'Alt')
      .replace(/shift/gi, isMac ? '⇧' : 'Shift')
      .replace(/ctrl/gi, isMac ? '⌃' : 'Ctrl')
      .replace(/\+/g, isMac ? '' : '+')
      .toUpperCase();
  }, [shortcut, isMac]);

  return <Kbd className={className}>{formatted}</Kbd>;
}

export { Kbd, KeyboardShortcut, useIsMac };
```

**Step 2: Export from index**

Add to `apps/web/src/components/ui/index.ts`:

```typescript
// After Data Display section
export { Kbd, KeyboardShortcut, useIsMac } from './kbd';
```

**Step 3: Commit**

```bash
git add apps/web/src/components/ui/kbd.tsx apps/web/src/components/ui/index.ts
git commit -m "feat(ui): add Kbd component for keyboard shortcuts

OS-aware keyboard shortcut display.
Converts mod+k to ⌘K on Mac, Ctrl+K on Windows."
```

---

## Phase 2: Navigation Shell Overhaul

Replace feature-oriented nav with minimal shell.

---

### Task 6: Create Minimal AppShell Layout

New layout with minimal top nav.

**Files:**
- Create: `apps/web/src/components/layout/app-shell.tsx`
- Create: `apps/web/src/components/layout/index.ts`

**Step 1: Create the AppShell component**

```tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { KeyboardShortcut } from '@/components/ui/kbd';
import {
  CompanionContainer,
  CommandPalette,
  useCommandPalette,
  ChatMode,
} from '@/components/companion';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/routes';

interface AppShellProps {
  children: React.ReactNode;
  /** Optional breadcrumb items */
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

function AppShell({ children, breadcrumbs }: AppShellProps) {
  const commandPalette = useCommandPalette();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Minimal Top Navigation */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          {/* Logo */}
          <Link
            href={ROUTES.dashboard}
            className="flex items-center gap-2 font-bold text-lg"
          >
            <span className="text-primary">Baley</span>
            <span>UI</span>
          </Link>

          {/* Command Palette Trigger + User Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => commandPalette.open()}
              className="hidden sm:flex items-center gap-2 text-muted-foreground"
            >
              <span>Search or run commands...</span>
              <KeyboardShortcut shortcut="mod+k" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => commandPalette.open()}
              className="sm:hidden"
              aria-label="Open command palette"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </Button>
            <ThemeToggle />
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="container py-2 border-b" aria-label="Breadcrumb">
          <ol className="flex items-center gap-2 text-sm">
            {breadcrumbs.map((crumb, index) => (
              <li key={crumb.label} className="flex items-center gap-2">
                {index > 0 && (
                  <span className="text-muted-foreground">/</span>
                )}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="font-medium">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* AI Companion */}
      <CompanionContainer defaultMode="orb" position="bottom-right">
        <ChatMode />
      </CompanionContainer>

      {/* Command Palette */}
      <CommandPalette
        open={commandPalette.isOpen}
        onOpenChange={commandPalette.setIsOpen}
      />

      {/* Toast Notifications */}
      <Toaster />
    </div>
  );
}

export { AppShell, type AppShellProps };
```

**Step 2: Create barrel export**

```tsx
// apps/web/src/components/layout/index.ts
export { AppShell, type AppShellProps } from './app-shell';
```

**Step 3: Commit**

```bash
git add apps/web/src/components/layout/
git commit -m "feat(layout): add minimal AppShell component

Replaces cluttered nav with logo + command palette trigger only.
Includes breadcrumbs, AI companion, and toaster."
```

---

### Task 7: Enhance Command Palette

Add recent items, better grouping, and natural language passthrough.

**Files:**
- Modify: `apps/web/src/components/companion/CommandPalette.tsx`

**Step 1: Update CommandPalette with recent items and navigation**

```tsx
'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { KeyboardShortcut } from '@/components/ui/kbd';
import { ROUTES } from '@/lib/routes';
import { trpc } from '@/lib/trpc/client';
import {
  Search,
  Sparkles,
  Plus,
  Play,
  Settings,
  ArrowRight,
  Clock,
  Bot,
  Workflow,
  MessageCircle,
  FileText,
  Key,
  Plug,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface Command {
  id: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  category: 'quick' | 'recent' | 'agents' | 'flows' | 'settings' | 'help';
  shortcut?: string;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAskAI?: (query: string) => void;
  className?: string;
}

// ============================================================================
// CATEGORY CONFIG
// ============================================================================

const categoryConfig: Record<Command['category'], { label: string; icon: React.ReactNode }> = {
  quick: { label: 'Quick Actions', icon: <Sparkles className="h-3.5 w-3.5" /> },
  recent: { label: 'Recent', icon: <Clock className="h-3.5 w-3.5" /> },
  agents: { label: 'Agents', icon: <Bot className="h-3.5 w-3.5" /> },
  flows: { label: 'Flows', icon: <Workflow className="h-3.5 w-3.5" /> },
  settings: { label: 'Settings', icon: <Settings className="h-3.5 w-3.5" /> },
  help: { label: 'Help', icon: <MessageCircle className="h-3.5 w-3.5" /> },
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CommandPalette({
  open,
  onOpenChange,
  onAskAI,
  className,
}: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch agents and flows for search
  const { data: blocks } = trpc.blocks.list.useQuery(undefined, { enabled: open });
  const { data: flows } = trpc.flows.list.useQuery(undefined, { enabled: open });

  // Build command list
  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [];

    // Quick actions (always shown)
    cmds.push(
      {
        id: 'new-agent',
        title: 'Create new agent',
        description: 'Build a new AI agent',
        icon: <Plus className="h-4 w-4" />,
        category: 'quick',
        shortcut: 'mod+n',
        action: () => router.push(ROUTES.blocks.create),
        keywords: ['create', 'new', 'agent', 'build'],
      },
      {
        id: 'new-flow',
        title: 'Create new flow',
        description: 'Design a workflow',
        icon: <Workflow className="h-4 w-4" />,
        category: 'quick',
        shortcut: 'mod+shift+n',
        action: () => router.push(ROUTES.flows.create),
        keywords: ['create', 'new', 'flow', 'workflow'],
      }
    );

    // Agents
    if (blocks) {
      blocks.slice(0, 5).forEach((block) => {
        cmds.push({
          id: `agent-${block.id}`,
          title: block.name,
          description: block.type === 'ai' ? 'AI Agent' : 'Function Block',
          icon: <Bot className="h-4 w-4" />,
          category: 'agents',
          action: () => router.push(ROUTES.blocks.detail(block.id)),
          keywords: [block.name.toLowerCase(), 'agent', 'block'],
        });
      });
    }

    // Flows
    if (flows) {
      flows.slice(0, 5).forEach((flow) => {
        cmds.push({
          id: `flow-${flow.id}`,
          title: flow.name,
          description: flow.enabled ? 'Active' : 'Inactive',
          icon: <Workflow className="h-4 w-4" />,
          category: 'flows',
          action: () => router.push(ROUTES.flows.detail(flow.id)),
          keywords: [flow.name.toLowerCase(), 'flow', 'workflow'],
        });
      });
    }

    // Settings
    cmds.push(
      {
        id: 'settings',
        title: 'Settings',
        description: 'App preferences',
        icon: <Settings className="h-4 w-4" />,
        category: 'settings',
        shortcut: 'mod+,',
        action: () => router.push(ROUTES.settings.root),
        keywords: ['settings', 'preferences', 'config'],
      },
      {
        id: 'connections',
        title: 'Connections',
        description: 'LLM provider configuration',
        icon: <Plug className="h-4 w-4" />,
        category: 'settings',
        action: () => router.push(ROUTES.settings.connections),
        keywords: ['connections', 'llm', 'provider', 'api'],
      },
      {
        id: 'api-keys',
        title: 'API Keys',
        description: 'Manage API keys',
        icon: <Key className="h-4 w-4" />,
        category: 'settings',
        action: () => router.push(ROUTES.settings.apiKeys),
        keywords: ['api', 'keys', 'tokens'],
      }
    );

    // Help
    cmds.push({
      id: 'docs',
      title: 'Documentation',
      description: 'View guides and API docs',
      icon: <FileText className="h-4 w-4" />,
      category: 'help',
      shortcut: '?',
      action: () => router.push(ROUTES.apiDocs),
      keywords: ['docs', 'documentation', 'help', 'guide'],
    });

    return cmds;
  }, [blocks, flows, router]);

  // Filter commands
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      // Show quick actions and recent by default
      return commands.filter(cmd =>
        cmd.category === 'quick' || cmd.category === 'recent'
      );
    }

    const q = query.toLowerCase();
    return commands.filter(cmd => {
      const searchText = [
        cmd.title,
        cmd.description,
        ...(cmd.keywords || []),
      ].join(' ').toLowerCase();
      return searchText.includes(q);
    });
  }, [commands, query]);

  // Group by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    for (const cmd of filteredCommands) {
      if (!groups[cmd.category]) {
        groups[cmd.category] = [];
      }
      groups[cmd.category].push(cmd);
    }
    return groups;
  }, [filteredCommands]);

  // Flatten for keyboard navigation
  const flatCommands = Object.values(groupedCommands).flat();

  // Reset on query change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, flatCommands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatCommands[selectedIndex]) {
          flatCommands[selectedIndex].action();
          onOpenChange(false);
        } else if (query.trim() && onAskAI) {
          // Pass to AI if no command matches
          onAskAI(query);
          onOpenChange(false);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onOpenChange(false);
        break;
    }
  };

  const handleSelect = (command: Command) => {
    command.action();
    onOpenChange(false);
  };

  let currentIndex = 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('max-w-lg p-0 gap-0 overflow-hidden', className)}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What do you want to do?"
            className="border-0 shadow-none focus-visible:ring-0 px-0 text-base"
          />
        </div>

        {/* Commands List */}
        <ScrollArea className="max-h-[400px]">
          <div className="p-2">
            {Object.keys(groupedCommands).length === 0 ? (
              <div className="py-8 text-center">
                <MessageCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No results. Press Enter to ask AI.
                </p>
              </div>
            ) : (
              Object.entries(groupedCommands).map(([category, cmds]) => {
                const config = categoryConfig[category as Command['category']];
                return (
                  <div key={category} className="mb-3 last:mb-0">
                    <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground font-medium">
                      {config.icon}
                      {config.label}
                    </div>
                    <div className="space-y-0.5">
                      {cmds.map((command) => {
                        const index = currentIndex;
                        currentIndex++;
                        return (
                          <CommandItem
                            key={command.id}
                            command={command}
                            isSelected={selectedIndex === index}
                            onSelect={() => handleSelect(command)}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/50 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-background border text-[10px]">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-background border text-[10px]">↵</kbd>
              select
            </span>
          </div>
          <span className="flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            AI-powered
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// COMMAND ITEM
// ============================================================================

function CommandItem({
  command,
  isSelected,
  onSelect,
}: {
  command: Command;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={cn(
        'w-full flex items-center gap-3 px-2 py-2 rounded-md',
        'text-left transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
      )}
      onClick={onSelect}
    >
      <div
        className={cn(
          'h-8 w-8 rounded-md flex items-center justify-center shrink-0',
          isSelected ? 'bg-accent-foreground/10' : 'bg-muted'
        )}
      >
        {command.icon}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{command.title}</p>
        {command.description && (
          <p className="text-xs text-muted-foreground truncate">
            {command.description}
          </p>
        )}
      </div>

      {command.shortcut && (
        <KeyboardShortcut shortcut={command.shortcut} />
      )}

      <ArrowRight
        className={cn(
          'h-4 w-4 shrink-0 transition-opacity',
          isSelected ? 'opacity-100' : 'opacity-0'
        )}
      />
    </button>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isOpen,
    setIsOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((prev) => !prev),
  };
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/companion/CommandPalette.tsx
git commit -m "feat(companion): enhance CommandPalette with real data

- Fetches agents and flows from API
- Better grouping and category icons
- Uses new KeyboardShortcut component
- AI passthrough for unmatched queries"
```

---

### Task 8: Create New Home Page

Job-oriented hub replacing stats dashboard.

**Files:**
- Modify: `apps/web/src/app/dashboard/page.tsx`

**Step 1: Replace with job-oriented home**

```tsx
'use client';

import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { KeyboardShortcut } from '@/components/ui/kbd';
import { ROUTES } from '@/lib/routes';
import {
  Bot,
  Workflow,
  Play,
  Sparkles,
  ArrowRight,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
} from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  const { user } = useUser();
  const router = useRouter();

  // Fetch recent data
  const { data: blocks, isLoading: blocksLoading } = trpc.blocks.list.useQuery();
  const { data: executions, isLoading: executionsLoading } = trpc.flows.listExecutions.useQuery({
    limit: 5,
  });

  const isLoading = blocksLoading || executionsLoading;
  const hasAgents = (blocks?.length || 0) > 0;
  const recentExecutions = executions?.slice(0, 3) || [];

  // Greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="container max-w-4xl py-12">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          {getGreeting()}{user?.firstName ? `, ${user.firstName}` : ''}
        </h1>
        <p className="text-muted-foreground mt-1">
          What would you like to do?
        </p>
      </div>

      {/* Primary Actions - Job-Oriented */}
      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        <Card
          className="cursor-pointer transition-colors hover:bg-muted/50 group"
          onClick={() => router.push(ROUTES.blocks.create)}
        >
          <CardHeader className="pb-2">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
              <Plus className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-base flex items-center gap-2">
              Create an agent
              <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </CardTitle>
            <CardDescription>
              Build AI that analyzes data, generates reports, or automates tasks
            </CardDescription>
          </CardHeader>
        </Card>

        <Card
          className="cursor-pointer transition-colors hover:bg-muted/50 group"
          onClick={() => router.push(ROUTES.flows.create)}
        >
          <CardHeader className="pb-2">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center mb-2">
              <Workflow className="h-5 w-5 text-blue-500" />
            </div>
            <CardTitle className="text-base flex items-center gap-2">
              Build a workflow
              <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </CardTitle>
            <CardDescription>
              Connect multiple agents into automated pipelines
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Recent Agents */}
      {isLoading ? (
        <div className="space-y-3 mb-8">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : hasAgents ? (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-muted-foreground">Your agents</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href={ROUTES.blocks.list}>
                View all
                <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
          <div className="space-y-2">
            {blocks?.slice(0, 3).map((block) => (
              <Link
                key={block.id}
                href={ROUTES.blocks.detail(block.id)}
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{block.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {block.type === 'ai' ? 'AI Agent' : 'Function'}
                  </p>
                </div>
                <Button variant="ghost" size="sm">
                  <Play className="h-4 w-4" />
                </Button>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <Card className="mb-8 border-dashed">
          <CardContent className="py-8">
            <EmptyState
              icon={Bot}
              title="No agents yet"
              description="Create your first agent to get started with AI automation."
              action={{
                label: 'Create Agent',
                href: ROUTES.blocks.create,
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      {recentExecutions.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-muted-foreground">Recent activity</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href={ROUTES.executions.list}>
                View all
                <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
          <div className="space-y-2">
            {recentExecutions.map((execution) => (
              <Link
                key={execution.id}
                href={ROUTES.executions.detail(execution.id)}
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                {execution.status === 'completed' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : execution.status === 'failed' ? (
                  <XCircle className="h-4 w-4 text-red-500" />
                ) : (
                  <Clock className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {execution.flow?.name || 'Unknown'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {execution.startedAt
                      ? new Date(execution.startedAt).toLocaleString()
                      : 'Pending'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Keyboard Shortcut Hint */}
      <div className="text-center text-sm text-muted-foreground">
        Press <KeyboardShortcut shortcut="mod+k" /> anytime to search or run commands
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/dashboard/page.tsx
git commit -m "feat(dashboard): replace stats with job-oriented home

- Greeting based on time of day
- Primary actions: Create agent, Build workflow
- Recent agents list with quick run
- Recent activity feed
- Keyboard shortcut hint"
```

---

### Task 9: Update Dashboard Layout to Use AppShell

Replace old layout with new minimal shell.

**Files:**
- Modify: `apps/web/src/app/dashboard/layout.tsx`

**Step 1: Update layout**

```tsx
'use client';

import { WorkspaceGuard } from '@/components/WorkspaceGuard';
import { AppShell } from '@/components/layout';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceGuard>
      <AppShell>{children}</AppShell>
    </WorkspaceGuard>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/dashboard/layout.tsx
git commit -m "refactor(dashboard): use minimal AppShell layout

Removes 7-item nav bar, now just logo + command palette."
```

---

## Phase 3: Feature Page Updates

Update individual pages to use new patterns.

---

### Task 10: Update Blocks List with Inline Actions

Replace modal-heavy interactions with inline patterns.

**Files:**
- Modify: `apps/web/src/app/dashboard/blocks/page.tsx`
- Modify: `apps/web/src/components/blocks/BlockCard.tsx`

**Step 1: Update BlockCard with ConfirmButton and ActionPopover**

Read the existing BlockCard, then update to use new components:

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { ActionPopover, type ActionItem } from '@/components/ui/action-popover';
import { InlineEdit } from '@/components/ui/inline-edit';
import { ROUTES } from '@/lib/routes';
import { trpc } from '@/lib/trpc/client';
import {
  Bot,
  Code,
  Play,
  MoreVertical,
  Copy,
  Trash2,
  Settings,
  BarChart2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface BlockCardProps {
  block: {
    id: string;
    name: string;
    type: 'ai' | 'function' | 'router' | 'parallel';
    description?: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  onDelete?: () => void;
}

export function BlockCard({ block, onDelete }: BlockCardProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const updateMutation = trpc.blocks.update.useMutation({
    onSuccess: () => utils.blocks.list.invalidate(),
  });

  const deleteMutation = trpc.blocks.delete.useMutation({
    onSuccess: () => {
      utils.blocks.list.invalidate();
      onDelete?.();
    },
  });

  const duplicateMutation = trpc.blocks.duplicate.useMutation({
    onSuccess: () => utils.blocks.list.invalidate(),
  });

  const handleRename = async (newName: string) => {
    await updateMutation.mutateAsync({ id: block.id, name: newName });
  };

  const handleDelete = async () => {
    await deleteMutation.mutateAsync({ id: block.id });
  };

  const handleDuplicate = async () => {
    await duplicateMutation.mutateAsync({ id: block.id });
  };

  const actions: ActionItem[] = [
    {
      id: 'run',
      label: 'Run',
      icon: <Play className="h-4 w-4" />,
      shortcut: '⌘R',
      onSelect: () => router.push(ROUTES.blocks.test(block.id)),
    },
    {
      id: 'configure',
      label: 'Configure',
      icon: <Settings className="h-4 w-4" />,
      onSelect: () => router.push(ROUTES.blocks.detail(block.id)),
    },
    {
      id: 'duplicate',
      label: 'Duplicate',
      icon: <Copy className="h-4 w-4" />,
      shortcut: '⌘D',
      onSelect: handleDuplicate,
    },
    {
      id: 'analytics',
      label: 'View analytics',
      icon: <BarChart2 className="h-4 w-4" />,
      onSelect: () => router.push(ROUTES.blocks.patterns(block.id)),
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: <Trash2 className="h-4 w-4" />,
      shortcut: '⌘⌫',
      destructive: true,
      onSelect: handleDelete,
    },
  ];

  const Icon = block.type === 'ai' ? Bot : Code;

  return (
    <Card className="group relative">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className={cn(
                'h-10 w-10 rounded-lg flex items-center justify-center shrink-0',
                block.type === 'ai' ? 'bg-primary/10' : 'bg-blue-500/10'
              )}
            >
              <Icon
                className={cn(
                  'h-5 w-5',
                  block.type === 'ai' ? 'text-primary' : 'text-blue-500'
                )}
              />
            </div>
            <div className="min-w-0">
              <InlineEdit
                value={block.name}
                onSave={handleRename}
                textClassName="font-semibold"
              />
              <Badge variant="secondary" className="mt-1">
                {block.type}
              </Badge>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => router.push(ROUTES.blocks.test(block.id))}
            >
              <Play className="h-4 w-4" />
            </Button>
            <ActionPopover
              trigger={
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              }
              actions={actions}
            />
          </div>
        </div>
      </CardHeader>

      {block.description && (
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground line-clamp-2">
            {block.description}
          </p>
        </CardContent>
      )}

      {/* Click area for navigation */}
      <Link
        href={ROUTES.blocks.detail(block.id)}
        className="absolute inset-0 z-0"
        aria-label={`View ${block.name}`}
      />
    </Card>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/blocks/BlockCard.tsx
git commit -m "feat(blocks): update BlockCard with inline actions

- InlineEdit for renaming
- ActionPopover for context menu
- Quick run button on hover
- No modals for simple actions"
```

---

### Task 11: Add Breadcrumbs to Detail Pages

Update block detail page to show breadcrumbs.

**Files:**
- Modify: `apps/web/src/app/dashboard/blocks/[id]/page.tsx`

**Step 1: Read existing page and add breadcrumbs**

(Read file first, then add breadcrumbs context)

The pattern is to pass breadcrumbs to the layout or use a client component that sets them.

**Step 2: Create a breadcrumb context**

Create `apps/web/src/components/layout/breadcrumb-context.tsx`:

```tsx
'use client';

import { createContext, useContext, useState, useEffect } from 'react';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface BreadcrumbContextValue {
  breadcrumbs: Breadcrumb[];
  setBreadcrumbs: (breadcrumbs: Breadcrumb[]) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);

  return (
    <BreadcrumbContext.Provider value={{ breadcrumbs, setBreadcrumbs }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumbs() {
  const context = useContext(BreadcrumbContext);
  if (!context) {
    throw new Error('useBreadcrumbs must be used within BreadcrumbProvider');
  }
  return context;
}

export function SetBreadcrumbs({ items }: { items: Breadcrumb[] }) {
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs(items);
    return () => setBreadcrumbs([]);
  }, [items, setBreadcrumbs]);

  return null;
}
```

**Step 3: Update layout index and AppShell to use context**

This is getting complex - we'll wire this up during implementation.

**Step 4: Commit**

```bash
git add apps/web/src/components/layout/
git commit -m "feat(layout): add breadcrumb context system

Allows pages to set breadcrumbs that appear in AppShell."
```

---

## Phase 4: Settings as Slide Panels

Convert settings from full pages to slide panels.

---

### Task 12: Create Settings Panel Component

Settings accessed via slide panel instead of page navigation.

**Files:**
- Create: `apps/web/src/components/settings/SettingsPanel.tsx`
- Create: `apps/web/src/components/settings/index.ts`

(Implementation details follow the same pattern - create component using SlidePanel)

---

## Phase 5: Polish & Testing

---

### Task 13: Add Animation Utilities

Ensure consistent animations per design system.

**Files:**
- Modify: `apps/web/tailwind.config.ts`

Add animation keyframes for slide-in-from-right, etc.

---

### Task 14: Manual Testing Checklist

- [ ] Command palette opens with ⌘K
- [ ] Search filters agents, flows, and actions
- [ ] Home page shows job-oriented actions
- [ ] Block card allows inline rename
- [ ] Block card delete uses ConfirmButton (no modal)
- [ ] Context menu (⋮) shows ActionPopover
- [ ] Slide panels work for configuration
- [ ] Breadcrumbs appear on detail pages
- [ ] All keyboard shortcuts work
- [ ] Escape closes any overlay
- [ ] Toast notifications appear correctly
- [ ] AI companion orb is visible
- [ ] Theme toggle works

---

### Task 15: Commit Final Polish

```bash
git add .
git commit -m "polish(ui): complete UI overhaul

- Minimal navigation shell
- Job-oriented home page
- Design system components (ConfirmButton, InlineEdit, SlidePanel, ActionPopover)
- Enhanced command palette with real data
- Inline actions throughout (no unnecessary modals)
- Consistent keyboard shortcuts
- Animation polish"
```

---

## Summary

**Total Tasks:** 15
**Estimated Phases:** 5
**Key Components Created:**
- ConfirmButton (transform pattern)
- InlineEdit (click-to-edit)
- SlidePanel (contextual configuration)
- ActionPopover (anchored menus)
- Kbd/KeyboardShortcut (OS-aware shortcuts)
- AppShell (minimal layout)
- Breadcrumb context

**Key Files Modified:**
- Dashboard layout (minimal nav)
- Dashboard home (job-oriented)
- CommandPalette (enhanced)
- BlockCard (inline actions)

**Design System Reference:** `docs/reference/design-system.md`
