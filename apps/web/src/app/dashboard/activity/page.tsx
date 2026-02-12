'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ROUTES } from '@/lib/routes';
import { formatTimeAgo, formatDuration } from '@/lib/format';
import {
  Activity,
  ArrowRight,
  Loader2,
  Search,
} from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';

interface ExecutionItem {
  id: string;
  baleybotId: string;
  status: string;
  triggeredBy: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  error: string | null;
  createdAt: Date;
  baleybot: { id: string; name: string | null; icon: string | null };
}

export default function ActivityPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [botFilter, setBotFilter] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<ExecutionItem[]>([]);
  const prevDataRef = useRef<{ items: ExecutionItem[]; nextCursor?: string } | undefined>(undefined);

  const { data, isLoading, isFetching } = trpc.baleybots.getRecentActivity.useQuery(
    { limit: 50, cursor },
  );

  // Accumulate paginated results
  useEffect(() => {
    if (!data || data === prevDataRef.current) return;
    prevDataRef.current = data;

    if (!cursor) {
      // Initial load or reset
      setAccumulated(data.items as ExecutionItem[]);
    } else {
      // Append new items (avoid duplicates)
      setAccumulated((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));
        const newItems = (data.items as ExecutionItem[]).filter((item) => !existingIds.has(item.id));
        return [...prev, ...newItems];
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const nextCursor = data?.nextCursor;

  // Filter executions (applied client-side to the accumulated list)
  const filteredExecutions = accumulated.filter((exec) => {
    const matchesStatus = statusFilter === 'all' || exec.status === statusFilter;
    const matchesBot = !botFilter ||
      (exec.baleybot?.name && exec.baleybot.name.toLowerCase().includes(botFilter.toLowerCase()));
    return matchesStatus && matchesBot;
  });

  const handleLoadMore = () => {
    if (nextCursor) {
      setCursor(nextCursor);
    }
  };

  return (
    <PageShell
      title="Activity"
      description="View all BaleyBot executions and their results"
    >
        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by bot name..."
              value={botFilter}
              onChange={(e) => setBotFilter(e.target.value)}
              className="pl-9"
              aria-label="Filter by bot name"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]" aria-label="Filter by execution status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Activity List */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Executions</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && !cursor ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredExecutions.length > 0 ? (
              <div className="animate-fade-in space-y-2">
                {filteredExecutions.map((execution) => (
                  <Link
                    key={execution.id}
                    href={ROUTES.activity.execution(execution.id)}
                    className="flex items-center gap-4 rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-lg">
                      {execution.baleybot?.icon || '🤖'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate">
                          {execution.baleybot?.name || 'Unknown BaleyBot'}
                        </span>
                        <StatusBadge
                          status={
                            execution.status as
                              | 'pending'
                              | 'running'
                              | 'completed'
                              | 'failed'
                              | 'cancelled'
                          }
                        />
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        {execution.startedAt && (
                          <span>{formatTimeAgo(new Date(execution.startedAt))}</span>
                        )}
                        {execution.durationMs && (
                          <span>Duration: {formatDuration(execution.durationMs)}</span>
                        )}
                        {execution.triggeredBy && (
                          <span className="capitalize">
                            Triggered: {execution.triggeredBy}
                          </span>
                        )}
                      </div>
                      {execution.status === 'failed' && execution.error && (
                        <p className="text-xs text-destructive mt-1 truncate max-w-md">
                          {String(execution.error).slice(0, 100)}
                        </p>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}

                {/* Load More button */}
                {nextCursor && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      onClick={handleLoadMore}
                      disabled={isFetching}
                    >
                      {isFetching ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : null}
                      Load More
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                icon={Activity}
                title="No activity yet"
                description="Run a BaleyBot to see execution history here."
                action={{
                  label: 'Go to BaleyBots',
                  href: ROUTES.dashboard,
                }}
              />
            )}
          </CardContent>
        </Card>
    </PageShell>
  );
}
