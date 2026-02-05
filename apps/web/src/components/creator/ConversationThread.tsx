'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, User, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CreatorMessage } from '@/lib/baleybot/creator-types';

// Swipe threshold for gesture detection (Phase 4.7)
const SWIPE_THRESHOLD = 50;
// Minimum swipe velocity (pixels/ms)
const SWIPE_VELOCITY_THRESHOLD = 0.3;

interface ConversationThreadProps {
  messages: CreatorMessage[];
  className?: string;
  /** Default collapsed state */
  defaultCollapsed?: boolean;
  /** Maximum height when expanded (CSS value) */
  maxHeight?: string;
}

/**
 * ConversationThread displays the chat history between user and assistant.
 *
 * Features:
 * - User messages right-aligned, assistant messages left-aligned
 * - Auto-scroll to bottom on new messages
 * - Collapsible to save space
 * - Shows message count when collapsed
 */
export function ConversationThread({
  messages,
  className,
  defaultCollapsed = false,
  maxHeight = '300px',
}: ConversationThreadProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef(messages.length);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > lastMessageCountRef.current && scrollRef.current && !isCollapsed) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
    lastMessageCountRef.current = messages.length;
  }, [messages.length, isCollapsed]);

  // Auto-expand when first message arrives
  useEffect(() => {
    if (messages.length > 0 && isCollapsed && lastMessageCountRef.current === 0) {
      setIsCollapsed(false);
    }
  }, [messages.length, isCollapsed]);

  // Touch gesture handling refs (Phase 4.7)
  const touchStartRef = useRef<{ y: number; time: number } | null>(null);

  // Swipe gesture handling (Phase 4.7)
  const handleSwipe = (direction: 'up' | 'down') => {
    if (direction === 'down' && !isCollapsed) {
      setIsCollapsed(true);
    } else if (direction === 'up' && isCollapsed) {
      setIsCollapsed(false);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartRef.current = { y: touch.clientY, time: Date.now() };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const touch = e.changedTouches[0];
    if (!touch) return;

    const deltaY = touch.clientY - touchStartRef.current.y;
    const deltaTime = Date.now() - touchStartRef.current.time;
    const velocity = Math.abs(deltaY) / deltaTime;

    // Detect swipe based on velocity and offset
    if (Math.abs(deltaY) > SWIPE_THRESHOLD || velocity > SWIPE_VELOCITY_THRESHOLD) {
      if (deltaY > 0) {
        handleSwipe('down');
      } else {
        handleSwipe('up');
      }
    }

    touchStartRef.current = null;
  };

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className={cn('rounded-xl border bg-background/50 touch-pan-x', className)}>
      {/* Header with collapse toggle and swipe gesture (Phase 4.7) */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={cn(
          'w-full flex items-center justify-between px-4 py-2.5',
          'text-sm font-medium text-muted-foreground',
          'hover:bg-muted/50 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-inset',
          'cursor-grab active:cursor-grabbing',
          !isCollapsed && 'border-b'
        )}
        aria-expanded={!isCollapsed}
        aria-controls="conversation-thread"
      >
        <span className="flex items-center gap-2">
          <Bot className="h-4 w-4" aria-hidden="true" />
          Conversation
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">
            {messages.length} {messages.length === 1 ? 'message' : 'messages'}
          </span>
        </span>
        <span className="flex items-center gap-1">
          {/* Swipe hint on mobile (Phase 4.7) */}
          <span className="text-[10px] text-muted-foreground/50 sm:hidden">
            {isCollapsed ? 'swipe up' : 'swipe down'}
          </span>
          {isCollapsed ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
      </button>

      {/* Messages container */}
      <div
        id="conversation-thread"
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 ease-in-out',
          isCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
        )}
      >
        <div className="overflow-hidden">
          <div
            ref={scrollRef}
            className="overflow-y-auto px-4 py-3 space-y-3"
            style={{ maxHeight }}
          >
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                isLatest={index === messages.length - 1}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: CreatorMessage;
  isLatest: boolean;
}

function MessageBubble({ message, isLatest }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex items-start gap-2',
        isUser ? 'flex-row-reverse' : 'flex-row',
        isLatest && 'animate-fade-in-up'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground'
        )}
        aria-hidden="true"
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>

      {/* Message bubble */}
      <div
        className={cn(
          'max-w-[80%] px-3 py-2 rounded-xl text-sm',
          isUser
            ? 'bg-primary text-primary-foreground rounded-tr-sm'
            : 'bg-muted text-foreground rounded-tl-sm'
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <time
          className={cn(
            'text-[10px] mt-1 block',
            isUser ? 'text-primary-foreground/70' : 'text-muted-foreground'
          )}
          dateTime={message.timestamp.toISOString()}
        >
          {formatTime(message.timestamp)}
        </time>
      </div>
    </div>
  );
}

/**
 * Format timestamp for display
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}
