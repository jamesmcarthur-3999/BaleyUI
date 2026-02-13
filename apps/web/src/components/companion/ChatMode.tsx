'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Send,
  StopCircle,
  RefreshCw,
  Copy,
  Check,
  User,
  Bot,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export type ContentBlock =
  | { type: 'text'; content: string }
  | {
      type: 'tool_call';
      id: string;
      toolName: string;
      status: 'running' | 'complete' | 'error';
      result?: string;
      error?: string;
    };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  blocks?: ContentBlock[];
  timestamp: Date;
  status?: 'sending' | 'sent' | 'error';
  metadata?: {
    model?: string;
    tokens?: number;
    duration?: number;
  };
}

interface ChatModeProps {
  messages?: ChatMessage[];
  isLoading?: boolean;
  onSendMessage?: (message: string) => void;
  onStopGeneration?: () => void;
  onRetry?: (messageId: string) => void;
  className?: string;
  placeholder?: string;
}

// ============================================================================
// TOOL DISPLAY NAMES — human-friendly status labels for tool chips
// ============================================================================

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  list_pending_actions: 'Checking your actions',
  apply_action: 'Applying recommendation',
  get_workspace_health: 'Checking workspace health',
  review_execution: 'Analyzing execution',
  diagnose_failure: 'Diagnosing failure',
  suggest_approval_patterns: 'Analyzing approval patterns',
  navigate_user_to: 'Navigating',
};

// ============================================================================
// TOOL CALL BLOCK COMPONENT
// ============================================================================

function ToolCallBlock({ block }: { block: Extract<ContentBlock, { type: 'tool_call' }> }) {
  const [expanded, setExpanded] = useState(false);

  const fallbackName = block.toolName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const displayName = TOOL_DISPLAY_NAMES[block.toolName] ?? fallbackName;

  return (
    <div className="my-1">
      <button
        onClick={() => {
          if (block.status !== 'running') setExpanded(!expanded);
        }}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs w-full text-left transition-colors',
          'bg-foreground/[0.03] text-muted-foreground hover:bg-foreground/[0.05]'
        )}
      >
        {block.status === 'running' && (
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-primary" />
        )}
        {block.status === 'complete' && (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
        )}
        {block.status === 'error' && (
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        )}

        <span className="font-medium truncate">{displayName}</span>

        {block.status !== 'running' && (block.result || block.error) && (
          <ChevronDown
            className={cn(
              'h-3 w-3 ml-auto shrink-0 transition-transform',
              expanded && 'rotate-180'
            )}
          />
        )}
      </button>

      {expanded && (block.result || block.error) && (
        <div className="mt-1 px-3 py-2 rounded-lg bg-foreground/[0.02] text-xs">
          <pre className="whitespace-pre-wrap break-words text-muted-foreground max-h-32 overflow-y-auto">
            {block.error || block.result}
          </pre>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// BLOCK RENDERER
// ============================================================================

function BlockRenderer({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === 'text') {
          if (!block.content) return null;
          return (
            <p key={i} className="text-sm whitespace-pre-wrap">
              {block.content}
            </p>
          );
        }
        if (block.type === 'tool_call') {
          return <ToolCallBlock key={block.id} block={block} />;
        }
        return null;
      })}
    </>
  );
}

// ============================================================================
// MESSAGE COMPONENT
// ============================================================================

function MessageBubble({
  message,
  onRetry,
  onCopy,
}: {
  message: ChatMessage;
  onRetry?: () => void;
  onCopy?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onCopy?.();
  };

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const hasBlocks = message.blocks && message.blocks.length > 0;

  return (
    <div
      className={cn(
        'flex gap-2.5 group animate-message-enter',
        isUser && 'flex-row-reverse'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'h-6 w-6 rounded-full flex items-center justify-center shrink-0',
          isUser
            ? 'bg-primary/10 text-primary'
            : 'bg-foreground/[0.06] text-muted-foreground'
        )}
      >
        {isUser ? (
          <User className="h-3 w-3" />
        ) : (
          <Bot className="h-3 w-3" />
        )}
      </div>

      {/* Content */}
      <div
        className={cn(
          'flex flex-col gap-1 max-w-[80%]',
          isUser && 'items-end'
        )}
      >
        <div
          className={cn(
            'rounded-xl px-3.5 py-2.5',
            isUser
              ? 'bg-primary/[0.07] text-foreground'
              : 'bg-foreground/[0.03] text-foreground',
            message.status === 'error' && 'ring-1 ring-destructive/30'
          )}
        >
          {hasBlocks ? (
            <BlockRenderer blocks={message.blocks!} />
          ) : (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          )}
        </div>

        {/* Message actions */}
        <div
          className={cn(
            'flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity',
            isUser && 'flex-row-reverse'
          )}
        >
          <span className="text-[10px] text-muted-foreground/50">
            {message.timestamp.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>

          {isAssistant && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>

              {message.status === 'error' && onRetry && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={onRetry}
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              )}
            </>
          )}

          {message.metadata?.tokens && (
            <span className="text-[10px] text-muted-foreground/50">
              {message.metadata.tokens} tokens
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TYPING INDICATOR
// ============================================================================

function TypingIndicator() {
  return (
    <div className="flex gap-2.5">
      <div className="h-6 w-6 rounded-full bg-foreground/[0.06] flex items-center justify-center">
        <Bot className="h-3 w-3 text-muted-foreground" />
      </div>
      <div className="rounded-xl bg-foreground/[0.03] px-4 py-2.5">
        <div className="h-4 w-24 rounded-full animate-typing-shimmer" />
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ChatMode({
  messages = [],
  isLoading = false,
  onSendMessage,
  onStopGeneration,
  onRetry,
  className,
  placeholder = 'Type a message...',
}: ChatModeProps) {
  const [input, setInput] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    onSendMessage?.(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Messages */}
      <ScrollArea
        className="flex-1 px-4 py-4"
        ref={scrollAreaRef}
      >
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-8">
              <div className="h-10 w-10 rounded-full bg-primary/10 mx-auto mb-3 flex items-center justify-center">
                <div className="h-3 w-3 rounded-full bg-primary/40 animate-pulse-soft" />
              </div>
              <h4 className="font-medium">Start a conversation</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Ask me anything about your agents and workflows
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onRetry={
                  message.status === 'error' && onRetry
                    ? () => onRetry(message.id)
                    : undefined
                }
              />
            ))
          )}

          {isLoading && <TypingIndicator />}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 pt-2">
        <div className="relative flex items-end gap-2">
          <div className="flex-1 glass-input rounded-2xl">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isLoading}
              className={cn(
                'min-h-[44px] max-h-[120px] resize-none',
                'border-0 bg-transparent shadow-none focus-visible:ring-0'
              )}
              rows={1}
            />
          </div>

          {isLoading ? (
            <Button
              size="icon"
              variant="destructive"
              className="h-9 w-9 rounded-xl"
              onClick={onStopGeneration}
            >
              <StopCircle className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9 rounded-xl bg-transparent text-muted-foreground hover:text-primary hover:bg-primary/10"
              onClick={handleSend}
              disabled={!input.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground/40 text-center mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
