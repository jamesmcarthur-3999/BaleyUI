'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/lib/routes';
import {
  CheckCircle2,
  XCircle,
  Play,
  Clock,
  ArrowRight,
  Activity,
  Zap,
} from 'lucide-react';

interface Execution {
  id: string;
  baleybotId: string;
  baleybotName: string;
  baleybotIcon: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  output: unknown;
}

interface RecentActivityFeedProps {
  executions: Execution[];
  isLoading?: boolean;
  className?: string;
}

export function RecentActivityFeed({
  executions,
  isLoading,
  className,
}: RecentActivityFeedProps) {
  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  const StatusIcon = ({ status }: { status: Execution['status'] }) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'running':
        return <Zap className="h-4 w-4 text-primary animate-pulse" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getBriefResult = (execution: Execution): string | null => {
    if (execution.status !== 'completed' || !execution.output) return null;

    // Try to extract a brief summary from the output
    const output = execution.output;
    if (typeof output === 'string') {
      return output.slice(0, 50) + (output.length > 50 ? '...' : '');
    }
    if (output && typeof output === 'object') {
      const outputObj = output as Record<string, unknown>;
      const summary = outputObj.summary || outputObj.result || outputObj.message;
      if (typeof summary === 'string') {
        return summary.slice(0, 50) + (summary.length > 50 ? '...' : '');
      }
    }
    return null;
  };

  return (
    <div className={`card-playful rounded-2xl overflow-hidden ${className}`}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="icon-box w-10 h-10">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <span className="font-semibold text-lg">Recent Activity</span>
          </div>
          <Button variant="ghost" size="sm" asChild className="group">
            <Link href={ROUTES.activity.list}>
              View All
              <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl overflow-hidden">
                <Skeleton className="h-16 w-full animate-shimmer" />
              </div>
            ))}
          </div>
        ) : executions.length > 0 ? (
          <div className="space-y-2">
            {executions.map((execution, index) => {
              const briefResult = getBriefResult(execution);

              return (
                <Link
                  key={execution.id}
                  href={ROUTES.activity.execution(execution.id)}
                  className={`flex items-center gap-4 rounded-xl p-3 hover:bg-primary/5 transition-all duration-200 group animate-fade-in opacity-0 stagger-${Math.min(index + 1, 6)}`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 text-xl shrink-0 transition-transform group-hover:scale-105">
                    {execution.baleybotIcon || '🤖'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-sm">
                        {execution.baleybotName}
                      </span>
                      <StatusIcon status={execution.status} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {execution.startedAt && (
                        <span>{formatTimeAgo(execution.startedAt)}</span>
                      )}
                      {execution.durationMs && (
                        <span className="flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                          {formatDuration(execution.durationMs)}
                        </span>
                      )}
                      {briefResult && (
                        <span className="truncate flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                          {briefResult}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/50 transition-all group-hover:text-primary group-hover:translate-x-1" />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="icon-box w-14 h-14 mb-4">
              <Activity className="h-7 w-7 text-primary/60" />
            </div>
            <h3 className="font-semibold mb-1">No activity yet</h3>
            <p className="text-sm text-muted-foreground">
              Run a BaleyBot to see activity here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
