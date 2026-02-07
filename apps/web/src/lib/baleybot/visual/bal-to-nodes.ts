/**
 * BAL to Visual Nodes Converter
 *
 * Converts BAL code into visual node representations for the diagram editor.
 * Supports single BBs, chains, parallel execution, and conditional flows.
 */

import dagre from 'dagre';
import { parseBalCode } from '../bal-parser-pure';
import type { TriggerConfig } from '../types';
export type { VisualNode, VisualEdge, VisualGraph } from './types';
import type { VisualNode, VisualEdge, VisualGraph, ParsedEntities } from './types';

// ============================================================================
// TRIGGER PARSING (moved inline after generator refactor)
// ============================================================================

/**
 * Parse a trigger string into a TriggerConfig object
 * Handles formats like: "manual", "schedule:0 9 * * *", "webhook", "bb_completion:entity_name"
 */
function parseTriggerString(trigger: string): TriggerConfig | null {
  if (!trigger || typeof trigger !== 'string') {
    return null;
  }

  const trimmed = trigger.trim().toLowerCase();

  // Simple manual trigger
  if (trimmed === 'manual') {
    return { type: 'manual' };
  }

  // Simple webhook trigger
  if (trimmed === 'webhook') {
    return { type: 'webhook' };
  }

  // Schedule trigger with cron expression
  if (trimmed.startsWith('schedule:')) {
    const schedule = trigger.slice('schedule:'.length).trim();
    return { type: 'schedule', schedule };
  }

  // BB completion trigger
  if (trimmed.startsWith('bb_completion:')) {
    const sourceBaleybotId = trigger.slice('bb_completion:'.length).trim();
    return { type: 'other_bb', sourceBaleybotId };
  }

  // Default to manual if unrecognized
  return { type: 'manual' };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const NODE_WIDTH = 280;
const NODE_HEIGHT = 150;
const HORIZONTAL_GAP = 100;

// ============================================================================
// CONVERTER
// ============================================================================

/**
 * Result of converting BAL code to a visual graph.
 * Includes parse errors alongside partial/empty results.
 */
export interface BalToVisualResult {
  graph: VisualGraph;
  errors: string[];
}

/**
 * Convert BAL code to a visual graph representation
 */
export function balToVisual(balCode: string): BalToVisualResult {
  return balToVisualFromParsed(balCode, parseBalCode(balCode));
}

/**
 * Convert BAL code to a visual graph using pre-parsed entities.
 */
export function balToVisualFromParsed(
  balCode: string,
  parsed: ParsedEntities
): BalToVisualResult {
  const { entities, chain, errors } = parsed;

  if (errors.length > 0 || entities.length === 0) {
    return { graph: { nodes: [], edges: [] }, errors };
  }

  const nodes: VisualNode[] = [];
  const edges: VisualEdge[] = [];

  // Determine the execution order
  const orderedNames = chain || entities.map((e) => e.name);

  // Create nodes for each entity
  entities.forEach((entity, index) => {
    const position = calculatePosition(entity.name, orderedNames, index, entities.length);

    // Parse trigger from config if present
    let triggerConfig: TriggerConfig | undefined;
    if (typeof entity.config.trigger === 'string') {
      const parsed = parseTriggerString(entity.config.trigger);
      if (parsed) {
        triggerConfig = parsed;
      }
    } else if (entity.config.trigger && typeof entity.config.trigger === 'object') {
      triggerConfig = entity.config.trigger as TriggerConfig;
    }

    nodes.push({
      id: entity.name,
      type: 'baleybot',
      data: {
        name: entity.name,
        goal: (entity.config.goal as string) || '',
        model: entity.config.model as string | undefined,
        trigger: triggerConfig,
        tools: (entity.config.tools as string[]) || [],
        canRequest: (entity.config.can_request as string[]) || (entity.config.needsApproval as string[]) || [],
        output: entity.config.output as Record<string, string> | undefined,
        temperature: entity.config.temperature as number | undefined,
        reasoning: entity.config.reasoning as boolean | { effort?: 'low' | 'medium' | 'high' } | undefined,
        stopWhen: entity.config.stopWhen as string | undefined,
        retries: entity.config.retries as number | undefined,
      },
      position,
    });
  });

  // Create edges based on chain
  if (chain && chain.length > 1) {
    for (let i = 0; i < chain.length - 1; i++) {
      const source = chain[i];
      const target = chain[i + 1];
      if (source && target) {
        edges.push({
          id: `${source}->${target}`,
          source,
          target,
          type: 'chain',
          animated: true,
        });
      }
    }
  }

  // Parse and add edges for other control structures
  const parallelEdges = parseParallelEdges(balCode, nodes);
  const conditionalEdges = parseConditionalEdges(balCode, nodes);

  edges.push(...parallelEdges, ...conditionalEdges);

  // Generate relationship edges from entity data
  edges.push(...generateSpawnEdges(nodes));
  edges.push(...generateSharedDataEdges(nodes));
  edges.push(...generateTriggerEdges(nodes));

  // Apply dagre layout based on edges
  const layoutedNodes = autoLayout(nodes, edges);

  return { graph: { nodes: layoutedNodes, edges }, errors: [] };
}

/**
 * Calculate position for a node based on its place in the chain
 */
function calculatePosition(
  nodeName: string,
  orderedNames: string[],
  entityIndex: number,
  _totalEntities: number
): { x: number; y: number } {
  const orderIndex = orderedNames.indexOf(nodeName);
  const effectiveIndex = orderIndex >= 0 ? orderIndex : entityIndex;

  // Layout in a horizontal chain by default
  // For larger graphs, we'd want a more sophisticated layout algorithm
  const x = effectiveIndex * (NODE_WIDTH + HORIZONTAL_GAP);
  const y = 100; // Fixed y for simple chain layout

  return { x, y };
}

/**
 * Parse parallel execution edges from BAL code
 */
function parseParallelEdges(
  balCode: string,
  nodes: VisualNode[]
): VisualEdge[] {
  const edges: VisualEdge[] = [];
  const nodeNames = new Set(nodes.map((n) => n.id));

  // Match parallel { "branch1": entity1, "branch2": entity2 }
  const parallelMatch = balCode.match(/parallel\s*\{([^}]+)\}/);
  if (!parallelMatch) return edges;

  const branchRegex = /"(\w+)"\s*:\s*(\w+)/g;
  const branches: Array<{ label: string; target: string }> = [];
  let branchMatch;

  while ((branchMatch = branchRegex.exec(parallelMatch[1] || '')) !== null) {
    if (branchMatch[1] && branchMatch[2] && nodeNames.has(branchMatch[2])) {
      branches.push({ label: branchMatch[1], target: branchMatch[2] });
    }
  }

  // Find the node that comes before parallel in the chain
  // For now, assume first branch is the main flow
  if (branches.length >= 2) {
    // Create parallel edges from first to others
    for (let i = 1; i < branches.length; i++) {
      const branch = branches[i];
      if (branch) {
        edges.push({
          id: `parallel-${branches[0]?.target}->${branch.target}`,
          source: branches[0]?.target || '',
          target: branch.target,
          type: 'parallel',
          label: branch.label,
        });
      }
    }
  }

  return edges;
}

