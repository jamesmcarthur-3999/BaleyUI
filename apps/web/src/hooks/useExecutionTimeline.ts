/**
 * useExecutionTimeline Hook
 *
 * Higher-level hook for execution timeline state management.
 * Wraps useExecutionStream and provides structured node state tracking.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useExecutionStream } from './useExecutionStream';
import type {
  ExecutionEvent,
  FlowExecutionStatus,
  NodeExecutionStatus,
} from '@/lib/execution/types';
import type { BaleybotStreamEvent } from '@/lib/streaming/types/events';

// ============================================================================
// Types
// ============================================================================

export interface NodeState {
  nodeId: string;
  status: NodeExecutionStatus;
  blockExecutionId?: string;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  error?: string;
  streamContent: string;
  toolCalls: ToolCallState[];
}

export interface ToolCallState {
  id: string;
  toolName: string;
  arguments?: unknown;
  result?: unknown;
  error?: string;
  status: 'streaming' | 'executing' | 'completed' | 'error';
}

export interface UseExecutionTimelineOptions {
  /** Initial execution data from server */
  initialExecution?: {
    status: FlowExecutionStatus;
    output?: unknown;
    error?: string;
  };
  /** Callback when execution completes */
  onComplete?: (output: unknown) => void;
  /** Callback when execution fails */
  onError?: (error: string) => void;
}

