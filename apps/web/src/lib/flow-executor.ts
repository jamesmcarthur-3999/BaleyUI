import { executeBALCode } from '@baleyui/sdk';

interface FlowNode {
  id: string;
  type: string;
  data: {
    baleybotId?: string;
    label?: string;
    config?: Record<string, unknown>;
  };
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

interface FlowExecutionContext {
  flowId: string;
  executionId: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  input: unknown;
  apiKey: string;
  baleybots: Map<string, { balCode: string }>;
}

export async function executeFlow(context: FlowExecutionContext): Promise<{
  status: 'success' | 'error' | 'cancelled';
  outputs: Record<string, unknown>;
  error?: string;
}> {
  const { nodes, edges, input, apiKey, baleybots } = context;
  const outputs: Record<string, unknown> = {};

  // Build execution graph
  const graph = buildExecutionGraph(nodes, edges);

  // Get topological order
  const order = topologicalSort(graph, nodes);

  // Execute nodes in order
  for (const nodeId of order) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) continue;

    // Get inputs from connected nodes
    const nodeInputs = getNodeInputs(node, edges, outputs, input);

    // Execute based on node type
    if (node.type === 'baleybot' && node.data.baleybotId) {
      const baleybot = baleybots.get(node.data.baleybotId);
      if (baleybot?.balCode) {
        try {
          const result = await executeBALCode(baleybot.balCode, {
            apiKey,
            timeout: 60000,
          });
          outputs[nodeId] = result.result;
        } catch (error) {
          return {
            status: 'error',
            outputs,
            error: `Node ${node.data.label || nodeId} failed: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }
    }
  }

  return { status: 'success', outputs };
}

function buildExecutionGraph(nodes: FlowNode[], edges: FlowEdge[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  for (const node of nodes) {
    graph.set(node.id, []);
  }

  for (const edge of edges) {
    const deps = graph.get(edge.target) || [];
    deps.push(edge.source);
    graph.set(edge.target, deps);
  }

  return graph;
}

function topologicalSort(graph: Map<string, string[]>, nodes: FlowNode[]): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function visit(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    for (const dep of graph.get(nodeId) || []) {
      visit(dep);
    }

    result.push(nodeId);
  }

  for (const node of nodes) {
    visit(node.id);
  }

  return result;
}

function getNodeInputs(
  node: FlowNode,
  edges: FlowEdge[],
  outputs: Record<string, unknown>,
  initialInput: unknown
): unknown {
  const incomingEdges = edges.filter(e => e.target === node.id);

  if (incomingEdges.length === 0) {
    return initialInput;
  }

  const firstEdge = incomingEdges[0];
  if (incomingEdges.length === 1 && firstEdge) {
    return outputs[firstEdge.source];
  }

  // Multiple inputs - combine into object
  const combined: Record<string, unknown> = {};
  for (const edge of incomingEdges) {
    const key = edge.targetHandle || edge.source;
    combined[key] = outputs[edge.source];
  }
  return combined;
}
