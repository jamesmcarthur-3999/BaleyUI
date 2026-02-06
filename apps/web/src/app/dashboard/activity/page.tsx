'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
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
import {
  Activity,
  ArrowRight,
  Search,
} from 'lucide-react';

export default function ActivityPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [botFilter, setBotFilter] = useState('');
  const { data: executions, isLoading } = trpc.baleybots.getRecentActivity.useQuery({
    limit: 50,
  });

  // Filter executions
  const filteredExecutions = executions?.filter((exec) => {
    const matchesStatus = statusFilter === 'all' || exec.status === statusFilter;
    const matchesBot = !botFilter ||
      (exec.baleybot?.name && exec.baleybot.name.toLowerCase().includes(botFilter.toLowerCase()));
    return matchesStatus && matchesBot;
  });

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

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Activity</h1>
          <p className="text-muted-foreground">
            View all BaleyBot executions and their results
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by bot name..."
              value={botFilter}
              onChange={(e) => setBotFilter(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
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
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredExecutions && filteredExecutions.length > 0 ? (
              <div className="space-y-2">
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
      </div>
    </div>
  );
}
