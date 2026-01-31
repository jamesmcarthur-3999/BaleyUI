/**
 * Type definitions for Flow Builder and BaleyBots compiler
 */

import type { Node, Edge } from '@xyflow/react';

// ============================================================================
// FLOW NODE TYPES
// ============================================================================

export type FlowNodeType =
  | 'ai-block'
  | 'function-block'
  | 'router'
  | 'parallel'
  | 'loop'
  | 'filter'
  | 'gate'
  | 'source'
  | 'sink';

export interface NodePosition {
  x: number;
  y: number;
}

// Base node data shared by all node types
interface BaseNodeData extends Record<string, unknown> {
  label: string;
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
}

// AI Block node data
export interface AIBlockNodeData extends BaseNodeData {
  blockId: string;
  model?: string;
  connectionId?: string;
}

// Function Block node data
export interface FunctionBlockNodeData extends BaseNodeData {
  blockId: string;
}

// Router node data
export interface RouterNodeData extends BaseNodeData {
  classifierBlockId?: string;
  routes: Record<string, string>; // routeName -> targetNodeId
  routeField: string;
  defaultRoute?: string;
}

// Parallel node data
export interface ParallelNodeData extends BaseNodeData {
  splitterBlockId?: string;
  processorNodeIds: string[];
  mergerBlockId?: string;
}

// Loop node data
export interface LoopNodeData extends BaseNodeData {
  bodyNodeId?: string;
  condition: LoopCondition;
  maxIterations: number;
}

export interface LoopCondition {
  type: 'field' | 'expression';
  field?: string;
  operator?: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte';
  value?: unknown;
  expression?: string;
}

// Filter node data
export interface FilterNodeData extends BaseNodeData {
  filterBlockId?: string;
  passField: string;
  failField: string;
}

// Gate node data
export interface GateNodeData extends BaseNodeData {
  guardBlockId?: string;
  passNodeId?: string;
  failNodeId?: string;
}

// Source node data (triggers)
export interface SourceNodeData extends BaseNodeData {
  triggerType: 'manual' | 'webhook' | 'schedule';
  webhookPath?: string;
  cronExpression?: string;
}

// Sink node data (outputs)
export interface SinkNodeData extends BaseNodeData {
  sinkType: 'output' | 'database' | 'webhook' | 'notification';
  config?: Record<string, unknown>;
}

// Union type for all node data
export type FlowNodeData =
  | AIBlockNodeData
  | FunctionBlockNodeData
  | RouterNodeData
  | ParallelNodeData
  | LoopNodeData
  | FilterNodeData
  | GateNodeData
  | SourceNodeData
  | SinkNodeData;

// React Flow node with our data types
export type FlowNode = Node<FlowNodeData, FlowNodeType>;

// React Flow edge
export type FlowEdge = Edge;

// ============================================================================
// JSON SCHEMA
// ============================================================================

export interface JsonSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  description?: string;
  enum?: unknown[];
  default?: unknown;
}

// ============================================================================
// FLOW DEFINITION
// ============================================================================

export interface FlowDefinition {
  id: string;
  name: string;
  description?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  triggers: FlowTrigger[];
  enabled: boolean;
  version: number;
}

export interface FlowTrigger {
  type: 'manual' | 'webhook' | 'schedule';
  config: ManualTriggerConfig | WebhookTriggerConfig | ScheduleTriggerConfig;
}

export interface ManualTriggerConfig {
  inputSchema?: JsonSchema;
}

export interface WebhookTriggerConfig {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  secret?: string;
}

export interface ScheduleTriggerConfig {
  cronExpression: string;
  timezone?: string;
}

// ============================================================================
// EXECUTION TYPES
// ============================================================================

export interface FlowExecutionContext {
  executionId: string;
  flowId: string;
  triggeredBy: {
    type: 'manual' | 'webhook' | 'schedule';
    userId?: string;
    webhookRequestId?: string;
    scheduledAt?: string;
  };
  startedAt: Date;
  nodeStates: Map<string, NodeExecutionState>;
}

export type NodeExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface NodeExecutionState {
  nodeId: string;
  status: NodeExecutionStatus;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
}

// ============================================================================
// COMPILATION RESULT
// ============================================================================

export interface CompilationResult {
  success: boolean;
  errors: CompilationError[];
  warnings: CompilationWarning[];
}

export interface CompilationError {
  nodeId?: string;
  edgeId?: string;
  code: string;
  message: string;
}

export interface CompilationWarning {
  nodeId?: string;
  edgeId?: string;
  code: string;
  message: string;
}

// ============================================================================
// SCHEMA COMPATIBILITY
// ============================================================================

export interface SchemaCompatibilityResult {
  compatible: boolean;
  errors: SchemaCompatibilityError[];
}

export interface SchemaCompatibilityError {
  field: string;
  sourceType: string;
  targetType: string;
  message: string;
}
