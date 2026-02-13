'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Lightbulb, ChevronDown, Loader2, CheckCircle2 } from 'lucide-react';
import type { SequentialThinkingSegment, ThoughtItem } from '@baleybots/chat';

interface SequentialThinkingPanelProps {
  segment: SequentialThinkingSegment;
  className?: string;
}

export function SequentialThinkingPanel({ segment, className }: SequentialThinkingPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = segment.status === 'running';
  const thoughtCount = segment.thoughts.length;
  const finalThought = segment.thoughts.find(t => t.is_final);

  return (
    <div className={cn('my-1', className)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs w-full text-left transition-all duration-200',
          isRunning
            ? 'bg-amber-500/[0.05] border border-amber-500/10'
            : 'bg-foreground/[0.03] hover:bg-foreground/[0.05]',
        )}
      >
        {isRunning
          ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-amber-500" />
          : <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-500/60" />
        }
        <span className={cn('font-medium', isRunning ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
          {isRunning ? `Thinking deeply (step ${thoughtCount})` : `Deep reasoning (${thoughtCount} steps)`}
        </span>
        {!isRunning && (
          <ChevronDown className={cn(
            'h-3 w-3 ml-auto shrink-0 text-muted-foreground/50 transition-transform',
            expanded && 'rotate-180',
          )} />
        )}
      </button>

      {expanded && (
        <div className="mt-1.5 space-y-1 animate-content-enter">
          {segment.thoughts.map((thought) => (
            <ThoughtRow key={thought.thought_id} thought={thought} />
          ))}
        </div>
      )}

      {!expanded && finalThought && !isRunning && (
        <div className="mt-1 px-3 py-1.5 text-xs text-muted-foreground/70 italic truncate">
          Conclusion: {finalThought.summary}
        </div>
      )}
    </div>
  );
}

function ThoughtRow({ thought }: { thought: ThoughtItem }) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className={cn(
      'px-3 py-1.5 rounded-xl text-xs',
      thought.isRevised && 'opacity-50',
      thought.is_final && 'bg-amber-500/[0.06] border border-amber-500/10',
    )}>
      <button
        onClick={() => setShowDetail(!showDetail)}
        className="flex items-center gap-2 w-full text-left"
      >
        {thought.is_final
          ? <CheckCircle2 className="h-3 w-3 shrink-0 text-amber-500" />
          : <span className="text-[10px] text-muted-foreground/50 w-3 text-center tabular-nums">
              {thought.progressCurrent ?? '\u00B7'}
            </span>
        }
        <span className={cn(
          'text-muted-foreground truncate',
          thought.isRevised && 'line-through',
          thought.is_final && 'font-medium text-foreground',
        )}>
          {thought.summary}
        </span>
        {thought.revises && (
          <span className="text-[10px] text-muted-foreground/40 shrink-0">revises #{thought.revises.slice(-4)}</span>
        )}
      </button>

      {showDetail && (
        <p className="mt-1 pl-5 whitespace-pre-wrap text-muted-foreground/70 max-h-32 overflow-y-auto">
          {thought.thought}
        </p>
      )}
    </div>
  );
}
