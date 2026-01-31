/**
 * Execution Engine Types
 *
 * Types for the flow execution engine including events, states, and results.
 */

import type { BaleybotStreamEvent } from '@/lib/streaming/types/events';
import type { FlowNodeType, FlowNodeData } from '@/lib/baleybots/types';

// ============================================================================
// EXECUTION STATUS
// ============================================================================

export type FlowExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type NodeExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

// ============================================================================
// EXECUTION EVENTS
// ============================================================================

export interface ExecutionStartEvent {
  type: 'execution_start';
  executionId: string;
  flowId: string;
  input: unknown;
  timestamp: number;
}

export interface ExecutionCompleteEvent {
  type: 'execution_complete';
  executionId: string;
  output: unknown;
  metrics: ExecutionMetrics;
  timestamp: number;
}

export interface ExecutionErrorEvent {
  type: 'execution_error';
  executionId: string;
  error: string;
  nodeId?: string;
  timestamp: number;
}

export interface ExecutionCancelledEvent {
  type: 'execution_cancelled';
  executionId: string;
  timestamp: number;
}

export interface NodeStartEvent {
  type: 'node_start';
  executionId: string;
  nodeId: string;
  nodeType: FlowNodeType;
  blockExecutionId: string;
  input: unknown;
  timestamp: number;
}

export interface NodeStreamEvent {
  type: 'node_stream';
  executionId: string;
  nodeId: string;
  blockExecutionId: string;
  event: BaleybotStreamEvent;
  timestamp: number;
}

export interface NodeCompleteEvent {
  type: 'node_complete';
  executionId: string;
  nodeId: string;
  blockExecutionId: string;
  output: unknown;
  durationMs: number;
  timestamp: number;
}

export interface NodeErrorEvent {
  type: 'node_error';
  executionId: string;
  nodeId: string;
  blockExecutionId: string;
  error: string;
  timestamp: number;
}

export interface NodeSkippedEvent {
  type: 'node_skipped';
  executionId: string;
  nodeId: string;
  reason: string;
  timestamp: number;
}

export type ExecutionEvent =
  | ExecutionStartEvent
  | ExecutionCompleteEvent
  | ExecutionErrorEvent
  | ExecutionCancelledEvent
  | NodeStartEvent
  | NodeStreamEvent
  | NodeCompleteEvent
  | NodeErrorEvent
  | NodeSkippedEvent;

// Type guards
export function isExecutionStart(event: ExecutionEvent): event is ExecutionStartEvent {
  return event.type === 'execution_start';
}

export function isExecutionComplete(event: ExecutionEvent): event is ExecutionCompleteEvent {
  return event.type === 'execution_complete';
}

export function isExecutionError(event: ExecutionEvent): event is ExecutionErrorEvent {
  return event.type === 'execution_error';
}

export function isNodeStart(event: ExecutionEvent): event is NodeStartEvent {
  return event.type === 'node_start';
}

export function isNodeStream(event: ExecutionEvent): event is NodeStreamEvent {
  return event.type === 'node_stream';
}

export function isNodeComplete(event: ExecutionEvent): event is NodeCompleteEvent {
  return event.type === 'node_complete';
}

export function isTerminalEvent(event: ExecutionEvent): boolean {
  return ['execution_complete', 'execution_error', 'execution_cancelled'].includes(event.type);
}

// ============================================================================
// EXECUTION OPTIONS & RESULTS
// ============================================================================

export interface ExecutionTrigger {
  type: 'manual' | 'webhook' | 'schedule';
  userId?: string;
  webhookRequestId?: string;
  webhookSecret?: string;
  ipAddress?: string;
  userAgent?: string;
  scheduledAt?: string;
}

export interface ExecutionOptions {
  flowId: string;
  input: unknown;
  triggeredBy: ExecutionTrigger;
}

export interface ExecutionMetrics {
  totalDurationMs: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  nodeCount: number;
  completedNodes: number;
  failedNodes: number;
}

export interface ExecutionResult {
  executionId: string;
  status: FlowExecutionStatus;
  output?: unknown;
  error?: string;
  metrics: ExecutionMetrics;
}

// ============================================================================
// NODE EXECUTOR TYPES
// ============================================================================

export interface CompiledNode {
  nodeId: string;
  type: FlowNodeType;
  data: FlowNodeData;
  incomingEdges: string[];
  outgoingEdges: string[];
}

export interface NodeExecutorContext {
  executionId: string;
  flowId: string;
  workspaceId: string;
  nodeResults: Map<string, unknown>;
  flowInput: unknown;
  onStream?: (event: BaleybotStreamEvent) => void;
  signal?: AbortSignal;
}

export interface NodeExecutor {
  type: FlowNodeType;
  execute(
    node: CompiledNode,
    input: unknown,
    context: NodeExecutorContext
  ): Promise<unknown>;
}

// ============================================================================
// EXECUTION STATE
// ============================================================================

export interface NodeState {
  nodeId: string;
  status: NodeExecutionStatus;
  blockExecutionId?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
}

export interface ExecutionState {
  executionId: string;
  flowId: string;
  status: FlowExecutionStatus;
  input: unknown;
  output?: unknown;
  error?: string;
  nodeStates: Map<string, NodeState>;
  startedAt: Date;
  completedAt?: Date;
  metrics: ExecutionMetrics;
}
