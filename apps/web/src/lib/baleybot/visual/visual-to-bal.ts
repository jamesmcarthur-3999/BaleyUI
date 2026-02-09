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

export interface NodeIntentChange {
  nodeId?: string | null;
  instruction: string;
}

export interface NodeIntentResult {
  applied: boolean;
  balCode: string;
  summary: string;
  nextSelectedNodeId?: string | null;
  error?: string;
}

function hasAdvancedCompositionSyntax(balCode: string): boolean {
  return /\b(parallel|loop|if|when|try|route|gate|filter|processor|map|select|merge)\b/i.test(
    balCode
  );
}

function findMatchingDelimiter(
  source: string,
  startIndex: number,
  open: '{' | '[' | '(',
  close: '}' | ']' | ')'
): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < source.length; i++) {
    const char = source[i];
    if (!char) break;

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === open) {
      depth++;
      continue;
    }

    if (char === close) {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patchEntityBlockInSource(
  sourceBalCode: string,
  entity: { name: string; config: Record<string, unknown> }
): string | null {
  const entityPattern = new RegExp(`\\b${escapeRegExp(entity.name)}\\b\\s*\\{`, 'g');
  const match = entityPattern.exec(sourceBalCode);
  if (!match) return null;

  const openBraceIndex = sourceBalCode.indexOf('{', match.index);
  if (openBraceIndex === -1) return null;

  const closeBraceIndex = findMatchingDelimiter(sourceBalCode, openBraceIndex, '{', '}');
  if (closeBraceIndex === -1) return null;

  const updatedEntityBlock = rebuildBAL([entity]).trim();
  return (
    sourceBalCode.slice(0, match.index) +
    updatedEntityBlock +
    sourceBalCode.slice(closeBraceIndex + 1)
  );
}

// ============================================================================
// CONVERTERS
// ============================================================================

/**
 * Apply a natural-language intent on top of parsed BAL entities.
 * Supports add/delete/rename plus quick goal/model/tool edits.
 */
export function applyNodeIntentFromParsed(
  parsed: ParsedEntities,
  change: NodeIntentChange,
  fallbackBalCode = ''
): NodeIntentResult {
  const instruction = change.instruction.trim();
  if (!instruction) {
    return {
      applied: false,
      balCode: fallbackBalCode,
      summary: 'No changes applied.',
      error: 'Enter a change request first.',
    };
  }

  const normalized = instruction.toLowerCase();
  const entities = parsed.entities.map((entity) => ({
    name: entity.name,
    config: { ...entity.config },
  }));

  if (entities.length === 0) {
    return {
      applied: false,
      balCode: fallbackBalCode,
      summary: 'No changes applied.',
      error: 'No entities are available to edit.',
    };
  }

  let chain = normalizeChain(parsed.chain, entities);
  const selectedNodeId = change.nodeId ?? undefined;
  const selectedIndex = selectedNodeId
    ? entities.findIndex((entity) => entity.name === selectedNodeId)
    : -1;
  const hasAdvancedCompositions =
    fallbackBalCode.trim().length > 0 && hasAdvancedCompositionSyntax(fallbackBalCode);

  // Delete node
  if (matchesIntent(normalized, ['delete', 'remove', 'drop']) && matchesIntent(normalized, ['node', 'bot', 'agent', 'step', 'bb', 'this'])) {
    if (!selectedNodeId || selectedIndex === -1) {
      return {
        applied: false,
        balCode: fallbackBalCode,
        summary: 'No changes applied.',
        error: 'Select a node first, then run delete.',
      };
    }
    if (hasAdvancedCompositions) {
      return {
        applied: false,
        balCode: fallbackBalCode,
        summary: 'No changes applied.',
        error:
          'This workflow uses advanced BAL compositions. Delete/insert operations must be done in Code view to avoid breaking structure.',
      };
    }
    if (entities.length === 1) {
      return {
        applied: false,
        balCode: fallbackBalCode,
        summary: 'No changes applied.',
        error: 'Cannot delete the only node in the workflow.',
      };
    }

    const removedName = entities[selectedIndex]!.name;
    entities.splice(selectedIndex, 1);

    const removedChainIndex = chain.indexOf(removedName);
    chain = chain.filter((name) => name !== removedName);
    if (chain.length === 0) {
      chain = entities.map((entity) => entity.name);
    }

    const nextSelectedNodeId =
      removedChainIndex >= 0
        ? (chain[Math.min(removedChainIndex, chain.length - 1)] ?? null)
        : (chain[0] ?? null);

    return {
      applied: true,
      balCode: rebuildBAL(orderEntitiesForChain(entities, chain), chain),
      summary: `Deleted "${removedName}".`,
      nextSelectedNodeId,
    };
  }

  // Rename node
  if (matchesIntent(normalized, ['rename', 'name', 'call'])) {
    if (!selectedNodeId || selectedIndex === -1) {
      return {
        applied: false,
        balCode: fallbackBalCode,
        summary: 'No changes applied.',
        error: 'Select a node first, then rename it.',
      };
    }
    if (hasAdvancedCompositions) {
      return {
        applied: false,
        balCode: fallbackBalCode,
        summary: 'No changes applied.',
        error:
          'This workflow uses advanced BAL compositions. Rename operations should be done in Code view so composition references stay consistent.',
      };
    }

    const renameTarget = extractRenameTarget(instruction);
    if (!renameTarget) {
      return {
        applied: false,
        balCode: fallbackBalCode,
        summary: 'No changes applied.',
        error: 'Could not find the new name. Try: rename this node to output_verifier.',
      };
    }

    const nextName = ensureUniqueEntityName(toSnakeCase(renameTarget), new Set(entities.map((entity) => entity.name)), selectedNodeId);
    const oldName = entities[selectedIndex]!.name;
    entities[selectedIndex] = { ...entities[selectedIndex]!, name: nextName };
    chain = chain.map((name) => (name === oldName ? nextName : name));

    return {
      applied: true,
      balCode: rebuildBAL(orderEntitiesForChain(entities, chain), chain),
      summary: `Renamed "${oldName}" to "${nextName}".`,
      nextSelectedNodeId: nextName,
    };
  }

  // Add node
  if (matchesIntent(normalized, ['add', 'create', 'insert']) && matchesIntent(normalized, ['node', 'bot', 'agent', 'step', 'bb'])) {
    if (hasAdvancedCompositions) {
      return {
        applied: false,
        balCode: fallbackBalCode,
        summary: 'No changes applied.',
        error:
          'This workflow uses advanced BAL compositions. Add/insert operations must be edited in Code view for precise composition control.',
      };
    }

    const existingNames = new Set(entities.map((entity) => entity.name));
    const explicitName = extractNamedNode(instruction);
    const inferredName = explicitName
      ? toSnakeCase(explicitName)
      : inferNodeNameFromInstruction(instruction);
    const entityName = ensureUniqueEntityName(inferredName, existingNames);
    const goal = inferNodeGoalFromInstruction(instruction);
    const tools = inferToolNames(instruction);
    const output = inferOutputSchema(instruction);
    const selectedEntity = selectedIndex >= 0 ? entities[selectedIndex] : undefined;

    const nextConfig: Record<string, unknown> = {
      goal,
      tools,
    };
    if (output) {
      nextConfig.output = output;
    }

    const modelOverride = extractModelOverride(instruction);
    if (modelOverride) {
      nextConfig.model = modelOverride;
    } else if (typeof selectedEntity?.config.model === 'string') {
      nextConfig.model = selectedEntity.config.model;
    }

    entities.push({
      name: entityName,
      config: nextConfig,
    });

    if (chain.length === 0) {
      chain = entities.map((entity) => entity.name);
    } else {
      const requestedBefore = /\bbefore\b/i.test(instruction);
      let insertionIndex = chain.length;
      if (selectedNodeId) {
        const chainIndex = chain.indexOf(selectedNodeId);
        if (chainIndex >= 0) {
          insertionIndex = requestedBefore ? chainIndex : chainIndex + 1;
        }
      } else if (requestedBefore) {
        insertionIndex = 0;
      }
      chain.splice(insertionIndex, 0, entityName);
    }

    return {
      applied: true,
      balCode: rebuildBAL(orderEntitiesForChain(entities, chain), chain),
      summary: `Added "${entityName}" ${selectedNodeId ? 'to the flow' : 'as a new step'}.`,
      nextSelectedNodeId: entityName,
    };
  }

  // Tool edits
  if (matchesIntent(normalized, ['tool', 'tools'])) {
    if (!selectedNodeId || selectedIndex === -1) {
      return {
        applied: false,
        balCode: fallbackBalCode,
        summary: 'No changes applied.',
        error: 'Select a node first to edit tools.',
      };
    }

    const target = entities[selectedIndex]!;
    const existingTools = getEntityTools(target.config);
    const requestedTools = inferToolNames(instruction);
    if (requestedTools.length === 0) {
      return {
        applied: false,
        balCode: fallbackBalCode,
        summary: 'No changes applied.',
        error: 'Could not detect a tool name in that request.',
      };
    }

    const isRemove = matchesIntent(normalized, ['remove', 'delete', 'drop']);
    const isAdd = matchesIntent(normalized, ['add', 'include', 'enable', 'use']);

    if (!isRemove && !isAdd) {
      return {
        applied: false,
        balCode: fallbackBalCode,
        summary: 'No changes applied.',
        error: 'Use "add tool X" or "remove tool X".',
      };
    }

    const merged = isRemove
      ? existingTools.filter((tool) => !requestedTools.includes(tool))
      : Array.from(new Set([...existingTools, ...requestedTools]));

    target.config.tools = merged;
    entities[selectedIndex] = target;
    const updatedBalCode =
      hasAdvancedCompositions
        ? patchEntityBlockInSource(fallbackBalCode, target) ??
          rebuildBAL(orderEntitiesForChain(entities, chain), chain)
        : rebuildBAL(orderEntitiesForChain(entities, chain), chain);

    return {
      applied: true,
      balCode: updatedBalCode,
      summary: `${isRemove ? 'Removed' : 'Updated'} tool configuration for "${target.name}".`,
      nextSelectedNodeId: target.name,
    };
  }

  // Goal edits
  if (matchesIntent(normalized, ['goal', 'purpose']) || normalized.startsWith('make this') || normalized.startsWith('set this')) {
    if (!selectedNodeId || selectedIndex === -1) {
      return {
        applied: false,
        balCode: fallbackBalCode,
        summary: 'No changes applied.',
        error: 'Select a node first to update its goal.',
      };
    }
    const nextGoal = extractGoalOverride(instruction);
    if (!nextGoal) {
      return {
        applied: false,
        balCode: fallbackBalCode,
        summary: 'No changes applied.',
        error: 'Could not infer the goal text.',
      };
    }

    entities[selectedIndex]!.config.goal = nextGoal;
    const goalUpdatedEntity = entities[selectedIndex]!;
    const updatedBalCode =
      hasAdvancedCompositions
        ? patchEntityBlockInSource(fallbackBalCode, goalUpdatedEntity) ??
          rebuildBAL(orderEntitiesForChain(entities, chain), chain)
        : rebuildBAL(orderEntitiesForChain(entities, chain), chain);
    return {
      applied: true,
      balCode: updatedBalCode,
      summary: `Updated goal for "${entities[selectedIndex]!.name}".`,
      nextSelectedNodeId: entities[selectedIndex]!.name,
    };
  }

  // Model edits
  if (matchesIntent(normalized, ['model'])) {
    if (!selectedNodeId || selectedIndex === -1) {
      return {
        applied: false,
        balCode: fallbackBalCode,
        summary: 'No changes applied.',
        error: 'Select a node first to update its model.',
      };
    }
    const model = extractModelOverride(instruction);
    if (!model) {
      return {
        applied: false,
        balCode: fallbackBalCode,
        summary: 'No changes applied.',
        error: 'Could not detect a model id (example: openai:gpt-4o-mini).',
      };
    }
    entities[selectedIndex]!.config.model = model;
    const modelUpdatedEntity = entities[selectedIndex]!;
    const updatedBalCode =
      hasAdvancedCompositions
        ? patchEntityBlockInSource(fallbackBalCode, modelUpdatedEntity) ??
          rebuildBAL(orderEntitiesForChain(entities, chain), chain)
        : rebuildBAL(orderEntitiesForChain(entities, chain), chain);
    return {
      applied: true,
      balCode: updatedBalCode,
      summary: `Updated model for "${entities[selectedIndex]!.name}".`,
      nextSelectedNodeId: entities[selectedIndex]!.name,
    };
  }

  return {
    applied: false,
    balCode: fallbackBalCode,
    summary: 'No changes applied.',
    error: 'Could not interpret that request. Try: "add a bot here that verifies output", "delete this node", or "rename this node to reviewer".',
  };
}

/**
 * Apply a node change using pre-parsed entities (client-safe — no server imports).
 * Call parseBalEntities() server action first, then pass the result here.
 */
export function applyNodeChangeFromParsed(
  parsed: ParsedEntities,
  change: NodeChange,
  originalBalCode?: string
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
  if (change.changes.canRequest !== undefined) {
    updatedConfig.can_request = change.changes.canRequest;
  }
  if (change.changes.output !== undefined) {
    updatedConfig.output = change.changes.output;
  }

  const updatedEntities = entities.map((e, i) =>
    i === entityIndex ? { name: e.name, config: updatedConfig } : e
  );

  // Preserve advanced compositions (parallel/loop/route/etc) by patching only
  // the selected entity block when source BAL is available.
  if (originalBalCode && hasAdvancedCompositionSyntax(originalBalCode)) {
    const updatedEntity = updatedEntities[entityIndex];
    if (updatedEntity) {
      const patched = patchEntityBlockInSource(originalBalCode, updatedEntity);
      if (patched) {
        return patched;
      }
    }
  }

  // Fallback: full rebuild from parsed chain.
  return rebuildBAL(updatedEntities, chain);
}

function normalizeChain(
  chain: string[] | undefined,
  entities: Array<{ name: string }>
): string[] {
  const entityNames = new Set(entities.map((entity) => entity.name));
  const ordered = (chain ?? [])
    .filter((name) => entityNames.has(name))
    .filter((name, index, arr) => arr.indexOf(name) === index);

  if (ordered.length > 0) {
    for (const entity of entities) {
      if (!ordered.includes(entity.name)) {
        ordered.push(entity.name);
      }
    }
    return ordered;
  }

  return entities.map((entity) => entity.name);
}

function orderEntitiesForChain(
  entities: Array<{ name: string; config: Record<string, unknown> }>,
  chain: string[]
): Array<{ name: string; config: Record<string, unknown> }> {
  const map = new Map(entities.map((entity) => [entity.name, entity]));
  const ordered: Array<{ name: string; config: Record<string, unknown> }> = [];

  for (const name of chain) {
    const entity = map.get(name);
    if (entity) {
      ordered.push(entity);
      map.delete(name);
    }
  }

  for (const entity of map.values()) {
    ordered.push(entity);
  }

  return ordered;
}

function matchesIntent(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function toSnakeCase(value: string): string {
  return value
    .trim()
    .replace(/["']/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_') || 'new_bot';
}

function ensureUniqueEntityName(
  base: string,
  existingNames: Set<string>,
  ignoreName?: string
): string {
  const safeBase = toSnakeCase(base);
  if (!existingNames.has(safeBase) || safeBase === ignoreName) {
    return safeBase;
  }

  let suffix = 2;
  let candidate = `${safeBase}_${suffix}`;
  while (existingNames.has(candidate) && candidate !== ignoreName) {
    suffix += 1;
    candidate = `${safeBase}_${suffix}`;
  }
  return candidate;
}

function extractRenameTarget(instruction: string): string | null {
  const quoted = instruction.match(/["']([^"']+)["']/);
  if (quoted?.[1]) {
    return quoted[1].trim();
  }

  const match = instruction.match(
    /\b(?:rename|name|call)\b(?:\s+(?:this|the))?(?:\s+(?:node|bot|agent|step|bb))?(?:\s+to)?\s+([a-zA-Z][a-zA-Z0-9 _-]*)/i
  );

  const candidate = match?.[1]?.trim();
  return candidate && candidate.length > 0 ? candidate : null;
}

function extractNamedNode(instruction: string): string | null {
  const quoted = instruction.match(/\b(?:named|called)\s+["']([^"']+)["']/i);
  if (quoted?.[1]) {
    return quoted[1].trim();
  }

  const plain = instruction.match(/\b(?:named|called)\s+([a-zA-Z][a-zA-Z0-9 _-]*)/i);
  if (plain?.[1]) {
    return plain[1].trim();
  }

  return null;
}

function inferNodeNameFromInstruction(instruction: string): string {
  const lower = instruction.toLowerCase();
  if (lower.includes('verif')) return 'output_verifier';
  if (lower.includes('test')) return 'tester';
  if (lower.includes('monitor')) return 'monitor';
  if (lower.includes('notify')) return 'notifier';

  const goal = inferNodeGoalFromInstruction(instruction);
  const words = goal
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 3);
  return words.length > 0 ? words.join('_') : 'new_bot';
}

function inferNodeGoalFromInstruction(instruction: string): string {
  const quoted = instruction.match(/["']([^"']+)["']/);
  if (quoted?.[1]) {
    return sentenceCase(quoted[1].trim());
  }

  const thatMatch = instruction.match(/\b(?:that|to)\s+(.+)$/i);
  if (thatMatch?.[1]) {
    return sentenceCase(stripTrailingLocationPhrases(thatMatch[1]));
  }

  return 'Perform the requested workflow step.';
}

function stripTrailingLocationPhrases(text: string): string {
  return text
    .replace(/\b(?:here|before this|after this|before|after)\b.*$/i, '')
    .trim()
    .replace(/[.]+$/, '');
}

function sentenceCase(text: string): string {
  if (!text) return text;
  const trimmed = text.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function inferToolNames(instruction: string): string[] {
  const inferred = new Set<string>();
  const lower = instruction.toLowerCase();

  const quotedToolPattern = /["']([a-zA-Z][a-zA-Z0-9_:.-]*)["']/g;
  let quotedMatch: RegExpExecArray | null;
  while ((quotedMatch = quotedToolPattern.exec(instruction)) !== null) {
    const tool = quotedMatch[1];
    if (!tool) continue;
    if (tool.includes(':')) continue;
    if (tool.includes('_')) {
      inferred.add(toSnakeCase(tool));
    }
  }

  const snakePattern = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;
  let snakeMatch: RegExpExecArray | null;
  while ((snakeMatch = snakePattern.exec(lower)) !== null) {
    if (snakeMatch[0]) inferred.add(snakeMatch[0]);
  }

  // Common natural-language aliases
  const aliases: Array<[RegExp, string]> = [
    [/\bweb\s+search\b/i, 'web_search'],
    [/\bfetch\b|\bcrawl\b|\bvisit\s+url\b/i, 'fetch_url'],
    [/\bnotification|\bnotify\b/i, 'send_notification'],
    [/\bschedule|\bcron\b/i, 'schedule_task'],
    [/\bshared\s+storage\b/i, 'shared_storage'],
    [/\bmemory\b/i, 'store_memory'],
    [/\bspawn\b/i, 'spawn_baleybot'],
    [/\bcreate\s+agent\b/i, 'create_agent'],
    [/\bcreate\s+tool\b/i, 'create_tool'],
  ];

  for (const [pattern, tool] of aliases) {
    if (pattern.test(instruction)) {
      inferred.add(tool);
    }
  }

  return Array.from(inferred);
}

function inferOutputSchema(instruction: string): Record<string, string> | undefined {
  const lower = instruction.toLowerCase();
  if (lower.includes('verify') || lower.includes('validation') || lower.includes('check output')) {
    return {
      passed: 'boolean',
      reason: 'string',
    };
  }
  return undefined;
}

function getEntityTools(config: Record<string, unknown>): string[] {
  const raw = config.tools;
  if (!Array.isArray(raw)) return [];
  return raw.filter((tool): tool is string => typeof tool === 'string');
}

function extractGoalOverride(instruction: string): string | null {
  const quoted = instruction.match(/["']([^"']+)["']/);
  if (quoted?.[1]) {
    return sentenceCase(quoted[1].trim());
  }

  const match = instruction.match(
    /\b(?:set|change|update|make)\b(?:\s+(?:this|the))?(?:\s+(?:node|bot|agent|step))?(?:\s+goal)?(?:\s+(?:to|as|for))?\s+(.+)$/i
  );
  const candidate = match?.[1]
    ? stripTrailingLocationPhrases(match[1])
    : null;

  return candidate && candidate.length > 0 ? sentenceCase(candidate) : null;
}

function extractModelOverride(instruction: string): string | null {
  const modelMatch = instruction.match(/\b(openai|anthropic):[a-zA-Z0-9._:-]+\b/i);
  if (modelMatch?.[0]) {
    return modelMatch[0];
  }

  const lower = instruction.toLowerCase();
  if (/\bgpt[- ]?4o mini\b/.test(lower)) return 'openai:gpt-4o-mini';
  if (/\bgpt[- ]?4o\b/.test(lower)) return 'openai:gpt-4o';
  if (/\bclaude\b.*\bhaiku\b/.test(lower)) return 'anthropic:claude-3-5-haiku-20241022';
  if (/\bclaude\b.*\bsonnet\b/.test(lower)) return 'anthropic:claude-sonnet-4-20250514';
  return null;
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
      can_request: node.data.canRequest,
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
      lines.push(`  "tools": { ${(entity.config.tools as string[]).map((t) => `"${t}"`).join(', ')} },`);
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