export interface UseExecutionTimelineReturn {
  /** Current execution status */
  status: FlowExecutionStatus;
  /** Whether the execution is in a terminal state */
  isComplete: boolean;
  /** Whether we're connected to the stream */
  isConnected: boolean;
  /** Map of node states by nodeId */
  nodeStates: Map<string, NodeState>;
  /** Currently active node ID (running) */
  activeNodeId: string | null;
  /** Current streaming content for display */
  currentStreamContent: string;
  /** Final execution output */
  output: unknown;
  /** Execution error message */
  error: string | null;
  /** Manually reconnect to stream */
  reconnect: () => void;
  /** Disconnect from stream */
  disconnect: () => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useExecutionTimeline(
  executionId: string | null,
  options: UseExecutionTimelineOptions = {}
): UseExecutionTimelineReturn {
  const { initialExecution, onComplete, onError } = options;

  // State
  const [status, setStatus] = useState<FlowExecutionStatus>(
    initialExecution?.status || 'pending'
  );
  const [nodeStates, setNodeStates] = useState<Map<string, NodeState>>(new Map());
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [output, setOutput] = useState<unknown>(initialExecution?.output || null);
  const [error, setError] = useState<string | null>(initialExecution?.error || null);

  // Check if execution is already complete from initial data
  const isInitiallyComplete = useMemo(
    () =>
      initialExecution?.status
        ? ['completed', 'failed', 'cancelled'].includes(initialExecution.status)
        : false,
    [initialExecution?.status]
  );

  // Process incoming events
  const handleEvent = useCallback(
    (event: ExecutionEvent) => {
      switch (event.type) {
        case 'execution_start':
          setStatus('running');
          break;

        case 'node_start': {
          const nodeStart = event as { nodeId: string; blockExecutionId: string; input: unknown };
          setActiveNodeId(nodeStart.nodeId);
          setNodeStates((prev) => {
            const next = new Map(prev);
            next.set(nodeStart.nodeId, {
              nodeId: nodeStart.nodeId,
              status: 'running',
              blockExecutionId: nodeStart.blockExecutionId,
              startedAt: new Date(),
              input: nodeStart.input,
              streamContent: '',
              toolCalls: [],
            });
            return next;
          });
          break;
        }

        case 'node_stream': {
          const nodeStream = event as { nodeId: string; event: BaleybotStreamEvent };
          const streamEvent = nodeStream.event;

          setNodeStates((prev) => {
            const next = new Map(prev);
            const current = next.get(nodeStream.nodeId);
            if (!current) return prev;

            const updated = { ...current };

            // Handle text deltas
            if (streamEvent.type === 'text_delta') {
              updated.streamContent += streamEvent.content;
            }

            // Handle tool calls
            if (streamEvent.type === 'tool_call_stream_start') {
              updated.toolCalls = [
                ...updated.toolCalls,
                {
                  id: streamEvent.id,
                  toolName: streamEvent.toolName,
                  status: 'streaming',
                },
              ];
            }

            if (streamEvent.type === 'tool_call_stream_complete') {
              updated.toolCalls = updated.toolCalls.map((tc) =>
                tc.id === streamEvent.id
                  ? { ...tc, arguments: streamEvent.arguments, status: 'executing' as const }
                  : tc
              );
            }

            if (streamEvent.type === 'tool_execution_output') {
              updated.toolCalls = updated.toolCalls.map((tc) =>
                tc.id === streamEvent.id
                  ? {
                      ...tc,
                      result: streamEvent.result,
                      error: streamEvent.error,
                      status: streamEvent.error ? ('error' as const) : ('completed' as const),
                    }
                  : tc
              );
            }

            next.set(nodeStream.nodeId, updated);
            return next;
          });
          break;
        }

        case 'node_complete': {
          const nodeComplete = event as { nodeId: string; output: unknown; durationMs: number };
          setNodeStates((prev) => {
            const next = new Map(prev);
            const current = next.get(nodeComplete.nodeId);
            if (!current) return prev;

            next.set(nodeComplete.nodeId, {
              ...current,
              status: 'completed',
              output: nodeComplete.output,
              completedAt: new Date(),
              durationMs: nodeComplete.durationMs,
            });
            return next;
          });
          // Don't clear activeNodeId here - let the next node_start do it
          break;
        }

        case 'node_error': {
          const nodeError = event as { nodeId: string; error: string };
          setNodeStates((prev) => {
            const next = new Map(prev);
            const current = next.get(nodeError.nodeId);
            if (!current) return prev;

            next.set(nodeError.nodeId, {
              ...current,
              status: 'failed',
              error: nodeError.error,
              completedAt: new Date(),
            });
            return next;
          });
          break;
        }

        case 'execution_complete': {
          const execComplete = event as { output: unknown };
          setStatus('completed');
          setOutput(execComplete.output);
          setActiveNodeId(null);
          onComplete?.(execComplete.output);
          break;
        }

        case 'execution_error': {
          const execError = event as { error: string };
          setStatus('failed');
          setError(execError.error);
          setActiveNodeId(null);
          onError?.(execError.error);
          break;
        }

        case 'execution_cancelled':
          setStatus('cancelled');
          setActiveNodeId(null);
          break;
      }
    },
    [onComplete, onError]
  );

  // Use the base execution stream hook
  const {
    events,
    status: connectionStatus,
    isConnected,
    reconnect,
    disconnect,
  } = useExecutionStream(
    // Only connect if execution is not already complete
    isInitiallyComplete ? null : executionId,
    {
      baseUrl: '/api/executions',
      autoReconnect: true,
      maxReconnectAttempts: 10,
      reconnectOnVisibility: true,
    }
  );

  // Process events as they come in
  useEffect(() => {
    if (events.length > 0) {
      // Process only the latest event (events array grows)
      const latestEvent = events[events.length - 1];
      if (latestEvent) {
        // The events from useExecutionStream are ServerStreamEvent
        // We need to extract the execution event from them
        handleEvent(latestEvent as unknown as ExecutionEvent);
      }
    }
  }, [events, handleEvent]);

  // Get current streaming content for display
  const currentStreamContent = useMemo(() => {
    if (!activeNodeId) return '';
    return nodeStates.get(activeNodeId)?.streamContent || '';
  }, [activeNodeId, nodeStates]);

  // Check if complete
  const isComplete = useMemo(
    () => ['completed', 'failed', 'cancelled'].includes(status),
    [status]
  );

  return {
    status,
    isComplete,
    isConnected,
    nodeStates,
    activeNodeId,
    currentStreamContent,
    output,
    error,
    reconnect,
    disconnect,
  };
}
