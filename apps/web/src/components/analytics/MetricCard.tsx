'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: number | string;
  unit?: string;
  change?: number;
  changePeriod?: string;
  description?: string;
  loading?: boolean;
  className?: string;
}

export function MetricCard({
  title,
  value,
  unit,
  change,
  changePeriod = 'vs last period',
  description,
  loading = false,
  className,
}: MetricCardProps) {
  const formatValue = (v: number | string): string => {
    if (typeof v === 'string') return v;
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
    if (Number.isInteger(v)) return v.toString();
    return v.toFixed(2);
  };

  const getTrendIcon = () => {
    if (change === undefined || change === 0) {
      return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
    if (change > 0) {
      return <TrendingUp className="h-4 w-4 text-emerald-500" />;
    }
    return <TrendingDown className="h-4 w-4 text-red-500" />;
  };

  const getTrendColor = () => {
    if (change === undefined || change === 0) return 'text-muted-foreground';
    return change > 0 ? 'text-emerald-500' : 'text-red-500';
  };

  return (
    <div
      className={cn(
        'rounded-2xl border border-border/50 bg-card/50 p-5',
        'transition-all duration-200 hover:border-border',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        {change !== undefined && (
          <div className={cn('flex items-center gap-1', getTrendColor())}>
            {getTrendIcon()}
            <span className="text-xs font-medium">
              {change > 0 ? '+' : ''}
              {change.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      <div className="mt-3">
        {loading ? (
          <div className="h-8 w-24 animate-pulse rounded bg-muted" />
        ) : (
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold tracking-tight">
              {formatValue(value)}
            </span>
            {unit && (
              <span className="text-sm text-muted-foreground">{unit}</span>
            )}
          </div>
        )}
      </div>

      {(description || changePeriod) && (
        <p className="mt-2 text-xs text-muted-foreground">
          {description || changePeriod}
        </p>
      )}
    </div>
  );
}
