'use client';

import { useEffect, useRef, useState } from 'react';
import { User, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SegmentRenderer, CREATOR_CONFIG } from '@/components/chat';
import type { StreamSegment } from '@baleybots/chat';
import type { CreatorMessage } from '@/lib/baleybot/creator-types';
import { AgentActivityPanel } from './AgentActivityPanel';
import { InlineAgentIndicators } from './InlineAgentIndicator';
import { ConnectionActionCard } from './ConnectionActionCard';
import type { ConnectionAction } from './ConnectionActionCard';

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
  /** Callback to send a message (used by advisor action buttons) */
  onSendMessage?: (message: string) => void;
  /** Agent activity events for the expandable activity panel */
  agentEvents?: AgentActivityEvent[];
  /** Real-time streaming text from creator_bot (shown as a live message bubble) */
  streamingText?: string;
  /** Connection actions performed during streaming */
  connectionActions?: ConnectionAction[];
  /** Real-time streaming reasoning from creator_bot */
  streamingReasoning?: string;
}

/**
 * ConversationThread displays the chat history as a clean, barebones chat.
 *
 * Uses the unified chat component library's SegmentRenderer for content
 * rendering (text, reasoning, tool calls) while keeping creator-specific
 * card wrappers, system messages, and building indicators.
 */
export function ConversationThread({
  messages,
  className,
  embedded: _embedded = false,
  isBuilding = false,
  streamingProgress,
  onOptionSelect: _onOptionSelect,
  onSendMessage,
  agentEvents,
  streamingText,
  connectionActions,
  streamingReasoning,
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
    <StreamingMessage text={streamingText} agentEvents={agentEvents} connectionActions={connectionActions} reasoning={streamingReasoning} />
  ) : isBuilding ? (
    <BuildingIndicator progress={streamingProgress} agentEvents={agentEvents} />
  ) : null;

  const messageList = (
    <>
      {messages.map((message, index) => {
        const isLatest = index === messages.length - 1 && !streamingBubble;
        if (message.role === 'user') {
          return <UserMessage key={message.id} message={message} isLatest={isLatest} />;
        }
        if (message.role === 'system') {
          return (
            <SystemMessage
              key={message.id}
              message={message}
              onOptionSelect={_onOptionSelect}
              onSendMessage={onSendMessage}
            />
          );
        }
        return <AssistantMessage key={message.id} message={message} isLatest={isLatest} />;
      })}
      {streamingBubble}
    </>
  );

  return (
    <div className={cn('flex-1 overflow-hidden flex flex-col', className)}>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-5"
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        {messageList}
      </div>
    </div>
  );
}

// ============================================================================
// SEGMENT BUILDERS — convert creator data into SDK-aligned StreamSegment[]
// ============================================================================

/** Build segments from a stored assistant message (text + optional reasoning) */
function buildMessageSegments(message: CreatorMessage): StreamSegment[] {
  const segments: StreamSegment[] = [];
  const ts = message.timestamp.getTime();

  if (message.thinking) {
    segments.push({
      type: 'reasoning',
      id: `${message.id}-reasoning`,
      timestamp: ts,
      content: message.thinking,
      isStreaming: false,
    });
  }

  if (message.content) {
    segments.push({
      type: 'text',
      id: `${message.id}-text`,
      timestamp: ts,
      content: message.content,
      isStreaming: false,
    });
  }

  return segments;
}

/** Build segments from live streaming props */
function buildStreamingSegments(text: string, reasoning?: string): StreamSegment[] {
  const segments: StreamSegment[] = [];
  const now = Date.now();

  if (reasoning) {
    segments.push({
      type: 'reasoning',
      id: 'streaming-reasoning',
      timestamp: now,
      content: reasoning,
      isStreaming: !text, // Active while no text has arrived yet
    });
  }

  if (text) {
    segments.push({
      type: 'text',
      id: 'streaming-text',
      timestamp: now,
      content: text,
      isStreaming: true,
    });
  }

  return segments;
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
      <div className="max-w-[90%] rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-[0.9375rem] leading-relaxed text-primary-foreground shadow-[0_12px_30px_-24px_hsl(var(--primary)/0.9)]">
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <time
          className="mt-1.5 block text-xs text-primary-foreground/60"
          dateTime={message.timestamp.toISOString()}
        >
          {formatTime(message.timestamp)}
        </time>
      </div>
    </div>
  );
}

