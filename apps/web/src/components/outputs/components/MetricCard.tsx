'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { MetricCardConfig } from '@/lib/outputs/types';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface MetricCardProps {
  config: MetricCardConfig;
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function MetricCard({ config, className }: MetricCardProps) {
  const { title, value, change, color = 'default', subtitle } = config;

  const colorClasses: Record<string, string> = {
    default: 'border-border',
    success: 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20',
    warning: 'border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20',
    error: 'border-red-500/50 bg-red-50/50 dark:bg-red-950/20',
  };

  const changeColor = change
    ? change.direction === 'up'
      ? 'text-green-600 dark:text-green-400'
      : change.direction === 'down'
        ? 'text-red-600 dark:text-red-400'
        : 'text-muted-foreground'
    : '';

  const ChangeIcon =
    change?.direction === 'up'
      ? TrendingUp
      : change?.direction === 'down'
        ? TrendingDown
        : Minus;

  return (
    <Card className={cn(colorClasses[color], className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
        {change && (
          <div className={cn('flex items-center text-xs mt-1', changeColor)}>
            <ChangeIcon className="h-3 w-3 mr-1" />
            <span>
              {change.value > 0 ? '+' : ''}
              {change.value}%
              {change.period && ` ${change.period}`}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
