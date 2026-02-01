'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sparkles,
  Send,
  X,
  Loader2,
  ChevronDown,
  Wand2,
  RefreshCw,
  Check,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface InlinePromptSuggestion {
  id: string;
  label: string;
  prompt: string;
  category?: string;
}

export interface InlinePromptResult {
  content: string;
  metadata?: {
    model?: string;
    tokens?: number;
    duration?: number;
  };
}

interface InlinePromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context?: string;
  suggestions?: InlinePromptSuggestion[];
  onSubmit?: (prompt: string) => Promise<InlinePromptResult>;
  onApply?: (result: InlinePromptResult) => void;
  className?: string;
  triggerClassName?: string;
  placeholder?: string;
}

// ============================================================================
// QUICK SUGGESTIONS
// ============================================================================

const defaultSuggestions: InlinePromptSuggestion[] = [
  {
    id: 'improve',
    label: 'Improve this',
    prompt: 'Improve this to be more effective and clear',
    category: 'enhance',
  },
  {
    id: 'simplify',
    label: 'Simplify',
    prompt: 'Simplify this while preserving the core functionality',
    category: 'enhance',
  },
  {
    id: 'explain',
    label: 'Explain',
    prompt: 'Explain what this does in simple terms',
    category: 'understand',
  },
  {
    id: 'fix',
    label: 'Fix issues',
    prompt: 'Identify and fix any issues or bugs',
    category: 'fix',
  },
];

// ============================================================================
// SUGGESTION CHIP
// ============================================================================

function SuggestionChip({
  suggestion,
  onClick,
  disabled,
}: {
  suggestion: InlinePromptSuggestion;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5',
        'text-xs font-medium rounded-full',
        'bg-muted hover:bg-muted/80 transition-colors',
        'disabled:opacity-50 disabled:pointer-events-none'
      )}
    >
      <Wand2 className="h-3 w-3" />
      {suggestion.label}
    </button>
  );
}

// ============================================================================
// RESULT PREVIEW
// ============================================================================

function ResultPreview({
  result,
  onApply,
  onRegenerate,
  onDismiss,
  isRegenerating,
}: {
  result: InlinePromptResult;
  onApply: () => void;
  onRegenerate: () => void;
  onDismiss: () => void;
  isRegenerating: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-muted/50 p-3 max-h-[200px] overflow-auto">
        <p className="text-sm whitespace-pre-wrap">{result.content}</p>
      </div>

      {result.metadata && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {result.metadata.model && (
            <Badge variant="outline" className="text-[10px]">
              {result.metadata.model}
            </Badge>
          )}
          {result.metadata.tokens && (
            <span>{result.metadata.tokens} tokens</span>
          )}
          {result.metadata.duration && (
            <span>{(result.metadata.duration / 1000).toFixed(1)}s</span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="flex-1 gap-1.5"
          onClick={onApply}
        >
          <Check className="h-3.5 w-3.5" />
          Apply
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={onRegenerate}
          disabled={isRegenerating}
        >
          {isRegenerating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Retry
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function InlinePrompt({
  open,
  onOpenChange,
  context,
  suggestions = defaultSuggestions,
  onSubmit,
  onApply,
  className,
  triggerClassName,
  placeholder = 'Ask AI to help...',
}: InlinePromptProps) {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<InlinePromptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 0);
    } else {
      // Reset state when closed
      setPrompt('');
      setResult(null);
      setError(null);
    }
  }, [open]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 100)}px`;
    }
  }, [prompt]);

  const handleSubmit = async (promptText: string) => {
    if (!promptText.trim() || isLoading || !onSubmit) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const result = await onSubmit(promptText.trim());
      setResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    if (result) {
      onApply?.(result);
      onOpenChange(false);
    }
  };

  const handleRegenerate = () => {
    if (prompt) {
      handleSubmit(prompt);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(prompt);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'gap-1.5 text-xs text-muted-foreground hover:text-foreground',
            triggerClassName
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          AI
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className={cn('w-80 p-3', className)}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {/* Context indicator */}
        {context && (
          <div className="mb-3 text-xs text-muted-foreground">
            <span className="font-medium">Context:</span> {context}
          </div>
        )}

        {/* Result preview */}
        {result && (
          <ResultPreview
            result={result}
            onApply={handleApply}
            onRegenerate={handleRegenerate}
            onDismiss={() => setResult(null)}
            isRegenerating={isLoading}
          />
        )}

        {/* Prompt input */}
        {!result && (
          <>
            {/* Quick suggestions */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {suggestions.slice(0, 4).map((suggestion) => (
                <SuggestionChip
                  key={suggestion.id}
                  suggestion={suggestion}
                  onClick={() => {
                    setPrompt(suggestion.prompt);
                    handleSubmit(suggestion.prompt);
                  }}
                  disabled={isLoading}
                />
              ))}
            </div>

            {/* Custom prompt input */}
            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={isLoading}
                className="min-h-[60px] max-h-[100px] resize-none pr-10 text-sm"
                rows={2}
              />
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-1 bottom-1 h-7 w-7"
                onClick={() => handleSubmit(prompt)}
                disabled={!prompt.trim() || isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Error message */}
            {error && (
              <p className="mt-2 text-xs text-destructive">{error}</p>
            )}

            {/* Keyboard hint */}
            <p className="mt-2 text-[10px] text-muted-foreground">
              Press Enter to submit, Shift+Enter for new line
            </p>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================================
// INLINE PROMPT BUTTON (FLOATING)
// ============================================================================

export function InlinePromptButton({
  context,
  suggestions,
  onSubmit,
  onApply,
  className,
}: Omit<InlinePromptProps, 'open' | 'onOpenChange'>) {
  const [open, setOpen] = useState(false);

  return (
    <InlinePrompt
      open={open}
      onOpenChange={setOpen}
      context={context}
      suggestions={suggestions}
      onSubmit={onSubmit}
      onApply={onApply}
      className={className}
    />
  );
}
