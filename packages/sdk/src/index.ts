/**
 * BaleyUI SDK
 *
 * Official JavaScript/TypeScript SDK for BaleyUI.
 * Execute AI flows and blocks programmatically.
 *
 * @packageDocumentation
 */

// Main client
export { BaleyUI } from './client';

// BAL Executor (Phase 2)
export {
  executeBALCode,
  compileBALCode,
  streamBALExecution,
} from './bal-executor';
export type {
  BALExecutionOptions,
  BALExecutionEvent,
  BALExecutionResult,
  BALCompileResult,
} from './bal-executor';

// Re-export useful types from @baleybots/tools
export type { PipelineStructure, BALConfig, DSLToolEvent } from '@baleybots/tools';

// Types
export type {
  BaleyUIOptions,
  Flow,
  FlowDetail,
  FlowNode,
  FlowEdge,
  FlowTrigger,
  Block,
  Execution,
  ExecutionStatus,
  ExecutionEvent,
  ExecutionEventType,
  ExecuteOptions,
  ExecuteResult,
  ExecutionHandle,
  ListFlowsResult,
  ListBlocksResult,
} from './types';

// Errors
export {
  BaleyUIError,
  AuthenticationError,
  PermissionError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  TimeoutError,
  ConnectionError,
} from './errors';
