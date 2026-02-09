'use client';

import { useState, useRef, useEffect } from 'react';
import { Lightbulb, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CreationStatus } from '@/lib/baleybot/creator-types';
import { cn } from '@/lib/utils';

export interface ChatQuickPrompt {
  id: string;
  label: string;
  prompt: string;
  mode?: 'insert' | 'send';
}

interface ChatInputProps {
  /** Current state for contextual placeholder */
  status: CreationStatus;
  /** Whether discovery inputs are still needed for next stage */
  discoveryPending?: boolean;
  /** Callback when message sent */
  onSend: (message: string) => void;
  /** Disable input */
  disabled?: boolean;
  /** Optional guided quick prompts */
  quickPrompts?: ChatQuickPrompt[];
  /** Optional label for the quick prompt section */
  quickPromptContextLabel?: string;
  /** Optional CSS class */
  className?: string;
}

/**
 * Get contextual placeholder text based on creation status
 */
function getPlaceholder(status: CreationStatus, discoveryPending: boolean): string {
  if (discoveryPending) {
    return 'Share the next detail...';
  }

  switch (status) {
    case 'empty':
      return 'Describe the bot you want to build...';
    case 'building':
      return 'Add guidance while I build...';
    case 'ready':
      return 'Ask for changes, tests, or launch prep...';
    case 'running':
      return 'Wait for completion...';
    case 'error':
      return 'Tell me what to fix...';
    default:
      return 'Describe what you need...';
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
  discoveryPending = false,
  onSend,
  disabled = false,
  quickPrompts = [],
  quickPromptContextLabel,
  className,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const MAX_LENGTH = 2000;
  const isProcessing = status === 'building' || status === 'running';
  const isDisabled = disabled || status === 'running';
  const hasContent = value.trim().length > 0;
  const isOverLimit = value.length > MAX_LENGTH;
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
    if (!trimmedValue || isDisabled || isOverLimit) return;

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

  const handleQuickPrompt = (quickPrompt: ChatQuickPrompt) => {
    if (isDisabled || isProcessing) return;

    if ((quickPrompt.mode ?? 'insert') === 'send') {
      const next = quickPrompt.prompt.trim();
      if (!next || next.length > MAX_LENGTH) return;
      onSend(next);
      setValue('');
      return;
    }

    setValue((prev) => {
      if (!prev.trim()) return quickPrompt.prompt;
      return `${prev}\n${quickPrompt.prompt}`;
    });
    textareaRef.current?.focus();
  };

  const showQuickPrompts = quickPrompts.length > 0 && !hasContent && !isProcessing;

  return (
    <div className={cn('w-full', className)}>
      {showQuickPrompts && (
        <div className="mb-2.5 rounded-2xl border border-border/50 bg-background/70 px-3 py-2.5">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Lightbulb className="h-3.5 w-3.5" />
            {quickPromptContextLabel ?? 'Suggested next actions'}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {quickPrompts.map((quickPrompt) => (
              <button
                key={quickPrompt.id}
                type="button"
                onClick={() => handleQuickPrompt(quickPrompt)}
                className={cn(
                  'rounded-full border border-border/60 bg-muted/20 px-3 py-1.5 text-left',
                  'text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                  'transition-colors'
                )}
              >
                {quickPrompt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        className={cn(
          'relative flex items-end gap-2 rounded-[1.35rem] border bg-background/90 transition-all duration-300',
          // CSS fade-in animation
          'animate-fade-in-up',
          // Responsive padding (Phase 4.5)
          'px-3 py-2.5 sm:px-4 sm:py-3.5',
          // Safe area for notched devices (Phase 4.5)
          'pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:pb-3',
          showGlow
            ? 'border-primary/40 shadow-[0_10px_35px_-25px_hsl(var(--primary)/0.7)]'
            : 'border-border/70',
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
          placeholder={getPlaceholder(status, discoveryPending)}
          rows={1}
          aria-label="Message to BaleyBot creator"
          aria-describedby="chat-input-hint"
          className={cn(
            'flex-1 resize-none bg-transparent placeholder:text-muted-foreground/60 focus:outline-none disabled:cursor-not-allowed',
            'min-h-[24px] max-h-[120px]',
            // Larger text on mobile for better touch (Phase 4.5)
            'text-[15px] leading-6 sm:text-base sm:leading-6'
          )}
          style={{ height: 'auto' }}
        />

        {/* Send button - min 44px touch target (Phase 4.2), larger on mobile (Phase 4.5) */}
        <Button
          type="button"
          size="icon"
          variant={hasContent ? 'default' : 'ghost'}
          disabled={!hasContent || isDisabled || isOverLimit}
          onClick={handleSend}
          aria-label={isProcessing ? 'Sending message' : 'Send message'}
          className={cn(
            'shrink-0 rounded-xl transition-all',
            // Slightly larger on mobile for easier tapping (Phase 4.5)
            'min-h-11 min-w-11 h-11 w-11 sm:h-11 sm:w-11',
            hasContent && !isDisabled && 'bg-primary hover:bg-primary/90'
          )}
        >
          {isProcessing ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-5 w-5" aria-hidden="true" />
          )}
        </Button>
      </div>

      {/* Footer: minimal helper + character count */}
      <div className="mt-2 flex items-center justify-between px-1 gap-2">
        <p id="chat-input-hint" className="text-[11px] text-muted-foreground/75">
          {discoveryPending
            ? 'Short answers are enough.'
            : 'Press Enter to send.'}
        </p>
        {value.length > MAX_LENGTH * 0.8 && (
          <span className={cn(
            'text-[11px] ml-auto',
            isOverLimit ? 'text-red-500 font-medium' : 'text-muted-foreground/60'
          )}>
            {value.length}/{MAX_LENGTH}
          </span>
        )}
      </div>
    </div>
  );
}
