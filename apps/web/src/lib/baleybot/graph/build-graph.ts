/**
 * Canonical BAL graph builder.
 *
 * Converts parsed BAL entities + composition hints into a graph model that can
 * drive visual rendering and editing.
 */

import type { TriggerConfig } from '../types';
import type {
  BalGraphEdge,
  BalGraphModel,
  BalGraphNode,
  BalGraphSidecarMetadata,
} from './types';
import type { VisualEdge, VisualGraph, VisualNode } from '../visual/types';

export type ParsedExpression =
  | { type: 'entity'; name: string }
  | { type: 'chain'; steps: ParsedExpression[] }
  | { type: 'parallel'; branches: ParsedExpression[] }
  | { type: 'if'; condition?: string; pass: ParsedExpression; fail?: ParsedExpression }
  | { type: 'loop'; until?: string; max?: number; body: ParsedExpression }
  | { type: 'select'; fields?: string[]; child?: ParsedExpression }
  | { type: 'merge'; mappings?: Record<string, string>; child?: ParsedExpression }
  | { type: 'map'; iterable?: string; body: ParsedExpression };

export interface ParsedGraphInput {
  entities: Array<{ name: string; config: Record<string, unknown> }>;
  chain?: string[];
  expression?: ParsedExpression;
}

interface BuildGraphOptions {
  sidecar?: BalGraphSidecarMetadata;
}

const AGENT_X_GAP = 340;
const AGENT_Y = 220;

function parseTriggerString(trigger: string): TriggerConfig | null {
  if (!trigger || typeof trigger !== 'string') return null;
  const trimmed = trigger.trim().toLowerCase();

  if (trimmed === 'manual') return { type: 'manual' };
  if (trimmed === 'webhook') return { type: 'webhook' };
  if (trimmed.startsWith('webhook:')) {
    return { type: 'webhook', webhookPath: trigger.slice('webhook:'.length).trim() };
  }
  if (trimmed.startsWith('schedule:')) {
    return { type: 'schedule', schedule: trigger.slice('schedule:'.length).trim() };
  }
  if (trimmed.startsWith('bb_completion:')) {
    const parts = trigger.slice('bb_completion:'.length).trim().split(':');
    return {
      type: 'other_bb',
      sourceBaleybotId: parts[0]?.trim(),
      completionType: parts[1]?.trim() as TriggerConfig['completionType'] | undefined,
    };
  }
  if (trimmed.startsWith('db_event:')) {
    const parts = trigger.slice('db_event:'.length).trim().split(':');
    return {
      type: 'db_event',
      dbConnectionId: parts[0]?.trim(),
      dbTable: parts[1]?.trim(),
      dbEvent: parts[2]?.trim() as TriggerConfig['dbEvent'] | undefined,
    };
  }
  if (trimmed.startsWith('mcp_event:')) {
    const parts = trigger.slice('mcp_event:'.length).trim().split(':');
    return {
      type: 'mcp_event',
      mcpServer: parts[0]?.trim(),
      mcpTool: parts[1]?.trim(),
      mcpResource: parts[2]?.trim(),
    };
  }
  if (trimmed === 'file_upload' || trimmed.startsWith('file_upload:')) {
    return {
      type: 'file_upload',
    };
  }

  return { type: 'manual' };
}

function entityTriggerFromConfig(config: Record<string, unknown>): TriggerConfig | undefined {
  const raw = config.trigger;
  if (!raw) return undefined;
  if (typeof raw === 'string') {
    return parseTriggerString(raw) ?? undefined;
  }
  if (typeof raw === 'object') {
    return raw as TriggerConfig;
  }
  return undefined;
}

function getEntityTools(config: Record<string, unknown>): string[] {
  const tools = config.tools;
  if (!Array.isArray(tools)) return [];
  return tools.filter((tool): tool is string => typeof tool === 'string');
}

function createAgentNode(
  entity: { name: string; config: Record<string, unknown> },
  index: number
): BalGraphNode {
  return {
    id: entity.name,
    kind: 'bb_agent',
    parentId: 'cluster:root',
    position: { x: 80 + index * AGENT_X_GAP, y: AGENT_Y },
    data: {
      label: entity.name,
      entityName: entity.name,
      goal: (entity.config.goal as string) || '',
      model: entity.config.model as string | undefined,
      tools: getEntityTools(entity.config),
      canRequest:
        (Array.isArray(entity.config.can_request)
          ? (entity.config.can_request as unknown[]).filter((v): v is string => typeof v === 'string')
          : []) ??
        [],
      output:
        entity.config.output && typeof entity.config.output === 'object'
          ? (entity.config.output as Record<string, string>)
          : undefined,
      trigger: entityTriggerFromConfig(entity.config),
      runtimeStatus: 'idle',
    },
  };
}

