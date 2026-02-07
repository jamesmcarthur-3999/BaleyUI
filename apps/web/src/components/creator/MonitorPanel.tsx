// apps/web/src/components/creator/MonitorPanel.tsx
'use client';

import { Activity, AlertTriangle, CheckCircle2, Clock, Pause, Play, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface AnalyticsData {
  total: number;
  successes: number;
  failures: number;
  successRate: number;
  avgDurationMs: number;
  totalTokens: number;
  dailyTrend: Array<{ date: string; count: number }>;
  topErrors: Array<{ message: string; count: number }>;
}

interface MonitorPanelProps {
  analyticsData: AnalyticsData | null | undefined;
  isLoading: boolean;
  /** Whether the bot has a trigger configured */
  hasTrigger: boolean;
  /** Whether the bot is currently paused (future use) */
  isPaused?: boolean;
  onPauseToggle?: () => void;
  className?: string;
}

/**
 * MonitorPanel shows operational health for a bot:
 * - Status header (healthy/degraded/down)
 * - Quick stats
 * - 7-day trend bar
 * - Alerts/errors
 */
export function MonitorPanel({
  analyticsData,
  isLoading,
  hasTrigger,
  isPaused = false,
  onPauseToggle,
  className,
}: MonitorPanelProps) {
  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (!analyticsData || analyticsData.total === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
        <Activity className="h-10 w-10 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-medium mb-2">No activity yet</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          {hasTrigger
            ? "Your bot is configured but hasn't run yet. It will appear here after first execution."
            : 'Run your bot a few times to see monitoring data here.'}
        </p>
      </div>
    );
  }

  const healthStatus = analyticsData.successRate >= 0.95
    ? 'healthy'
    : analyticsData.successRate >= 0.8
      ? 'degraded'
      : 'unhealthy';

  const healthConfig = {
    healthy: { color: 'text-green-600 dark:text-green-400', bg: 'bg-green-500/5 border-green-500/30', icon: CheckCircle2, label: 'Healthy' },
    degraded: { color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/5 border-amber-500/30', icon: AlertTriangle, label: 'Degraded' },
    unhealthy: { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/5 border-red-500/30', icon: AlertTriangle, label: 'Unhealthy' },
  };

  const health = healthConfig[healthStatus];
  const StatusIcon = health.icon;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Health status header */}
      <div className={cn('rounded-lg border p-4 flex items-center justify-between', health.bg)}>
        <div className="flex items-center gap-3">
          <StatusIcon className={cn('h-5 w-5', health.color)} />
          <div>
            <p className={cn('text-sm font-medium', health.color)}>{health.label}</p>
            <p className="text-xs text-muted-foreground">
              {(analyticsData.successRate * 100).toFixed(1)}% success rate over {analyticsData.total} run{analyticsData.total !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        {onPauseToggle && hasTrigger && (
          <Button size="sm" variant="outline" onClick={onPauseToggle}>
            {isPaused ? <Play className="h-3.5 w-3.5 mr-1" /> : <Pause className="h-3.5 w-3.5 mr-1" />}
            {isPaused ? 'Resume' : 'Pause'}
          </Button>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xl font-bold">{analyticsData.total}</p>
          <p className="text-[10px] text-muted-foreground">Total Runs</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xl font-bold">
            {analyticsData.avgDurationMs > 1000
              ? `${(analyticsData.avgDurationMs / 1000).toFixed(1)}s`
              : `${analyticsData.avgDurationMs}ms`}
          </p>
          <p className="text-[10px] text-muted-foreground">Avg Duration</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xl font-bold">{analyticsData.totalTokens.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">Tokens Used</p>
        </div>
      </div>

      {/* Daily trend */}
      {analyticsData.dailyTrend.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-sm font-medium">Daily Activity</h3>
          </div>
          <div className="flex items-end gap-1 h-20 px-1">
            {analyticsData.dailyTrend.map((day) => {
              const maxCount = Math.max(...analyticsData.dailyTrend.map(d => d.count));
              const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
              return (
                <div key={day.date} className="flex-1 min-w-0">
                  <div
                    className="bg-primary/70 hover:bg-primary rounded-t transition-colors w-full"
                    style={{ height: `${Math.max(height, 4)}%` }}
                    title={`${day.date}: ${day.count} executions`}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1 px-1">
            <span className="text-[10px] text-muted-foreground">{analyticsData.dailyTrend[0]?.date}</span>
            <span className="text-[10px] text-muted-foreground">{analyticsData.dailyTrend[analyticsData.dailyTrend.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* Recent errors */}
      {analyticsData.topErrors.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-sm font-medium">Recent Errors</h3>
          </div>
          <div className="space-y-2">
            {analyticsData.topErrors.map((err, i) => (
              <div key={i} className="flex items-start justify-between gap-2 text-sm rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <p className="text-destructive text-xs break-all flex-1">{err.message}</p>
                <span className="text-muted-foreground text-xs shrink-0">{err.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
