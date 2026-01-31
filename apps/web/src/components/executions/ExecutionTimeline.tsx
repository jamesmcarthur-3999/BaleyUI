'use client';

/**
 * ExecutionTimeline Component
 *
 * Main timeline view for flow execution.
 * Shows all nodes with real-time status updates via SSE.
 */

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  WifiOff,
  AlertCircle,
  Ban,
} from 'lucide-react';
import { NodeExecutionCard } from './NodeExecutionCard';
import { LiveStreamViewer } from './LiveStreamViewer';
import { ExecutionMetrics } from './ExecutionMetrics';
import { ExecutionActions, CopyOutputButton } from './ExecutionActions';
import { SuccessCelebration } from './SuccessCelebration';
import { useExecutionTimeline, type NodeState } from '@/hooks/useExecutionTimeline';
import { cn } from '@/lib/utils';
import type { FlowExecutionStatus } from '@/lib/execution/types';
import type { FlowNodeType } from '@/lib/baleybots/types';

// ============================================================================
// Types
// ============================================================================

interface FlowNode {
  id: string;
  type: FlowNodeType;
  data: {
    label?: string;
    name?: string;
    blockId?: string;
  };
}

export interface ExecutionTimelineProps {
  /** Execution ID to stream */
  executionId: string;
  /** Flow nodes for reference */
  nodes: FlowNode[];
  /** Initial execution data (from server) */
  initialExecution?: {
    status: FlowExecutionStatus;
    output?: unknown;
    error?: string;
    startedAt?: Date | string;
    completedAt?: Date | string | null;
    metrics?: {
      durationMs?: number;
      totalTokens?: number;
      cost?: number;
    };
  };
  /** Callback when cancel is requested */
  onCancel?: () => Promise<void>;
  /** Callback when retry is requested */
  onRetry?: () => Promise<void>;
  /** Custom className */
  className?: string;
}

// ============================================================================
// Status Header
// ============================================================================

