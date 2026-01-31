'use client';

/**
 * ExecutionCard Component
 *
 * Displays a single execution in a card format for the executions list.
 * Shows status, flow name, duration, and trigger type.
 */

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  Play,
  Webhook,
  Calendar,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FlowExecutionStatus } from '@/lib/execution/types';

// ============================================================================
// Types
// ============================================================================

interface TriggerInfo {
  type: 'manual' | 'webhook' | 'schedule';
  userId?: string;
  webhookRequestId?: string;
}

export interface ExecutionCardProps {
  execution: {
    id: string;
    flowId: string;
    status: FlowExecutionStatus;
    startedAt: Date | string;
    completedAt?: Date | string | null;
    triggeredBy: TriggerInfo;
    flow: {
      name: string;
    };
  };
}

// ============================================================================
// Status Helpers
// ============================================================================

function getStatusIcon(status: FlowExecutionStatus) {
  switch (status) {
    case 'pending':
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'cancelled':
      return <Ban className="h-4 w-4 text-yellow-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}


function getTriggerIcon(type: string) {
  switch (type) {
    case 'manual':
      return <User className="h-3 w-3" />;
    case 'webhook':
      return <Webhook className="h-3 w-3" />;
    case 'schedule':
      return <Calendar className="h-3 w-3" />;
    default:
      return <Play className="h-3 w-3" />;
  }
}

function formatDuration(startedAt: Date | string, completedAt?: Date | string | null): string {
  const start = new Date(startedAt);
  const end = completedAt ? new Date(completedAt) : new Date();
  const ms = end.getTime() - start.getTime();

  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

// ============================================================================
// Component
// ============================================================================

export function ExecutionCard({ execution }: ExecutionCardProps) {
  const isRunning = execution.status === 'running' || execution.status === 'pending';

  return (
    <Link href={`/executions/${execution.id}`}>
      <Card
        className={cn(
          'hover:bg-accent/50 transition-colors cursor-pointer',
          isRunning && 'border-blue-500/50'
        )}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon(execution.status)}
              <CardTitle className="text-base font-medium">
                {execution.flow.name}
              </CardTitle>
            </div>
            <StatusBadge status={execution.status} />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-4">
              {/* Trigger type */}
              <div className="flex items-center gap-1">
                {getTriggerIcon(execution.triggeredBy.type)}
                <span className="capitalize">{execution.triggeredBy.type}</span>
              </div>
              {/* Duration */}
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>
                  {isRunning
                    ? 'Running...'
                    : formatDuration(execution.startedAt, execution.completedAt)}
                </span>
              </div>
            </div>
            {/* Time ago */}
            <span>
              {formatDistanceToNow(new Date(execution.startedAt), { addSuffix: true })}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
