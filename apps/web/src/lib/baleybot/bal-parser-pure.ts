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
import {
  buildGraphFromParsed,
  graphToVisualGraph,
  type ParsedExpression,
} from './graph/build-graph';

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
  expression?: ParsedExpression;
  errors: string[];
}

export type TriggerType = 'manual' | 'schedule' | 'webhook' | 'other_bb' | 'db_event' | 'mcp_event' | 'file_upload';

export interface TriggerConfig {
  type: TriggerType;
  schedule?: string;
  sourceBaleybotId?: string;
  completionType?: 'success' | 'failure' | 'completion';
  webhookPath?: string;
  dbConnectionId?: string;
  dbTable?: string;
  dbEvent?: 'insert' | 'update' | 'delete' | 'change';
  mcpServer?: string;
  mcpTool?: string;
  mcpResource?: string;
  acceptedMimeTypes?: string[];
  maxFileSizeMb?: number;
  multiple?: boolean;
  payloadMode?: 'metadata' | 'inline_base64';
  enabled?: boolean;
}

export interface VisualNode {
  id: string;
  type:
    | 'baleybot'
    | 'bb_cluster'
    | 'bb_agent'
    | 'trigger'
    | 'datasource'
    | 'storage_bucket'
    | 'output';
  data: {
    name: string;
    goal: string;
    model?: string;
    trigger?: TriggerConfig;
    tools: string[];
    canRequest: string[];
    output?: Record<string, string>;
    runtimeStatus?: 'idle' | 'running' | 'success' | 'failed';
    kind?: string;
    parentId?: string;
    collapsed?: boolean;
    meta?: Record<string, unknown>;
  };
  position: { x: number; y: number };
}

export interface VisualEdge {
  id: string;
  source: string;
  target: string;
  type:
    | 'chain'
    | 'conditional_pass'
    | 'conditional_fail'
    | 'parallel'
    | 'loop'
    | 'spawn'
    | 'shared_data'
    | 'trigger'
    | 'runtime';
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

/**
 * BAL v2 compliance normalization.
 *
 * This intentionally performs no legacy rewrites (e.g. tools array brackets,
 * BAL v1 directives). Callers should provide BAL v2 syntax directly.
 */
export function normalizeBalCodeForCompatibility(balCode: string): string {
  return balCode;
}

function decodeEscapedString(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function extractStringList(raw: string): string[] {
  const quoted: string[] = [];
  const quotedRegex = /"((?:\\.|[^"\\])*)"/g;
  let quotedMatch: RegExpExecArray | null;

  while ((quotedMatch = quotedRegex.exec(raw)) !== null) {
    quoted.push(decodeEscapedString(quotedMatch[1] || ''));
  }

  if (quoted.length > 0) {
    return quoted;
  }

  const identifiers: string[] = [];
  const idRegex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
  let idMatch: RegExpExecArray | null;

  while ((idMatch = idRegex.exec(raw)) !== null) {
    if (idMatch[0]) {
      identifiers.push(idMatch[0]);
    }
  }

  return identifiers;
}

function propertyKeyPattern(key: string): string {
  return `(?:"${key}"|${key})\\s*:\\s*`;
}

function matchStringProperty(body: string, key: string): string | undefined {
  const match = body.match(new RegExp(`${propertyKeyPattern(key)}"((?:\\\\.|[^"\\\\])*)"`, 's'));
  return match?.[1] ? decodeEscapedString(match[1]) : undefined;
}

