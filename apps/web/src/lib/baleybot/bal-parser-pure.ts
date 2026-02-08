/**
 * Pure BAL Parser Module (Worker-Safe)
 *
 * Extracts the pure parsing logic from generator.ts and bal-to-nodes.ts
 * so it can be used in a WebWorker without pulling in server-side dependencies.
 *
 * This module MUST NOT import from:
 * - ./internal-baleybots (server-only: DB, AI execution)
 * - ./tool-catalog (server-only: workspace policies)
 * - ./types (transitively imports @baleybots/core values)
 * - @baleyui/db (database)
 *
 * It CAN import from:
 * - @baleybots/tools baleybots-dsl-v2 sub-module (pure lexer/parser)
 *   NOTE: Must use deep import to avoid barrel export that pulls in @baleybots/core
 */

// Use individual sub-path imports to avoid the DSL barrel (index.js) which imports @baleybots/core.
// The @baleybots/tools exports map doesn't expose ./dsl/* paths, so next.config.ts has a
// webpack alias to resolve these to the actual dist files.
import { tokenize } from '@baleybots/tools/dsl/lexer';
import { parse } from '@baleybots/tools/dsl/parser';

// ============================================================================
// TYPES (inlined to avoid importing from ./types which pulls @baleybots/core)
// ============================================================================

export interface ParsedEntity {
  name: string;
  config: Record<string, unknown>;
}

export interface ParseResult {
  entities: ParsedEntity[];
  chain?: string[];
  errors: string[];
}

export type TriggerType = 'manual' | 'schedule' | 'webhook' | 'other_bb';

export interface TriggerConfig {
  type: TriggerType;
  schedule?: string;
  sourceBaleybotId?: string;
  completionType?: 'success' | 'failure' | 'completion';
  webhookPath?: string;
  enabled?: boolean;
}

export interface VisualNode {
  id: string;
  type: 'baleybot' | 'trigger' | 'output';
  data: {
    name: string;
    goal: string;
    model?: string;
    trigger?: TriggerConfig;
    tools: string[];
    canRequest: string[];
    output?: Record<string, string>;
  };
  position: { x: number; y: number };
}

export interface VisualEdge {
  id: string;
  source: string;
  target: string;
  type: 'chain' | 'conditional_pass' | 'conditional_fail' | 'parallel' | 'spawn' | 'shared_data' | 'trigger';
  label?: string;
  animated?: boolean;
}

export interface VisualGraph {
  nodes: VisualNode[];
  edges: VisualEdge[];
}

export interface BalToVisualResult {
  graph: VisualGraph;
  errors: string[];
}

// ============================================================================
// HELPERS (copied from generator.ts)
// ============================================================================

function typeSpecToString(spec: { kind: string; [key: string]: unknown }): string {
  switch (spec.kind) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'array';
    case 'object':
      return 'object';
    case 'optional': {
      const inner = spec.inner as { kind: string; [key: string]: unknown } | undefined;
      return inner ? `${typeSpecToString(inner)}?` : 'optional';
    }
    default:
      return 'string';
  }
}

function outputSchemaToRecord(output: { fields: Array<{ name: string; fieldType: { kind: string } }> }): Record<string, string> {
  const result: Record<string, string> = {};
  for (const field of output.fields) {
    result[field.name] = typeSpecToString(field.fieldType as { kind: string; [key: string]: unknown });
  }
  return result;
}

// ============================================================================
// PARSE BAL CODE (extracted from generator.ts)
// ============================================================================

/**
 * Extract pipeline order from AST root expression.
 * Walks ChainExpr, ParallelExpr, EntityRef, etc.
 */
