/**
 * BAL to visual graph compatibility wrapper.
 *
 * The V2 editor uses canonical graph primitives directly. This module keeps
 * legacy call-sites (server actions/tests) stable by delegating to the
 * parser-side compatibility converter.
 */

import {
  parseBalCode,
  type ParseResult,
} from '../bal-parser-pure';
import { buildGraphFromParsed, graphToVisualGraph } from '../graph/build-graph';
import type { ParsedEntities, VisualEdge, VisualGraph, VisualNode } from './types';

export type { VisualNode, VisualEdge, VisualGraph } from './types';

/**
 * Result of converting BAL code to a visual graph.
 */
export interface BalToVisualResult {
  graph: VisualGraph;
  errors: string[];
}

/**
 * Convert BAL code to a visual graph representation.
 */
export function balToVisual(balCode: string): BalToVisualResult {
  return balToVisualFromParsed(balCode, parseBalCode(balCode));
}

/**
 * Convert BAL code to a visual graph using pre-parsed entities.
 */
export function balToVisualFromParsed(
  _balCode: string,
  parsed: ParsedEntities
): BalToVisualResult {
  const parseResult = parsed as ParseResult;
  if (parseResult.entities.length === 0) {
    return {
      graph: { nodes: [], edges: [] },
      errors: parseResult.errors,
    };
  }
  const model = buildGraphFromParsed({
    entities: parseResult.entities,
    chain: parseResult.chain,
    expression: parseResult.expression,
  });
  const graph = graphToVisualGraph(model) as VisualGraph;
  const nodes = graph.nodes.filter((node) => node.type === 'bb_agent');
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = [
    ...graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)),
    ...generateSharedDataEdges(nodes),
    ...generateTriggerEdges(nodes),
  ];
  const laidOutNodes = applyCompatibilityLayout(nodes, edges);

  return {
    graph: {
      nodes: laidOutNodes,
      edges: dedupeEdges(edges),
    },
    errors: parseResult.errors,
  };
}

function dedupeEdges(edges: VisualEdge[]): VisualEdge[] {
  const seen = new Set<string>();
  const deduped: VisualEdge[] = [];
  for (const edge of edges) {
    if (seen.has(edge.id)) continue;
    seen.add(edge.id);
    deduped.push(edge);
  }
  return deduped;
}

function generateSharedDataEdges(nodes: VisualNode[]): VisualEdge[] {
  const edges: VisualEdge[] = [];
  const sharedTools = ['store_memory', 'shared_storage'];

  for (const tool of sharedTools) {
    const nodesWithTool = nodes.filter((node) => node.data.tools.includes(tool));
    if (nodesWithTool.length < 2) continue;

    if (nodesWithTool.length >= 3) {
      const hub = nodesWithTool[0];
      if (!hub) continue;
      for (let index = 1; index < nodesWithTool.length; index += 1) {
        const spoke = nodesWithTool[index];
        if (!spoke) continue;
        edges.push({
          id: `shared-${hub.id}<->${spoke.id}-${tool}`,
          source: hub.id,
          target: spoke.id,
          type: 'shared_data',
          label: tool,
        });
      }
      continue;
    }

    const first = nodesWithTool[0];
    const second = nodesWithTool[1];
    if (!first || !second) continue;
    edges.push({
      id: `shared-${first.id}<->${second.id}-${tool}`,
      source: first.id,
      target: second.id,
      type: 'shared_data',
      label: tool,
    });
  }

  return edges;
}

function generateTriggerEdges(nodes: VisualNode[]): VisualEdge[] {
  const edges: VisualEdge[] = [];
  const nodeNames = new Set(nodes.map((node) => node.id));

  for (const node of nodes) {
    if (node.data.trigger?.type !== 'other_bb') continue;
    const sourceId = node.data.trigger.sourceBaleybotId;
    if (!sourceId || !nodeNames.has(sourceId)) continue;
    edges.push({
      id: `trigger-${sourceId}->${node.id}`,
      source: sourceId,
      target: node.id,
      type: 'trigger',
      label: 'triggers',
      animated: true,
    });
  }

  return edges;
}

function applyCompatibilityLayout(nodes: VisualNode[], edges: VisualEdge[]): VisualNode[] {
  const laidOut = nodes.map((node) => ({
    ...node,
    position: { ...node.position },
  }));
  const byId = new Map(laidOut.map((node) => [node.id, node]));

  const spawnTargetsBySource = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.type !== 'spawn') continue;
    const existing = spawnTargetsBySource.get(edge.source) ?? [];
    if (!existing.includes(edge.target)) {
      existing.push(edge.target);
      spawnTargetsBySource.set(edge.source, existing);
    }
  }

  for (const [source, targets] of spawnTargetsBySource.entries()) {
    if (targets.length < 2) continue;
    const sourceNode = byId.get(source);
    const baseY = sourceNode?.position.y ?? 100;
    if (sourceNode) {
      sourceNode.position.y = baseY;
    }
    const centerOffset = (targets.length - 1) / 2;
    targets.forEach((target, index) => {
      const targetNode = byId.get(target);
      if (!targetNode) return;
      targetNode.position.y = baseY + (index - centerOffset) * 120;
    });
  }

  return laidOut;
}