function matchNumberProperty(body: string, key: string): number | undefined {
  const match = body.match(new RegExp(`${propertyKeyPattern(key)}(-?\\d+(?:\\.\\d+)?)`));
  if (!match?.[1]) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function matchBooleanProperty(body: string, key: string): boolean | undefined {
  const match = body.match(new RegExp(`${propertyKeyPattern(key)}(true|false)`));
  if (!match?.[1]) return undefined;
  return match[1] === 'true';
}

function matchStringListProperty(body: string, key: string): string[] | undefined {
  const setMatch = body.match(new RegExp(`${propertyKeyPattern(key)}\\{([\\s\\S]*?)\\}`, 's'));
  if (setMatch?.[1] !== undefined) {
    return extractStringList(setMatch[1]);
  }

  const arrayMatch = body.match(new RegExp(`${propertyKeyPattern(key)}\\[([\\s\\S]*?)\\]`, 's'));
  if (arrayMatch?.[1] !== undefined) {
    return extractStringList(arrayMatch[1]);
  }

  const singleString = matchStringProperty(body, key);
  return singleString ? [singleString] : undefined;
}

function matchOutputProperty(body: string): Record<string, string> | undefined {
  const outputMatch = body.match(/"output"\s*:\s*\{([\s\S]*?)\}/);
  if (!outputMatch?.[1]) return undefined;

  const fields: Record<string, string> = {};
  const fieldRegex = /"([^"\\]+)"\s*:\s*"([^"\\]+)"/g;
  let fieldMatch: RegExpExecArray | null;

  while ((fieldMatch = fieldRegex.exec(outputMatch[1])) !== null) {
    const key = fieldMatch[1];
    const value = fieldMatch[2];
    if (key && value) {
      fields[key] = value;
    }
  }

  return Object.keys(fields).length > 0 ? fields : undefined;
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

function extractObjectPropertyRaw(body: string, key: string): string | undefined {
  const match = new RegExp(`${propertyKeyPattern(key)}\\{`, 's').exec(body);
  if (!match) return undefined;

  const openIndex = body.indexOf('{', match.index + match[0].length - 1);
  if (openIndex === -1) return undefined;

  const closeIndex = findMatchingDelimiter(body, openIndex, '{', '}');
  if (closeIndex === -1) return undefined;

  return body.slice(openIndex, closeIndex + 1);
}

function parseJsonLikeObject(raw: string): Record<string, unknown> | undefined {
  const candidates = [
    raw,
    raw.replace(/,\s*([}\]])/g, '$1'),
  ];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Keep trying candidates
    }
  }

  return undefined;
}

function matchObjectProperty(body: string, key: string): Record<string, unknown> | undefined {
  const raw = extractObjectPropertyRaw(body, key);
  return raw ? parseJsonLikeObject(raw) : undefined;
}

function extractLooseEntityConfig(entityBody: string): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  const goal = matchStringProperty(entityBody, 'goal');
  const model = matchStringProperty(entityBody, 'model');
  const tools = matchStringListProperty(entityBody, 'tools');
  const output = matchOutputProperty(entityBody);
  const history = matchStringProperty(entityBody, 'history');
  const maxTokens = matchNumberProperty(entityBody, 'maxTokens');
  const temperature = matchNumberProperty(entityBody, 'temperature');
  const retries = matchNumberProperty(entityBody, 'retries');
  const stopWhen = matchStringProperty(entityBody, 'stopWhen');
  const canRequest =
    matchStringListProperty(entityBody, 'can_request') ??
    matchStringListProperty(entityBody, 'needsApproval');
  const triggerString = matchStringProperty(entityBody, 'trigger');
  const triggerObject = matchObjectProperty(entityBody, 'trigger');
  const reasoningString = matchStringProperty(entityBody, 'reasoning');
  const reasoningBoolean = matchBooleanProperty(entityBody, 'reasoning');
  const reasoningObject = matchObjectProperty(entityBody, 'reasoning');

  if (goal !== undefined) config.goal = goal;
  if (model !== undefined) config.model = model;
  if (tools !== undefined) config.tools = tools;
  if (output !== undefined) config.output = output;
  if (history !== undefined) config.history = history;
  if (maxTokens !== undefined) config.maxTokens = maxTokens;
  if (temperature !== undefined) config.temperature = temperature;
  if (retries !== undefined) config.retries = retries;
  if (stopWhen !== undefined) config.stopWhen = stopWhen;
  if (canRequest !== undefined) config.can_request = canRequest;
  if (triggerString !== undefined) config.trigger = triggerString;
  else if (triggerObject !== undefined) config.trigger = triggerObject;
  if (reasoningString !== undefined) config.reasoning = { effort: reasoningString };
  else if (reasoningObject !== undefined) config.reasoning = reasoningObject;
  else if (reasoningBoolean !== undefined) config.reasoning = reasoningBoolean;

  return config;
}

