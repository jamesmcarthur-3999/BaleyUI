'use client';

import { useState, useRef, useEffect } from 'react';
import { useReviewExecution } from './ReviewExecutionContext';
import type { ReviewMessage, ReviewContentBlock, ToolCallState } from './ReviewExecutionContext';
import { ToolCallCard } from '@/components/streaming/ToolCallCard';
import type { ToolCall } from '@/components/streaming/ToolCallCard';
import { StreamdownMarkdown } from '@/components/shared/StreamdownMarkdown';
import { Button } from '@/components/ui/button';
import { Send, Bot, User, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInterfaceProps {
  className?: string;
}

function toToolCall(tc: ToolCallState): ToolCall {
  return {
    id: tc.id,
    toolName: tc.toolName,
    arguments: tc.arguments,
    parsedArguments: tc.parsedArguments,
    status: tc.status,
    result: tc.result,
    error: tc.error,
    startTime: tc.startTime,
    endTime: tc.endTime,
  };
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ============================================================================
// USER MESSAGE BUBBLE
// ============================================================================

function UserBubble({ message }: { message: ReviewMessage }) {
  return (
    <div className="flex items-start gap-2 flex-row-reverse animate-fade-in-up">
      <div
        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-primary text-primary-foreground"
        aria-hidden="true"
      >
        <User className="h-4 w-4" />
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-[0.9375rem] leading-relaxed text-primary-foreground shadow-[0_12px_30px_-24px_hsl(var(--primary)/0.9)]">
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <time className="mt-1.5 block text-xs text-primary-foreground/60">
          {formatTime(message.timestamp)}
        </time>
      </div>
    </div>
  );
}

// ============================================================================
// ASSISTANT MESSAGE BUBBLE (finalized)
// ============================================================================

function AssistantBubble({ message }: { message: ReviewMessage }) {
  return (
    <div className="animate-fade-in-up">
      <div className="rounded-[1.1rem] border border-border/60 bg-card/70 p-4 shadow-[0_12px_35px_-28px_rgba(0,0,0,0.8)]">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground/80 mb-2">
          <Bot className="h-3.5 w-3.5" />
          BaleyBot
        </span>

        <div className="space-y-2">
          {message.blocks.map((block, i) => (
            <BlockRenderer
              key={i}
              block={block}
              toolCallStates={message.toolCallStates}
            />
          ))}
        </div>

        <time className="mt-2 block text-xs text-muted-foreground/60">
          {formatTime(message.timestamp)}
        </time>
      </div>
    </div>
  );
}

// ============================================================================
// BLOCK RENDERER (shared between finalized and streaming)
// ============================================================================

function BlockRenderer({
  block,
  toolCallStates,
}: {
  block: ReviewContentBlock;
  toolCallStates: Record<string, ToolCallState>;
}) {
  if (block.type === 'text') {
    return <StreamdownMarkdown text={block.content} />;
  }

  // tool_call block
  const tc = toolCallStates[block.toolCallId];
  if (!tc) return null;

  return <ToolCallCard toolCall={toToolCall(tc)} className="my-2" />;
}

// ============================================================================
// STREAMING PREVIEW
// ============================================================================

function StreamingPreview() {
  const { state } = useReviewExecution();

  if (state.currentBlocks.length === 0) {
    return (
      <div className="rounded-[1.1rem] border border-border/60 bg-card/70 p-4 shadow-[0_12px_35px_-28px_rgba(0,0,0,0.8)]">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground/80 mb-3">
          <Bot className="h-3.5 w-3.5" />
          BaleyBot
        </span>
        <div className="flex items-center gap-2.5">
          <span className="inline-flex gap-[3px] shrink-0">
            <span className="w-[5px] h-[5px] rounded-full bg-primary/70 animate-loading-dot" style={{ animationDelay: '0ms' }} />
            <span className="w-[5px] h-[5px] rounded-full bg-primary/70 animate-loading-dot" style={{ animationDelay: '200ms' }} />
            <span className="w-[5px] h-[5px] rounded-full bg-primary/70 animate-loading-dot" style={{ animationDelay: '400ms' }} />
          </span>
          <span className="text-sm text-foreground/80">Thinking...</span>
        </div>
        <div className="mt-3 h-[3px] rounded-full bg-muted-foreground/10 overflow-hidden">
          <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-transparent via-primary/60 to-transparent animate-progress-slide" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[1.1rem] border border-border/60 bg-card/70 p-4 shadow-[0_12px_35px_-28px_rgba(0,0,0,0.8)]">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground/80 mb-2">
        <Bot className="h-3.5 w-3.5" />
        BaleyBot
      </span>

      <div className="space-y-2">
        {state.currentBlocks.map((block, i) => {
          const isLast = i === state.currentBlocks.length - 1;

          if (block.type === 'text') {
            return (
              <div key={i}>
                <StreamdownMarkdown text={block.content} isStreaming={isLast} />
              </div>
            );
          }

          // tool_call block during streaming
          const tc = state.toolCalls[block.toolCallId];
          if (!tc) return null;
          return <ToolCallCard key={i} toolCall={toToolCall(tc)} className="my-2" />;
        })}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ChatInterface({ className }: ChatInterfaceProps) {
  const { state, execute, cancel } = useReviewExecution();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages or streaming updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.messages, state.output, state.currentBlocks]);

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || state.isExecuting) return;

    setInput('');
    await execute(trimmed);

    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className={cn('flex flex-col rounded-lg border bg-background overflow-hidden', className)}>
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {state.messages.length === 0 && !state.isExecuting && (
          <div className="flex-1 flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Send a message to interact with your bot
              </p>
            </div>
          </div>
        )}

        {/* Finalized messages */}
        {state.messages.map((msg) =>
          msg.role === 'user' ? (
            <UserBubble key={msg.id} message={msg} />
          ) : (
            <AssistantBubble key={msg.id} message={msg} />
          )
        )}

        {/* Streaming preview */}
        {state.isExecuting && <StreamingPreview />}
      </div>

      {/* Duration badge */}
      {state.durationMs !== null && !state.isExecuting && (
        <div className="px-4 pb-1">
          <span className="text-[10px] text-muted-foreground">
            Completed in {(state.durationMs / 1000).toFixed(1)}s
          </span>
        </div>
      )}

      {/* Error display */}
      {state.error && (
        <div className="mx-4 mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {state.error}
        </div>
      )}

      {/* Input area */}
      <div className="border-t p-3 flex gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className={cn(
            "flex-1 resize-none bg-transparent text-sm focus:outline-none min-h-[36px] max-h-[120px] py-2",
            state.isExecuting && "opacity-60"
          )}
          rows={1}
          aria-busy={state.isExecuting}
        />
        {state.isExecuting ? (
          <Button
            size="icon"
            variant="destructive"
            onClick={cancel}
            className="shrink-0 h-9 w-9"
            title="Cancel execution"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={handleSubmit}
            disabled={!input.trim()}
            className="shrink-0 h-9 w-9"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
