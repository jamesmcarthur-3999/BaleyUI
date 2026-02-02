'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ChevronDown, Clock, CheckCircle, XCircle, Loader2, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
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

const statusConfig = {
  pending: {
    icon: Clock,
    label: 'Pending',
    className: 'text-yellow-500',
    bgClassName: 'bg-yellow-50 dark:bg-yellow-950/30',
  },
  running: {
    icon: Loader2,
    label: 'Running',
    className: 'text-blue-500 animate-spin',
    bgClassName: 'bg-blue-50 dark:bg-blue-950/30',
  },
  completed: {
    icon: CheckCircle,
    label: 'Completed',
    className: 'text-green-500',
    bgClassName: 'bg-green-50 dark:bg-green-950/30',
  },
  failed: {
    icon: XCircle,
    label: 'Failed',
    className: 'text-red-500',
    bgClassName: 'bg-red-50 dark:bg-red-950/30',
  },
  cancelled: {
    icon: Ban,
    label: 'Cancelled',
    className: 'text-gray-500',
    bgClassName: 'bg-gray-50 dark:bg-gray-950/30',
  },
} as const;

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
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            id="execution-history"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="divide-y">
              {executions.map((execution) => (
                <ExecutionRow
                  key={execution.id}
                  execution={execution}
                  onClick={onExecutionClick}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ExecutionRowProps {
  execution: Execution;
  onClick?: (executionId: string) => void;
}

function ExecutionRow({ execution, onClick }: ExecutionRowProps) {
  const status = statusConfig[execution.status as keyof typeof statusConfig] || statusConfig.pending;
  const StatusIcon = status.icon;

  const createdAt = typeof execution.createdAt === 'string'
    ? new Date(execution.createdAt)
    : execution.createdAt;

  const timeAgo = formatDistanceToNow(createdAt, { addSuffix: true });

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

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
      {/* Status icon */}
      <div
        className={cn('p-1.5 rounded-lg', status.bgClassName)}
        title={status.label}
      >
        <StatusIcon className={cn('h-4 w-4', status.className)} aria-hidden="true" />
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{status.label}</span>
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