function ExecutionStatusHeader({
  status,
  isConnected,
  startedAt,
}: {
  status: FlowExecutionStatus;
  isConnected: boolean;
  startedAt?: Date | string;
}) {
  const getStatusIcon = () => {
    switch (status) {
      case 'pending':
        return <Clock className="h-5 w-5 text-muted-foreground" />;
      case 'running':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'cancelled':
        return <Ban className="h-5 w-5 text-yellow-500" />;
      default:
        return <Clock className="h-5 w-5" />;
    }
  };

  const getStatusBadgeVariant = (): 'default' | 'destructive' | 'outline' | 'secondary' => {
    switch (status) {
      case 'completed':
        return 'default';
      case 'failed':
        return 'destructive';
      case 'running':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {getStatusIcon()}
        <div>
          <h2 className="text-lg font-semibold capitalize">{status}</h2>
          {startedAt && (
            <p className="text-sm text-muted-foreground">
              Started {new Date(startedAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!isConnected && status === 'running' && (
          <Badge variant="outline" className="gap-1 text-yellow-500">
            <WifiOff className="h-3 w-3" />
            Disconnected
          </Badge>
        )}
        <Badge variant={getStatusBadgeVariant()}>{status}</Badge>
      </div>
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

export function ExecutionTimeline({
  executionId,
  nodes,
  initialExecution,
  onCancel,
  onRetry,
  className,
}: ExecutionTimelineProps) {
  const activeNodeRef = useRef<HTMLDivElement>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const prevStatusRef = useRef<FlowExecutionStatus | null>(null);

  const {
    status,
    isComplete,
    isConnected,
    nodeStates,
    activeNodeId,
    currentStreamContent,
    output,
    error,
    reconnect,
  } = useExecutionTimeline(executionId, {
    initialExecution,
    onComplete: (result) => {
      console.log('Execution completed:', result);
    },
    onError: (err) => {
      console.error('Execution error:', err);
    },
  });

  // Show celebration when status changes to completed
  useEffect(() => {
    if (status === 'completed' && prevStatusRef.current === 'running') {
      setShowCelebration(true);
    }
    prevStatusRef.current = status;
  }, [status]);

  // Auto-scroll to active node
  useEffect(() => {
    if (activeNodeId && activeNodeRef.current) {
      activeNodeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeNodeId]);

  // Get node info helper
  const getNodeInfo = (nodeId: string): { type: FlowNodeType; label: string } => {
    const node = nodes.find((n) => n.id === nodeId);
    return {
      type: (node?.type || 'function-block') as FlowNodeType,
      label: node?.data?.label || node?.data?.name || nodeId,
    };
  };

  // Sort nodes in execution order (pending/running first, then by start time)
  const sortedNodeIds = Array.from(nodeStates.keys()).sort((a, b) => {
    const stateA = nodeStates.get(a);
    const stateB = nodeStates.get(b);

    // Running nodes first
    if (stateA?.status === 'running' && stateB?.status !== 'running') return -1;
    if (stateB?.status === 'running' && stateA?.status !== 'running') return 1;

    // Then by start time
    const timeA = stateA?.startedAt?.getTime() || 0;
    const timeB = stateB?.startedAt?.getTime() || 0;
    return timeA - timeB;
  });

  // Calculate progress
  const completedNodes = sortedNodeIds.filter((id) =>
    ['completed', 'failed'].includes(nodeStates.get(id)?.status || '')
  ).length;
  const totalExecutableNodes = nodes.filter(n => n.type !== 'source' && n.type !== 'sink').length;
  const progressPercent = totalExecutableNodes > 0
    ? Math.round((completedNodes / totalExecutableNodes) * 100)
    : 0;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Success Celebration */}
      <SuccessCelebration show={showCelebration} />

      {/* Status Header */}
      <Card>
        <CardHeader>
          <ExecutionStatusHeader
            status={status}
            isConnected={isConnected}
            startedAt={initialExecution?.startedAt}
          />
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {/* Progress Bar */}
          {status === 'running' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {completedNodes} of {totalExecutableNodes} nodes completed
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <ExecutionMetrics
              durationMs={initialExecution?.metrics?.durationMs}
              totalTokens={initialExecution?.metrics?.totalTokens}
              cost={initialExecution?.metrics?.cost}
              nodesExecuted={completedNodes}
              totalNodes={totalExecutableNodes}
            />
            <ExecutionActions
              status={status}
              onCancel={onCancel}
              onRetry={onRetry}
            />
          </div>
        </CardContent>
      </Card>

      {/* Disconnected Warning */}
      {!isConnected && !isComplete && (
        <Alert variant="destructive">
          <WifiOff className="h-4 w-4" />
          <AlertTitle>Connection Lost</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>The connection to the execution stream was lost.</span>
            <button
              onClick={reconnect}
              className="text-sm font-medium underline hover:no-underline"
            >
              Reconnect
            </button>
          </AlertDescription>
        </Alert>
      )}

      {/* Live Streaming Viewer (when streaming) */}
      {activeNodeId && currentStreamContent && (
        <LiveStreamViewer
          content={currentStreamContent}
          nodeLabel={getNodeInfo(activeNodeId).label}
          isStreaming={nodeStates.get(activeNodeId)?.status === 'running'}
        />
      )}

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Execution Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {sortedNodeIds.length === 0 && !isComplete && (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p>Waiting for execution to start...</p>
            </div>
          )}

          {sortedNodeIds.map((nodeId) => {
            const state = nodeStates.get(nodeId);
            const { type, label } = getNodeInfo(nodeId);
            const isActive = nodeId === activeNodeId;

            return (
              <div
                key={nodeId}
                ref={isActive ? activeNodeRef : undefined}
              >
                <NodeExecutionCard
                  nodeId={nodeId}
                  nodeType={type}
                  label={label}
                  state={state}
                  isActive={isActive}
                  defaultExpanded={isActive || state?.status === 'failed'}
                />
              </div>
            );
          })}

          {/* Show nodes that haven't started yet */}
          {nodes
            .filter((node) => !nodeStates.has(node.id) && node.type !== 'source' && node.type !== 'sink')
            .map((node) => (
              <NodeExecutionCard
                key={node.id}
                nodeId={node.id}
                nodeType={node.type}
                label={node.data?.label || node.data?.name || node.id}
                state={undefined}
                isActive={false}
              />
            ))}
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Execution Failed</AlertTitle>
          <AlertDescription>
            <pre className="mt-2 text-sm whitespace-pre-wrap">{error}</pre>
          </AlertDescription>
        </Alert>
      )}

      {/* Output Display */}
      {isComplete && output !== null && output !== undefined && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Final Output
              </CardTitle>
              <CopyOutputButton output={output} />
            </div>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-md text-sm overflow-auto max-h-96">
              {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
