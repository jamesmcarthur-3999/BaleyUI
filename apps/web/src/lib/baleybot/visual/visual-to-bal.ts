/**
 * Visual to BAL Converter
 *
 * Converts visual graph changes back to BAL code.
 * This enables bidirectional sync between visual and code views.
 */

import type { VisualNode, VisualEdge, VisualGraph } from './bal-to-nodes';
import { parseBalCode } from '../generator';

// ============================================================================
// TYPES
// ============================================================================

export interface NodeChange {
  nodeId: string;
  changes: Partial<VisualNode['data']>;
}

// ============================================================================
// CONVERTERS
// ============================================================================

/**
 * Apply a node change to BAL code
 * Returns the updated BAL code with the change applied
 */
export function applyNodeChange(
  balCode: string,
  change: NodeChange
): string {
  const { entities, chain } = parseBalCode(balCode);

  // Find the entity to update
  const entityIndex = entities.findIndex((e) => e.name === change.nodeId);

  if (entityIndex === -1) {
    console.warn(`[visual-to-bal] Entity "${change.nodeId}" not found`);
    return balCode;
  }

  // Update the entity config
  const entity = entities[entityIndex]!;
  const updatedConfig = { ...entity.config };

  // Apply changes
  if (change.changes.goal !== undefined) {
    updatedConfig.goal = change.changes.goal;
  }
  if (change.changes.model !== undefined) {
    updatedConfig.model = change.changes.model;
  }
  if (change.changes.tools !== undefined) {
    updatedConfig.tools = change.changes.tools;
  }
  if (change.changes.output !== undefined) {
    updatedConfig.output = change.changes.output;
  }

  // Rebuild BAL code
  return rebuildBAL(
    entities.map((e, i) =>
      i === entityIndex ? { name: e.name, config: updatedConfig } : e
    ),
    chain
  );
}

/**
 * Convert a complete visual graph to BAL code
 */
export function visualToBAL(graph: VisualGraph): string {
  const entities = graph.nodes.map((node) => ({
    name: node.id,
    config: {
      goal: node.data.goal,
      model: node.data.model,
      tools: node.data.tools,
      output: node.data.output,
      trigger: node.data.trigger
        ? serializeTrigger(node.data.trigger)
        : undefined,
    },
  }));

  // Extract chain from edges
  const chainEdges = graph.edges.filter((e) => e.type === 'chain');
  const chain = extractChainOrder(chainEdges, graph.nodes);

  return rebuildBAL(entities, chain);
}

/**
 * Rebuild BAL code from entities and chain
 */
function rebuildBAL(
  entities: Array<{ name: string; config: Record<string, unknown> }>,
  chain?: string[]
): string {
  const lines: string[] = [];

  // Generate each entity
  for (const entity of entities) {
    lines.push(`${entity.name} {`);

    // Goal
    if (entity.config.goal) {
      lines.push(`  "goal": "${escapeString(entity.config.goal as string)}",`);
    }

    // Model
    if (entity.config.model) {
      lines.push(`  "model": "${entity.config.model}",`);
    }

    // Tools
    if (
      entity.config.tools &&
      Array.isArray(entity.config.tools) &&
      entity.config.tools.length > 0
    ) {
      lines.push(`  "tools": [${(entity.config.tools as string[]).map((t) => `"${t}"`).join(', ')}],`);
    }

    // Output
    if (
      entity.config.output &&
      typeof entity.config.output === 'object' &&
      Object.keys(entity.config.output).length > 0
    ) {
      const outputLines = Object.entries(entity.config.output as Record<string, string>)
        .map(([key, type]) => `    "${key}": "${type}"`)
        .join(',\n');
      lines.push(`  "output": {\n${outputLines}\n  },`);
    }

    // Trigger
    if (entity.config.trigger) {
      lines.push(`  "trigger": "${entity.config.trigger}"`);
    }

    // Remove trailing comma from last property
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1];
      if (lastLine?.endsWith(',')) {
        lines[lines.length - 1] = lastLine.slice(0, -1);
      }
    }

    lines.push('}');
    lines.push('');
  }

  // Generate chain if we have multiple entities
  if (chain && chain.length > 1) {
    lines.push('chain {');
    lines.push(`  ${chain.join('\n  ')}`);
    lines.push('}');
  }

  return lines.join('\n').trim();
}

/**
 * Extract chain order from edges
 */
function extractChainOrder(edges: VisualEdge[], nodes: VisualNode[]): string[] {
  if (edges.length === 0) {
    return nodes.map((n) => n.id);
  }

  // Build adjacency map
  const nextMap = new Map<string, string>();
  const hasPrevious = new Set<string>();

  for (const edge of edges) {
    nextMap.set(edge.source, edge.target);
    hasPrevious.add(edge.target);
  }

  // Find start node (no incoming edges)
  let startNode: string | undefined;
  for (const node of nodes) {
    if (!hasPrevious.has(node.id)) {
      startNode = node.id;
      break;
    }
  }

  if (!startNode) {
    return nodes.map((n) => n.id);
  }

  // Build chain
  const chain: string[] = [startNode];
  let current = startNode;

  while (nextMap.has(current)) {
    const next = nextMap.get(current)!;
    chain.push(next);
    current = next;
  }

  return chain;
}

/**
 * Serialize trigger config to BAL format
 */
function serializeTrigger(trigger: NonNullable<VisualNode['data']['trigger']>): string {
  switch (trigger.type) {
    case 'schedule':
      return `schedule:${trigger.schedule || '0 * * * *'}`;
    case 'webhook':
      return trigger.webhookPath ? `webhook:${trigger.webhookPath}` : 'webhook';
    case 'other_bb':
      return `bb_completion:${trigger.sourceBaleybotId || 'unknown'}:${trigger.completionType || 'completion'}`;
    default:
      return 'manual';
  }
}

/**
 * Escape string for BAL output
 */
function escapeString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