/**
 * Parse conditional (when) edges from BAL code
 */
function parseConditionalEdges(
  balCode: string,
  nodes: VisualNode[]
): VisualEdge[] {
  const edges: VisualEdge[] = [];
  const nodeNames = new Set(nodes.map((n) => n.id));

  // Match when condition_entity { "pass": entity1, "fail": entity2 }
  const whenMatch = balCode.match(/when\s+(\w+)\s*\{([^}]+)\}/);
  if (!whenMatch) return edges;

  const [, conditionEntity, branchesStr] = whenMatch;
  if (!conditionEntity || !branchesStr || !nodeNames.has(conditionEntity)) {
    return edges;
  }

  const passMatch = branchesStr.match(/"pass"\s*:\s*(\w+)/);
  const failMatch = branchesStr.match(/"fail"\s*:\s*(\w+)/);

  if (passMatch?.[1] && nodeNames.has(passMatch[1])) {
    edges.push({
      id: `${conditionEntity}->pass->${passMatch[1]}`,
      source: conditionEntity,
      target: passMatch[1],
      type: 'conditional_pass',
      label: 'pass',
    });
  }

  if (failMatch?.[1] && nodeNames.has(failMatch[1])) {
    edges.push({
      id: `${conditionEntity}->fail->${failMatch[1]}`,
      source: conditionEntity,
      target: failMatch[1],
      type: 'conditional_fail',
      label: 'fail',
    });
  }

  return edges;
}

// ============================================================================
// RELATIONSHIP EDGE GENERATORS
// ============================================================================

