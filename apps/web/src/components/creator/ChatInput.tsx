'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CreationStatus } from '@/lib/baleybot/creator-types';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  /** Current state for contextual placeholder */
  status: CreationStatus;
  /** Callback when message sent */
  onSend: (message: string) => void;
  /** Disable input */
  disabled?: boolean;
  /** Optional CSS class */
  className?: string;
}

/**
 * Get contextual placeholder text based on creation status
 */
function getPlaceholder(status: CreationStatus): string {
  switch (status) {
    case 'empty':
      return 'What do you need?';
    case 'building':
      return 'Adjust something...';
    case 'ready':
      return 'Ask anything or describe changes...';
    case 'running':
      return 'Wait for completion...';
    case 'error':
      return 'Try again or describe what you need...';
    default:
      return 'What do you need?';
  }
}

/**
 * ChatInput - Floating chat input component for the BaleyBot creator.
 *
 * Features:
 * - Auto-resizing textarea (max 3 lines, ~120px)
 * - Contextual placeholders based on creation status
 * - Enter to send, Shift+Enter for newline
 * - Send button with loading state
 * - Glow effect when focused or has content
 * - Auto-focus on mount when status is 'empty'
 */
export function ChatInput({
  status,
  onSend,
  disabled = false,
  className,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isProcessing = status === 'building' || status === 'running';
  const isDisabled = disabled || status === 'running';
  const hasContent = value.trim().length > 0;
  const showGlow = isFocused || hasContent;

  // Auto-focus on mount when status is 'empty'
  useEffect(() => {
    if (status === 'empty' && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [status]);

  // Auto-resize textarea
  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    // Set to scrollHeight but cap at max height (120px for ~3 lines)
    const newHeight = Math.min(textarea.scrollHeight, 120);
    textarea.style.height = `${newHeight}px`;
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  const handleSend = () => {
    const trimmedValue = value.trim();
    if (!trimmedValue || isDisabled) return;

    onSend(trimmedValue);
    setValue('');

    // Reset textarea height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to send, Shift+Enter for newline
    // Also support Cmd/Ctrl+Enter to send
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
  };

  return (
    <div className={cn('w-full', className)}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={cn(
          'relative flex items-end gap-2 rounded-2xl border-2 bg-background/80 backdrop-blur-sm px-4 py-3 transition-all duration-300',
          showGlow
            ? 'border-primary/50 shadow-[0_0_15px_rgba(var(--primary-rgb),0.15)]'
            : 'border-border',
          isDisabled && 'opacity-60'
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={isDisabled}
          placeholder={getPlaceholder(status)}
          rows={1}
          aria-label="Message to BaleyBot creator"
          aria-describedby="chat-input-hint"
          className={cn(
            'flex-1 resize-none bg-transparent text-base leading-6 placeholder:text-muted-foreground/60 focus:outline-none disabled:cursor-not-allowed',
            'min-h-[24px] max-h-[120px]'
          )}
          style={{ height: 'auto' }}
        />

        <Button
          type="button"
          size="icon"
          variant={hasContent ? 'default' : 'ghost'}
          disabled={!hasContent || isDisabled}
          onClick={handleSend}
          aria-label={isProcessing ? 'Sending message' : 'Send message'}
          className={cn(
            'h-9 w-9 shrink-0 rounded-xl transition-all',
            hasContent && !isDisabled && 'bg-primary hover:bg-primary/90'
          )}
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </motion.div>

      {/* Hint text */}
      <p id="chat-input-hint" className="mt-2 text-center text-xs text-muted-foreground/60">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
}