let syntheticNodeCounter = 0;
function nextSyntheticId(prefix: string): string {
  syntheticNodeCounter += 1;
  return `${prefix}:${syntheticNodeCounter}`;
}

interface TraverseState {
  nodes: BalGraphNode[];
  edges: BalGraphEdge[];
}

interface TraverseResult {
  entries: string[];
  exits: string[];
}

function connectAll(
  edges: BalGraphEdge[],
  sources: string[],
  targets: string[],
  kind: BalGraphEdge['kind'],
  label?: string,
  animated = false
) {
  for (const source of sources) {
    for (const target of targets) {
      if (source === target) continue;
      const id = `${kind}:${source}->${target}:${label ?? ''}`;
      if (edges.some((edge) => edge.id === id)) continue;
      edges.push({
        id,
        source,
        target,
        kind,
        label,
        animated,
      });
    }
  }
}

function traverseExpression(
  expr: ParsedExpression | undefined,
  state: TraverseState
): TraverseResult {
  if (!expr) {
    return { entries: [], exits: [] };
  }

  if (expr.type === 'entity') {
    return { entries: [expr.name], exits: [expr.name] };
  }

  if (expr.type === 'chain') {
    let chainEntries: string[] = [];
    let previousExits: string[] = [];
    let previousInitialized = false;
    for (const step of expr.steps) {
      const stepResult = traverseExpression(step, state);
      if (!previousInitialized) {
        chainEntries = stepResult.entries;
        previousExits = stepResult.exits;
        previousInitialized = true;
      } else {
        connectAll(state.edges, previousExits, stepResult.entries, 'control');
        previousExits = stepResult.exits;
      }
    }
    return { entries: chainEntries, exits: previousExits };
  }

  if (expr.type === 'parallel') {
    const branches = expr.branches.map((branch) => traverseExpression(branch, state));
    const entries = branches.flatMap((branch) => branch.entries);
    const exits = branches.flatMap((branch) => branch.exits);
    const anchor = branches[0]?.entries?.[0];
    if (anchor) {
      for (let i = 1; i < branches.length; i++) {
        const branchEntry = branches[i]?.entries?.[0];
        if (!branchEntry) continue;
        connectAll(state.edges, [anchor], [branchEntry], 'parallel', `branch_${i}`, true);
      }
    }
    return { entries, exits };
  }

  if (expr.type === 'if') {
    const pass = traverseExpression(expr.pass, state);
    const fail = expr.fail ? traverseExpression(expr.fail, state) : { entries: [], exits: [] };
    const conditionNodeId = nextSyntheticId('condition');
    state.nodes.push({
      id: conditionNodeId,
      kind: 'output',
      position: { x: 80 + syntheticNodeCounter * 20, y: 80 },
      data: {
        label: expr.condition ? `if ${expr.condition}` : 'if condition',
        meta: { synthetic: true, conditional: true },
      },
    });

    connectAll(state.edges, [conditionNodeId], pass.entries, 'conditional', 'pass', true);
    if (fail.entries.length > 0) {
      connectAll(state.edges, [conditionNodeId], fail.entries, 'conditional', 'fail', true);
    }

    return {
      entries: [conditionNodeId],
      exits: [...pass.exits, ...fail.exits],
    };
  }

  if (expr.type === 'loop') {
    const body = traverseExpression(expr.body, state);
    if (body.exits.length > 0 && body.entries.length > 0) {
      connectAll(
        state.edges,
        body.exits,
        body.entries,
        'loop',
        expr.until ? `until ${expr.until}` : 'loop',
        true
      );
    }
    return body;
  }

  if (expr.type === 'map') {
    return traverseExpression(expr.body, state);
  }

  if (expr.type === 'select' || expr.type === 'merge') {
    const child = traverseExpression(expr.child, state);
    return child;
  }

  return { entries: [], exits: [] };
}

function addFallbackChainEdges(state: TraverseState, chain: string[]) {
  for (let i = 0; i < chain.length - 1; i++) {
    const source = chain[i];
    const target = chain[i + 1];
    if (!source || !target) continue;
    connectAll(state.edges, [source], [target], 'control');
  }
}

function parseDatasourceFromTool(tool: string): { id: string; label: string } | null {
  const postgres = tool.match(/^query_postgres_(.+)$/);
  if (postgres?.[1]) {
    return { id: `datasource:${tool}`, label: `Postgres ${postgres[1].replace(/_/g, ' ')}` };
  }

  const mysql = tool.match(/^query_mysql_(.+)$/);
  if (mysql?.[1]) {
    return { id: `datasource:${tool}`, label: `MySQL ${mysql[1].replace(/_/g, ' ')}` };
  }

  return null;
}

