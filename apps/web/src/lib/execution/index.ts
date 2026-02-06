/**
 * Execution Engine
 *
 * Types, error handling, and retry logic for execution tracking.
 */

// Types
export type {
  // Status types
  FlowExecutionStatus,
  NodeExecutionStatus,

  // Event types
  ExecutionEvent,
  ExecutionStartEvent,
  ExecutionCompleteEvent,
  ExecutionErrorEvent,
  ExecutionCancelledEvent,
  NodeStartEvent,
  NodeStreamEvent,
  NodeCompleteEvent,
  NodeErrorEvent,
  NodeSkippedEvent,

  // Execution types
  ExecutionOptions,
  ExecutionTrigger,
  ExecutionResult,
  ExecutionMetrics,
  ExecutionState,
  NodeState,

  // Node executor types
  CompiledNode,
  NodeExecutor,
  NodeExecutorContext,
} from './types';

// Re-export type guards
export {
  isExecutionStart,
  isExecutionComplete,
  isExecutionError,
  isNodeStart,
  isNodeStream,
  isNodeComplete,
  isTerminalEvent,
} from './types';
