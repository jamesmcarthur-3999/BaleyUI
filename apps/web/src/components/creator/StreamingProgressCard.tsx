'use client';

import { useEffect, useMemo, useState } from 'react';
import { Brain, Loader2, Wrench, RotateCcw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StreamingHighlightType = 'thinking' | 'tool' | 'loop' | 'status';
export type StreamingToolStatus = 'pending' | 'running' | 'success' | 'error';

export interface StreamingHighlight {
  id: string;
  text: string;
  type: StreamingHighlightType;
  toolName?: string;
  timestamp: number;
}

export interface StreamingTool {
  name: string;
  status: StreamingToolStatus;
  updatedAt: number;
}

export interface StreamingProgressSnapshot {
  phase: string;
  message: string;
  highlights: StreamingHighlight[];
  tools: StreamingTool[];
  startedAt: number;
}

interface StreamingProgressCardProps {
  progress: StreamingProgressSnapshot;
  className?: string;
  maxHighlights?: number;
}

function getHighlightIcon(type: StreamingHighlightType) {
  switch (type) {
    case 'thinking':
      return <Brain className="h-3.5 w-3.5 text-sky-300" />;
    case 'tool':
      return <Wrench className="h-3.5 w-3.5 text-violet-300" />;
    case 'loop':
      return <RotateCcw className="h-3.5 w-3.5 text-amber-300" />;
    default:
      return <Sparkles className="h-3.5 w-3.5 text-emerald-300" />;
  }
}

function formatPhase(phase: string): string {
  const normalized = phase.replace(/[_-]+/g, ' ').trim();
  if (!normalized) return 'Working';
  return normalized
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function statusClassName(status: StreamingToolStatus): string {
  if (status === 'running') {
    return 'border-violet-400/30 bg-violet-500/15 text-violet-100';
  }
  if (status === 'success') {
    return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100';
  }
  if (status === 'error') {
    return 'border-red-400/30 bg-red-500/10 text-red-100';
  }
  return 'border-border/60 bg-background/40 text-muted-foreground';
}

export function StreamingProgressCard({
  progress,
  className,
  maxHighlights = 5,
}: StreamingProgressCardProps) {
  const [elapsedMs, setElapsedMs] = useState(() => Date.now() - progress.startedAt);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsedMs(Date.now() - progress.startedAt);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [progress.startedAt]);

  const visibleHighlights = useMemo(
    () => progress.highlights.slice(-maxHighlights).reverse(),
    [maxHighlights, progress.highlights]
  );

  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));

  return (
    <div
      className={cn(
        'rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 via-background/80 to-background/80 p-3.5',
        'shadow-[0_18px_50px_-40px_hsl(var(--primary)/0.75)]',
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-primary/80">
            {formatPhase(progress.phase)}
          </p>
          <p className="mt-0.5 text-sm text-foreground/90 truncate">{progress.message}</p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] text-primary">
          <Loader2 className="h-3 w-3 animate-spin" />
          {elapsedSeconds}s
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {visibleHighlights.length > 0 ? (
          visibleHighlights.map((highlight) => (
            <div
              key={highlight.id}
              className="rounded-lg border border-border/55 bg-background/55 px-2.5 py-2"
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">{getHighlightIcon(highlight.type)}</span>
                <p className="text-xs text-foreground/90 leading-5">{highlight.text}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-border/55 bg-background/30 px-2.5 py-2 text-xs text-muted-foreground">
            Warming up the response...
          </div>
        )}
      </div>

      {progress.tools.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {progress.tools.slice(0, 6).map((tool) => (
            <span
              key={tool.name}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                statusClassName(tool.status)
              )}
            >
              {tool.name}
              <span className="opacity-80">{tool.status}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

