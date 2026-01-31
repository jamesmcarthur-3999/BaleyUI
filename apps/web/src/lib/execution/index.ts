/**
 * Execution Engine
 *
 * Server-side flow execution with real-time streaming.
 */

// Main executor
export { FlowExecutor } from './flow-executor';

// State management
export { ExecutionStateMachine, InvalidTransitionError } from './state-machine';

// Event handling
export { ExecutionEventEmitter, FlowEventAggregator } from './event-emitter';

// Node executors
export {
  executeNode,
  getExecutor,
  hasExecutor,
  getRegisteredTypes,
} from './node-executors';

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
