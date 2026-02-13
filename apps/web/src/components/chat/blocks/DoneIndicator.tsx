'use client';

import { cn } from '@/lib/utils';
import type { DoneSegment } from '@baleybots/chat';

interface DoneIndicatorProps {
  segment: DoneSegment;
  className?: string;
}

export function DoneIndicator({ segment, className }: DoneIndicatorProps) {
  // Only show non-trivial completions (errors, resource limits, etc.)
  const isNormal = segment.reason === 'turn_yielded';
  if (isNormal) return null;

  return (
    <div className={cn(
      'flex items-center gap-2 py-1 text-[11px] text-muted-foreground/50',
      className,
    )}>
      <div className="flex-1 h-px bg-foreground/[0.04]" />
      <span>{segment.reasonDisplay}</span>
      {segment.durationDisplay && (
        <span className="tabular-nums">{segment.durationDisplay}</span>
      )}
      <div className="flex-1 h-px bg-foreground/[0.04]" />
    </div>
  );
}
