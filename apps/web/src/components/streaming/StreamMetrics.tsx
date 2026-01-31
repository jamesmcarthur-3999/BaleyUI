'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Clock, Zap, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StreamMetrics {
  ttft?: number | null;
  tokensPerSec?: number | null;
  totalTokens?: number;
}

interface StreamMetricsProps {
  metrics: StreamMetrics;
  className?: string;
}

function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '-';
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function StreamMetrics({ metrics, className }: StreamMetricsProps) {
  const metricsData = [
    {
      icon: Clock,
      label: 'Time to First Token',
      value: metrics.ttft !== null && metrics.ttft !== undefined ? `${formatNumber(metrics.ttft)}ms` : '-',
      tooltip: 'Time from request to first token',
    },
    {
      icon: Zap,
      label: 'Tokens/Second',
      value: formatNumber(metrics.tokensPerSec),
      tooltip: 'Average streaming speed',
    },
    {
      icon: Hash,
      label: 'Total Tokens',
      value: formatNumber(metrics.totalTokens || 0),
      tooltip: 'Total tokens generated',
    },
  ];

  const hasAnyData =
    metrics.ttft !== null || metrics.tokensPerSec !== null || (metrics.totalTokens && metrics.totalTokens > 0);

  if (!hasAnyData) {
    return null;
  }

  return (
    <Card className={cn('', className)}>
      <CardContent className="p-4">
        <div className="grid grid-cols-3 gap-4">
          {metricsData.map((metric) => {
            const Icon = metric.icon;
            return (
              <div key={metric.label} className="flex flex-col space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon className="h-3 w-3" />
                  <span>{metric.label}</span>
                </div>
                <div className="text-lg font-semibold tabular-nums">{metric.value}</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
