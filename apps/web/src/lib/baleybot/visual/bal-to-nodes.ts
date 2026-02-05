/**
 * BAL to Visual Nodes Converter
 *
 * Converts BAL code into visual node representations for the diagram editor.
 * Supports single BBs, chains, parallel execution, and conditional flows.
 */

import { parseBalCode } from '../generator';
import type { TriggerConfig } from '../types';
export type { VisualNode, VisualEdge, VisualGraph } from './types';
import type { VisualNode, VisualEdge, VisualGraph } from './types';

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
 * Convert BAL code to a visual graph representation
 */
export function balToVisual(balCode: string): VisualGraph {
  const { entities, chain, errors } = parseBalCode(balCode);

  if (errors.length > 0 || entities.length === 0) {
    return { nodes: [], edges: [] };
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
        canRequest: (entity.config.can_request as string[]) || [],
        output: entity.config.output as Record<string, string> | undefined,
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

  return { nodes, edges };
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
// LAYOUT HELPERS
// ============================================================================

/**
 * Apply auto-layout to nodes (simple horizontal chain)
 */
export function autoLayout(nodes: VisualNode[]): VisualNode[] {
  return nodes.map((node, index) => ({
    ...node,
    position: {
      x: index * (NODE_WIDTH + HORIZONTAL_GAP),
      y: 100,
    },
  }));
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
