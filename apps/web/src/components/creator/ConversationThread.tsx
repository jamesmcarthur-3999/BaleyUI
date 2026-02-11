'use client';

import { useEffect, useRef, useState } from 'react';
import { User, Bot, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RenderMarkdown } from '@/components/shared/RenderMarkdown';
import type { CreatorMessage } from '@/lib/baleybot/creator-types';
import { AgentActivityPanel } from './AgentActivityPanel';

export interface StreamingProgress {
  phase: string;
  message: string;
  startedAt: number;
}

interface AgentActivityEvent {
  event: Record<string, unknown>;
  entityName?: string;
  timestamp: number;
}

interface ConversationThreadProps {
  messages: CreatorMessage[];
  className?: string;
  /** Default collapsed state */
  defaultCollapsed?: boolean;
  /** Maximum height when expanded (CSS value) */
  maxHeight?: string;
  /** Embedded mode: no border/chrome, fills parent */
  embedded?: boolean;
  /** Show thinking/building indicator */
  isBuilding?: boolean;
  /** Streaming progress info for the building indicator */
  streamingProgress?: StreamingProgress | null;
  /** Callback when user selects an option card */
  onOptionSelect?: (optionId: string) => void;
  /** Agent activity events for the expandable activity panel */
  agentEvents?: AgentActivityEvent[];
  /** Real-time streaming text from creator_bot (shown as a live message bubble) */
  streamingText?: string;
}

/**
 * ConversationThread displays the chat history as a clean, barebones chat.
 *
 * The AI leads the process — all rich detail lives in the right panel tabs.
 * Chat shows only: message text (markdown), thinking toggle, timestamps.
 */
export function ConversationThread({
  messages,
  className,
  embedded = false,
  isBuilding = false,
  streamingProgress,
  onOptionSelect: _onOptionSelect,
  agentEvents,
  streamingText,
}: ConversationThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef(messages.length);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > lastMessageCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
    lastMessageCountRef.current = messages.length;
  }, [messages.length]);

  // Also scroll when building starts or streaming text updates
  useEffect(() => {
    if ((isBuilding || streamingText) && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [isBuilding, streamingText]);

  if (messages.length === 0 && !isBuilding) {
    return null;
  }

  const streamingBubble = streamingText ? (
    <StreamingMessage text={streamingText} agentEvents={agentEvents} />
  ) : isBuilding ? (
    <BuildingIndicator progress={streamingProgress} agentEvents={agentEvents} />
  ) : null;

  const messageList = (
    <>
      {messages.map((message, index) =>
        message.role === 'user' ? (
          <UserMessage
            key={message.id}
            message={message}
            isLatest={index === messages.length - 1 && !streamingBubble}
          />
        ) : (
          <AssistantMessage
            key={message.id}
            message={message}
            isLatest={index === messages.length - 1 && !streamingBubble}
          />
        )
      )}
      {streamingBubble}
    </>
  );

  return (
    <div className={cn('flex-1 overflow-hidden flex flex-col', className)}>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-4"
      >
        {messageList}
      </div>
    </div>
  );
}

// ============================================================================
// USER MESSAGE
// ============================================================================

function UserMessage({
  message,
  isLatest,
}: {
  message: CreatorMessage;
  isLatest: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 flex-row-reverse',
        isLatest && 'animate-fade-in-up'
      )}
    >
      <div
        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-primary text-primary-foreground"
        aria-hidden="true"
      >
        <User className="h-4 w-4" />
      </div>
      <div className="max-w-[90%] rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-[15px] leading-7 text-primary-foreground shadow-[0_12px_30px_-24px_hsl(var(--primary)/0.9)]">
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <time
          className="mt-1.5 block text-[11px] text-primary-foreground/70"
          dateTime={message.timestamp.toISOString()}
        >
          {formatTime(message.timestamp)}
        </time>
      </div>
    </div>
  );
}

// ============================================================================
// ASSISTANT MESSAGE
// ============================================================================

