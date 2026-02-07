/**
 * Visual to BAL Converter
 *
 * Converts visual graph changes back to BAL code.
 * This enables bidirectional sync between visual and code views.
 */

import type { VisualNode, VisualEdge, VisualGraph, ParsedEntities } from './types';
import { createLogger } from '@/lib/logger';

const logger = createLogger('visual-to-bal');

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
 * Apply a node change using pre-parsed entities (client-safe — no server imports).
 * Call parseBalEntities() server action first, then pass the result here.
 */
export function applyNodeChangeFromParsed(
  parsed: ParsedEntities,
  change: NodeChange
): string {
  const { entities, chain } = parsed;

  // Find the entity to update
  const entityIndex = entities.findIndex((e) => e.name === change.nodeId);

  if (entityIndex === -1) {
    logger.warn(`Entity "${change.nodeId}" not found`);
    return rebuildBAL(entities, chain);
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
  if (change.changes.temperature !== undefined) {
    updatedConfig.temperature = change.changes.temperature;
  }
  if (change.changes.reasoning !== undefined) {
    updatedConfig.reasoning = change.changes.reasoning;
  }
  if (change.changes.retries !== undefined) {
    updatedConfig.retries = change.changes.retries;
  }
  if (change.changes.stopWhen !== undefined) {
    updatedConfig.stopWhen = change.changes.stopWhen;
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
      temperature: node.data.temperature,
      reasoning: node.data.reasoning,
      retries: node.data.retries,
      stopWhen: node.data.stopWhen,
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

    // Temperature
    if (entity.config.temperature !== undefined) {
      lines.push(`  "temperature": ${entity.config.temperature},`);
    }

    // Reasoning
    if (entity.config.reasoning !== undefined) {
      if (typeof entity.config.reasoning === 'object' && entity.config.reasoning !== null) {
        const r = entity.config.reasoning as { effort?: string };
        lines.push(`  "reasoning": "${r.effort || 'medium'}",`);
      } else if (entity.config.reasoning) {
        lines.push(`  "reasoning": true,`);
      }
    }

    // Retries
    if (entity.config.retries !== undefined && (entity.config.retries as number) > 0) {
      lines.push(`  "retries": ${entity.config.retries},`);
    }

    // Stop condition
    if (entity.config.stopWhen) {
      lines.push(`  "stopWhen": "${escapeString(entity.config.stopWhen as string)}",`);
    }

    // Can Request / Needs Approval
    if (
      entity.config.can_request &&
      Array.isArray(entity.config.can_request) &&
      entity.config.can_request.length > 0
    ) {
      lines.push(`  "can_request": [${(entity.config.can_request as string[]).map((t) => `"${t}"`).join(', ')}],`);
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
