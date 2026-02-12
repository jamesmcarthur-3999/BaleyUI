'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/lib/routes';
import { formatTimeAgo, formatDuration } from '@/lib/format';
import {
  ArrowRight,
  Activity,
} from 'lucide-react';
import { UnifiedStatusBadge } from '@/components/ui/unified-status-badge';

interface Execution {
  id: string;
  baleybotId: string;
  baleybotName: string;
  baleybotIcon: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
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
            {executions.map((execution, index) => (
              <Link
                key={execution.id}
                href={ROUTES.activity.execution(execution.id)}
                className={`flex items-center gap-4 rounded-xl p-3 hover:bg-primary/5 transition-colors duration-200 group animate-fade-in stagger-${Math.min(index + 1, 6)}`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 text-xl shrink-0 transition-transform group-hover:scale-105">
                  {execution.baleybotIcon || '🤖'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-sm">
                      {execution.baleybotName}
                    </span>
                    <UnifiedStatusBadge status={execution.status} domain="execution" variant="icon-only" />
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
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/50 transition-[color,transform] group-hover:text-primary group-hover:translate-x-1" />
              </Link>
            ))}
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
