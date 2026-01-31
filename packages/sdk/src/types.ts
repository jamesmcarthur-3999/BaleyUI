/**
 * BaleyUI SDK Types
 */

// ============================================================================
// Client Options
// ============================================================================

export interface BaleyUIOptions {
  /**
   * Your BaleyUI API key.
   * Get one from Settings > API Keys in your dashboard.
   */
  apiKey: string;

  /**
   * Base URL for the API.
   * @default "https://app.baleyui.com"
   */
  baseUrl?: string;

  /**
   * Request timeout in milliseconds.
   * @default 30000
   */
  timeout?: number;

  /**
   * Maximum number of retries for failed requests.
   * @default 3
   */
  maxRetries?: number;
}

// ============================================================================
// API Resources
// ============================================================================

export interface Flow {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  version: number;
  nodeCount: number;
  edgeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FlowDetail extends Flow {
  nodes: FlowNode[];
  edges: FlowEdge[];
  triggers: FlowTrigger[];
}

export interface FlowNode {
  id: string;
  type: 'source' | 'sink' | 'aiBlock' | 'functionBlock' | 'router' | 'parallel' | 'loop';
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface FlowTrigger {
  type: 'webhook' | 'schedule' | 'manual';
  config?: Record<string, unknown>;
}

export interface Block {
  id: string;
  name: string;
  description: string | null;
  type: 'ai' | 'function' | 'router' | 'parallel';
  model: string | null;
  executionCount: number;
  avgDuration: number | null;
  createdAt: string;
  updatedAt: string;
}

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Execution {
  id: string;
  flowId: string | null;
  blockId: string | null;
  status: ExecutionStatus;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  duration: number | null;
  createdAt: string;
}

export type ExecutionEventType =
  | 'execution_start'
  | 'execution_complete'
  | 'execution_error'
  | 'node_start'
  | 'node_complete'
  | 'node_error'
  | 'node_stream';

export interface ExecutionEvent {
  type: ExecutionEventType;
  executionId: string;
  nodeId?: string | null;
  data?: Record<string, unknown> | null;
  timestamp: string;
  index: number;
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface ExecuteOptions {
  /**
   * Input data to pass to the flow or block.
   */
  input?: Record<string, unknown>;

  /**
   * Whether to wait for completion before returning.
   * @default false
   */
  wait?: boolean;

  /**
   * Timeout in ms when wait=true.
   * @default 300000 (5 minutes)
   */
  waitTimeout?: number;
}

export interface ExecuteResult {
  workspaceId: string;
  executionId: string;
  flowId?: string;
  blockId?: string;
  status: ExecutionStatus;
  message: string;
}

export interface ListFlowsResult {
  workspaceId: string;
  flows: Flow[];
  count: number;
}

export interface ListBlocksResult {
  workspaceId: string;
  blocks: Block[];
  count: number;
}

// ============================================================================
// Execution Handle
// ============================================================================

export interface ExecutionHandle {
  /**
   * The execution ID.
   */
  id: string;

  /**
   * Get the current status of the execution.
   */
  getStatus(): Promise<Execution>;

  /**
   * Wait for the execution to complete.
   * @param timeout Timeout in milliseconds (default: 5 minutes)
   */
  waitForCompletion(timeout?: number): Promise<Execution>;

  /**
   * Stream execution events in real-time.
   */
  stream(): AsyncGenerator<ExecutionEvent, void, unknown>;
}
