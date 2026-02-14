'use client';

import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ArrowRight, X } from 'lucide-react';
import type { PendingNavigation } from '@/hooks/useBaleyChat';

const AUTO_DISMISS_MS = 30_000;

interface NavigationChipProps {
  navigation: PendingNavigation;
  onApprove: (id: string) => void;
  onDismiss: (id: string) => void;
  className?: string;
}

export function NavigationChip({
  navigation,
  onApprove,
  onDismiss,
  className,
}: NavigationChipProps) {
  useEffect(() => {
    const remaining = AUTO_DISMISS_MS - (Date.now() - navigation.createdAt);
    if (remaining <= 0) {
      onDismiss(navigation.id);
      return;
    }
    const timer = setTimeout(() => onDismiss(navigation.id), remaining);
    return () => clearTimeout(timer);
  }, [navigation.createdAt, navigation.id, onDismiss]);

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs',
        'bg-primary/[0.06] border border-primary/20',
        'animate-in fade-in slide-in-from-bottom-1 duration-200',
        className,
      )}
    >
      <ArrowRight className="h-3.5 w-3.5 text-primary/70 shrink-0" />
      <span className="text-foreground/80 truncate">
        Go to <span className="font-medium text-foreground">{navigation.label}</span>
        {navigation.reason && (
          <span className="text-muted-foreground"> &mdash; {navigation.reason}</span>
        )}
      </span>
      <div className="flex items-center gap-1 ml-auto shrink-0">
        <button
          onClick={() => onApprove(navigation.id)}
          className={cn(
            'px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          Go
        </button>
        <button
          onClick={() => onDismiss(navigation.id)}
          className="p-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

interface NavigationChipListProps {
  navigations: PendingNavigation[];
  onApprove: (id: string) => void;
  onDismiss: (id: string) => void;
  className?: string;
}

export function NavigationChipList({
  navigations,
  onApprove,
  onDismiss,
  className,
}: NavigationChipListProps) {
  if (navigations.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {navigations.map((nav) => (
        <NavigationChip
          key={nav.id}
          navigation={nav}
          onApprove={onApprove}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}