function formatConnectionLabel(connectionId: string): string {
  if (!connectionId) return 'Data source';
  if (connectionId.length <= 12) return connectionId;
  return `Source ${connectionId.slice(0, 8)}`;
}

function addRelationshipNodesAndEdges(
  model: BalGraphModel,
  options: BuildGraphOptions | undefined
) {
  const agentNodes = model.nodes.filter((node) => node.kind === 'bb_agent');
  const agentById = new Map(agentNodes.map((node) => [node.id, node]));
  const datasourceNodes = new Map<string, BalGraphNode>();
  const sidecarDatasourceByEntity = new Map(
    agentNodes.map((node) => [
      node.id,
      (options?.sidecar?.datasourceBindings ?? []).filter((binding) => binding.entity === node.id),
    ] as const)
  );

  const addNodeIfMissing = (node: BalGraphNode) => {
    if (!model.nodes.some((existing) => existing.id === node.id)) {
      model.nodes.push(node);
    }
  };

  const addEdgeIfMissing = (edge: BalGraphEdge) => {
    if (!model.edges.some((existing) => existing.id === edge.id)) {
      model.edges.push(edge);
    }
  };

  for (const agent of agentNodes) {
    const tools = agent.data.tools ?? [];

    // Trigger nodes
    const trigger = agent.data.trigger;
    if (trigger && trigger.type !== 'manual') {
      const triggerNodeId = `trigger:${agent.id}`;
      addNodeIfMissing({
        id: triggerNodeId,
        kind: 'trigger',
        position: { x: agent.position.x, y: agent.position.y - 170 },
        data: {
          label: trigger.type,
          trigger,
          meta: { type: trigger.type },
        },
      });
      addEdgeIfMissing({
        id: `trigger:${triggerNodeId}->${agent.id}`,
        source: triggerNodeId,
        target: agent.id,
        kind: 'trigger',
        animated: true,
      });
    }

    // Data source nodes from explicit sidecar bindings
    const explicitDatasourceBindings = sidecarDatasourceByEntity.get(agent.id) ?? [];
    for (const binding of explicitDatasourceBindings) {
      const nodeId = `datasource:connection:${binding.connectionId}`;
      if (!datasourceNodes.has(nodeId)) {
        const node: BalGraphNode = {
          id: nodeId,
          kind: 'datasource',
          position: { x: agent.position.x - 210, y: agent.position.y + 140 + datasourceNodes.size * 12 },
          data: {
            label: binding.connectionLabel ?? formatConnectionLabel(binding.connectionId),
            meta: {
              source: 'sidecar',
              connectionId: binding.connectionId,
              connectionType: binding.connectionType,
              tool: binding.tool,
            },
          },
        };
        datasourceNodes.set(nodeId, node);
        addNodeIfMissing(node);
      }

      addEdgeIfMissing({
        id: `data:${nodeId}->${agent.id}:${binding.tool}`,
        source: nodeId,
        target: agent.id,
        kind: 'data',
        label: binding.mode ? `${binding.mode.replace(/_/g, ' ')}` : 'data',
      });
    }

    // Data source nodes
    for (const tool of tools) {
      const source = parseDatasourceFromTool(tool);
      if (!source) continue;
      const coveredBySidecar = explicitDatasourceBindings.some((binding) => binding.tool === tool);
      if (coveredBySidecar) continue;

      if (!datasourceNodes.has(source.id)) {
        const node: BalGraphNode = {
          id: source.id,
          kind: 'datasource',
          position: { x: agent.position.x, y: agent.position.y + 190 + datasourceNodes.size * 10 },
          data: { label: source.label, meta: { tool } },
        };
        datasourceNodes.set(source.id, node);
        addNodeIfMissing(node);
      }
      addEdgeIfMissing({
        id: `data:${source.id}->${agent.id}`,
        source: source.id,
        target: agent.id,
        kind: 'data',
        label: tool,
      });
    }

    // Storage bucket visualization
    if (tools.includes('shared_storage') || tools.includes('store_memory')) {
      const usesShared = tools.includes('shared_storage');
      const storageId = usesShared ? 'storage:shared' : 'storage:memory';
      const label = usesShared ? 'Shared Storage' : 'Memory';
      addNodeIfMissing({
        id: storageId,
        kind: 'storage_bucket',
        position: { x: agent.position.x + 90, y: agent.position.y + 120 },
        data: { label },
      });
      addEdgeIfMissing({
        id: `data:${agent.id}->${storageId}`,
        source: agent.id,
        target: storageId,
        kind: 'data',
        label: usesShared ? 'shared_storage' : 'store_memory',
      });
    }

    // Spawn relations
    if (tools.includes('spawn_baleybot')) {
      const explicitBindings = options?.sidecar?.spawnBindings?.filter((binding) => binding.source === agent.id) ?? [];
      if (explicitBindings.length > 0) {
        for (const binding of explicitBindings) {
          if (!agentById.has(binding.target)) continue;
          addEdgeIfMissing({
            id: `spawn:${binding.source}->${binding.target}`,
            source: binding.source,
            target: binding.target,
            kind: 'spawn',
            animated: true,
            label: 'spawns',
          });
        }
      } else {
        for (const other of agentNodes) {
          if (other.id === agent.id) continue;
          addEdgeIfMissing({
            id: `spawn:${agent.id}->${other.id}`,
            source: agent.id,
            target: other.id,
            kind: 'spawn',
            animated: true,
            label: 'spawns',
          });
        }
      }
    }
  }

  for (const edge of options?.sidecar?.sharedStorageLinks ?? []) {
    if (!agentById.has(edge.producer) || !agentById.has(edge.consumer)) continue;
    addEdgeIfMissing({
      id: `data:shared:${edge.producer}->${edge.consumer}:${edge.keyPattern ?? '*'}`,
      source: edge.producer,
      target: edge.consumer,
      kind: 'data',
      label: edge.keyPattern ? `shared:${edge.keyPattern}` : 'shared',
      animated: Boolean(edge.required),
      meta: { required: edge.required ?? false },
    });
  }
}

