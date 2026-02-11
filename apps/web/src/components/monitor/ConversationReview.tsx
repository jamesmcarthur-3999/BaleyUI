'use client';

import { useState } from 'react';
import { MessageSquare, ChevronRight, Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConversationSummary {
  conversationId: string | null;
  messageCount: number;
  firstAt: Date | string;
  lastAt: Date | string;
  lastStatus: string;
  totalTokens: number;
  totalDurationMs: number;
}

interface ConversationReviewProps {
  baleybotId: string;
  conversations: ConversationSummary[];
  className?: string;
}

function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'completed'
    ? 'bg-emerald-500'
    : status === 'failed'
      ? 'bg-red-500'
      : status === 'running'
        ? 'bg-blue-500 animate-pulse'
        : 'bg-zinc-400';
  return <span className={cn('inline-block h-2 w-2 rounded-full', color)} />;
}

export function ConversationReview({ conversations, className }: ConversationReviewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (conversations.length === 0) return null;

  return (
    <div className={cn('rounded-xl border bg-background overflow-hidden', className)}>
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b bg-muted/20">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Conversations</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{conversations.length} threads</span>
      </div>
      <div className="divide-y">
        {conversations.map((conv) => {
          const id = conv.conversationId ?? 'unknown';
          const isExpanded = expandedId === id;
          return (
            <div key={id}>
              <button
                className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : id)}
                aria-expanded={isExpanded}
                aria-controls={`conv-detail-${id}`}
              >
                <StatusDot status={conv.lastStatus} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium truncate">
                      Conversation {id.slice(0, 8)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {conv.messageCount} messages
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {formatTime(conv.lastAt)}
                  </span>
                </div>
                <ChevronRight className={cn(
                  'h-3.5 w-3.5 text-muted-foreground transition-transform',
                  isExpanded && 'rotate-90',
                )} />
              </button>
              {isExpanded && (
                <div id={`conv-detail-${id}`} className="px-3.5 pb-3 pt-1 bg-muted/10 border-t">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>Duration: {(conv.totalDurationMs / 1000).toFixed(1)}s total</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Zap className="h-3 w-3" />
                      <span>Tokens: {conv.totalTokens.toLocaleString()}</span>
                    </div>
                    <div className="text-muted-foreground col-span-2">
                      Started: {new Date(conv.firstAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
