// apps/web/src/components/creator/ReadinessDots.tsx
'use client';

import { cn } from '@/lib/utils';
import type { ReadinessState, ReadinessDimension, DimensionStatus } from '@/lib/baleybot/creator-types';

interface ReadinessDotsProps {
  readiness: ReadinessState;
  onDotClick?: (dimension: ReadinessDimension) => void;
  className?: string;
}

const DIMENSION_LABELS: Record<ReadinessDimension, string> = {
  designed: 'Designed',
  connected: 'Connected',
  tested: 'Tested',
  activated: 'Activated',
  monitored: 'Monitored',
};

const STATUS_COLORS: Record<DimensionStatus, string> = {
  complete: 'bg-green-500',
  'in-progress': 'bg-amber-500 animate-pulse-soft',
  incomplete: 'bg-muted-foreground/30',
  'not-applicable': '',
};

/**
 * Compact row of colored dots showing readiness dimensions.
 * Filters out not-applicable dimensions.
 */
export function ReadinessDots({ readiness, onDotClick, className }: ReadinessDotsProps) {
  const dimensions = (Object.entries(readiness) as [ReadinessDimension, DimensionStatus][])
    .filter(([, status]) => status !== 'not-applicable');

  if (dimensions.length === 0) return null;

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {dimensions.map(([dim, status]) => (
        <button
          key={dim}
          onClick={() => onDotClick?.(dim)}
          className={cn(
            'w-2 h-2 rounded-full transition-all',
            STATUS_COLORS[status],
            onDotClick && 'cursor-pointer hover:scale-150',
            status === 'complete' && 'animate-readiness-pop'
          )}
          title={`${DIMENSION_LABELS[dim]}: ${status}`}
          aria-label={`${DIMENSION_LABELS[dim]} status: ${status}`}
        />
      ))}
    </div>
  );
}
