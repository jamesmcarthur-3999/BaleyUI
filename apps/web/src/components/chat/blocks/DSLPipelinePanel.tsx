'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Network, ChevronDown, Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import type { DSLPipelineSegment } from '@baleybots/core';
import type { ChatConfig } from '../types';

interface DSLPipelinePanelProps {
  segment: DSLPipelineSegment;
  config: ChatConfig;
  className?: string;
}

export function DSLPipelinePanel({ segment, className }: DSLPipelinePanelProps) {
  const [expanded, setExpanded] = useState(segment.status === 'running');
  const isRunning = segment.status === 'running' || segment.status === 'parsing' || segment.status === 'streaming';
  const isComplete = segment.status === 'completed';
  const isFailed = segment.status === 'failed';
  const botCount = segment.definedBots.length;

  return (
    <div className={cn('my-1.5', className)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-xs w-full text-left transition-colors',
          'bg-foreground/[0.04] hover:bg-foreground/[0.06]',
          'border border-foreground/[0.06]',
        )}
      >
        {isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-primary" />}
        {isComplete && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
        {isFailed && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />}
        <Network className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="font-medium text-muted-foreground">
          {isRunning ? 'Running' : isComplete ? 'Ran' : 'Failed'} pipeline
          {botCount > 0 && ` (${botCount} bots)`}
        </span>
        <ChevronDown className={cn(
          'h-3 w-3 ml-auto shrink-0 text-muted-foreground/50 transition-transform',
          expanded && 'rotate-180',
        )} />
      </button>

      {expanded && (
        <div className="mt-1 ml-3 border-l border-foreground/[0.08] pl-3 space-y-1 animate-content-enter">
          {segment.definedBots.map((bot) => (
            <div key={bot.name} className="flex items-center gap-2 px-2 py-1 text-xs">
              <BotStatusIcon status={bot.status} />
              <span className={cn(
                'text-muted-foreground',
                bot.status === 'running' && 'text-primary',
              )}>
                {bot.name}
              </span>
              {bot.goal && (
                <span className="text-muted-foreground/50 truncate">&mdash; {bot.goal}</span>
              )}
            </div>
          ))}

          {segment.error && (
            <div className="px-2 py-1.5 rounded bg-destructive/5 text-xs text-destructive">
              {segment.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BotStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'pending': return <Clock className="h-3 w-3 shrink-0 text-muted-foreground/40" />;
    case 'running': return <Loader2 className="h-3 w-3 animate-spin shrink-0 text-primary" />;
    case 'completed': return <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" />;
    case 'failed': return <AlertCircle className="h-3 w-3 shrink-0 text-destructive" />;
    default: return <Clock className="h-3 w-3 shrink-0 text-muted-foreground/40" />;
  }
}
