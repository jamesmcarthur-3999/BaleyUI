'use client';

import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface UsageMeterProps {
  label: string;
  used: number;
  limit: number | null;
  icon: LucideIcon;
  formatValue?: (value: number) => string;
}

function defaultFormat(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toLocaleString();
}

function getMeterColor(percent: number): string {
  if (percent >= 85) return 'bg-red-500';
  if (percent >= 60) return 'bg-amber-500';
  return 'bg-emerald-500';
}

export function UsageMeter({ label, used, limit, icon: Icon, formatValue = defaultFormat }: UsageMeterProps) {
  const isUnlimited = limit === null;
  const percent = isUnlimited ? 0 : limit > 0 ? Math.min((used / limit) * 100, 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">{label}</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatValue(used)}
          {isUnlimited ? ' (unlimited)' : ` / ${formatValue(limit)}`}
        </span>
      </div>
      {!isUnlimited && (
        <div
          className="h-2.5 rounded-full bg-primary/10 overflow-hidden"
          role="progressbar"
          aria-valuenow={used}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-label={`${label}: ${formatValue(used)} of ${formatValue(limit)}`}
        >
          <div
            className={cn(
              'h-full rounded-full transition-all animate-meter-fill',
              getMeterColor(percent)
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