function extractEntitiesLoosely(balCode: string): ParsedEntity[] {
  const entities: ParsedEntity[] = [];
  const reservedNames = new Set([
    'chain',
    'parallel',
    'if',
    'else',
    'loop',
    'run',
    'select',
    'merge',
    'map',
    'with',
  ]);

  let i = 0;
  while (i < balCode.length) {
    const char = balCode[i];
    if (!char || !/[a-zA-Z_]/.test(char)) {
      i++;
      continue;
    }

    const nameStart = i;
    i++;
    while (i < balCode.length && /[a-zA-Z0-9_]/.test(balCode[i] || '')) {
      i++;
    }
    const name = balCode.slice(nameStart, i);

    if (reservedNames.has(name)) {
      continue;
    }

    let cursor = i;
    while (cursor < balCode.length && /\s/.test(balCode[cursor] || '')) {
      cursor++;
    }

    if (balCode[cursor] !== '{') {
      i = nameStart + 1;
      continue;
    }

    const blockEnd = findMatchingDelimiter(balCode, cursor, '{', '}');
    if (blockEnd === -1) {
      break;
    }

    const entityBody = balCode.slice(cursor + 1, blockEnd);
    const config = extractLooseEntityConfig(entityBody);
    const hasRecognizedConfig = Object.keys(config).length > 0;
    const goal = config.goal;

    if (
      (typeof goal === 'string' && goal.trim().length > 0) ||
      hasRecognizedConfig
    ) {
      entities.push({ name, config });
    }

    i = blockEnd + 1;
  }

  return entities;
}

function extractChainLoosely(balCode: string, entityNames: Set<string>): string[] | undefined {
  const chainRegex = /\bchain\s*\{/g;
  let chainMatch: RegExpExecArray | null;

  while ((chainMatch = chainRegex.exec(balCode)) !== null) {
    const braceIndex = balCode.indexOf('{', chainMatch.index);
    if (braceIndex === -1) continue;

    const endIndex = findMatchingDelimiter(balCode, braceIndex, '{', '}');
    if (endIndex === -1) continue;

    const body = balCode.slice(braceIndex + 1, endIndex);
    const names: string[] = [];
    const seen = new Set<string>();

    const idRegex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
    let idMatch: RegExpExecArray | null;
    while ((idMatch = idRegex.exec(body)) !== null) {
      const name = idMatch[0];
      if (name && entityNames.has(name) && !seen.has(name)) {
        names.push(name);
        seen.add(name);
      }
    }

    if (names.length > 0) {
      return names;
    }
  }

  return undefined;
}

function mergeLooseCompatProperties(
  parsedEntities: ParsedEntity[],
  balCode: string
): ParsedEntity[] {
  const looseByName = new Map(
    extractEntitiesLoosely(balCode).map((entity) => [entity.name, entity] as const)
  );

  return parsedEntities.map((entity) => {
    const loose = looseByName.get(entity.name);
    if (!loose) return entity;

    return {
      ...entity,
      config: {
        ...entity.config,
        temperature: loose.config.temperature ?? entity.config.temperature,
        reasoning: loose.config.reasoning ?? entity.config.reasoning,
        stopWhen: loose.config.stopWhen ?? entity.config.stopWhen,
        retries: loose.config.retries ?? entity.config.retries,
        can_request: loose.config.can_request ?? entity.config.can_request,
        trigger: loose.config.trigger ?? entity.config.trigger,
      },
    };
  });
}

// ============================================================================
// PARSE BAL CODE (extracted from generator.ts)
// ============================================================================

/**
 * Extract pipeline order from AST root expression.
 * Walks ChainExpr, ParallelExpr, EntityRef, etc.
 */
type AstLikeNode = { type: string; [key: string]: unknown };

function getSourceSnippet(node: AstLikeNode | null | undefined, source: string): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const span = node.span as
    | { start?: { offset?: number }; end?: { offset?: number } }
    | undefined;
  const start = span?.start?.offset;
  const end = span?.end?.offset;
  if (typeof start !== 'number' || typeof end !== 'number' || start < 0 || end <= start) {
    return undefined;
  }
  return source.slice(start, end);
}

