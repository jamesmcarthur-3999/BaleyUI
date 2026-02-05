'use client';

import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Bell, Check, CheckCheck } from 'lucide-react';

/**
 * Map notification priority to a badge variant.
 */
function priorityVariant(priority: string): 'destructive' | 'default' | 'secondary' {
  switch (priority) {
    case 'high':
      return 'destructive';
    case 'normal':
      return 'default';
    case 'low':
      return 'secondary';
    default:
      return 'default';
  }
}

/**
 * Format a timestamp for display in notification rows.
 */
function formatTimestamp(date: Date | string): string {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Notifications page.
 *
 * Lists all user notifications with read/unread state,
 * priority badges, and mark-read actions.
 */
export default function NotificationsPage() {
  const utils = trpc.useUtils();
  const { data: notificationsList, isLoading } = trpc.notifications.list.useQuery();
  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess() {
      utils.notifications.list.invalidate();
    },
  });
  const markAllReadMutation = trpc.notifications.markAllRead.useMutation({
    onSuccess() {
      utils.notifications.list.invalidate();
    },
  });

  const unreadCount = notificationsList?.filter((n) => !n.readAt).length ?? 0;

  function handleMarkRead(id: string): void {
    markReadMutation.mutate({ id });
  }

  function handleMarkAllRead(): void {
    markAllReadMutation.mutate();
  }

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Notifications
              </h1>
              <p className="text-muted-foreground">
                Stay updated on BaleyBot activity and system events
              </p>
            </div>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="h-6 min-w-6 justify-center">
                {unreadCount}
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              onClick={handleMarkAllRead}
              disabled={markAllReadMutation.isPending}
            >
              <CheckCheck className="h-4 w-4 mr-2" />
              Mark all read
            </Button>
          )}
        </div>

        {/* Notifications List */}
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : notificationsList && notificationsList.length > 0 ? (
          <div className="flex flex-col gap-2">
            {notificationsList.map((notification) => {
              const isUnread = !notification.readAt;

              return (
                <button
                  key={notification.id}
                  type="button"
                  className={cn(
                    'w-full text-left rounded-xl border p-4 transition-colors',
                    isUnread
                      ? 'bg-card hover:bg-accent/50 cursor-pointer'
                      : 'bg-muted/30 opacity-75'
                  )}
                  onClick={() => {
                    if (isUnread) {
                      handleMarkRead(notification.id);
                    }
                  }}
                  disabled={!isUnread || markReadMutation.isPending}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={cn(
                          'mt-1 h-2 w-2 rounded-full shrink-0',
                          isUnread ? 'bg-primary' : 'bg-transparent'
                        )}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium truncate">
                            {notification.title}
                          </h3>
                          <Badge
                            variant={priorityVariant(notification.priority)}
                            className="shrink-0 text-[10px] px-1.5 py-0"
                          >
                            {notification.priority}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {notification.message}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTimestamp(notification.createdAt)}
                      </span>
                      {isUnread && (
                        <Check className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Bell}
            title="No notifications"
            description="You're all caught up. Notifications from your BaleyBots will appear here."
          />
        )}
      </div>
    </div>
  );
}
