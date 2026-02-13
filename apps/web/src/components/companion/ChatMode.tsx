'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, StopCircle } from 'lucide-react';
import { ChatThread, COMPANION_CONFIG } from '@/components/chat';
import type { ChatMessage } from '@/components/chat';

interface ChatModeProps {
  messages?: ChatMessage[];
  isLoading?: boolean;
  onSendMessage?: (message: string) => void;
  onStopGeneration?: () => void;
  onRetry?: (messageId: string) => void;
  className?: string;
  placeholder?: string;
}

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  // Filter out empty assistant placeholders (show typing indicator instead)
  const visibleMessages = messages.filter(
    (m) => m.role !== 'assistant' || m.content || (m.segments && m.segments.length > 0)
  );
  const lastVisible = visibleMessages[visibleMessages.length - 1];
  const isWaitingForResponse = isLoading && lastVisible?.role !== 'assistant';

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Messages via unified ChatThread */}
      <ChatThread
        messages={visibleMessages}
        config={COMPANION_CONFIG}
        isTyping={isWaitingForResponse}
        onRetry={onRetry}
        emptyState={<CompanionEmptyState />}
      />

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

function CompanionEmptyState() {
  return (
    <div className="text-center py-8">
      <div className="h-10 w-10 rounded-full bg-primary/10 mx-auto mb-3 flex items-center justify-center">
        <div className="h-3 w-3 rounded-full bg-primary/40 animate-pulse-soft" />
      </div>
      <h4 className="font-medium">Start a conversation</h4>
      <p className="text-sm text-muted-foreground mt-1">
        Ask me anything about your agents and workflows
      </p>
    </div>
  );
}