function normalizeConditionSnippet(snippet: string | undefined): string | undefined {
  if (!snippet) return undefined;
  const trimmed = snippet.trim();
  if (!trimmed) return undefined;
  return trimmed
    .replace(/^if\s*\(/i, '')
    .replace(/\)\s*\{$/, '')
    .replace(/^"|"$/g, '')
    .trim();
}

function astToParsedExpression(
  node: AstLikeNode | null,
  source: string
): ParsedExpression | undefined {
  if (!node) return undefined;

  if (node.type === 'EntityRef' || node.type === 'EntityRefWithContext') {
    const name = node.name;
    if (typeof name === 'string') {
      return { type: 'entity', name };
    }
    return undefined;
  }

  if (node.type === 'ChainExpr') {
    const body = (node.body as AstLikeNode[] | undefined) ?? [];
    return {
      type: 'chain',
      steps: body
        .map((child) => astToParsedExpression(child, source))
        .filter((child): child is ParsedExpression => Boolean(child)),
    };
  }

  if (node.type === 'ParallelExpr') {
    const body = (node.body as AstLikeNode[] | undefined) ?? [];
    return {
      type: 'parallel',
      branches: body
        .map((child) => astToParsedExpression(child, source))
        .filter((child): child is ParsedExpression => Boolean(child)),
    };
  }

  if (node.type === 'IfExpr') {
    const thenBranch = astToParsedExpression(node.thenBranch as AstLikeNode | null, source);
    if (!thenBranch) return undefined;
    const elseBranch = astToParsedExpression(node.elseBranch as AstLikeNode | null, source);
    return {
      type: 'if',
      condition: normalizeConditionSnippet(getSourceSnippet(node.condition as AstLikeNode | null, source)),
      pass: thenBranch,
      fail: elseBranch,
    };
  }

  if (node.type === 'LoopExpr') {
    const body = astToParsedExpression(node.body as AstLikeNode | null, source);
    if (!body) return undefined;
    const max = typeof node.max === 'number' ? node.max : undefined;
    return {
      type: 'loop',
      body,
      max,
      until: normalizeConditionSnippet(getSourceSnippet(node.until as AstLikeNode | null, source)),
    };
  }

  if (node.type === 'MapExpr') {
    const body = astToParsedExpression(node.body as AstLikeNode | null, source);
    if (!body) return undefined;
    return {
      type: 'map',
      iterable: getSourceSnippet(node.iterable as AstLikeNode | null, source),
      body,
    };
  }

  if (node.type === 'SelectExpr') {
    return {
      type: 'select',
      fields: ((node.fields as Array<{ name?: string }>) ?? [])
        .map((field) => field.name)
        .filter((name): name is string => Boolean(name)),
    };
  }

  if (node.type === 'MergeExpr') {
    const mappings: Record<string, string> = {};
    for (const mapping of (node.mappings as Array<{ key?: string; path?: string }> | undefined) ?? []) {
      if (!mapping?.key || !mapping.path) continue;
      mappings[mapping.key] = mapping.path;
    }
    return {
      type: 'merge',
      mappings,
    };
  }

  return undefined;
}

function extractPipelineFromAst(
  node: AstLikeNode | null
): { type: 'chain' | 'parallel' | 'single'; order: string[] } | null {
  if (!node) return null;

  const extractNames = (n: AstLikeNode): string[] => {
    if (n.type === 'EntityRef' && typeof n.name === 'string') return [n.name];
    if (n.type === 'EntityRefWithContext' && typeof n.name === 'string') return [n.name];
    const body = n.body as AstLikeNode[] | undefined;
    if (body && Array.isArray(body)) return body.flatMap(extractNames);
    const then = n.thenBranch as AstLikeNode | undefined;
    const els = n.elseBranch as AstLikeNode | undefined;
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

function detectLegacyBalSyntax(balCode: string): string[] {
  const checks: Array<{ label: string; pattern: RegExp }> = [
    { label: 'route()', pattern: /\broute\s*\(/i },
    { label: 'gate()', pattern: /\bgate\s*\(/i },
    { label: 'filter()', pattern: /\bfilter\s*\(/i },
    { label: 'processor()', pattern: /\bprocessor\s*\(/i },
    { label: 'when { ... }', pattern: /\bwhen\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\{/i },
    { label: 'try/catch', pattern: /\btry\s*(?:\(|\{)/i },
    { label: '@entity', pattern: /@entity\b/i },
    { label: '@run', pattern: /@run\b/i },
    { label: 'tools array []', pattern: /"tools"\s*:\s*\[/i },
  ];

  return checks
    .filter((check) => check.pattern.test(balCode))
    .map((check) => check.label);
}

/**
 * Parse BAL code and extract entity definitions.
 * Pure function with no server dependencies.
 */
export function parseBalCode(balCode: string): ParseResult {
  const legacySyntax = detectLegacyBalSyntax(balCode);
  if (legacySyntax.length > 0) {
    return {
      entities: [],
      chain: undefined,
      expression: undefined,
      errors: [
        `BAL v1 syntax is not supported: ${legacySyntax.join(', ')}. Use BAL v2 compositions (chain, parallel, if/else, loop, map, select, merge).`,
      ],
    };
  }

  const parseProgram = (source: string) => {
    const tokens = tokenize(source);
    return parse(tokens, source);
  };

  const strictToParsedEntities = (ast: ReturnType<typeof parseProgram>): ParsedEntity[] => {
    const parsedEntities: ParsedEntity[] = [];
    for (const entity of ast.entities.values()) {
      parsedEntities.push({
        name: entity.name,
        config: {
          goal: entity.goal,
          model: entity.model,
          tools: entity.tools ?? [],
          output: entity.output
            ? outputSchemaToRecord(
                entity.output as { fields: Array<{ name: string; fieldType: { kind: string } }> }
              )
            : undefined,
          history: entity.history,
          maxTokens: entity.maxTokens,
        },
      });
    }
    return parsedEntities;
  };

  const parseCandidates = [balCode];

  let lastError: unknown;
  for (const candidate of parseCandidates) {
    try {
      const ast = parseProgram(candidate);
      const strictEntities = strictToParsedEntities(ast);
      const mergedEntities = mergeLooseCompatProperties(strictEntities, balCode);
      const pipeline = extractPipelineFromAst(ast.root as { type: string; [key: string]: unknown } | null);
      const expression = astToParsedExpression(ast.root as AstLikeNode | null, candidate);
      const looseChain = extractChainLoosely(balCode, new Set(mergedEntities.map((e) => e.name)));
      return {
        entities: mergedEntities,
        chain: pipeline?.order ?? looseChain,
        expression,
        errors: [],
      };
    } catch (error) {
      lastError = error;
    }
  }

  // Last-resort mode: pull entities/config from raw BAL so Visual stays usable.
  const looseEntities = extractEntitiesLoosely(balCode);
  if (looseEntities.length > 0) {
    const looseChain = extractChainLoosely(balCode, new Set(looseEntities.map((e) => e.name)));
    return {
      entities: looseEntities,
      chain: looseChain,
      expression: looseChain
        ? {
            type: 'chain',
            steps: looseChain.map((name) => ({ type: 'entity', name })),
          }
        : undefined,
      errors: [],
    };
  }

  return {
    entities: [],
    chain: undefined,
    expression: undefined,
    errors: [lastError instanceof Error ? lastError.message : String(lastError)],
  };
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

  if (trimmed.startsWith('webhook:')) {
    const webhookPath = trigger.slice('webhook:'.length).trim();
    return { type: 'webhook', webhookPath };
  }

  if (trimmed.startsWith('schedule:')) {
    const schedule = trigger.slice('schedule:'.length).trim();
    return { type: 'schedule', schedule };
  }

  if (trimmed.startsWith('bb_completion:')) {
    const parts = trigger.slice('bb_completion:'.length).trim().split(':');
    const sourceBaleybotId = parts[0]?.trim();
    const completionType = parts[1]?.trim() as TriggerConfig['completionType'] | undefined;
    return {
      type: 'other_bb',
      ...(sourceBaleybotId ? { sourceBaleybotId } : {}),
      ...(completionType ? { completionType } : {}),
    };
  }

  if (trimmed.startsWith('db_event:')) {
    const parts = trigger.slice('db_event:'.length).trim().split(':');
    const dbConnectionId = parts[0]?.trim();
    const dbTable = parts[1]?.trim();
    const dbEvent = parts[2]?.trim() as TriggerConfig['dbEvent'] | undefined;
    return {
      type: 'db_event',
      ...(dbConnectionId ? { dbConnectionId } : {}),
      ...(dbTable ? { dbTable } : {}),
      ...(dbEvent ? { dbEvent } : {}),
    };
  }

  if (trimmed.startsWith('mcp_event:')) {
    const parts = trigger.slice('mcp_event:'.length).trim().split(':');
    const mcpServer = parts[0]?.trim();
    const mcpTool = parts[1]?.trim();
    const mcpResource = parts[2]?.trim();
    return {
      type: 'mcp_event',
      ...(mcpServer ? { mcpServer } : {}),
      ...(mcpTool ? { mcpTool } : {}),
      ...(mcpResource ? { mcpResource } : {}),
    };
  }

  if (trimmed === 'file_upload' || trimmed.startsWith('file_upload:')) {
    return { type: 'file_upload' };
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

  const parallelMatch = balCode.match(/parallel\s*\{([\s\S]*?)\}/);
  if (!parallelMatch) return edges;

  const branchNames: string[] = [];
  const seen = new Set<string>();
  const keywordSet = new Set([
    'parallel',
    'chain',
    'if',
    'else',
    'loop',
    'map',
    'select',
    'merge',
    'with',
    'run',
  ]);

  const idRegex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
  let match: RegExpExecArray | null;
  while ((match = idRegex.exec(parallelMatch[1] || '')) !== null) {
    const candidate = match[0];
    if (!candidate || keywordSet.has(candidate) || !nodeNames.has(candidate) || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    branchNames.push(candidate);
  }

  if (branchNames.length >= 2) {
    const source = branchNames[0]!;
    for (let i = 1; i < branchNames.length; i++) {
      const target = branchNames[i];
      if (!target) continue;
      edges.push({
        id: `parallel-${source}->${target}`,
        source,
        target,
        type: 'parallel',
        label: `branch_${i}`,
      });
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

  const ifMatch = balCode.match(/if\s*\([^)]*\)\s*\{([\s\S]*?)\}(?:\s*else\s*\{([\s\S]*?)\})?/);
  if (!ifMatch) return edges;

  const extractFirstNode = (block: string | undefined): string | null => {
    if (!block) return null;
    const idRegex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
    let match: RegExpExecArray | null;
    while ((match = idRegex.exec(block)) !== null) {
      const candidate = match[0];
      if (candidate && nodeNames.has(candidate)) {
        return candidate;
      }
    }
    return null;
  };

  const passTarget = extractFirstNode(ifMatch[1]);
  const failTarget = extractFirstNode(ifMatch[2]);
  const source = nodes[0]?.id;
  if (!source) {
    return edges;
  }
  if (passTarget) {
    edges.push({
      id: `${source}->pass->${passTarget}`,
      source,
      target: passTarget,
      type: 'conditional_pass',
      label: 'pass',
    });
  }
  if (failTarget) {
    edges.push({
      id: `${source}->fail->${failTarget}`,
      source,
      target: failTarget,
      type: 'conditional_fail',
      label: 'fail',
    });
  }

  return edges;
}

function parseLoopEdges(
  balCode: string,
  nodes: VisualNode[]
): VisualEdge[] {
  const edges: VisualEdge[] = [];
  const nodeNames = new Set(nodes.map((node) => node.id));
  const loopRegex = /\bloop\b/g;
  let loopMatch: RegExpExecArray | null;
  let loopIndex = 0;

  while ((loopMatch = loopRegex.exec(balCode)) !== null) {
    let cursor = loopMatch.index + loopMatch[0].length;
    while (cursor < balCode.length && /\s/.test(balCode[cursor] || '')) {
      cursor++;
    }

    let params = '';
    if (balCode[cursor] === '(') {
      const paramsEnd = findMatchingDelimiter(balCode, cursor, '(', ')');
      if (paramsEnd === -1) {
        continue;
      }
      params = balCode.slice(cursor + 1, paramsEnd);
      cursor = paramsEnd + 1;
      while (cursor < balCode.length && /\s/.test(balCode[cursor] || '')) {
        cursor++;
      }
    }

    if (balCode[cursor] !== '{') {
      continue;
    }

    const bodyEnd = findMatchingDelimiter(balCode, cursor, '{', '}');
    if (bodyEnd === -1) {
      continue;
    }

    const body = balCode.slice(cursor + 1, bodyEnd);
    const names: string[] = [];
    const seen = new Set<string>();
    const idRegex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
    let idMatch: RegExpExecArray | null;

    while ((idMatch = idRegex.exec(body)) !== null) {
      const name = idMatch[0];
      if (name && nodeNames.has(name) && !seen.has(name)) {
        names.push(name);
        seen.add(name);
      }
    }

    if (names.length === 0) {
      continue;
    }

    const source = names[names.length - 1];
    const target = names[0];
    if (!source || !target) {
      continue;
    }

    const labelParts: string[] = [];
    const untilMatch = params.match(/(?:"until"|until)\s*:\s*"((?:\\.|[^"\\])*)"/i);
    const maxMatch = params.match(/(?:"max"|max)\s*:\s*(\d+)/i);
    if (untilMatch?.[1]) {
      labelParts.push(`until ${decodeEscapedString(untilMatch[1])}`);
    }
    if (maxMatch?.[1]) {
      labelParts.push(`max ${maxMatch[1]}`);
    }

    edges.push({
      id: `loop-${source}->${target}-${loopIndex++}`,
      source,
      target,
      type: 'loop',
      animated: true,
      label: labelParts.length > 0 ? `loop (${labelParts.join(', ')})` : 'loop',
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
  return balToVisualFromParsed(balCode, parseBalCode(balCode));
}

/**
 * Convert BAL + parsed entities into the legacy visual graph contract.
 * This keeps compatibility for existing server actions/tests while V2 editor
 * uses canonical graph primitives directly.
 */
export function balToVisualFromParsed(
  balCode: string,
  parsed: ParseResult
): BalToVisualResult {
  const { entities, chain, errors } = parsed;

  if (entities.length === 0) {
    return { graph: { nodes: [], edges: [] }, errors };
  }

  const orderedNames = entities
    .map((entity) => entity.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
  const explicitChain = (Array.isArray(chain) ? chain : [])
    .filter((name): name is string => typeof name === 'string' && name.length > 0);

  const nodes: VisualNode[] = entities.map((entity, index) => {
    const config = entity.config ?? {};
    const rawTrigger = config.trigger;
    const trigger =
      typeof rawTrigger === 'string'
        ? parseTriggerString(rawTrigger) ?? undefined
        : (rawTrigger as TriggerConfig | undefined);

    return {
      id: entity.name,
      type: 'baleybot',
      position: calculatePosition(entity.name, explicitChain.length > 0 ? explicitChain : orderedNames, index, entities.length),
      data: {
        name: entity.name,
        goal: typeof config.goal === 'string' ? config.goal : '',
        model: typeof config.model === 'string' ? config.model : undefined,
        trigger,
        tools: Array.isArray(config.tools)
          ? config.tools.filter((tool): tool is string => typeof tool === 'string')
          : [],
        canRequest: Array.isArray(config.can_request)
          ? config.can_request.filter((value): value is string => typeof value === 'string')
          : [],
        output:
          config.output && typeof config.output === 'object'
            ? (config.output as Record<string, string>)
            : undefined,
      },
    };
  });

  const nodeNames = new Set(nodes.map((node) => node.id));
  const edges: VisualEdge[] = [];

  if (explicitChain.length > 1) {
    for (let i = 0; i < explicitChain.length - 1; i++) {
      const source = explicitChain[i];
      const target = explicitChain[i + 1];
      if (!source || !target || !nodeNames.has(source) || !nodeNames.has(target)) continue;
      edges.push({
        id: `${source}->${target}`,
        source,
        target,
        type: 'chain',
        label: 'chain',
      });
    }
  }

  edges.push(...parseParallelEdges(balCode, nodes));
  edges.push(...parseConditionalEdges(balCode, nodes));
  edges.push(...parseLoopEdges(balCode, nodes));
  edges.push(...generateSpawnEdges(nodes));
  edges.push(...generateSharedDataEdges(nodes));
  edges.push(...generateTriggerEdges(nodes));

  const uniqueEdges = new Map<string, VisualEdge>();
  for (const edge of edges) {
    if (!uniqueEdges.has(edge.id)) {
      uniqueEdges.set(edge.id, edge);
    }
  }

  return {
    graph: {
      nodes: autoLayout(nodes, Array.from(uniqueEdges.values())),
      edges: Array.from(uniqueEdges.values()),
    },
    errors,
  };
}
