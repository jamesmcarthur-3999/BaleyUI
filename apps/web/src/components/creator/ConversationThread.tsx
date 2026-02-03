'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { ChevronUp, ChevronDown, User, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CreatorMessage } from '@/lib/baleybot/creator-types';

// Swipe threshold for gesture detection (Phase 4.7)
const SWIPE_THRESHOLD = 50;

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

  // Swipe gesture handling (Phase 4.7)
  const handleSwipe = useCallback((direction: 'up' | 'down') => {
    if (direction === 'down' && !isCollapsed) {
      setIsCollapsed(true);
    } else if (direction === 'up' && isCollapsed) {
      setIsCollapsed(false);
    }
  }, [isCollapsed]);

  const handleDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const { velocity, offset } = info;
    // Detect swipe based on velocity and offset
    if (Math.abs(offset.y) > SWIPE_THRESHOLD || Math.abs(velocity.y) > 300) {
      if (offset.y > 0 || velocity.y > 0) {
        handleSwipe('down');
      } else {
        handleSwipe('up');
      }
    }
  }, [handleSwipe]);

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className={cn('rounded-xl border bg-background/50 touch-pan-x', className)}>
      {/* Header with collapse toggle and swipe gesture (Phase 4.7) */}
      <motion.button
        onClick={() => setIsCollapsed(!isCollapsed)}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
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
      </motion.button>

      {/* Messages container */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            id="conversation-thread"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
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
          </motion.div>
        )}
      </AnimatePresence>
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
    <motion.div
      initial={isLatest ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'flex items-start gap-2',
        isUser ? 'flex-row-reverse' : 'flex-row'
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
    </motion.div>
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
