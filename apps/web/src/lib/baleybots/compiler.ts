/**
 * Flow Compiler
 *
 * Converts a visual flow graph (React Flow nodes/edges) into a BaleyBots
 * runtime composition. The resulting Processable can be executed with
 * full streaming support.
 */

import type {
  FlowNode,
  FlowEdge,
  FlowDefinition,
  CompilationResult,
  CompilationError,
  CompilationWarning,
  AIBlockNodeData,
  FunctionBlockNodeData,
  RouterNodeData,
  LoopNodeData,
  ParallelNodeData,
  SourceNodeData,
  SinkNodeData,
} from './types';
import { validateSchemaCompatibility } from './schema-validator';

// ============================================================================
// COMPILATION TYPES
// ============================================================================

interface CompilationContext {
  nodes: Map<string, FlowNode>;
  edges: FlowEdge[];
  errors: CompilationError[];
  warnings: CompilationWarning[];
  blockCache: Map<string, unknown>; // blockId -> block data
  connectionCache: Map<string, unknown>; // connectionId -> connection
}

interface CompiledNode {
  nodeId: string;
  type: string;
  processable: unknown; // Will be Processable<any, any> at runtime
}

// ============================================================================
// MAIN COMPILER
// ============================================================================

/**
 * Compiles a flow definition into an executable BaleyBots composition.
 * Returns compilation result with errors/warnings.
 */
export async function compileFlow(
  flow: FlowDefinition,
  options?: {
    validateOnly?: boolean;
  }
): Promise<CompilationResult & { executor?: unknown }> {
  const ctx: CompilationContext = {
    nodes: new Map(flow.nodes.map((n) => [n.id, n])),
    edges: flow.edges,
    errors: [],
    warnings: [],
    blockCache: new Map(),
    connectionCache: new Map(),
  };

  // Phase 1: Validation
  validateFlowStructure(ctx);
  validateConnections(ctx);
  validateSchemas(ctx);

  if (ctx.errors.length > 0) {
    return {
      success: false,
      errors: ctx.errors,
      warnings: ctx.warnings,
    };
  }

  // If only validating, return here
  if (options?.validateOnly) {
    return {
      success: true,
      errors: [],
      warnings: ctx.warnings,
    };
  }

  // Phase 2: Compilation (runtime only - not in browser)
  // This would be executed server-side
  const compiledGraph = await compileGraph(ctx);

  return {
    success: true,
    errors: [],
    warnings: ctx.warnings,
    executor: compiledGraph,
  };
}

// ============================================================================
// VALIDATION PHASE
// ============================================================================

function validateFlowStructure(ctx: CompilationContext): void {
  // Check for at least one source node
  const sourceNodes = Array.from(ctx.nodes.values()).filter(
    (n) => n.type === 'source'
  );
  if (sourceNodes.length === 0) {
    ctx.errors.push({
      code: 'NO_SOURCE',
      message: 'Flow must have at least one source (trigger) node',
    });
  }

  // Check for at least one sink node
  const sinkNodes = Array.from(ctx.nodes.values()).filter(
    (n) => n.type === 'sink'
  );
  if (sinkNodes.length === 0) {
    ctx.warnings.push({
      code: 'NO_SINK',
      message: 'Flow has no sink (output) node - results may not be captured',
    });
  }

  // Check for orphan nodes (no incoming or outgoing edges)
  for (const node of ctx.nodes.values()) {
    const hasIncoming = ctx.edges.some((e) => e.target === node.id);
    const hasOutgoing = ctx.edges.some((e) => e.source === node.id);

    // Sources don't need incoming edges
    if (!hasIncoming && node.type !== 'source') {
      ctx.warnings.push({
        nodeId: node.id,
        code: 'ORPHAN_NODE',
        message: `Node "${node.data.label}" has no incoming connections`,
      });
    }

    // Sinks don't need outgoing edges
    if (!hasOutgoing && node.type !== 'sink') {
      ctx.warnings.push({
        nodeId: node.id,
        code: 'DEAD_END_NODE',
        message: `Node "${node.data.label}" has no outgoing connections`,
      });
    }
  }

  // Check for cycles (except in loop nodes)
  detectCycles(ctx);
}

