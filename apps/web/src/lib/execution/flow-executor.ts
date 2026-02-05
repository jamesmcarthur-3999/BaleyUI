/**
 * Flow Executor
 *
 * Main orchestrator for flow execution.
 * Handles node execution order, state management, and event streaming.
 *
 * This executor coordinates the execution of database-stored flows at runtime.
 * Individual nodes are executed via the node executor registry, which uses
 * BaleyBots primitives:
 * - AI blocks → Baleybot.create() with proper streaming
 * - Function blocks → Deterministic.create() for pure functions
 * - Control nodes (router, parallel, loop) → Dynamic composition using the above
 *
 * For static compositions defined in code, use the BaleyBots pipeline API directly:
 * - pipeline().step().step().build()
 * - route(), parallel(), loop(), etc.
 */

// TODO: STYLE-002 - This file is over 600 lines (~627 lines). Consider splitting into:
// - flow-executor/executor.ts (main FlowExecutor class)
// - flow-executor/graph-builder.ts (buildExecutionGraph logic)
// - flow-executor/helpers.ts (utility functions)

import {
  db,
  flows,
  flowExecutions,
  blockExecutions,
  eq,
  and,
  notDeleted,
} from '@baleyui/db';
import { compileFlow } from '@/lib/baleybots/compiler';
import { ExecutionStateMachine } from './state-machine';
import { FlowEventAggregator } from './event-emitter';
import {
  executeNode,
  type CompiledNode,
  type NodeExecutorContext,
} from './node-executors';
import type {
  ExecutionOptions,
  ExecutionResult,
  ExecutionEvent,
  FlowExecutionStatus,
  NodeState,
} from './types';
import type { FlowNode, FlowEdge, FlowNodeType, FlowTrigger } from '@/lib/baleybots/types';
import { createLogger } from '@/lib/logger';

const logger = createLogger('flow-executor');

// ============================================================================
// TYPES
// ============================================================================

interface FlowData {
  id: string;
  workspaceId: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  triggers: unknown[];
  enabled: boolean;
  version: number;
}

interface ExecutionGraph {
  nodes: Map<string, CompiledNode>;
  edges: Map<string, { source: string; target: string; sourceHandle?: string; targetHandle?: string }>;
  topologicalOrder: string[];
  sourceNodes: string[];
  sinkNodes: string[];
}

// ============================================================================
// FLOW EXECUTOR
// ============================================================================

export class FlowExecutor {
  private stateMachine: ExecutionStateMachine;
  private eventAggregator: FlowEventAggregator;
  private nodeStates: Map<string, NodeState> = new Map();
  private nodeResults: Map<string, unknown> = new Map();
  private abortController: AbortController;

  private constructor(
    public readonly executionId: string,
    private readonly flow: FlowData,
    private readonly input: unknown
  ) {
    this.stateMachine = new ExecutionStateMachine(executionId);
    this.eventAggregator = new FlowEventAggregator(executionId);
    this.abortController = new AbortController();
  }

  /**
   * Start a new flow execution
   */
  static async start(options: ExecutionOptions): Promise<FlowExecutor> {
    // 1. Load flow from database
    const flow = await db.query.flows.findFirst({
      where: and(eq(flows.id, options.flowId), notDeleted(flows)),
    });

    if (!flow) {
      throw new Error(`Flow not found: ${options.flowId}`);
    }

    // 2. Compile and validate flow
    const compilation = await compileFlow({
      id: flow.id,
      name: flow.name,
      description: flow.description ?? undefined,
      nodes: flow.nodes as FlowNode[],
      edges: flow.edges as FlowEdge[],
      triggers: (flow.triggers ?? []) as FlowTrigger[],
      enabled: flow.enabled ?? false,
      version: flow.version,
    });

    if (!compilation.success) {
      const errorMsg = compilation.errors.map((e) => e.message).join('; ');
      throw new Error(`Flow compilation failed: ${errorMsg}`);
    }

    // 3. Create execution record
    const execResults = await db
      .insert(flowExecutions)
      .values({
        flowId: options.flowId,
        flowVersion: flow.version,
        triggeredBy: options.triggeredBy,
        status: 'pending',
        input: options.input,
        startedAt: new Date(),
      })
      .returning();

    const execution = execResults[0];
    if (!execution) {
      throw new Error('Failed to create execution record');
    }

    // 4. Create executor
    const executor = new FlowExecutor(
      execution.id,
      {
        id: flow.id,
        workspaceId: flow.workspaceId,
        name: flow.name,
        nodes: flow.nodes as FlowNode[],
        edges: flow.edges as FlowEdge[],
        triggers: (flow.triggers ?? []) as FlowTrigger[],
        enabled: flow.enabled ?? false,
        version: flow.version,
      },
      options.input
    );

    // 5. Start execution asynchronously
    executor.execute().catch((error: unknown) => {
      logger.error(`Flow execution ${execution.id} failed`, error);
    });

    return executor;
  }

