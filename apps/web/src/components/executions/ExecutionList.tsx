'use client';

/**
 * ExecutionList Component
 *
 * Displays a list of executions with filtering and empty states.
 */

import { ExecutionCard, type ExecutionCardProps } from './ExecutionCard';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Filter, Inbox } from 'lucide-react';
import type { FlowExecutionStatus } from '@/lib/execution/types';
import { useVirtualList } from '@/hooks/useVirtualList';

// ============================================================================
// Types
// ============================================================================

export interface ExecutionListProps {
  executions: ExecutionCardProps['execution'][];
  isLoading?: boolean;
  /** Currently selected status filter */
  statusFilter?: FlowExecutionStatus | 'all';
  /** Callback when status filter changes */
  onStatusFilterChange?: (status: FlowExecutionStatus | 'all') => void;
  /** Currently selected flow filter */
  flowFilter?: string | 'all';
  /** Available flows for filtering */
  flows?: { id: string; name: string }[];
  /** Callback when flow filter changes */
  onFlowFilterChange?: (flowId: string | 'all') => void;
  /** Empty state action */
  onRunFlow?: () => void;
}



// ============================================================================
// Filters
// ============================================================================

function ExecutionFilters({
  statusFilter = 'all',
  onStatusFilterChange,
  flowFilter = 'all',
  flows,
  onFlowFilterChange,
}: Pick<
  ExecutionListProps,
  'statusFilter' | 'onStatusFilterChange' | 'flowFilter' | 'flows' | 'onFlowFilterChange'
>) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Filter className="h-4 w-4" />
        <span>Filter:</span>
      </div>

      {/* Status filter */}
      <Select
        value={statusFilter}
        onValueChange={(value) => onStatusFilterChange?.(value as FlowExecutionStatus | 'all')}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="running">Running</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
          <SelectItem value="failed">Failed</SelectItem>
          <SelectItem value="cancelled">Cancelled</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
        </SelectContent>
      </Select>

      {/* Flow filter */}
      {flows && flows.length > 0 && (
        <Select
          value={flowFilter}
          onValueChange={(value) => onFlowFilterChange?.(value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Flow" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Flows</SelectItem>
            {flows.map((flow) => (
              <SelectItem key={flow.id} value={flow.id}>
                {flow.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

const ITEM_HEIGHT = 120;
const VIRTUALIZE_THRESHOLD = 20;

function VirtualizedExecutionList({ executions }: { executions: ExecutionCardProps['execution'][] }) {
  const { containerRef, totalHeight, virtualItems } = useVirtualList({
    itemCount: executions.length,
    itemHeight: ITEM_HEIGHT,
    overscan: 5,
  });

  return (
    <div ref={containerRef} className="overflow-auto" style={{ maxHeight: 600 }}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        {virtualItems.map((item) => (
          <div
            key={executions[item.index]!.id}
            style={{ position: 'absolute', top: item.start, height: item.size, left: 0, right: 0 }}
          >
            <ExecutionCard execution={executions[item.index]!} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExecutionList({
  executions,
  isLoading,
  statusFilter,
  onStatusFilterChange,
  flowFilter,
  flows,
  onFlowFilterChange,
  onRunFlow,
}: ExecutionListProps) {
  // Show loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <ExecutionFilters
          statusFilter={statusFilter}
          onStatusFilterChange={onStatusFilterChange}
          flowFilter={flowFilter}
          flows={flows}
          onFlowFilterChange={onFlowFilterChange}
        />
        <ListSkeleton variant="card" count={5} />
      </div>
    );
  }

  // Show empty state
  if (executions.length === 0) {
    return (
      <div>
        {(onStatusFilterChange || onFlowFilterChange) && (
          <ExecutionFilters
            statusFilter={statusFilter}
            onStatusFilterChange={onStatusFilterChange}
            flowFilter={flowFilter}
            flows={flows}
            onFlowFilterChange={onFlowFilterChange}
          />
        )}
        <EmptyState
          icon={Inbox}
          title="No executions yet"
          description="Run a flow to see execution history here. Each run is tracked with status, timing, and outputs."
          action={onRunFlow ? {
            label: 'Run a Flow',
            onClick: onRunFlow,
          } : undefined}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(onStatusFilterChange || onFlowFilterChange) && (
        <ExecutionFilters
          statusFilter={statusFilter}
          onStatusFilterChange={onStatusFilterChange}
          flowFilter={flowFilter}
          flows={flows}
          onFlowFilterChange={onFlowFilterChange}
        />
      )}
      {executions.length > VIRTUALIZE_THRESHOLD ? (
        <VirtualizedExecutionList executions={executions} />
      ) : (
        <div className="space-y-3">
          {executions.map((execution) => (
            <ExecutionCard key={execution.id} execution={execution} />
          ))}
        </div>
      )}
    </div>
  );
}
