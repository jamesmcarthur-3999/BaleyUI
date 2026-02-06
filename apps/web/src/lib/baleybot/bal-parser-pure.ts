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

// Use individual sub-path imports to avoid the DSL barrel (index.js) which imports @baleybots/core
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
  type: 'chain' | 'conditional_pass' | 'conditional_fail' | 'parallel';
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
        },
      });
    }

    return { entities, chain: undefined, errors: [] };
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
const NODE_HEIGHT = 150;
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

  return { graph: { nodes, edges }, errors: [] };
}
