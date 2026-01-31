'use client';

/**
 * ExecutionMetrics Component
 *
 * Displays execution metrics like duration, tokens, and cost.
 */

import { Badge } from '@/components/ui/badge';
import { Clock, Zap, DollarSign, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCost, formatDuration, formatTokens } from '@/lib/format';

// ============================================================================
// Types
// ============================================================================

export interface ExecutionMetricsProps {
  /** Total execution duration in milliseconds */
  durationMs?: number;
  /** Total tokens used (input + output) */
  totalTokens?: number;
  /** Input tokens */
  inputTokens?: number;
  /** Output tokens */
  outputTokens?: number;
  /** Estimated cost in USD */
  cost?: number;
  /** Number of nodes executed */
  nodesExecuted?: number;
  /** Total nodes in flow */
  totalNodes?: number;
  /** Compact display mode */
  compact?: boolean;
  /** Custom className */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ExecutionMetrics({
  durationMs,
  totalTokens,
  inputTokens,
  outputTokens,
  cost,
  nodesExecuted,
  totalNodes,
  compact = false,
  className,
}: ExecutionMetricsProps) {
  if (compact) {
    return (
      <div className={cn('flex items-center gap-3 text-sm text-muted-foreground', className)}>
        {durationMs !== undefined && (
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{formatDuration(durationMs)}</span>
          </div>
        )}
        {totalTokens !== undefined && (
          <div className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            <span>{formatTokens(totalTokens)}</span>
          </div>
        )}
        {cost !== undefined && (
          <div className="flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            <span>{formatCost(cost)}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {/* Duration */}
      {durationMs !== undefined && (
        <Badge variant="outline" className="gap-1">
          <Clock className="h-3 w-3" />
          {formatDuration(durationMs)}
        </Badge>
      )}

      {/* Tokens */}
      {totalTokens !== undefined && (
        <Badge variant="outline" className="gap-1">
          <Zap className="h-3 w-3" />
          {formatTokens(totalTokens)} tokens
          {inputTokens !== undefined && outputTokens !== undefined && (
            <span className="text-muted-foreground text-xs ml-1">
              ({formatTokens(inputTokens)} in / {formatTokens(outputTokens)} out)
            </span>
          )}
        </Badge>
      )}

      {/* Cost */}
      {cost !== undefined && (
        <Badge variant="outline" className="gap-1">
          <DollarSign className="h-3 w-3" />
          {formatCost(cost)}
        </Badge>
      )}

      {/* Nodes progress */}
      {nodesExecuted !== undefined && totalNodes !== undefined && (
        <Badge variant="outline" className="gap-1">
          <Hash className="h-3 w-3" />
          {nodesExecuted}/{totalNodes} nodes
        </Badge>
      )}
    </div>
  );
}
