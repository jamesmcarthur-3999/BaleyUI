'use client';

import { trpc } from '@/lib/trpc/client';
import { ROUTES } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/format';
import { BotAnalyticsCards } from './BotAnalyticsCards';
import { ConversationReview } from './ConversationReview';
import { Loader2, ExternalLink, AlertTriangle, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UnifiedStatusBadge } from '@/components/ui/unified-status-badge';
import { useRouter } from 'next/navigation';

interface BotMonitorPanelProps {
  baleybotId: string;
  baleybotName: string;
  onPauseOrResume?: () => void;
  isPauseResumeBusy?: boolean;
  className?: string;
}

export function BotMonitorPanel({ baleybotId, baleybotName, onPauseOrResume, isPauseResumeBusy, className }: BotMonitorPanelProps) {
  const router = useRouter();

  const { data: analytics, isLoading: isLoadingAnalytics } = trpc.analytics.getBaleybotAnalytics.useQuery(
    { baleybotId, days: 30 },
  );

  const { data: executions, isLoading: isLoadingExecs } = trpc.analytics.getBaleybotExecutions.useQuery(
    { baleybotId, limit: 10 },
  );

  const { data: conversations } = trpc.analytics.getBaleybotConversations.useQuery(
    { baleybotId, limit: 10 },
  );

  const hasConversations = conversations && conversations.length > 0;

  if (isLoadingAnalytics || isLoadingExecs) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-5 overflow-y-auto', className)}>
      {/* Live status banner */}
      <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            {baleybotName} is live
          </span>
        </div>
        {onPauseOrResume && (
          <Button
            size="sm"
            variant="outline"
            onClick={onPauseOrResume}
            disabled={isPauseResumeBusy}
            className="h-7 text-xs gap-1.5"
          >
            {isPauseResumeBusy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Pause className="h-3 w-3" />
            )}
            Pause
          </Button>
        )}
      </div>

      {/* Analytics cards */}
      {analytics && <BotAnalyticsCards data={analytics} />}

      {/* Top errors */}
      {analytics && analytics.topErrors.length > 0 && (
        <div className="rounded-xl border bg-background p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-medium">Common Errors</span>
          </div>
          <div className="space-y-1.5">
            {analytics.topErrors.slice(0, 3).map((err, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate max-w-[80%]">{err.message}</span>
                <span className="text-muted-foreground tabular-nums">{err.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conversation review (for chat-type BBs) */}
      {hasConversations && (
        <ConversationReview baleybotId={baleybotId} conversations={conversations} />
      )}

      {/* Recent executions */}
      <div className="rounded-xl border bg-background overflow-hidden">
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b bg-muted/20">
          <span className="text-xs font-medium">Recent Executions</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] gap-1"
            onClick={() => router.push(ROUTES.activity.list)}
          >
            View all
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
        {executions && executions.length > 0 ? (
          <div className="divide-y">
            {executions.map((exec) => (
              <button
                key={exec.id}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-muted/30 transition-colors"
                onClick={() => router.push(ROUTES.activity.execution(exec.id))}
              >
                <UnifiedStatusBadge status={exec.status as any} domain="execution" size="sm" />
                <span className="text-xs text-muted-foreground truncate flex-1">
                  {exec.input
                    ? String(typeof exec.input === 'string' ? exec.input : JSON.stringify(exec.input)).slice(0, 60)
                    : 'No input'}
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                  {exec.durationMs ? `${(exec.durationMs / 1000).toFixed(1)}s` : '--'}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {formatTimeAgo(exec.createdAt)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-3.5 py-6 text-center text-xs text-muted-foreground">
            No executions yet. Run your bot to see activity here.
          </div>
        )}
      </div>
    </div>
  );
}