// ============================================================================
// ASSISTANT MESSAGE — card wrapper with SegmentRenderer for content
// ============================================================================

function AssistantMessage({
  message,
  isLatest,
}: {
  message: CreatorMessage;
  isLatest: boolean;
}) {
  const isError = message.metadata?.isError;
  const segments = buildMessageSegments(message);

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
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground/80 mb-2">
            <Bot className="h-3.5 w-3.5" />
            BaleyBot
          </span>

          {/* Content via unified SegmentRenderer (handles text + reasoning) */}
          <SegmentRenderer segments={segments} config={CREATOR_CONFIG} />
        </div>

        {/* Timestamp */}
        <time
          className="block text-xs text-muted-foreground/60"
          dateTime={message.timestamp.toISOString()}
        >
          {formatTime(message.timestamp)}
        </time>
      </div>
    </div>
  );
}

// ============================================================================
// SYSTEM MESSAGE (catastrophic AI failure, not from the model)
// ============================================================================

function SystemMessage({
  message,
  onOptionSelect,
  onSendMessage,
}: {
  message: CreatorMessage;
  onOptionSelect?: (optionId: string) => void;
  onSendMessage?: (message: string) => void;
}) {
  const isError = message.metadata?.isError;
  const options = message.metadata?.options;
  const advisorActions = message.metadata?.advisorActions;
  const diagnostic = message.metadata?.diagnostic as { level?: string; details?: string } | undefined;
  const isSuccess = diagnostic?.level === 'success';

  return (
    <div className="flex justify-center animate-fade-in">
      <div
        className={cn(
          'max-w-[85%] rounded-xl px-4 py-2.5 text-center text-sm leading-relaxed',
          isError
            ? 'bg-red-500/8 text-red-400 border border-red-500/20'
            : isSuccess
              ? 'bg-emerald-500/8 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
              : 'bg-muted/50 text-muted-foreground'
        )}
      >
        <p>{message.content}</p>
        {diagnostic?.details && (
          <p className="mt-1 text-xs opacity-70">{diagnostic.details}</p>
        )}
        {options && options.length > 0 && onOptionSelect && (
          <div className="flex justify-center gap-2 mt-2">
            {options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => onOptionSelect(opt.id)}
                className="text-xs px-3 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
        {advisorActions && advisorActions.length > 0 && onSendMessage && (
          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {advisorActions.map((action, i) => (
              <button
                key={i}
                onClick={() => onSendMessage(action.prompt)}
                className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm text-primary hover:bg-primary/10 transition-colors"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// STREAMING MESSAGE — live text from creator_bot with SegmentRenderer
// ============================================================================

function StreamingMessage({
  text,
  agentEvents,
  connectionActions,
  reasoning,
}: {
  text: string;
  agentEvents?: AgentActivityEvent[];
  connectionActions?: ConnectionAction[];
  reasoning?: string;
}) {
  const segments = buildStreamingSegments(text, reasoning);

  return (
    <div className="animate-fade-in">
      <div className="rounded-[1.1rem] border border-border/60 bg-card/70 p-4 shadow-[0_12px_35px_-28px_rgba(0,0,0,0.8)]">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground/80 mb-2">
          <Bot className="h-3.5 w-3.5" />
          BaleyBot
        </span>

        {/* Content via unified SegmentRenderer (handles text + reasoning) */}
        <SegmentRenderer segments={segments} config={CREATOR_CONFIG} />

        {/* Inline agent indicators — subtle dividers for specialist bot activity */}
        {agentEvents && agentEvents.length > 0 && (
          <InlineAgentIndicators events={agentEvents} />
        )}

        {/* Connection action cards — inline visual feedback for connection operations */}
        {connectionActions && connectionActions.length > 0 && (
          <div className="mt-3 space-y-2">
            {connectionActions.map((ca, i) => (
              <ConnectionActionCard key={`${ca.action}-${ca.timestamp}-${i}`} action={ca} />
            ))}
          </div>
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
    <span className="text-xs text-muted-foreground/50 tabular-nums">
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
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground/80">
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
          <span className="text-sm text-foreground/80">
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