function AssistantMessage({
  message,
  isLatest,
}: {
  message: CreatorMessage;
  isLatest: boolean;
}) {
  const [showThinking, setShowThinking] = useState(false);
  const isError = message.metadata?.isError;

  return (
    <div className={cn(isLatest && 'animate-fade-in-up')}>
      <div className="space-y-2">
        <div
          className={cn(
            'rounded-[1.1rem] border p-4 shadow-[0_12px_35px_-28px_rgba(0,0,0,0.8)]',
            isError
              ? 'border-red-500/35 bg-red-500/5'
              : 'border-border/60 bg-card/70'
          )}
        >
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground mb-2">
            <Bot className="h-3.5 w-3.5" />
            BaleyBot
          </span>

          {/* Message text with markdown */}
          <div className="text-[15px] text-foreground/95 leading-7">
            <RenderMarkdown text={message.content} />
          </div>
        </div>

        {/* Thinking/reasoning expandable */}
        {message.thinking && (
          <div>
            <button
              onClick={() => setShowThinking(!showThinking)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
            >
              <Brain className="h-3 w-3" />
              {showThinking ? 'Hide reasoning' : 'Show reasoning'}
            </button>
            {showThinking && (
              <div className="mt-1.5 pl-3 border-l-2 border-muted-foreground/20 text-xs text-muted-foreground whitespace-pre-wrap">
                {message.thinking}
              </div>
            )}
          </div>
        )}

        {/* Timestamp */}
        <time
          className="block text-[11px] text-muted-foreground"
          dateTime={message.timestamp.toISOString()}
        >
          {formatTime(message.timestamp)}
        </time>
      </div>
    </div>
  );
}

// ============================================================================
// STREAMING MESSAGE (live text from creator_bot)
// ============================================================================

function StreamingMessage({ text, agentEvents }: { text: string; agentEvents?: AgentActivityEvent[] }) {
  return (
    <div className="animate-fade-in">
      <div className="rounded-[1.1rem] border border-border/60 bg-card/70 p-4 shadow-[0_12px_35px_-28px_rgba(0,0,0,0.8)]">
        <div className="flex items-center gap-1 mb-2">
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground">
            <Bot className="h-3.5 w-3.5" />
            BaleyBot
          </span>
          <span className="inline-flex gap-[3px] ml-1.5">
            <span className="w-[4px] h-[4px] rounded-full bg-primary/70 animate-loading-dot" style={{ animationDelay: '0ms' }} />
            <span className="w-[4px] h-[4px] rounded-full bg-primary/70 animate-loading-dot" style={{ animationDelay: '200ms' }} />
            <span className="w-[4px] h-[4px] rounded-full bg-primary/70 animate-loading-dot" style={{ animationDelay: '400ms' }} />
          </span>
        </div>
        <div className="text-[15px] text-foreground/95 leading-7">
          <RenderMarkdown text={text} />
        </div>

        {/* Agent activity panel — shows when spawned bots are active */}
        {agentEvents && agentEvents.length > 0 && (
          <AgentActivityPanel events={agentEvents} className="mt-3" />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// BUILDING INDICATOR
// ============================================================================

const PHASE_LABELS: Record<string, string> = {
  discovery: 'Understanding your request',
  thinking: 'Thinking',
  building: 'Building',
  generating: 'Generating code',
  complete: 'Finishing up',
};

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  if (elapsed < 3) return null;
  return (
    <span className="text-[11px] text-muted-foreground/50 tabular-nums">
      {elapsed}s
    </span>
  );
}

function BuildingIndicator({ progress, agentEvents }: { progress?: StreamingProgress | null; agentEvents?: AgentActivityEvent[] }) {
  const message = progress?.message;
  const phase = progress?.phase ?? 'discovery';
  const startedAt = progress?.startedAt ?? Date.now();

  const displayMessage = message || PHASE_LABELS[phase] || 'Thinking...';

  return (
    <div className="animate-fade-in">
      <div className="rounded-[1.1rem] border border-border/60 bg-card/70 p-4 shadow-[0_12px_35px_-28px_rgba(0,0,0,0.8)]">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground">
            <Bot className="h-3.5 w-3.5" />
            BaleyBot
          </span>
          <ElapsedTimer startedAt={startedAt} />
        </div>

        {/* Status message with animated dots */}
        <div className="flex items-center gap-2.5">
          <span className="inline-flex gap-[3px] shrink-0">
            <span className="w-[5px] h-[5px] rounded-full bg-primary/70 animate-loading-dot" style={{ animationDelay: '0ms' }} />
            <span className="w-[5px] h-[5px] rounded-full bg-primary/70 animate-loading-dot" style={{ animationDelay: '200ms' }} />
            <span className="w-[5px] h-[5px] rounded-full bg-primary/70 animate-loading-dot" style={{ animationDelay: '400ms' }} />
          </span>
          <span className="text-[14px] text-foreground/80">
            {displayMessage}
          </span>
        </div>

        {/* Animated progress bar */}
        <div className="mt-3 h-[3px] rounded-full bg-muted-foreground/10 overflow-hidden">
          <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-transparent via-primary/60 to-transparent animate-progress-slide" />
        </div>

        {/* Agent activity panel — shows when spawned bots are active */}
        {agentEvents && agentEvents.length > 0 && (
          <AgentActivityPanel events={agentEvents} className="mt-3" />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}
