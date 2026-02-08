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
    return 'Answer required outcomes or continue with defaults...';
  }

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

function getStatusLabel(status: CreationStatus, discoveryPending: boolean): string {
  if (discoveryPending) {
    return 'Discovery Needed';
  }

  switch (status) {
    case 'empty':
      return 'Discovery';
    case 'building':
      return 'Building';
    case 'ready':
      return 'Ready';
    case 'running':
      return 'Running';
    case 'error':
      return 'Needs fix';
    default:
      return 'Ready';
  }
}

function getStatusHint(status: CreationStatus, discoveryPending: boolean): string {
  if (discoveryPending) {
    return 'Fill any blocking discovery details or continue with smart defaults.';
  }

  switch (status) {
    case 'empty':
      return 'Start with a plain-language goal and desired outcome.';
    case 'building':
      return 'Creator is sequencing setup steps. You can still steer it.';
    case 'ready':
      return 'Ask for refinements, new tools, or production hardening.';
    case 'running':
      return 'Execution is in progress. Wait for completion to continue.';
    case 'error':
      return 'Describe the issue and request a targeted fix.';
    default:
      return 'Describe what you want to build.';
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
        <div className="mb-2.5 rounded-xl border border-border/50 bg-muted/20 p-2.5">
          <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Lightbulb className="h-3.5 w-3.5" />
            {quickPromptContextLabel ?? 'Suggested next actions'}
          </p>
          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {quickPrompts.map((quickPrompt) => (
              <button
                key={quickPrompt.id}
                type="button"
                onClick={() => handleQuickPrompt(quickPrompt)}
                className={cn(
                  'rounded-lg border border-border/60 bg-background/80 px-2.5 py-1.5 text-left',
                  'text-[11px] text-muted-foreground hover:bg-background hover:text-foreground',
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
          'relative flex items-end gap-2 rounded-2xl border-2 bg-background/80 backdrop-blur-sm transition-all duration-300',
          // CSS fade-in animation
          'animate-fade-in-up',
          // Responsive padding (Phase 4.5)
          'px-3 py-2.5 sm:px-4 sm:py-3',
          // Safe area for notched devices (Phase 4.5)
          'pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:pb-3',
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
          placeholder={getPlaceholder(status, discoveryPending)}
          rows={1}
          aria-label="Message to BaleyBot creator"
          aria-describedby="chat-input-hint"
          className={cn(
            'flex-1 resize-none bg-transparent placeholder:text-muted-foreground/60 focus:outline-none disabled:cursor-not-allowed',
            'min-h-[24px] max-h-[120px]',
            // Larger text on mobile for better touch (Phase 4.5)
            'text-base leading-6 sm:text-base sm:leading-6'
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

      {/* Footer: hint text + character count */}
      <div className="mt-2 flex items-center justify-between px-1 gap-2">
        <span
          className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full border',
            discoveryPending &&
              'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
            !discoveryPending &&
              status === 'ready' &&
              'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400',
            !discoveryPending &&
              status === 'building' &&
              'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400',
            !discoveryPending &&
              status === 'running' &&
              'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-400',
            !discoveryPending &&
              status === 'error' &&
              'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400',
            !discoveryPending &&
              status === 'empty' &&
              'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
          )}
        >
          {getStatusLabel(status, discoveryPending)}
        </span>
        <p id="chat-input-hint" className="text-xs text-muted-foreground/70 hidden lg:block truncate">
          {getStatusHint(status, discoveryPending)}
        </p>
        <p className="text-xs text-muted-foreground/60 hidden sm:block lg:hidden">
          Enter to send, Shift+Enter for new line
        </p>
        {value.length > MAX_LENGTH * 0.8 && (
          <span className={cn(
            'text-xs ml-auto',
            isOverLimit ? 'text-red-500 font-medium' : 'text-muted-foreground/60'
          )}>
            {value.length}/{MAX_LENGTH}
          </span>
        )}
      </div>
    </div>
  );
}
