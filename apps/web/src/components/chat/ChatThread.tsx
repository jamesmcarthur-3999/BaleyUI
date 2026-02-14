'use client';

import { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Bot, MessageSquare } from 'lucide-react';
import { ChatBubble } from './ChatBubble';
import { useVariableVirtualList } from '@/hooks/useVirtualList';
import type { ChatMessage, ChatConfig } from './types';

/** Threshold (in messages) below which we skip virtualization overhead */
const VIRTUALIZE_THRESHOLD = 50;

/** Estimate message height by segment types for virtual list positioning */
function estimateMessageHeight(msg: ChatMessage): number {
  if (!msg.segments || msg.segments.length === 0) return 80;
  let h = 48; // base padding/avatar
  for (const seg of msg.segments) {
    switch (seg.type) {
      case 'text':
        // ~20px per 80 chars of content, min 40px
        h += Math.max(40, Math.ceil((seg.content?.length ?? 40) / 80) * 20);
        break;
      case 'tool_call':
        h += 100;
        break;
      case 'spawn_agent':
        h += 180;
        break;
      case 'reasoning':
        h += 60;
        break;
      case 'error':
        h += 80;
        break;
      default:
        h += 60;
    }
  }
  return h;
}

interface ChatThreadProps {
  messages: ChatMessage[];
  config: ChatConfig;
  isTyping?: boolean;
  onRetry?: (messageId: string) => void;
  emptyState?: React.ReactNode;
  className?: string;
}

export function ChatThread({
  messages,
  config,
  isTyping,
  onRetry,
  emptyState,
  className,
}: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  // Use virtual scrolling for long conversations
  const shouldVirtualize = messages.length > VIRTUALIZE_THRESHOLD;

  const { containerRef, totalHeight, virtualItems, scrollToIndex } = useVariableVirtualList({
    itemCount: messages.length,
    estimatedItemHeight: 100,
    getItemHeight: shouldVirtualize
      ? (index: number) => estimateMessageHeight(messages[index]!)
      : undefined,
    overscan: 5,
  });

  // Track whether user is near bottom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      const threshold = 100;
      isNearBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll when new content arrives (if user is near bottom)
  useEffect(() => {
    if (!config.autoScroll || !isNearBottomRef.current) return;

    if (shouldVirtualize) {
      scrollToIndex(messages.length - 1, 'end');
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isTyping, config.autoScroll, shouldVirtualize]);

  if (messages.length === 0 && !isTyping) {
    return (
      <div className={cn('flex-1 flex items-center justify-center', className)}>
        {emptyState ?? (
          <div className="text-center text-muted-foreground/50">
            <MessageSquare className="h-8 w-8 mx-auto mb-2" />
            <p className="text-sm">No messages yet</p>
          </div>
        )}
      </div>
    );
  }

  // For short conversations, render all messages directly (no virtualization overhead)
  if (!shouldVirtualize) {
    return (
      <div ref={containerRef} className={cn('flex-1 min-h-0 overflow-y-auto overflow-x-hidden', className)}>
        <div className={cn(
            'py-4 space-y-1',
            config.variant === 'full-page' ? 'max-w-3xl mx-auto' : 'px-3',
          )}>
          {messages.map((msg) => (
            <ChatBubble
              key={msg.id}
              message={msg}
              config={config}
              onRetry={onRetry ? () => onRetry(msg.id) : undefined}
            />
          ))}

          {isTyping && <TypingIndicator config={config} />}
          <div ref={bottomRef} />
        </div>
      </div>
    );
  }

  // Virtualized rendering for long conversations
  return (
    <div ref={containerRef} className={cn('flex-1 min-h-0 overflow-y-auto overflow-x-hidden', className)}>
      <div
        className={cn(
          'relative',
          config.variant === 'full-page' ? 'max-w-3xl mx-auto' : 'px-3',
        )}
        style={{ height: totalHeight + 32 /* py-4 padding */ }}
      >
        {virtualItems.map((item) => {
          const msg = messages[item.index]!;
          return (
            <div
              key={msg.id}
              style={{
                position: 'absolute',
                top: item.start + 16, /* top padding */
                left: 0,
                right: 0,
                minHeight: item.size,
              }}
            >
              <ChatBubble
                message={msg}
                config={config}
                onRetry={onRetry ? () => onRetry(msg.id) : undefined}
              />
            </div>
          );
        })}
      </div>

      {isTyping && (
        <div className={cn(config.variant === 'full-page' ? 'max-w-3xl mx-auto' : 'px-3')}>
          <TypingIndicator config={config} />
        </div>
      )}
    </div>
  );
}

function TypingIndicator({ config }: { config: ChatConfig }) {
  return (
    <div className="flex items-center gap-3 px-4 py-4 animate-fade-in">
      {config.showAvatars && (
        <div className="flex-none w-7 h-7 rounded-full flex items-center justify-center bg-foreground/[0.05]">
          <Bot className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
      <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-foreground/[0.03]">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-loading-dot" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-loading-dot" style={{ animationDelay: '200ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-loading-dot" style={{ animationDelay: '400ms' }} />
        </span>
      </div>
    </div>
  );
}
