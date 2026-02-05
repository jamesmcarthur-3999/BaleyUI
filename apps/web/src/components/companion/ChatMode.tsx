'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Send,
  Paperclip,
  StopCircle,
  RefreshCw,
  Copy,
  Check,
  User,
  Bot,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
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

  return (
    <div
      className={cn(
        'flex gap-3 group',
        isUser && 'flex-row-reverse'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'h-8 w-8 rounded-full flex items-center justify-center shrink-0',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
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
            'rounded-2xl px-4 py-2.5',
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-muted rounded-tl-sm',
            message.status === 'error' && 'border-2 border-destructive'
          )}
        >
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>

        {/* Message actions */}
        <div
          className={cn(
            'flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity',
            isUser && 'flex-row-reverse'
          )}
        >
          <span className="text-xs text-muted-foreground">
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
            <Badge variant="outline" className="text-[10px] h-5">
              {message.metadata.tokens} tokens
            </Badge>
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
    <div className="flex gap-3">
      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
        <Bot className="h-4 w-4" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
        <div className="flex gap-1">
          <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
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
              <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
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
      <div className="p-4 border-t">
        <div className="relative flex items-end gap-2">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isLoading}
              className={cn(
                'min-h-[44px] max-h-[120px] resize-none pr-10',
                'rounded-xl border-muted-foreground/20'
              )}
              rows={1}
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 bottom-1 h-8 w-8 text-muted-foreground hover:text-foreground"
              disabled={isLoading}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
          </div>

          {isLoading ? (
            <Button
              size="icon"
              variant="destructive"
              className="h-11 w-11 rounded-xl"
              onClick={onStopGeneration}
            >
              <StopCircle className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="h-11 w-11 rounded-xl"
              onClick={handleSend}
              disabled={!input.trim()}
            >
              <Send className="h-5 w-5" />
            </Button>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground text-center mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
