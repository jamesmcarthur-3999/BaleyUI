'use client';

import { Check, AlertTriangle, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { countCompleted } from '@/lib/baleybot/readiness';
import type { ReadinessState, DimensionStatus, ReadinessDimension } from '@/lib/baleybot/readiness';

interface ReadinessItem {
  dimension: ReadinessDimension;
  label: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ReadinessChecklistProps {
  readiness: ReadinessState;
  items: ReadinessItem[];
}

function getStatusForDimension(readiness: ReadinessState, dimension: ReadinessDimension): DimensionStatus {
  return readiness[dimension];
}

function ProgressRing({ completed, total }: { completed: number; total: number }) {
  const size = 48;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? completed / total : 0;
  const offset = circumference * (1 - progress);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-primary animate-ring-draw"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            '--ring-circumference': circumference,
            '--ring-offset': offset,
          } as React.CSSProperties}
        />
      </svg>
      <span className="absolute text-xs font-semibold tabular-nums">
        {completed}/{total}
      </span>
    </div>
  );
}

function StatusIcon({ status }: { status: DimensionStatus }) {
  if (status === 'complete') {
    return (
      <div className="h-6 w-6 rounded-full bg-emerald-500/15 flex items-center justify-center animate-readiness-pop">
        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
      </div>
    );
  }
  if (status === 'in-progress') {
    return (
      <div className="h-6 w-6 rounded-full bg-amber-500/15 flex items-center justify-center">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
      </div>
    );
  }
  return (
    <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
      <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />
    </div>
  );
}

export function ReadinessChecklist({ readiness, items }: ReadinessChecklistProps) {
  const { completed, total } = countCompleted(readiness);

  return (
    <div className="space-y-4">
      {/* Header with progress ring */}
      <div className="flex items-center gap-3">
        <ProgressRing completed={completed} total={total} />
        <div>
          <p className="text-sm font-medium">Launch Readiness</p>
          <p className="text-xs text-muted-foreground">
            {completed === total
              ? 'All checks passed'
              : `${total - completed} item${total - completed === 1 ? '' : 's'} remaining`}
          </p>
        </div>
      </div>

      {/* Readiness items */}
      <div className="space-y-2">
        {items.map((item) => {
          const status = getStatusForDimension(readiness, item.dimension);
          if (status === 'not-applicable') return null;

          return (
            <div
              key={item.dimension}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                status === 'complete' && 'border-emerald-500/30 bg-emerald-500/5',
                status === 'in-progress' && 'border-amber-500/30 bg-amber-500/5',
                status === 'incomplete' && 'border-border bg-card'
              )}
            >
              <StatusIcon status={status} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
              {item.action && status !== 'complete' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 text-xs"
                  onClick={item.action.onClick}
                >
                  {item.action.label}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
