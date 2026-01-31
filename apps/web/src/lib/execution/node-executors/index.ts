/**
 * Node Executor Registry
 *
 * Central registry for all node type executors.
 */

import type { FlowNodeType, FlowNodeData } from '@/lib/baleybots/types';
import type { BaleybotStreamEvent } from '@/lib/streaming/types/events';

// ============================================================================
// EXECUTOR INTERFACE
// ============================================================================

export interface CompiledNode {
  nodeId: string;
  type: FlowNodeType;
  data: FlowNodeData;
  incomingEdges: Array<{ sourceId: string; sourceHandle?: string }>;
  outgoingEdges: Array<{ targetId: string; targetHandle?: string }>;
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
// EXECUTOR IMPORTS
// ============================================================================

import { aiBlockExecutor } from './ai-block';
import { functionBlockExecutor } from './function-block';
import { routerExecutor } from './router';
import { parallelExecutor } from './parallel';
import { loopExecutor } from './loop';
import { sourceExecutor } from './source';
import { sinkExecutor } from './sink';

// ============================================================================
// REGISTRY
// ============================================================================

const executorRegistry: Map<FlowNodeType, NodeExecutor> = new Map();

// Register all executors
function registerExecutor(executor: NodeExecutor): void {
  executorRegistry.set(executor.type, executor);
}

registerExecutor(aiBlockExecutor);
registerExecutor(functionBlockExecutor);
registerExecutor(routerExecutor);
registerExecutor(parallelExecutor);
registerExecutor(loopExecutor);
registerExecutor(sourceExecutor);
registerExecutor(sinkExecutor);

/**
 * Get executor for a node type
 */
export function getExecutor(type: FlowNodeType): NodeExecutor | undefined {
  return executorRegistry.get(type);
}

/**
 * Check if an executor exists for a node type
 */
export function hasExecutor(type: FlowNodeType): boolean {
  return executorRegistry.has(type);
}

/**
 * Get all registered executor types
 */
export function getRegisteredTypes(): FlowNodeType[] {
  return Array.from(executorRegistry.keys());
}

/**
 * Execute a node using the appropriate executor
 */
export async function executeNode(
  node: CompiledNode,
  input: unknown,
  context: NodeExecutorContext
): Promise<unknown> {
  const executor = getExecutor(node.type);

  if (!executor) {
    throw new Error(`No executor registered for node type: ${node.type}`);
  }

  // Check for cancellation
  if (context.signal?.aborted) {
    throw new Error('Execution cancelled');
  }

  return executor.execute(node, input, context);
}

// Types are already exported above via interface definitions
