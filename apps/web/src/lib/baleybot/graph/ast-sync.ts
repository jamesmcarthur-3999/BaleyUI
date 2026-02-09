/**
 * Graph edit reducer + deterministic BAL writeback.
 *
 * This is intentionally deterministic and formatting-stable so visual edits can
 * always produce executable BAL text in real time.
 */

import type { BalGraphEdge, BalGraphModel, BalGraphNode, GraphEditCommand } from './types';

function isAgent(node: BalGraphNode): boolean {
  return node.kind === 'bb_agent';
}

function cloneModel(model: BalGraphModel): BalGraphModel {
  return {
    ...model,
    nodes: model.nodes.map((node) => ({
      ...node,
      data: { ...node.data },
      position: { ...node.position },
    })),
    edges: model.edges.map((edge) => ({ ...edge })),
    metadata: model.metadata
      ? {
          ...model.metadata,
          sidecar: model.metadata.sidecar
            ? {
                ...model.metadata.sidecar,
                sharedStorageLinks: [...(model.metadata.sidecar.sharedStorageLinks ?? [])],
                datasourceBindings: [...(model.metadata.sidecar.datasourceBindings ?? [])],
                spawnBindings: [...(model.metadata.sidecar.spawnBindings ?? [])],
              }
            : undefined,
        }
      : undefined,
  };
}

function toSnakeCase(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');
}

function ensureUniqueAgentId(model: BalGraphModel, base: string): string {
  const safe = toSnakeCase(base) || 'new_bot';
  const ids = new Set(model.nodes.filter(isAgent).map((node) => node.id));
  if (!ids.has(safe)) return safe;
  let i = 2;
  while (ids.has(`${safe}_${i}`)) i += 1;
  return `${safe}_${i}`;
}

function rebuildLinearControlEdges(model: BalGraphModel, orderedIds: string[]) {
  model.edges = model.edges.filter((edge) => edge.kind !== 'control');
  for (let i = 0; i < orderedIds.length - 1; i++) {
    const source = orderedIds[i];
    const target = orderedIds[i + 1];
    if (!source || !target) continue;
    model.edges.push({
      id: `control:${source}->${target}`,
      source,
      target,
      kind: 'control',
    });
  }
}

function computeAgentOrder(model: BalGraphModel): string[] {
  const agentIds = model.nodes.filter(isAgent).map((node) => node.id);
  if (agentIds.length <= 1) return agentIds;

  const controlEdges = model.edges.filter(
    (edge) => edge.kind === 'control' && agentIds.includes(edge.source) && agentIds.includes(edge.target)
  );

  if (controlEdges.length === 0) {
    return agentIds;
  }

  const inDegree = new Map<string, number>(agentIds.map((id) => [id, 0]));
  const outMap = new Map<string, string[]>(agentIds.map((id) => [id, []]));

  for (const edge of controlEdges) {
    outMap.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const queue = agentIds.filter((id) => (inDegree.get(id) ?? 0) === 0);
  const ordered: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    ordered.push(current);
    for (const next of outMap.get(current) ?? []) {
      const degree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, degree);
      if (degree === 0) queue.push(next);
    }
  }

  // Cycle fallback
  if (ordered.length !== agentIds.length) {
    return agentIds;
  }
  return ordered;
}

function escapeString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

function buildEntityBlock(node: BalGraphNode): string {
  const lines: string[] = [];
  lines.push(`${node.id} {`);
  lines.push(`  "goal": "${escapeString(node.data.goal ?? 'Perform this step.')}"`);

  if (node.data.model) {
    lines.push(`  ,"model": "${escapeString(node.data.model)}"`);
  }

  const tools = node.data.tools ?? [];
  if (tools.length > 0) {
    lines.push(`  ,"tools": { ${tools.map((tool) => `"${escapeString(tool)}"`).join(', ')} }`);
  }

  const canRequest = node.data.canRequest ?? [];
  if (canRequest.length > 0) {
    lines.push(`  ,"can_request": [${canRequest.map((tool) => `"${escapeString(tool)}"`).join(', ')}]`);
  }

  if (node.data.output && Object.keys(node.data.output).length > 0) {
    const fields = Object.entries(node.data.output)
      .map(([key, type]) => `    "${escapeString(key)}": "${escapeString(type)}"`)
      .join(',\n');
    lines.push(`  ,"output": {\n${fields}\n  }`);
  }

  lines.push('}');
  return lines.join('\n');
}

function buildComposition(model: BalGraphModel, orderedIds: string[]): string[] {
  const lines: string[] = [];
  if (orderedIds.length <= 1) {
    return lines;
  }

  const hasParallel = model.edges.some((edge) => edge.kind === 'parallel');
  if (hasParallel) {
    const parallelIds = new Set<string>();
    for (const edge of model.edges.filter((e) => e.kind === 'parallel')) {
      parallelIds.add(edge.source);
      parallelIds.add(edge.target);
    }
    if (parallelIds.size > 1) {
      lines.push('parallel {');
      for (const id of orderedIds.filter((id) => parallelIds.has(id))) {
        lines.push(`  ${id}`);
      }
      lines.push('}');
      return lines;
    }
  }

  lines.push('chain {');
  for (const id of orderedIds) {
    lines.push(`  ${id}`);
  }
  lines.push('}');
  return lines;
}