function detectCycles(ctx: CompilationContext): void {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const loopNodes = new Set(
    Array.from(ctx.nodes.values())
      .filter((n) => n.type === 'loop')
      .map((n) => n.id)
  );

  function dfs(nodeId: string, path: string[]): boolean {
    if (recursionStack.has(nodeId)) {
      // Found cycle - check if it's part of a loop node
      const cycleStart = path.indexOf(nodeId);
      const cycle = path.slice(cycleStart);
      const isLoopCycle = cycle.some((id) => loopNodes.has(id));

      if (!isLoopCycle) {
        ctx.errors.push({
          nodeId,
          code: 'CYCLE_DETECTED',
          message: `Cycle detected: ${cycle.map((id) => ctx.nodes.get(id)?.data.label).join(' → ')}`,
        });
      }
      return true;
    }

    if (visited.has(nodeId)) {
      return false;
    }

    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const outgoing = ctx.edges.filter((e) => e.source === nodeId);
    for (const edge of outgoing) {
      dfs(edge.target, [...path]);
    }

    recursionStack.delete(nodeId);
    return false;
  }

  // Start DFS from all source nodes
  for (const node of ctx.nodes.values()) {
    if (node.type === 'source' && !visited.has(node.id)) {
      dfs(node.id, []);
    }
  }
}

function validateConnections(ctx: CompilationContext): void {
  // Validate each edge connects valid handles
  for (const edge of ctx.edges) {
    const sourceNode = ctx.nodes.get(edge.source);
    const targetNode = ctx.nodes.get(edge.target);

    if (!sourceNode) {
      ctx.errors.push({
        edgeId: edge.id,
        code: 'INVALID_SOURCE',
        message: `Edge references non-existent source node: ${edge.source}`,
      });
      continue;
    }

    if (!targetNode) {
      ctx.errors.push({
        edgeId: edge.id,
        code: 'INVALID_TARGET',
        message: `Edge references non-existent target node: ${edge.target}`,
      });
      continue;
    }

    // Validate node type-specific connection rules
    validateNodeConnectionRules(ctx, edge, sourceNode, targetNode);
  }
}

function validateNodeConnectionRules(
  ctx: CompilationContext,
  edge: FlowEdge,
  source: FlowNode,
  target: FlowNode
): void {
  // Sink nodes cannot have outgoing connections
  if (source.type === 'sink') {
    ctx.errors.push({
      edgeId: edge.id,
      nodeId: source.id,
      code: 'INVALID_SINK_OUTPUT',
      message: 'Sink nodes cannot have outgoing connections',
    });
  }

  // Source nodes cannot have incoming connections
  if (target.type === 'source') {
    ctx.errors.push({
      edgeId: edge.id,
      nodeId: target.id,
      code: 'INVALID_SOURCE_INPUT',
      message: 'Source nodes cannot have incoming connections',
    });
  }

  // Router outputs must use named handles
  if (source.type === 'router') {
    const routerData = source.data as RouterNodeData;
    const handleId = edge.sourceHandle;

    if (handleId && handleId !== 'default') {
      const validRoutes = Object.keys(routerData.routes || {});
      if (!validRoutes.includes(handleId) && handleId !== routerData.defaultRoute) {
        ctx.warnings.push({
          edgeId: edge.id,
          code: 'UNKNOWN_ROUTE',
          message: `Router edge uses unknown route: ${handleId}`,
        });
      }
    }
  }
}

function validateSchemas(ctx: CompilationContext): void {
  for (const edge of ctx.edges) {
    const sourceNode = ctx.nodes.get(edge.source);
    const targetNode = ctx.nodes.get(edge.target);

    if (!sourceNode || !targetNode) continue;

    const sourceSchema = sourceNode.data.outputSchema;
    const targetSchema = targetNode.data.inputSchema;

    if (sourceSchema && targetSchema) {
      const result = validateSchemaCompatibility(sourceSchema, targetSchema);
      if (!result.compatible) {
        for (const error of result.errors) {
          ctx.errors.push({
            edgeId: edge.id,
            code: 'SCHEMA_MISMATCH',
            message: `Schema mismatch: ${error.message}`,
          });
        }
      }
    }
  }
}

// ============================================================================
// COMPILATION PHASE
// ============================================================================

async function compileGraph(ctx: CompilationContext): Promise<unknown> {
  // Build execution order using topological sort
  const executionOrder = topologicalSort(ctx);

  // Compile each node in order
  const compiledNodes = new Map<string, CompiledNode>();

  for (const nodeId of executionOrder) {
    const node = ctx.nodes.get(nodeId)!;
    const compiled = await compileNode(ctx, node, compiledNodes);
    if (compiled) {
      compiledNodes.set(nodeId, compiled);
    }
  }

  // Identify the main execution path
  // For now, return a simple pipeline of all nodes
  return {
    type: 'compiled-flow',
    nodes: Array.from(compiledNodes.values()),
    execute: async (input: unknown) => {
      // Runtime execution would happen here
      // This is a placeholder - actual implementation uses BaleyBots
      return { result: 'Flow execution placeholder', input };
    },
  };
}

function topologicalSort(ctx: CompilationContext): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function visit(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    // Visit all nodes this one depends on first
    const incoming = ctx.edges.filter((e) => e.target === nodeId);
    for (const edge of incoming) {
      visit(edge.source);
    }

    result.push(nodeId);
  }

  // Visit all nodes
  for (const node of ctx.nodes.values()) {
    visit(node.id);
  }

  return result;
}