  /**
   * Subscribe to execution events
   */
  subscribe(listener: (event: ExecutionEvent) => void): () => void {
    return this.eventAggregator.subscribe(listener);
  }

  /**
   * Cancel the execution
   */
  async cancel(): Promise<void> {
    if (this.stateMachine.isTerminal) {
      throw new Error('Cannot cancel completed execution');
    }

    this.abortController.abort();
    await this.stateMachine.transition('cancelled');

    this.eventAggregator.emit({
      type: 'execution_cancelled',
      executionId: this.executionId,
      timestamp: Date.now(),
    });

    this.eventAggregator.close();
  }

  /**
   * Get the current status
   */
  get status(): FlowExecutionStatus {
    return this.stateMachine.status;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Main execution loop
   */
  private async execute(): Promise<ExecutionResult> {
    try {
      // Transition to running
      await this.stateMachine.transition('running');

      // Emit start event
      this.eventAggregator.emit({
        type: 'execution_start',
        executionId: this.executionId,
        flowId: this.flow.id,
        input: this.input,
        timestamp: Date.now(),
      });

      // Build execution graph
      const graph = this.buildExecutionGraph();
      this.stateMachine.setNodeCount(graph.topologicalOrder.length);

      // Execute nodes in topological order
      for (const nodeId of graph.topologicalOrder) {
        if (this.abortController.signal.aborted) {
          throw new Error('Execution cancelled');
        }

        const node = graph.nodes.get(nodeId);
        if (!node) continue;

        await this.executeNode(node, graph);
      }

      // Collect final output from sink nodes
      const output = this.collectOutput(graph);

      // Transition to completed
      await this.stateMachine.transition('completed', {
        output,
        metrics: this.stateMachine.getMetrics(),
      });

      // Emit completion event
      this.eventAggregator.emit({
        type: 'execution_complete',
        executionId: this.executionId,
        output,
        metrics: this.stateMachine.getMetrics(),
        timestamp: Date.now(),
      });

      return {
        executionId: this.executionId,
        status: 'completed',
        output,
        metrics: this.stateMachine.getMetrics(),
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // Transition to failed if not already terminal
      if (!this.stateMachine.isTerminal) {
        await this.stateMachine.transition('failed', { error: errorMessage });
      }

      // Emit error event
      this.eventAggregator.emit({
        type: 'execution_error',
        executionId: this.executionId,
        error: errorMessage,
        timestamp: Date.now(),
      });

      return {
        executionId: this.executionId,
        status: this.stateMachine.status,
        error: errorMessage,
        metrics: this.stateMachine.getMetrics(),
      };
    } finally {
      this.eventAggregator.close();
    }
  }

  /**
   * Build the execution graph from flow nodes and edges
   */
  private buildExecutionGraph(): ExecutionGraph {
    const nodes = new Map<string, CompiledNode>();
    const edges = new Map<
      string,
      { source: string; target: string; sourceHandle?: string; targetHandle?: string }
    >();
    const sourceNodes: string[] = [];
    const sinkNodes: string[] = [];

    // Build node map
    for (const node of this.flow.nodes) {
      const incomingEdges: Array<{ sourceId: string; sourceHandle?: string }> = [];
      const outgoingEdges: Array<{ targetId: string; targetHandle?: string }> = [];

      // Find edges for this node
      for (const edge of this.flow.edges) {
        if (edge.target === node.id) {
          incomingEdges.push({
            sourceId: edge.source,
            sourceHandle: edge.sourceHandle ?? undefined,
          });
        }
        if (edge.source === node.id) {
          outgoingEdges.push({
            targetId: edge.target,
            targetHandle: edge.targetHandle ?? undefined,
          });
        }
      }

      const compiledNode: CompiledNode = {
        nodeId: node.id,
        type: node.type as FlowNodeType,
        data: node.data,
        incomingEdges,
        outgoingEdges,
      };

      nodes.set(node.id, compiledNode);

      // Track source and sink nodes
      if (node.type === 'source') {
        sourceNodes.push(node.id);
      } else if (node.type === 'sink') {
        sinkNodes.push(node.id);
      }
    }

    // Build edge map
    for (const edge of this.flow.edges) {
      edges.set(edge.id, {
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? undefined,
        targetHandle: edge.targetHandle ?? undefined,
      });
    }

    // Compute topological order
    const topologicalOrder = this.topologicalSort(nodes, edges);

    return { nodes, edges, topologicalOrder, sourceNodes, sinkNodes };
  }

  /**
   * Topological sort using Kahn's algorithm
   */
  private topologicalSort(
    nodes: Map<string, CompiledNode>,
    edges: Map<string, { source: string; target: string }>
  ): string[] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // Initialize
    for (const nodeId of nodes.keys()) {
      inDegree.set(nodeId, 0);
      adjacency.set(nodeId, []);
    }

    // Build adjacency and in-degree
    for (const edge of edges.values()) {
      const targets = adjacency.get(edge.source) || [];
      targets.push(edge.target);
      adjacency.set(edge.source, targets);

      const degree = inDegree.get(edge.target) || 0;
      inDegree.set(edge.target, degree + 1);
    }

    // Find nodes with no incoming edges
    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    // Process queue
    const result: string[] = [];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      result.push(nodeId);

      for (const targetId of adjacency.get(nodeId) || []) {
        const newDegree = (inDegree.get(targetId) || 0) - 1;
        inDegree.set(targetId, newDegree);

        if (newDegree === 0) {
          queue.push(targetId);
        }
      }
    }

    // Check for cycles
    if (result.length !== nodes.size) {
      throw new Error('Flow contains cycles');
    }

    return result;
  }

