// apps/web/src/components/creator/ReadinessDots.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, Check, Circle, MoreHorizontal } from 'lucide-react';
import type { ReadinessState, ReadinessDimension, DimensionStatus } from '@/lib/baleybot/creator-types';
import { countCompleted, getRecommendedAction } from '@/lib/baleybot/readiness';

interface ReadinessChecklistProps {
  readiness: ReadinessState;
  onDotClick?: (dimension: ReadinessDimension) => void;
  onActionClick?: (optionId: string) => void;
  className?: string;
}

const DIMENSION_LABELS: Record<ReadinessDimension, string> = {
  designed: 'Design',
  connected: 'Connections',
  tested: 'Testing',
  activated: 'Triggers',
  monitored: 'Monitoring',
};

const STATUS_COLORS: Record<DimensionStatus, string> = {
  complete: 'bg-green-500',
  'in-progress': 'bg-amber-500 animate-pulse-soft',
  incomplete: 'bg-muted-foreground/30',
  'not-applicable': '',
};

/**
 * Dual-mode readiness indicator.
 *
 * Compact: colored dots + "N/M ready" label + chevron to expand.
 * Expanded: dropdown checklist with dimension names, status icons,
 * and a highlighted "recommended next" action.
 */
export function ReadinessChecklist({ readiness, onDotClick, onActionClick, className }: ReadinessChecklistProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { completed, total } = countCompleted(readiness);
  const recommended = getRecommendedAction(readiness);
  const allComplete = completed === total && total > 0;

  const dimensions = (Object.entries(readiness) as [ReadinessDimension, DimensionStatus][])
    .filter(([, status]) => status !== 'not-applicable');

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isExpanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExpanded]);

  if (dimensions.length === 0) return null;

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      {/* Compact row: dots + count + toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted/50 transition-colors"
        aria-expanded={isExpanded}
        aria-label={`Readiness: ${completed} of ${total} complete`}
      >
        <div className="flex items-center gap-1.5">
          {dimensions.map(([dim, status]) => (
            <span
              key={dim}
              className={cn(
                'w-2 h-2 rounded-full transition-all',
                STATUS_COLORS[status],
                status === 'complete' && 'animate-readiness-pop',
              )}
            />
          ))}
        </div>
        <span className={cn(
          'text-xs',
          allComplete ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground',
        )}>
          {allComplete ? 'Ready!' : `${completed}/${total}`}
        </span>
        <ChevronDown className={cn(
          'h-3 w-3 text-muted-foreground transition-transform duration-200',
          isExpanded && 'rotate-180',
        )} />
      </button>

      {/* Expanded checklist dropdown */}
      {isExpanded && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border bg-popover shadow-lg p-3 space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
          <p className="text-xs font-medium text-muted-foreground mb-2 px-1">Readiness Checklist</p>
          {dimensions.map(([dim, status]) => {
            const isRecommended = recommended?.dimension === dim;
            return (
              <button
                key={dim}
                onClick={() => {
                  if (isRecommended && onActionClick) {
                    onActionClick(recommended.optionId);
                  } else {
                    onDotClick?.(dim);
                  }
                  setIsExpanded(false);
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors',
                  isRecommended && 'bg-primary/5 border border-primary/20',
                  !isRecommended && 'hover:bg-muted/50',
                )}
              >
                {/* Status icon */}
                <span className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center shrink-0',
                  status === 'complete' && 'bg-green-500/10 text-green-600 dark:text-green-400',
                  status === 'in-progress' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                  status === 'incomplete' && 'bg-muted text-muted-foreground',
                )}>
                  {status === 'complete' ? (
                    <Check className="h-3 w-3" />
                  ) : status === 'in-progress' ? (
                    <MoreHorizontal className="h-3 w-3" />
                  ) : (
                    <Circle className="h-3 w-3" />
                  )}
                </span>
                <span className="flex-1 text-left">{DIMENSION_LABELS[dim]}</span>
                {isRecommended && (
                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                    Next
                  </span>
                )}
              </button>
            );
          })}
          {allComplete && (
            <div className="mt-2 pt-2 border-t border-border/30 text-center">
              <p className="text-sm font-medium text-green-600 dark:text-green-400">All systems go!</p>
              <p className="text-xs text-muted-foreground">Your bot is production-ready.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
