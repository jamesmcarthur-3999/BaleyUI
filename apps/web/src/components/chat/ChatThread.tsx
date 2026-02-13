'use client';

import { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { MessageSquare } from 'lucide-react';
import { LoadingDots } from '@/components/ui/loading-dots';
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
    <div ref={scrollRef} className={cn('flex-1 overflow-y-auto', className)}>
      <div className={cn(
          'py-4',
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
          <div className="flex items-center gap-3 px-4 py-3">
            <LoadingDots size="sm" />
            <span className="text-xs text-muted-foreground/50">Thinking...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
