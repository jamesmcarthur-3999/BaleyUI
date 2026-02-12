'use client';

import { useState } from 'react';
import { ChevronUp, ChevronDown, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UnifiedStatusBadge } from '@/components/ui/unified-status-badge';
import { formatDuration } from '@/lib/format';
import { formatDistanceToNow } from 'date-fns';

interface Execution {
  id: string;
  status: string;
  input?: unknown;
  output?: unknown;
  error?: string | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  durationMs?: number | null;
  createdAt: Date | string;
}

interface ExecutionHistoryProps {
  executions: Execution[];
  className?: string;
  /** Default collapsed state */
  defaultCollapsed?: boolean;
  /** Callback when an execution is clicked */
  onExecutionClick?: (executionId: string) => void;
}


/**
 * ExecutionHistory displays recent executions for a BaleyBot.
 *
 * Features:
 * - Shows last N executions with status indicators
 * - Collapsible to save space
 * - Click to navigate to execution detail
 * - Shows duration and relative time
 */
export function ExecutionHistory({
  executions,
  className,
  defaultCollapsed = true,
  onExecutionClick,
}: ExecutionHistoryProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  if (executions.length === 0) {
    return null;
  }

  return (
    <div className={cn('rounded-xl border bg-background/50', className)}>
      {/* Header with collapse toggle */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={cn(
          'w-full flex items-center justify-between px-4 py-2.5',
          'text-sm font-medium text-muted-foreground',
          'hover:bg-muted/50 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-inset',
          !isCollapsed && 'border-b'
        )}
        aria-expanded={!isCollapsed}
        aria-controls="execution-history"
      >
        <span className="flex items-center gap-2">
          <Clock className="h-4 w-4" aria-hidden="true" />
          Recent Executions
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">
            {executions.length}
          </span>
        </span>
        {isCollapsed ? (
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronUp className="h-4 w-4" aria-hidden="true" />
        )}
      </button>

      {/* Executions list */}
      <div
        id="execution-history"
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-in-out',
          isCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
        )}
      >
        <div className="overflow-hidden">
          <div className="divide-y">
            {executions.map((execution) => (
              <ExecutionRow
                key={execution.id}
                execution={execution}
                onClick={onExecutionClick}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ExecutionRowProps {
  execution: Execution;
  onClick?: (executionId: string) => void;
}

function ExecutionRow({ execution, onClick }: ExecutionRowProps) {
  const createdAt = typeof execution.createdAt === 'string'
    ? new Date(execution.createdAt)
    : execution.createdAt;

  const timeAgo = formatDistanceToNow(createdAt, { addSuffix: true });

  return (
    <button
      onClick={() => onClick?.(execution.id)}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3',
        'hover:bg-muted/50 transition-colors text-left',
        'focus:outline-none focus:bg-muted/50',
        onClick ? 'cursor-pointer' : 'cursor-default'
      )}
      disabled={!onClick}
    >
      {/* Status badge */}
      <UnifiedStatusBadge status={execution.status as any} domain="execution" size="sm" />

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {execution.durationMs != null && (
            <span className="text-xs text-muted-foreground">
              {formatDuration(execution.durationMs)}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {timeAgo}
        </p>
      </div>

      {/* Error indicator */}
      {execution.error && (
        <span className="text-xs text-red-500 truncate max-w-[150px]" title={execution.error}>
          {execution.error}
        </span>
      )}
    </button>
  );
}