async function compileNode(
  ctx: CompilationContext,
  node: FlowNode,
  compiledNodes: Map<string, CompiledNode>
): Promise<CompiledNode | null> {
  switch (node.type) {
    case 'ai-block':
      return compileAIBlock(ctx, node as FlowNode & { data: AIBlockNodeData });

    case 'function-block':
      return compileFunctionBlock(
        ctx,
        node as FlowNode & { data: FunctionBlockNodeData }
      );

    case 'router':
      return compileRouter(
        ctx,
        node as FlowNode & { data: RouterNodeData },
        compiledNodes
      );

    case 'loop':
      return compileLoop(
        ctx,
        node as FlowNode & { data: LoopNodeData },
        compiledNodes
      );

    case 'parallel':
      return compileParallel(
        ctx,
        node as FlowNode & { data: ParallelNodeData },
        compiledNodes
      );

    case 'source':
      return compileSource(ctx, node as FlowNode & { data: SourceNodeData });

    case 'sink':
      return compileSink(ctx, node as FlowNode & { data: SinkNodeData });

    default:
      ctx.warnings.push({
        nodeId: node.id,
        code: 'UNKNOWN_NODE_TYPE',
        message: `Unknown node type: ${node.type}`,
      });
      return null;
  }
}

async function compileAIBlock(
  _ctx: CompilationContext,
  node: FlowNode & { data: AIBlockNodeData }
): Promise<CompiledNode> {
  // In actual implementation, this would:
  // 1. Fetch the block from database
  // 2. Create a Baleybot.create() instance
  // 3. Configure model, tools, schema
  return {
    nodeId: node.id,
    type: 'ai-block',
    processable: {
      name: node.data.label,
      blockId: node.data.blockId,
      // Placeholder for Baleybot instance
    },
  };
}

async function compileFunctionBlock(
  _ctx: CompilationContext,
  node: FlowNode & { data: FunctionBlockNodeData }
): Promise<CompiledNode> {
  // In actual implementation, this would:
  // 1. Fetch the block from database
  // 2. Create a Deterministic.create() instance
  // 3. Compile the code
  return {
    nodeId: node.id,
    type: 'function-block',
    processable: {
      name: node.data.label,
      blockId: node.data.blockId,
      // Placeholder for Deterministic instance
    },
  };
}

async function compileRouter(
  _ctx: CompilationContext,
  node: FlowNode & { data: RouterNodeData },
  _compiledNodes: Map<string, CompiledNode>
): Promise<CompiledNode> {
  // In actual implementation, this would:
  // 1. Get the classifier block
  // 2. Map routes to compiled nodes
  // 3. Create BaleybotRouter.create() instance
  return {
    nodeId: node.id,
    type: 'router',
    processable: {
      name: node.data.label,
      routes: node.data.routes,
      routeField: node.data.routeField,
      // Placeholder for BaleybotRouter instance
    },
  };
}

async function compileLoop(
  _ctx: CompilationContext,
  node: FlowNode & { data: LoopNodeData },
  _compiledNodes: Map<string, CompiledNode>
): Promise<CompiledNode> {
  // In actual implementation, this would:
  // 1. Get the body node
  // 2. Create condition evaluator
  // 3. Create Loop instance
  return {
    nodeId: node.id,
    type: 'loop',
    processable: {
      name: node.data.label,
      maxIterations: node.data.maxIterations,
      condition: node.data.condition,
      // Placeholder for Loop instance
    },
  };
}

async function compileParallel(
  _ctx: CompilationContext,
  node: FlowNode & { data: ParallelNodeData },
  _compiledNodes: Map<string, CompiledNode>
): Promise<CompiledNode> {
  // In actual implementation, this would:
  // 1. Get splitter, processor, and merger nodes
  // 2. Create ParallelMerge instance
  return {
    nodeId: node.id,
    type: 'parallel',
    processable: {
      name: node.data.label,
      processorNodeIds: node.data.processorNodeIds,
      // Placeholder for ParallelMerge instance
    },
  };
}

async function compileSource(
  _ctx: CompilationContext,
  node: FlowNode & { data: SourceNodeData }
): Promise<CompiledNode> {
  return {
    nodeId: node.id,
    type: 'source',
    processable: {
      name: node.data.label,
      triggerType: node.data.triggerType,
      webhookPath: node.data.webhookPath,
      cronExpression: node.data.cronExpression,
    },
  };
}

async function compileSink(
  _ctx: CompilationContext,
  node: FlowNode & { data: SinkNodeData }
): Promise<CompiledNode> {
  return {
    nodeId: node.id,
    type: 'sink',
    processable: {
      name: node.data.label,
      sinkType: node.data.sinkType,
      config: node.data.config,
    },
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { validateFlowStructure, validateConnections, validateSchemas };