function extractPipelineFromAst(
  node: { type: string; [key: string]: unknown } | null
): { type: 'chain' | 'parallel' | 'single'; order: string[] } | null {
  if (!node) return null;

  const extractNames = (n: { type: string; [key: string]: unknown }): string[] => {
    if (n.type === 'EntityRef' && typeof n.name === 'string') return [n.name];
    if (n.type === 'EntityRefWithContext' && typeof n.name === 'string') return [n.name];
    const body = n.body as Array<{ type: string; [key: string]: unknown }> | undefined;
    if (body && Array.isArray(body)) return body.flatMap(extractNames);
    const then = n.thenBranch as { type: string; [key: string]: unknown } | undefined;
    const els = n.elseBranch as { type: string; [key: string]: unknown } | undefined;
    return [...(then ? extractNames(then) : []), ...(els ? extractNames(els) : [])];
  };

  switch (node.type) {
    case 'ChainExpr':
      return { type: 'chain', order: extractNames(node) };
    case 'ParallelExpr':
      return { type: 'parallel', order: extractNames(node) };
    default: {
      const names = extractNames(node);
      return names.length > 0 ? { type: 'single', order: names } : null;
    }
  }
}

/**
 * Parse BAL code and extract entity definitions.
 * Pure function with no server dependencies.
 */
