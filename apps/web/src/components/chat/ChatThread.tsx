'use client';

import { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Bot, MessageSquare } from 'lucide-react';
import { ChatBubble } from './ChatBubble';
import type { ChatMessage, ChatConfig } from './types';

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  // Track whether user is near bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      const threshold = 100;
      isNearBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Auto-scroll when new content arrives (if user is near bottom)
  useEffect(() => {
    if (config.autoScroll && isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping, config.autoScroll]);

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

  return (
    <div ref={scrollRef} className={cn('flex-1 overflow-y-auto overflow-x-hidden', className)}>
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

        {isTyping && (
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
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
