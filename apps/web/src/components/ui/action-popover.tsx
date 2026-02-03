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
  if (actions.length === 0) return false;
  const first = actions[0];
  return first !== undefined && 'items' in first;
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
  // React 19 compiler handles memoization automatically
  const getFilteredActions = () => {
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
  };

  const filteredActions = getFilteredActions();

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

ActionPopover.displayName = 'ActionPopover';

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

ActionMenuItem.displayName = 'ActionMenuItem';

export { ActionPopover, type ActionPopoverProps, type ActionItem, type ActionGroup };