/**
 * Entities with spawn_baleybot connect to all other entities (potential spawn targets).
 */
function generateSpawnEdges(nodes: VisualNode[]): VisualEdge[] {
  const edges: VisualEdge[] = [];
  const hubNodes = nodes.filter(n => n.data.tools.includes('spawn_baleybot'));
  for (const hub of hubNodes) {
    for (const spoke of nodes) {
      if (spoke.id === hub.id) continue;
      edges.push({
        id: `spawn-${hub.id}->${spoke.id}`,
        source: hub.id,
        target: spoke.id,
        type: 'spawn',
        label: 'spawns',
        animated: true,
      });
    }
  }
  return edges;
}

/**
 * Entities sharing data tools (store_memory, shared_storage) have an implicit data relationship.
 */
function generateSharedDataEdges(nodes: VisualNode[]): VisualEdge[] {
  const edges: VisualEdge[] = [];
  const dataTools = ['store_memory', 'shared_storage'];

  // Group nodes by shared tool
  for (const tool of dataTools) {
    const nodesWithTool = nodes.filter(n => n.data.tools.includes(tool));
    if (nodesWithTool.length < 2) continue;

    // If 3+ nodes share a tool, use star pattern from first node
    // instead of full mesh (reduces edges from n*(n-1)/2 to n-1)
    if (nodesWithTool.length >= 3) {
      const hub = nodesWithTool[0]!;
      for (let i = 1; i < nodesWithTool.length; i++) {
        const spoke = nodesWithTool[i]!;
        const edgeId = `shared-${hub.id}<->${spoke.id}-${tool}`;
        if (!edges.some(e => e.id === edgeId)) {
          edges.push({
            id: edgeId,
            source: hub.id,
            target: spoke.id,
            type: 'shared_data',
            label: tool,
          });
        }
      }
    } else {
      // Only 2 nodes — single edge
      const a = nodesWithTool[0]!;
      const b = nodesWithTool[1]!;
      const edgeId = `shared-${a.id}<->${b.id}-${tool}`;
      if (!edges.some(e => e.id === edgeId)) {
        edges.push({
          id: edgeId,
          source: a.id,
          target: b.id,
          type: 'shared_data',
          label: tool,
        });
      }
    }
  }

  return edges;
}

/**
 * bb_completion triggers create edges from the source entity to the triggered entity.
 * Trigger data comes from node.data.trigger (set via parseTriggerString when entity config includes trigger).
 */
function generateTriggerEdges(nodes: VisualNode[]): VisualEdge[] {
  const edges: VisualEdge[] = [];
  const nodeNames = new Set(nodes.map(n => n.id));

  for (const node of nodes) {
    if (node.data.trigger?.type === 'other_bb') {
      const sourceId = node.data.trigger.sourceBaleybotId;
      if (sourceId && nodeNames.has(sourceId)) {
        edges.push({
          id: `trigger-${sourceId}->${node.id}`,
          source: sourceId,
          target: node.id,
          type: 'trigger',
          label: 'triggers',
          animated: true,
        });
      }
    }
  }

  return edges;
}

// ============================================================================
// LAYOUT HELPERS
// ============================================================================

/**
 * Apply dagre hierarchical layout to position nodes based on edges.
 * Falls back to horizontal layout if no edges or dagre fails.
 */
export function autoLayout(nodes: VisualNode[], edges: VisualEdge[] = []): VisualNode[] {
  if (nodes.length === 0) return nodes;

  // No edges — simple horizontal
  if (edges.length === 0) {
    return nodes.map((node, index) => ({
      ...node,
      position: { x: index * (NODE_WIDTH + HORIZONTAL_GAP), y: 100 },
    }));
  }

  try {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 140, marginx: 40, marginy: 40 });
    g.setDefaultEdgeLabel(() => ({}));

    for (const node of nodes) {
      g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }
    for (const edge of edges) {
      g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    return nodes.map((node) => {
      const pos = g.node(node.id);
      return pos
        ? { ...node, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } }
        : node;
    });
  } catch {
    return nodes.map((node, index) => ({
      ...node,
      position: { x: index * (NODE_WIDTH + HORIZONTAL_GAP), y: 100 },
    }));
  }
}

/**
 * Calculate bounding box of all nodes
 */
export function getBoundingBox(nodes: VisualNode[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + NODE_WIDTH);
    maxY = Math.max(maxY, node.position.y + NODE_HEIGHT);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
