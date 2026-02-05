'use client';

import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Timer, Ban, RefreshCw } from 'lucide-react';

/**
 * Map task status to badge styling classes.
 */
function statusClasses(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    case 'running':
      return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'completed':
      return 'bg-green-500/10 text-green-600 border-green-500/20';
    case 'failed':
      return 'bg-red-500/10 text-red-600 border-red-500/20';
    case 'cancelled':
      return 'bg-muted text-muted-foreground border-muted';
    default:
      return 'bg-muted text-muted-foreground border-muted';
  }
}

/**
 * Format a date for display in task rows.
 */
function formatRunTime(date: Date | string): string {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Scheduled tasks page.
 *
 * Lists all workspace scheduled tasks with their BaleyBot association,
 * run time, status, and cron expression for recurring tasks.
 */
export default function ScheduledTasksPage() {
  const utils = trpc.useUtils();
  const { data: tasks, isLoading } = trpc.scheduledTasks.list.useQuery();
  const cancelMutation = trpc.scheduledTasks.cancel.useMutation({
    onSuccess() {
      utils.scheduledTasks.list.invalidate();
    },
  });

  function handleCancel(id: string): void {
    cancelMutation.mutate({ id });
  }

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Scheduled Tasks
            </h1>
            <p className="text-muted-foreground">
              View and manage tasks scheduled by your BaleyBots
            </p>
          </div>
        </div>

        {/* Tasks List */}
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : tasks && tasks.length > 0 ? (
          <div className="flex flex-col gap-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between rounded-xl border bg-card p-4"
              >
                <div className="flex items-center gap-4 min-w-0">
                  {/* BaleyBot icon and name */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl shrink-0">
                      {task.baleybot?.icon || '🤖'}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {task.baleybot?.name || 'Unknown BaleyBot'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {formatRunTime(task.runAt)}
                        </span>
                        {task.cronExpression && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <RefreshCw className="h-3 w-3" />
                            {task.cronExpression}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {/* Status badge */}
                  <Badge
                    variant="outline"
                    className={cn('capitalize', statusClasses(task.status))}
                  >
                    {task.status}
                  </Badge>

                  {/* Cancel button for pending tasks */}
                  {task.status === 'pending' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancel(task.id)}
                      disabled={cancelMutation.isPending}
                    >
                      <Ban className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Timer}
            title="No scheduled tasks"
            description="Tasks will appear here when your BaleyBots schedule future work."
          />
        )}
      </div>
    </div>
  );
}