export function parseBalCode(balCode: string): ParseResult {
  const entities: ParsedEntity[] = [];

  try {
    const tokens = tokenize(balCode);
    const ast = parse(tokens, balCode);

    for (const entity of ast.entities.values()) {
      entities.push({
        name: entity.name,
        config: {
          goal: entity.goal,
          model: entity.model,
          tools: entity.tools ?? [],
          output: entity.output ? outputSchemaToRecord(entity.output as { fields: Array<{ name: string; fieldType: { kind: string } }> }) : undefined,
          history: entity.history,
          maxTokens: entity.maxTokens,
        },
      });
    }

    const pipeline = extractPipelineFromAst(ast.root as { type: string; [key: string]: unknown } | null);
    return { entities, chain: pipeline?.order, errors: [] };
  } catch (error) {
    return {
      entities: [],
      chain: undefined,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

// ============================================================================
// TRIGGER PARSING (copied from bal-to-nodes.ts)
// ============================================================================

function parseTriggerString(trigger: string): TriggerConfig | null {
  if (!trigger || typeof trigger !== 'string') {
    return null;
  }

  const trimmed = trigger.trim().toLowerCase();

  if (trimmed === 'manual') {
    return { type: 'manual' };
  }

  if (trimmed === 'webhook') {
    return { type: 'webhook' };
  }

  if (trimmed.startsWith('schedule:')) {
    const schedule = trigger.slice('schedule:'.length).trim();
    return { type: 'schedule', schedule };
  }

  if (trimmed.startsWith('bb_completion:')) {
    const sourceBaleybotId = trigger.slice('bb_completion:'.length).trim();
    return { type: 'other_bb', sourceBaleybotId };
  }

  return { type: 'manual' };
}

// ============================================================================
// BAL TO VISUAL (extracted from bal-to-nodes.ts)
// ============================================================================

const NODE_WIDTH = 280;
const HORIZONTAL_GAP = 100;

function calculatePosition(
  nodeName: string,
  orderedNames: string[],
  entityIndex: number,
  _totalEntities: number
): { x: number; y: number } {
  const orderIndex = orderedNames.indexOf(nodeName);
  const effectiveIndex = orderIndex >= 0 ? orderIndex : entityIndex;

  const x = effectiveIndex * (NODE_WIDTH + HORIZONTAL_GAP);
  const y = 100;

  return { x, y };
}

function parseParallelEdges(
  balCode: string,
  nodes: VisualNode[]
): VisualEdge[] {
  const edges: VisualEdge[] = [];
  const nodeNames = new Set(nodes.map((n) => n.id));

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

  if (branches.length >= 2) {
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

function parseConditionalEdges(
  balCode: string,
  nodes: VisualNode[]
): VisualEdge[] {
  const edges: VisualEdge[] = [];
  const nodeNames = new Set(nodes.map((n) => n.id));

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
// LAYOUT (simple hierarchical — dagre is in bal-to-nodes.ts for server path)
// ============================================================================

const NODE_HEIGHT = 150;

/**
 * Simple left-to-right layout based on edge topology.
 * Uses BFS from sources to assign ranks for basic hierarchical positioning.
 */
function autoLayout(nodes: VisualNode[], edges: VisualEdge[]): VisualNode[] {
  if (nodes.length === 0) return nodes;

  // No edges — simple horizontal
  if (edges.length === 0) {
    return nodes.map((node, index) => ({
      ...node,
      position: { x: index * (NODE_WIDTH + HORIZONTAL_GAP), y: 100 },
    }));
  }

  // Build adjacency from edges
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  const nodeIds = new Set(nodes.map(n => n.id));

  for (const n of nodes) {
    outgoing.set(n.id, []);
    incoming.set(n.id, 0);
  }

  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      outgoing.get(edge.source)?.push(edge.target);
      incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    }
  }

  // BFS topological sort for rank assignment
  const rank = new Map<string, number>();
  const queue: string[] = [];

  for (const n of nodes) {
    if ((incoming.get(n.id) ?? 0) === 0) {
      queue.push(n.id);
      rank.set(n.id, 0);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentRank = rank.get(current) ?? 0;
    for (const next of outgoing.get(current) ?? []) {
      const existingRank = rank.get(next);
      if (existingRank === undefined || existingRank < currentRank + 1) {
        rank.set(next, currentRank + 1);
      }
      incoming.set(next, (incoming.get(next) ?? 1) - 1);
      if ((incoming.get(next) ?? 0) <= 0) {
        queue.push(next);
      }
    }
  }

  // Assign any unranked nodes (cycles)
  for (const n of nodes) {
    if (!rank.has(n.id)) {
      rank.set(n.id, 0);
    }
  }

  // Group nodes by rank
  const byRank = new Map<number, string[]>();
  for (const [id, r] of rank) {
    const group = byRank.get(r) ?? [];
    group.push(id);
    byRank.set(r, group);
  }

  // Position: x by rank, y stagger within rank
  return nodes.map(node => {
    const r = rank.get(node.id) ?? 0;
    const group = byRank.get(r) ?? [node.id];
    const indexInGroup = group.indexOf(node.id);
    const totalInGroup = group.length;
    const yCenter = 100;
    // Compact spacing when 4+ nodes in same rank
    const ySpacing = totalInGroup >= 4
      ? NODE_HEIGHT + 20  // 170px for dense groups
      : NODE_HEIGHT + 40; // 190px for sparse groups
    const yOffset = (indexInGroup - (totalInGroup - 1) / 2) * ySpacing;

    return {
      ...node,
      position: {
        x: r * (NODE_WIDTH + HORIZONTAL_GAP),
        y: yCenter + yOffset,
      },
    };
  });
}

/**
 * Convert BAL code to a visual graph representation.
 * Pure function with no server dependencies.
 */
export function balToVisual(balCode: string): BalToVisualResult {
  const { entities, chain, errors } = parseBalCode(balCode);

  if (errors.length > 0 || entities.length === 0) {
    return { graph: { nodes: [], edges: [] }, errors };
  }

  const nodes: VisualNode[] = [];
  const edges: VisualEdge[] = [];

  const orderedNames = chain || entities.map((e) => e.name);

  entities.forEach((entity, index) => {
    const position = calculatePosition(entity.name, orderedNames, index, entities.length);

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

  const parallelEdges = parseParallelEdges(balCode, nodes);
  const conditionalEdges = parseConditionalEdges(balCode, nodes);

  edges.push(...parallelEdges, ...conditionalEdges);

  // Generate relationship edges from entity data
  edges.push(...generateSpawnEdges(nodes));
  edges.push(...generateSharedDataEdges(nodes));
  edges.push(...generateTriggerEdges(nodes));

  // Apply layout based on edges
  const layoutedNodes = autoLayout(nodes, edges);

  return { graph: { nodes: layoutedNodes, edges }, errors: [] };
}
