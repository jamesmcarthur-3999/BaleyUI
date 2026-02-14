'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Brain, ChevronDown } from 'lucide-react';
import { LoadingDots } from '@/components/ui/loading-dots';
import type { ReasoningSegment } from '@baleybots/chat';

interface ThinkingToggleProps {
  segment: ReasoningSegment;
  className?: string;
}

export function ThinkingToggle({ segment, className }: ThinkingToggleProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn('my-1', className)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs w-full text-left transition-all duration-200',
          segment.isStreaming
            ? 'bg-primary/[0.06] border border-primary/10'
            : 'bg-foreground/[0.03] hover:bg-foreground/[0.05]',
        )}
      >
        <Brain className={cn(
          'h-3.5 w-3.5 shrink-0',
          segment.isStreaming ? 'text-primary animate-pulse-soft' : 'text-primary/60',
        )} />
        <span className={cn('font-medium', segment.isStreaming ? 'text-primary/80' : 'text-muted-foreground')}>
          {segment.isStreaming ? 'Thinking' : 'Thought process'}
        </span>
        {segment.isStreaming && <LoadingDots size="sm" />}
        {!segment.isStreaming && (
          <ChevronDown className={cn(
            'h-3 w-3 ml-auto shrink-0 text-muted-foreground/50 transition-transform',
            expanded && 'rotate-180',
          )} />
        )}
      </button>

      {expanded && !segment.isStreaming && (
        <div className="mt-1.5 px-3 py-2.5 rounded-xl bg-primary/[0.03] border border-primary/[0.06] text-xs animate-content-enter">
          <p className="whitespace-pre-wrap break-words text-muted-foreground leading-relaxed max-h-48 overflow-y-auto">
            {segment.content}
          </p>
        </div>
      )}
    </div>
  );
}