export function buildGraphFromParsed(
  parsed: ParsedGraphInput,
  options?: BuildGraphOptions
): BalGraphModel {
  syntheticNodeCounter = 0;
  const clusterNode: BalGraphNode = {
    id: 'cluster:root',
    kind: 'bb_cluster',
    position: { x: 30, y: 60 },
    data: {
      label: 'Workflow',
      collapsed: false,
      meta: { childCount: parsed.entities.length },
    },
  };

  const agentNodes = parsed.entities.map((entity, index) => createAgentNode(entity, index));
  const state: TraverseState = {
    nodes: [clusterNode, ...agentNodes],
    edges: [],
  };

  const traversed = traverseExpression(parsed.expression, state);
  if (traversed.entries.length === 0 && parsed.chain && parsed.chain.length > 1) {
    addFallbackChainEdges(state, parsed.chain);
  }

  const model: BalGraphModel = {
    nodes: state.nodes,
    edges: state.edges,
    metadata: {
      sidecar: options?.sidecar,
    },
  };

  addRelationshipNodesAndEdges(model, options);
  return model;
}

function mapGraphNodeToVisual(node: BalGraphNode): VisualNode {
  const visualType: VisualNode['type'] =
    node.kind === 'bb_agent'
      ? 'bb_agent'
      : node.kind === 'bb_cluster'
        ? 'bb_cluster'
        : node.kind === 'datasource'
          ? 'datasource'
          : node.kind === 'storage_bucket'
            ? 'storage_bucket'
            : node.kind === 'trigger'
              ? 'trigger'
              : 'output';

  return {
    id: node.id,
    type: visualType,
    position: node.position,
    data: {
      name: node.data.entityName ?? node.data.label,
      goal: node.data.goal ?? '',
      model: node.data.model,
      trigger: node.data.trigger,
      tools: node.data.tools ?? [],
      canRequest: node.data.canRequest ?? [],
      output: node.data.output,
      runtimeStatus: node.data.runtimeStatus,
      kind: node.kind,
      parentId: node.parentId,
      collapsed: node.data.collapsed,
      meta: node.data.meta,
    },
  };
}

function mapGraphEdgeToVisual(edge: BalGraphEdge): VisualEdge {
  let type: VisualEdge['type'] = 'chain';

  if (edge.kind === 'parallel') type = 'parallel';
  if (edge.kind === 'conditional') {
    type = edge.label === 'fail' ? 'conditional_fail' : 'conditional_pass';
  }
  if (edge.kind === 'loop') type = 'loop';
  if (edge.kind === 'spawn') type = 'spawn';
  if (edge.kind === 'trigger') type = 'trigger';
  if (edge.kind === 'data') type = 'shared_data';
  if (edge.kind === 'runtime') type = 'runtime';

  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type,
    label: edge.label,
    animated: edge.animated,
  };
}

export function graphToVisualGraph(model: BalGraphModel): VisualGraph {
  return {
    nodes: model.nodes.map(mapGraphNodeToVisual),
    edges: model.edges.map(mapGraphEdgeToVisual),
  };
}
