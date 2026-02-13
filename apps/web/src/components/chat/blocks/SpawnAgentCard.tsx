'use client';

import { useState, lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { Bot, ChevronDown, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { SpawnAgentSegment } from '@baleybots/chat';
import type { ChatConfig } from '../types';

// Lazy-load SegmentRenderer to break circular dependency
const LazySegmentRenderer = lazy(() =>
  import('./SegmentRenderer').then(m => ({ default: m.SegmentRenderer }))
);

interface SpawnAgentCardProps {
  segment: SpawnAgentSegment;
  config: ChatConfig;
  className?: string;
}

export function SpawnAgentCard({ segment, config, className }: SpawnAgentCardProps) {
  const [expanded, setExpanded] = useState(segment.status === 'running');
  const isRunning = segment.status === 'running';
  const isComplete = segment.status === 'completed';
  const isFailed = segment.status === 'failed';

  const displayName = segment.name ?? segment.agentType;
  const iteration = segment.maxIterations > 0
    ? ` (${segment.currentIteration}/${segment.maxIterations})`
    : '';

  return (
    <div className={cn('my-1.5', className)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs w-full text-left transition-all duration-200',
          'border',
          isRunning && 'bg-primary/[0.05] border-primary/15',
          isComplete && 'bg-foreground/[0.03] border-foreground/[0.06] hover:bg-foreground/[0.05]',
          isFailed && 'bg-destructive/[0.04] border-destructive/15',
        )}
      >
        {isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-primary" />}
        {isComplete && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
        {isFailed && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />}
        <Bot className={cn('h-3.5 w-3.5 shrink-0', isRunning ? 'text-primary' : 'text-muted-foreground')} />
        <span className="font-medium text-muted-foreground truncate">
          {isRunning ? 'Running' : isComplete ? 'Ran' : 'Failed'} {displayName}{iteration}
        </span>
        {segment.tokensUsed > 0 && (
          <span className="text-[10px] text-muted-foreground/50 tabular-nums bg-foreground/[0.03] rounded-full px-1.5 py-0.5 ml-auto mr-2">
            {segment.tokensUsed.toLocaleString()} tok
          </span>
        )}
        <ChevronDown className={cn(
          'h-3 w-3 shrink-0 text-muted-foreground/50 transition-transform',
          expanded && 'rotate-180',
        )} />
      </button>

      {expanded && segment.childSegments.length > 0 && (
        <div className="ml-3 border-l-2 border-foreground/[0.08] pl-3 mt-1.5 space-y-1 animate-content-enter">
          <Suspense fallback={<div className="text-xs text-muted-foreground/50 px-2 py-1">Loading...</div>}>
            <LazySegmentRenderer segments={segment.childSegments} config={config} />
          </Suspense>
        </div>
      )}

      {expanded && segment.error && (
        <div className="mt-1.5 px-3 py-2 rounded-xl bg-destructive/[0.05] border border-destructive/10 text-xs text-destructive">
          {segment.error}
        </div>
      )}
    </div>
  );
}