export function modelToBalCode(model: BalGraphModel): string {
  const orderedIds = computeAgentOrder(model);
  const orderedNodes = orderedIds
    .map((id) => model.nodes.find((node) => node.id === id && isAgent(node)))
    .filter((node): node is BalGraphNode => Boolean(node));

  const lines: string[] = [];
  for (const node of orderedNodes) {
    lines.push(buildEntityBlock(node));
    lines.push('');
  }

  lines.push(...buildComposition(model, orderedIds));
  return lines.join('\n').trim();
}

export function applyGraphEdit(model: BalGraphModel, command: GraphEditCommand): BalGraphModel {
  const next = cloneModel(model);

  if (command.type === 'add_node') {
    const newId = ensureUniqueAgentId(next, command.nodeId);
    const index = next.nodes.filter(isAgent).length;
    const newNode: BalGraphNode = {
      id: newId,
      kind: 'bb_agent',
      parentId: 'cluster:root',
      position: { x: 80 + index * 340, y: 220 },
      data: {
        label: command.props?.label ?? newId,
        entityName: newId,
        goal: command.props?.goal ?? 'Perform this workflow step.',
        model: command.props?.model,
        tools: command.props?.tools ?? [],
        canRequest: command.props?.canRequest ?? [],
        output: command.props?.output,
        trigger: command.props?.trigger,
        runtimeStatus: 'idle',
      },
    };

    next.nodes.push(newNode);
    const ordered = computeAgentOrder(next);
    if (command.afterNodeId && ordered.includes(command.afterNodeId)) {
      const filtered = ordered.filter((id) => id !== newId);
      const insertAt = filtered.indexOf(command.afterNodeId) + 1;
      filtered.splice(insertAt, 0, newId);
      rebuildLinearControlEdges(next, filtered);
    } else {
      rebuildLinearControlEdges(next, [...ordered, newId]);
    }
    return next;
  }

  if (command.type === 'delete_node') {
    next.nodes = next.nodes.filter((node) => node.id !== command.nodeId);
    next.edges = next.edges.filter(
      (edge) => edge.source !== command.nodeId && edge.target !== command.nodeId
    );
    rebuildLinearControlEdges(next, computeAgentOrder(next));
    return next;
  }

  if (command.type === 'rename_node') {
    const updatedId = ensureUniqueAgentId(next, command.nextId);
    next.nodes = next.nodes.map((node) => {
      if (node.id !== command.nodeId) return node;
      return {
        ...node,
        id: updatedId,
        data: {
          ...node.data,
          label: command.nextLabel ?? updatedId,
          entityName: updatedId,
        },
      };
    });
    next.edges = next.edges.map((edge) => ({
      ...edge,
      id: edge.id
        .replace(command.nodeId, updatedId)
        .replace(`${command.nodeId}->`, `${updatedId}->`)
        .replace(`->${command.nodeId}`, `->${updatedId}`),
      source: edge.source === command.nodeId ? updatedId : edge.source,
      target: edge.target === command.nodeId ? updatedId : edge.target,
    }));
    return next;
  }

  if (command.type === 'set_node_props') {
    next.nodes = next.nodes.map((node) =>
      node.id === command.nodeId
        ? {
            ...node,
            data: {
              ...node.data,
              ...command.props,
              entityName: node.kind === 'bb_agent' ? command.props.entityName ?? node.data.entityName : node.data.entityName,
            },
          }
        : node
    );
    return next;
  }

  if (command.type === 'connect_edge') {
    const kind: BalGraphEdge['kind'] = command.edgeKind ?? 'control';
    const id = `${kind}:${command.source}->${command.target}`;
    if (!next.edges.some((edge) => edge.id === id)) {
      next.edges.push({
        id,
        source: command.source,
        target: command.target,
        kind,
        label: command.label,
      });
    }
    if (kind === 'control') {
      rebuildLinearControlEdges(next, computeAgentOrder(next));
    }
    return next;
  }

  if (command.type === 'disconnect_edge') {
    next.edges = next.edges.filter((edge) => edge.id !== command.edgeId);
    if (command.edgeId.startsWith('control:')) {
      rebuildLinearControlEdges(next, computeAgentOrder(next));
    }
    return next;
  }

  if (command.type === 'reorder_branch') {
    const ordered = computeAgentOrder(next).filter((id) => id !== command.nodeId);
    if (command.beforeNodeId && ordered.includes(command.beforeNodeId)) {
      const index = ordered.indexOf(command.beforeNodeId);
      ordered.splice(index, 0, command.nodeId);
    } else if (command.afterNodeId && ordered.includes(command.afterNodeId)) {
      const index = ordered.indexOf(command.afterNodeId);
      ordered.splice(index + 1, 0, command.nodeId);
    } else {
      ordered.push(command.nodeId);
    }
    rebuildLinearControlEdges(next, ordered);
    return next;
  }

  return next;
}

export function applyGraphEditAndGenerateBAL(
  model: BalGraphModel,
  command: GraphEditCommand
): { model: BalGraphModel; balCode: string } {
  const nextModel = applyGraphEdit(model, command);
  return {
    model: nextModel,
    balCode: modelToBalCode(nextModel),
  };
}