  /**
   * Execute a single node
   */
  private async executeNode(
    node: CompiledNode,
    graph: ExecutionGraph
  ): Promise<void> {
    // Create block execution record
    const blockId = this.getBlockId(node);

    const blockExecResults = await db
      .insert(blockExecutions)
      .values({
        blockId: blockId || '00000000-0000-0000-0000-000000000000', // Placeholder for non-block nodes
        flowExecutionId: this.executionId,
        status: 'running',
        input: this.getNodeInput(node, graph),
        startedAt: new Date(),
      })
      .returning();

    const blockExec = blockExecResults[0];
    if (!blockExec) {
      throw new Error('Failed to create block execution record');
    }

    // Update node state
    this.nodeStates.set(node.nodeId, {
      nodeId: node.nodeId,
      status: 'running',
      blockExecutionId: blockExec.id,
      startedAt: new Date(),
    });

    // Emit node start event
    this.eventAggregator.emit({
      type: 'node_start',
      executionId: this.executionId,
      nodeId: node.nodeId,
      nodeType: node.type,
      blockExecutionId: blockExec.id,
      input: this.getNodeInput(node, graph),
      timestamp: Date.now(),
    });

    const startTime = Date.now();

    try {
      // Create node emitter
      const nodeEmitter = this.eventAggregator.createNodeEmitter(
        node.nodeId,
        blockExec.id
      );

      // Build executor context
      const context: NodeExecutorContext = {
        executionId: this.executionId,
        flowId: this.flow.id,
        workspaceId: this.flow.workspaceId,
        nodeResults: this.nodeResults,
        flowInput: this.input,
        onStream: (event) => {
          this.eventAggregator.emit({
            type: 'node_stream',
            executionId: this.executionId,
            nodeId: node.nodeId,
            blockExecutionId: blockExec.id,
            event,
            timestamp: Date.now(),
          });
        },
        signal: this.abortController.signal,
      };

      // Execute the node
      const nodeInput = this.getNodeInput(node, graph);
      const output = await executeNode(node, nodeInput, context);

      const durationMs = Date.now() - startTime;

      // Store result
      this.nodeResults.set(node.nodeId, output);

      // Update block execution
      await db
        .update(blockExecutions)
        .set({
          status: 'complete',
          output: output as Record<string, unknown>,
          completedAt: new Date(),
          durationMs,
        })
        .where(eq(blockExecutions.id, blockExec.id));

      // Update node state
      this.nodeStates.set(node.nodeId, {
        nodeId: node.nodeId,
        status: 'completed',
        blockExecutionId: blockExec.id,
        output,
        completedAt: new Date(),
        durationMs,
      });

      this.stateMachine.incrementCompletedNodes();

      // Emit completion event
      this.eventAggregator.emit({
        type: 'node_complete',
        executionId: this.executionId,
        nodeId: node.nodeId,
        blockExecutionId: blockExec.id,
        output,
        durationMs,
        timestamp: Date.now(),
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // Update block execution
      await db
        .update(blockExecutions)
        .set({
          status: 'failed',
          error: errorMessage,
          completedAt: new Date(),
          durationMs: Date.now() - startTime,
        })
        .where(eq(blockExecutions.id, blockExec.id));

      // Update node state
      this.nodeStates.set(node.nodeId, {
        nodeId: node.nodeId,
        status: 'failed',
        blockExecutionId: blockExec.id,
        error: errorMessage,
        completedAt: new Date(),
      });

      this.stateMachine.incrementFailedNodes();

      // Emit error event
      this.eventAggregator.emit({
        type: 'node_error',
        executionId: this.executionId,
        nodeId: node.nodeId,
        blockExecutionId: blockExec.id,
        error: errorMessage,
        timestamp: Date.now(),
      });

      // Re-throw to stop execution
      throw error;
    }
  }

  /**
   * Get the input for a node based on its incoming edges
   */
  private getNodeInput(node: CompiledNode, graph: ExecutionGraph): unknown {
    // Source nodes use flow input
    if (node.type === 'source') {
      return this.input;
    }

    // No incoming edges - use flow input
    if (node.incomingEdges.length === 0) {
      return this.input;
    }

    // Single incoming edge - use that node's output
    if (node.incomingEdges.length === 1) {
      const edge = node.incomingEdges[0];
      if (edge) {
        return this.nodeResults.get(edge.sourceId);
      }
      return this.input;
    }

    // Multiple incoming edges - merge outputs
    const inputs: Record<string, unknown> = {};
    for (const edge of node.incomingEdges) {
      const key = edge.sourceHandle || edge.sourceId;
      inputs[key] = this.nodeResults.get(edge.sourceId);
    }
    return inputs;
  }

  /**
   * Get the block ID from node data
   */
  private getBlockId(node: CompiledNode): string | null {
    const data = node.data as Record<string, unknown>;
    return (data.blockId as string) || null;
  }

  /**
   * Collect output from sink nodes
   */
  private collectOutput(graph: ExecutionGraph): unknown {
    // If single sink, return its output directly
    if (graph.sinkNodes.length === 1) {
      const sinkId = graph.sinkNodes[0];
      if (sinkId) {
        return this.nodeResults.get(sinkId);
      }
    }

    // Multiple sinks - return object with all outputs
    const outputs: Record<string, unknown> = {};
    for (const sinkId of graph.sinkNodes) {
      const node = graph.nodes.get(sinkId);
      const key = node?.data.label || sinkId;
      outputs[key as string] = this.nodeResults.get(sinkId);
    }
    return outputs;
  }
}
