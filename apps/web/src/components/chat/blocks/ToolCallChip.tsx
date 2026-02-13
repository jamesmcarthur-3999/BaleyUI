'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Loader2, CheckCircle2, AlertCircle, ChevronDown } from 'lucide-react';
import { LoadingDots } from '@/components/ui/loading-dots';
import { getToolLabel, getToolIcon } from '../tool-summaries';
import type { ToolCallSegment } from '@baleybots/chat';
import type { ChatConfig } from '../types';

interface ToolCallChipProps {
  segment: ToolCallSegment;
  detail?: ChatConfig['toolDetail'];
  className?: string;
}

export function ToolCallChip({ segment, detail = 'standard', className }: ToolCallChipProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = getToolIcon(segment.name);
  const isActive = segment.status === 'running';
  const isDone = segment.status === 'completed';
  const isError = segment.status === 'failed';

  const label = getToolLabel(segment.name, segment.status, segment.args, segment.result);

  const canExpand = !isActive && (segment.result || segment.error) && detail !== 'minimal';

  return (
    <div className={cn('my-1', className)}>
      {/* Chip row */}
      <button
        onClick={() => canExpand && setExpanded(!expanded)}
        disabled={!canExpand}
        className={cn(
          'group/chip flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs w-full text-left transition-colors',
          'bg-foreground/[0.03] hover:bg-foreground/[0.05]',
          canExpand && 'cursor-pointer',
          !canExpand && 'cursor-default',
        )}
      >
        {/* Status icon */}
        {isActive && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-primary" />}
        {isDone && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
        {isError && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />}

        {/* Tool-specific icon */}
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

        {/* Label */}
        <span className="font-medium truncate text-muted-foreground">{label}</span>

        {/* Active dots */}
        {isActive && <LoadingDots size="sm" className="ml-1" />}

        {/* Expand chevron */}
        {canExpand && (
          <ChevronDown className={cn(
            'h-3 w-3 ml-auto shrink-0 text-muted-foreground/50 transition-transform',
            expanded && 'rotate-180',
          )} />
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-1 px-3 py-2 rounded-lg bg-foreground/[0.02] text-xs animate-content-enter">
          {segment.error && (
            <pre className="whitespace-pre-wrap break-words text-destructive max-h-32 overflow-y-auto">
              {segment.error}
            </pre>
          )}
          {segment.result != null && !segment.error && (
            <pre className="whitespace-pre-wrap break-words text-muted-foreground max-h-32 overflow-y-auto">
              {formatResult(segment.result)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function formatResult(result: unknown): string {
  if (typeof result === 'string') return result;
  return JSON.stringify(result, null, 2);
}
