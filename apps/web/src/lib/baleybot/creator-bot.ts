/**
 * Creator Bot Service
 *
 * The Creator Bot is an internal BaleyBot that helps users build other BaleyBots
 * through natural conversation. It executes through the standard BaleyBot path
 * with full execution tracking.
 */

import { runCreatorBot, runCreatorDiscovery } from './internal-bb/runner';
import { normalizeBalCodeForCompatibility, parseBalCode } from './bal-parser-pure';
import { runInternalOrchestrationLoop } from './internal-orchestration';
import {
  type CreatorOutput,
  type CreatorMessage,
  type CreatorStreamChunk,
} from './creator-types';
import type { GeneratorContext } from './types';
import {
  getToolCatalog,
  formatToolCatalogForCreatorBotCompact,
} from './tools/catalog-service';
import { getConnectionSummary } from './tools/requirements-scanner';
import { detectBalSkills, summarizeBalSkills } from './bal-skills';
import { sanitizeCreatorText } from './creator-sanitization';
import { createLogger } from '@/lib/logger';
import type { BaleybotStreamEvent } from '@baleybots/core';

const logger = createLogger('creator-bot');

const CREATOR_CONTEXT_MAX_EXISTING_BBS = 12;
const CREATOR_CONTEXT_MAX_HISTORY_MESSAGES = 16;
const CREATOR_CONTEXT_MAX_HISTORY_CHARS = 900;
const CREATOR_CONTEXT_MAX_ADDITIONAL_CHARS = 5000;

const CREATOR_SOFT_TEXT_MAX_CHARS = 12000;
const CREATOR_SOFT_QUESTION_LABEL_MAX_CHARS = 160;
const CREATOR_SOFT_QUESTION_DESCRIPTION_MAX_CHARS = 800;
const CREATOR_SOFT_ASSUMPTION_LABEL_MAX_CHARS = 140;
const CREATOR_SOFT_ASSUMPTION_VALUE_MAX_CHARS = 1200;
const CREATOR_SOFT_ASSUMPTION_LIMIT = 20;

const CREATOR_DISCOVERY_MAX_TOOL_NAMES = 32;
const CREATOR_DISCOVERY_MAX_EXISTING_BBS = 10;
const CREATOR_DISCOVERY_MAX_RECENT_USER_TURNS = 6;
const CREATOR_DISCOVERY_MAX_RECENT_USER_CHARS = 320;

interface DiscoveryQuestion {
  id: string;
  label: string;
  description: string;
  icon?: string;
  requiredNow?: boolean;
}

interface DiscoveryAssumption {
  id: string;
  label: string;
  value: string;
  confidence: 'low' | 'medium' | 'high';
  requiresConfirmation?: boolean;
}

interface DiscoveryConnectionContext {
  name: string;
  type: string;
  status: string;
  isDefault?: boolean;
}

interface DiscoveryAssessment {
  shouldBlock: boolean;
  blockMode: 'none' | 'soft' | 'hard';
  message?: string;
  questions: DiscoveryQuestion[];
  hardBlockers: DiscoveryQuestion[];
  softBlockers: DiscoveryQuestion[];
  assumptions: DiscoveryAssumption[];
  runnableConfidence: number;
  hasAssumptionConsent: boolean;
  contextNotes: string[];
}

interface DiscoveryHistorySnapshot {
  iteration: number;
  requiredNow: DiscoveryQuestion[];
  optionalLater: DiscoveryQuestion[];
}

interface CreatorValidationResult {
  success: boolean;
  output?: CreatorOutput;
  signature: string;
  errorMessage?: string;
  rawPreview?: string;
}

interface CreatorLoopState {
  attempts: number;
  bestOutput?: CreatorOutput;
  lastError?: string;
  lastRawPreview?: string;
  lastCycleError?: string;
}

interface CreatorCycleResult {
  prompt: string;
  validation: CreatorValidationResult;
}

export type CreatorProgressPhase =
  | 'discovery'
  | 'orchestration'
  | 'generation'
  | 'recovery'
  | 'complete';

export interface CreatorProgressEvent {
  phase: CreatorProgressPhase;
  message: string;
  highlight?: string;
  highlightType?: 'thinking' | 'tool' | 'loop' | 'status';
  toolName?: string;
  cycle?: number;
}

const PROGRESS_HIGHLIGHT_LIMIT = 200;

function truncateProgressHighlight(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= PROGRESS_HIGHLIGHT_LIMIT) return compact;
  return `${compact.slice(0, PROGRESS_HIGHLIGHT_LIMIT - 1).trimEnd()}...`;
}

function truncateCompactText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}...`;
}

function emitCreatorProgress(
  options: CreatorBotOptions,
  event: CreatorProgressEvent
): void {
  if (!options.onProgress) return;
  try {
    options.onProgress({
      ...event,
      message: truncateProgressHighlight(event.message),
      highlight: event.highlight ? truncateProgressHighlight(event.highlight) : undefined,
    });
  } catch (error) {
    logger.warn('creator progress callback failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function toProgressEventFromSegment(
  segment: BaleybotStreamEvent
): {
  message: string;
  highlight?: string;
  highlightType?: 'thinking' | 'tool' | 'loop' | 'status';
  toolName?: string;
} | null {
  switch (segment.type) {
    case 'reasoning': {
      const content = segment.content?.trim();
      if (!content) return null;
      return {
        message: 'Refining approach',
        highlight: content,
        highlightType: 'thinking',
      };
    }
    case 'tool_call_stream_start':
      return {
        message: `Preparing tool: ${segment.toolName}`,
        highlight: `Selecting ${segment.toolName} arguments`,
        highlightType: 'tool',
        toolName: segment.toolName,
      };
    case 'tool_execution_start':
      return {
        message: `Running tool: ${segment.toolName}`,
        highlight: `Executing ${segment.toolName}`,
        highlightType: 'tool',
        toolName: segment.toolName,
      };
    case 'tool_execution_output':
      return {
        message: segment.error
          ? `Tool failed: ${segment.toolName}`
          : `Tool complete: ${segment.toolName}`,
        highlight: segment.error
          ? segment.error
          : `Received output from ${segment.toolName}`,
        highlightType: 'tool',
        toolName: segment.toolName,
      };
    case 'tool_call_stream_error':
      return {
        message: 'Tool stream error',
        highlight: segment.error?.message || 'Unknown tool stream error',
        highlightType: 'tool',
      };
    case 'error':
      return {
        message: 'Generation error encountered',
        highlight:
          segment.error instanceof Error
            ? segment.error.message
            : segment.error?.message || 'Unknown generation error',
        highlightType: 'status',
      };
    default:
      return null;
  }
}

function validateCreatorCandidate(candidate: CreatorOutput): CreatorValidationResult {
  const compactedCandidate = compactCreatorOutputForUser(candidate);

  if (candidate.status === 'building') {
    return {
      success: true,
      signature: 'building_needs_input',
      output: compactedCandidate,
    };
  }

  const normalizedBalCode = normalizeBalCodeForCompatibility(compactedCandidate.balCode);
  const normalizedParse = parseBalCode(normalizedBalCode);

  if (normalizedParse.entities.length === 0 || normalizedParse.errors.length > 0) {
    return {
      success: false,
      signature: 'bal_compatibility_failed',
      errorMessage: normalizedParse.errors.join('; ') || 'No entities were parsed',
      rawPreview: normalizedBalCode.slice(0, 600),
    };
  }

    return {
      success: true,
      signature: 'success',
      output: {
        ...compactedCandidate,
        balCode: normalizedBalCode,
      },
    };
}

function compactCreatorOutputForUser(output: CreatorOutput): CreatorOutput {
  const softCap = (value: string, maxLength: number): string =>
    truncateCompactText(value, maxLength);

  return {
    ...output,
    thinking:
      typeof output.thinking === 'string'
        ? softCap(output.thinking, CREATOR_SOFT_TEXT_MAX_CHARS)
        : output.thinking,
    message:
      typeof output.message === 'string'
        ? softCap(output.message, CREATOR_SOFT_TEXT_MAX_CHARS)
        : output.message,
    questions: output.questions?.map((question) => ({
      ...question,
      label: softCap(question.label, CREATOR_SOFT_QUESTION_LABEL_MAX_CHARS),
      description: truncateCompactText(
        question.description,
        CREATOR_SOFT_QUESTION_DESCRIPTION_MAX_CHARS
      ),
    })),
    assumptions: output.assumptions
      ?.slice(0, CREATOR_SOFT_ASSUMPTION_LIMIT)
      .map((assumption) => ({
        ...assumption,
        label: softCap(
          assumption.label,
          CREATOR_SOFT_ASSUMPTION_LABEL_MAX_CHARS
        ),
        value: softCap(
          assumption.value,
          CREATOR_SOFT_ASSUMPTION_VALUE_MAX_CHARS
        ),
      })),
  };
}

function buildCreatorRepairPrompt(args: {
  originalUserMessage: string;
  previousPrompt: string;
  lastError?: string;
  lastRawPreview?: string;
}): string {
  const pieces = [
    'Repair the previous creator response and return a valid response in the exact required JSON schema.',
    '',
    `Original user request: ${args.originalUserMessage}`,
    '',
    'Previous request sent to creator:',
    args.previousPrompt,
  ];

  if (args.lastError) {
    pieces.push('', `Validation error to fix: ${args.lastError}`);
  }

  if (args.lastRawPreview) {
    pieces.push('', 'Previous malformed output preview:', args.lastRawPreview);
  }

  pieces.push(
    '',
    'Requirements:',
    '- Return valid JSON matching the creator schema exactly.',
    '- Ensure balCode parses and is visualizer-compatible.',
    '- For multi-entity outputs, include a composition block (chain/parallel/if/etc).',
    '- Do not include unsupported entity properties: temperature, reasoning, stopWhen, retries, can_request, trigger.'
  );

  return pieces.join('\n');
}

// ============================================================================
// DISCOVERY GATE
// ============================================================================

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function hasExplicitBuildIntent(userMessage: string): boolean {
  const lower = userMessage.trim().toLowerCase();
  if (!lower) return false;

  const buildIntentPatterns = [
    'create',
    'build',
    'make',
    'generate',
    'design',
    'draft',
    'set up',
    'setup',
    'spin up',
    'implement',
    'turn this into',
    'convert this into',
  ];

  return includesAny(lower, buildIntentPatterns);
}

function isExploratoryCreatorPrompt(userMessage: string): boolean {
  const lower = userMessage.trim().toLowerCase();
  if (!lower) return false;
  if (hasExplicitBuildIntent(lower)) return false;

  const startsWithQuestion = /^(how|what|why|can|could|would|should|do|does|is|are|when|where)\b/.test(
    lower
  );
  const exploratorySignals = includesAny(lower, [
    'help me understand',
    'walk me through',
    'what do you recommend',
    'how should we',
    'what should we',
    'what happens next',
    'best approach',
  ]);

  return startsWithQuestion || lower.includes('?') || exploratorySignals;
}

function extractUserTranscript(options: CreatorBotOptions, userMessage: string): string {
  const priorUserTurns = (options.conversationHistory ?? [])
    .filter((msg) => msg.role === 'user')
    .map((msg) => msg.content.trim())
    .filter(Boolean);

  return [...priorUserTurns, userMessage.trim()].filter(Boolean).join('\n');
}

function extractLikelyTableNames(text: string): string[] {
  const matches = new Set<string>();
  const patterns = [
    /\btable\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/gi,
    /\bcollection\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/gi,
    /\bview\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/gi,
    /\b[a-zA-Z_][a-zA-Z0-9_]*\.([a-zA-Z_][a-zA-Z0-9_]*)\b/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match[0]?.includes('.') && match[0].split('.').length === 2) {
        const table = match[0].split('.')[0];
        if (table) {
          matches.add(table.toLowerCase());
        }
        continue;
      }
      if (match[1]) {
        matches.add(match[1].toLowerCase());
      }
    }
  }

  return [...matches];
}

function inferDraftName(userMessage: string): string {
  const compact = userMessage
    .replace(/[^\w\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(' ');
  if (!compact) return 'Draft BaleyBot';
  return compact
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 64);
}

function buildDiscoveryMessage(params: {
  requiredNow: DiscoveryQuestion[];
  optionalLater: DiscoveryQuestion[];
  preface?: string;
}): string {
  const { requiredNow, optionalLater, preface } = params;
  const normalizedPreface = (() => {
    const trimmed = preface?.trim();
    if (!trimmed) return undefined;
    const singleLine = trimmed.replace(/\s+/g, ' ');
    const looksLikeChecklist =
      /[\u2022]|^\s*[-*]\s/m.test(trimmed) ||
      /\[(required|later|assumption|confidence)\]/i.test(trimmed) ||
      trimmed.split('\n').length > 2;
    if (looksLikeChecklist || singleLine.length > 220) return undefined;
    return singleLine;
  })();
  const lines: string[] = [];
  const nextRequired = requiredNow[0];
  const firstOptional = optionalLater[0];

  if (normalizedPreface) {
    lines.push(normalizedPreface);
  }

  if (nextRequired) {
    lines.push(
      `To keep this moving, I need one detail: **${nextRequired.label}**`,
      nextRequired.description
    );
  } else if (firstOptional) {
    lines.push(
      'I can build a first version now. Helpful next detail:',
      `**${firstOptional.label}**: ${firstOptional.description}`
    );
  } else {
    lines.push('I can proceed to generation now.');
  }

  return lines.join('\n\n');
}

function isLikelyOptionalDiscoveryQuestion(question: DiscoveryQuestion): boolean {
  const text = `${question.label} ${question.description}`.toLowerCase();
  return includesAny(text, [
    'output destination',
    'notification destination',
    'delivery',
    'where should alerts go',
    'channel',
    'integration',
    'slack',
    'email',
    'webhook destination',
    'credential',
    'api key',
    'auth key',
    'trigger mode',
    'schedule',
    'cadence',
    'polling',
    'token',
    'secret',
  ]);
}

function normalizeQuestionUrgency(question: DiscoveryQuestion): DiscoveryQuestion {
  if (question.requiredNow !== undefined) {
    return question;
  }

  return {
    ...question,
    requiredNow: !isLikelyOptionalDiscoveryQuestion(question),
  };
}

function dedupeDiscoveryQuestions(questions: DiscoveryQuestion[]): DiscoveryQuestion[] {
  const seen = new Set<string>();
  const deduped: DiscoveryQuestion[] = [];

  for (const raw of questions) {
    const question = normalizeQuestionUrgency(raw);
    const key = `${question.label.toLowerCase()}::${question.description.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(question);
  }

  return deduped;
}

function toDiscoveryQuestionId(label: string, index: number): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || `question-${index + 1}`;
}

function coerceDiscoveryQuestions(rawQuestions: unknown): DiscoveryQuestion[] {
  if (!Array.isArray(rawQuestions)) return [];

  const normalized: DiscoveryQuestion[] = [];

  for (let index = 0; index < rawQuestions.length; index += 1) {
    const question = rawQuestions[index];
    if (!question) continue;

    if (typeof question === 'string') {
      const text = question.trim();
      if (!text) continue;
      const [rawLabel, ...rest] = text.split(':');
      const hasSplit = rawLabel && rest.length > 0;
      const label = hasSplit ? rawLabel.trim() : `Required Detail ${index + 1}`;
      const description = hasSplit ? rest.join(':').trim() : text;
      normalized.push({
        id: toDiscoveryQuestionId(label, index),
        label,
        description,
      });
      continue;
    }

    if (typeof question !== 'object' || Array.isArray(question)) continue;
    const record = question as Record<string, unknown>;

    const labelCandidate =
      typeof record.label === 'string'
        ? record.label
        : typeof record.title === 'string'
          ? record.title
          : typeof record.question === 'string'
            ? record.question
            : '';
    const descriptionCandidate =
      typeof record.description === 'string'
        ? record.description
        : typeof record.detail === 'string'
          ? record.detail
          : typeof record.prompt === 'string'
            ? record.prompt
            : typeof record.question === 'string'
              ? record.question
              : '';

    const label = labelCandidate.trim();
    const description = descriptionCandidate.trim();
    if (!label || !description) continue;

    const requiredNow =
      typeof record.requiredNow === 'boolean'
        ? record.requiredNow
        : typeof record.required === 'boolean'
          ? record.required
          : undefined;

    normalized.push({
      id:
        typeof record.id === 'string' && record.id.trim().length > 0
          ? record.id.trim()
          : toDiscoveryQuestionId(label, index),
      label,
      description,
      icon:
        typeof record.icon === 'string' && record.icon.trim().length > 0
          ? record.icon.trim()
          : undefined,
      requiredNow,
    });
  }

  return normalized;
}

function extractLatestDiscoverySnapshot(
  history: CreatorMessage[] | undefined
): DiscoveryHistorySnapshot | null {
  if (!history || history.length === 0) return null;

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    if (!message || message.role !== 'assistant') continue;

    const lifecycle = message.metadata?.creatorLifecycle;
    if (!lifecycle || lifecycle.stage !== 'discovery') continue;

    const requiredNow = dedupeDiscoveryQuestions(
      coerceDiscoveryQuestions(lifecycle.requiredQuestions).map((question) => ({
        ...question,
        requiredNow: true,
      }))
    );
    const optionalLater = dedupeDiscoveryQuestions(
      coerceDiscoveryQuestions(lifecycle.optionalQuestions).map((question) => ({
        ...question,
        requiredNow: false,
      }))
    );

    return {
      iteration:
        typeof lifecycle.iteration === 'number' && Number.isFinite(lifecycle.iteration)
          ? lifecycle.iteration
          : 1,
      requiredNow,
      optionalLater,
    };
  }

  return null;
}

function isLikelyAcknowledgementReply(userMessage: string): boolean {
  const normalized = userMessage.trim().toLowerCase();
  if (!normalized) return true;

  const ackPhrases = [
    'ok',
    'okay',
    'kk',
    'yes',
    'yep',
    'yeah',
    'sure',
    'sounds good',
    'go ahead',
    'continue',
    'proceed',
    'do it',
    'next',
    'cool',
    'great',
  ];

  if (ackPhrases.includes(normalized)) return true;
  if (ackPhrases.some((phrase) => normalized === `${phrase}.` || normalized === `${phrase}!`)) {
    return true;
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= 3 && ackPhrases.some((phrase) => normalized.includes(phrase))) {
    return true;
  }

  return false;
}

function normalizeDiscoveryAssistantMessage(message: string | undefined): string | undefined {
  if (!message) return undefined;
  const compact = message.trim().replace(/\n{3,}/g, '\n\n');
  if (!compact) return undefined;

  const looksChecklist =
    /\[(required|later|assumption|confidence)\]/i.test(compact) ||
    (/(?:^|\n)\s*(?:[-*]|\d+\.)\s+/m.test(compact) &&
      compact.split('\n').length > 8);

  if (looksChecklist) return undefined;
  if (compact.length > 900) {
    return `${compact.slice(0, 897).trimEnd()}...`;
  }

  return compact;
}

function normalizeDiscoveryToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isMeaningfulDiscoveryAnswer(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;

  const placeholders = new Set([
    'n/a',
    'na',
    'none',
    'unknown',
    'unsure',
    'not sure',
    'idk',
    'tbd',
    'later',
    '-',
    '?',
  ]);

  return !placeholders.has(normalized);
}

const DISCOVERY_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'to',
  'for',
  'of',
  'in',
  'on',
  'with',
  'from',
  'that',
  'this',
  'should',
  'would',
  'could',
  'can',
  'now',
  'later',
  'required',
  'optional',
  'detail',
  'details',
  'which',
  'what',
  'where',
  'when',
  'how',
  'please',
  'need',
  'needs',
  'value',
  'values',
  'configure',
  'configuration',
]);

function tokenizeDiscoveryText(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !DISCOVERY_STOPWORDS.has(token));
}

function extractDiscoveryQuestionExamples(question: DiscoveryQuestion): string[] {
  const source = `${question.label} ${question.description}`;
  const match = source.match(
    /\b(?:for example|for instance|e\.g\.)\s*:?\s*([^)?.\n]+)/i
  );
  if (!match?.[1]) return [];

  return match[1]
    .split(/,|\/|\bor\b|\band\b/gi)
    .map((token) => token.trim().replace(/["']/g, ''))
    .filter((token) => token.length > 1);
}

function isInclusiveDiscoveryAnswer(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;

  if (
    includesAny(normalized, [
      'all of the above',
      'all of it',
      'all of those',
      'all of them',
      'everything',
      'all metrics',
      'all areas',
      'full scope',
      'all categories',
    ])
  ) {
    return true;
  }

  return /^all(?:\s+of\s+(?:it|that|them|those))?[.!]?$/.test(normalized);
}

function extractRecentUserMessages(history: CreatorMessage[] | undefined): string[] {
  if (!history?.length) return [];

  return history
    .filter((message) => message.role === 'user')
    .map((message) => message.content.trim())
    .filter(Boolean)
    .slice(-8);
}

function parseLabeledDiscoveryAnswers(
  userMessage: string
): Array<{ key: string; value: string }> {
  const answers: Array<{ key: string; value: string }> = [];
  const pattern = /^\s*(?:[-*]\s*)?([^:=\n]{2,80})\s*(?::|=|->)\s*(.+)\s*$/gm;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(userMessage)) !== null) {
    const rawKey = match[1]?.trim() ?? '';
    const rawValue = match[2]?.trim() ?? '';
    if (!rawKey || !isMeaningfulDiscoveryAnswer(rawValue)) continue;

    answers.push({
      key: normalizeDiscoveryToken(rawKey),
      value: rawValue,
    });
  }

  return answers;
}

function isDiscoveryQuestionAnsweredByKey(
  question: DiscoveryQuestion,
  answerKey: string
): boolean {
  const questionLabel = normalizeDiscoveryToken(question.label);
  const questionId = normalizeDiscoveryToken(question.id);

  if (!answerKey) return false;
  if (
    answerKey === questionLabel ||
    answerKey === questionId ||
    questionLabel.includes(answerKey) ||
    answerKey.includes(questionLabel) ||
    questionId.includes(answerKey) ||
    answerKey.includes(questionId)
  ) {
    return true;
  }

  const keyTokens = answerKey.split('-').filter((token) => token.length > 2);
  const labelTokens = questionLabel
    .split('-')
    .filter((token) => token.length > 2);

  if (keyTokens.length === 0 || labelTokens.length === 0) {
    return false;
  }

  const overlap = keyTokens.filter((token) => labelTokens.includes(token)).length;
  return overlap >= Math.min(2, keyTokens.length, labelTokens.length);
}

function isOutcomeCriticalDiscoveryQuestion(question: DiscoveryQuestion): boolean {
  const text = `${question.id} ${question.label} ${question.description}`.toLowerCase();

  const setupPatterns = [
    'database source',
    'db source',
    'data source',
    'source system',
    'signup signal',
    'table',
    'field',
    'column',
    'metrics focus',
    'status update focus',
    'weekly update focus',
    'credential',
    'api key',
    'auth key',
    'token',
    'secret',
    'webhook',
    'slack',
    'email',
    'destination',
    'channel',
    'trigger mode',
    'schedule',
    'poll',
    'mcp',
  ];

  if (includesAny(text, setupPatterns)) {
    return false;
  }

  const outcomePatterns = [
    'outcome',
    'success criteria',
    'must happen',
    'expected result',
    'business rule',
    'decision rule',
    'approval policy',
    'acceptance',
    'threshold',
  ];

  if (includesAny(text, outcomePatterns)) {
    return true;
  }

  // Default to blocking for unknown question categories.
  return true;
}

function isExecutionCriticalDiscoveryQuestion(question: DiscoveryQuestion): boolean {
  const text = `${question.id} ${question.label} ${question.description}`.toLowerCase();
  return includesAny(text, [
    'activity data source',
    'data source',
    'database source',
    'db source',
    'source system',
    'signup signal',
    'table',
    'field',
    'column',
    'api endpoint',
    'endpoint',
    'mcp source',
    'mcp server',
    'mcp tool',
    'mcp resource',
  ]);
}

function hasAssumptionConsent(params: {
  userMessage: string;
  answerHistory: string[];
}): boolean {
  const transcript = [params.userMessage, ...params.answerHistory.slice(-3)]
    .join('\n')
    .toLowerCase();

  return includesAny(transcript, [
    'continue with defaults',
    'use defaults',
    'safe defaults',
    'best-practice defaults',
    'best practice defaults',
    'use default guidance',
    'you decide',
    'you choose',
    'pick the best option',
    'assume',
    'not sure, use default guidance',
    'for unanswered fields, use safe defaults',
  ]);
}

function buildDiscoveryAssumption(params: {
  question: DiscoveryQuestion;
  workspaceConnections: DiscoveryConnectionContext[];
}): DiscoveryAssumption | null {
  const text = `${params.question.id} ${params.question.label} ${params.question.description}`.toLowerCase();

  if (includesAny(text, ['database source', 'db source', 'activity data source', 'source system'])) {
    const connectedDatabases = params.workspaceConnections.filter(
      (connection) =>
        (connection.type === 'postgres' || connection.type === 'mysql') &&
        connection.status === 'connected'
    );
    const defaultDatabase = connectedDatabases.find((connection) => connection.isDefault);

    if (connectedDatabases.length === 1) {
      return {
        id: params.question.id,
        label: params.question.label,
        value: `Use "${connectedDatabases[0]!.name}" as the primary data source.`,
        confidence: 'high',
      };
    }

    if (defaultDatabase) {
      return {
        id: params.question.id,
        label: params.question.label,
        value: `Use default source "${defaultDatabase.name}" for the initial build.`,
        confidence: 'medium',
        requiresConfirmation: true,
      };
    }

    return null;
  }

  if (includesAny(text, ['trigger mode', 'polling', 'schedule', 'cadence'])) {
    return {
      id: params.question.id,
      label: params.question.label,
      value: 'Start with a safe scheduled trigger cadence and refine in Connections.',
      confidence: 'medium',
      requiresConfirmation: true,
    };
  }

  if (includesAny(text, ['output destination', 'destination', 'alerts go', 'audience'])) {
    return {
      id: params.question.id,
      label: params.question.label,
      value: 'Deliver results via in-app notifications until a destination is configured.',
      confidence: 'medium',
      requiresConfirmation: true,
    };
  }

  if (includesAny(text, ['status update focus', 'weekly update focus', 'which metrics'])) {
    return {
      id: params.question.id,
      label: params.question.label,
      value: 'Draft updates using headline metrics (volume, trend, anomalies) by default.',
      confidence: 'low',
      requiresConfirmation: true,
    };
  }

  return null;
}

function computeDiscoveryRunnableConfidence(params: {
  hardBlockers: DiscoveryQuestion[];
  softBlockers: DiscoveryQuestion[];
  assumptions: DiscoveryAssumption[];
  hasAssumptionConsent: boolean;
}): number {
  if (params.hardBlockers.length > 0) {
    return 0.2;
  }

  if (params.softBlockers.length === 0) {
    return 0.95;
  }

  const assumptionCoverage =
    params.assumptions.length / Math.max(params.softBlockers.length, 1);

  if (assumptionCoverage >= 1) {
    return params.hasAssumptionConsent ? 0.84 : 0.78;
  }

  if (assumptionCoverage >= 0.5) {
    return 0.72;
  }

  return 0.64;
}

function isDiscoveryQuestionAnsweredByFreeform(params: {
  question: DiscoveryQuestion;
  text: string;
  workspaceConnections: DiscoveryConnectionContext[];
}): boolean {
  const { question, text, workspaceConnections } = params;
  const normalizedText = text.trim().toLowerCase();
  if (!normalizedText || isLikelyAcknowledgementReply(normalizedText)) {
    return false;
  }

  const questionText = `${question.id} ${question.label} ${question.description}`.toLowerCase();
  const hasUrl = /https?:\/\/\S+/.test(normalizedText) || /(^|\s)\/api\/[^\s]+/.test(normalizedText);
  const connectionNames = workspaceConnections
    .map((connection) => connection.name.toLowerCase().trim())
    .filter(Boolean);

  const hasDbProviderHint = /\b(postgres(?:ql)?|mysql|mariadb|sqlite|mongodb|snowflake|bigquery)\b/.test(
    normalizedText
  );
  const hasNamedConnectionHint = /\b(?:database|db|connection)\s*(?:is|=|:|named|called|use|using)\s+[a-z0-9][a-z0-9 _-]{1,60}\b/.test(
    normalizedText
  );
  const mentionsKnownConnection = connectionNames.some((name) => normalizedText.includes(name));
  const hasDbSourceSignal = hasDbProviderHint || hasNamedConnectionHint || mentionsKnownConnection;

  const hasTableFieldSignal =
    /\b[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\b/.test(normalizedText) ||
    (/\btable\s+[a-z_][a-z0-9_]*\b/.test(normalizedText) &&
      /\b(field|column|status|created_at|timestamp|condition|where)\b/.test(normalizedText));

  const hasTriggerModeSignal = includesAny(normalizedText, [
    'every ',
    'hourly',
    'daily',
    'weekly',
    'cron',
    'schedule',
    'interval',
    'poll',
    'real-time',
    'realtime',
    'event-driven',
    'on insert',
    'on create',
    'webhook',
  ]);

  const hasDestinationSignal = includesAny(normalizedText, [
    'notify',
    'notification',
    'email',
    'slack',
    'discord',
    'sms',
    'webhook',
    'teams',
    'pagerduty',
    'dashboard',
    'in-app',
    'store',
    'write back',
  ]);
  const hasNamedTableSignal = /\b(table|view|collection|bucket)\s+[a-z_][a-z0-9_]{1,}\b/.test(
    normalizedText
  );
  const hasSpecificApiSignal =
    hasUrl ||
    /\b(api|endpoint)\s*(is|=|:|at)\s+\S+/.test(normalizedText);
  const hasStorageProviderSignal = includesAny(normalizedText, [
    'postgres',
    'mysql',
    'mariadb',
    'sqlite',
    'mongodb',
    'snowflake',
    'bigquery',
    's3',
    'spreadsheet',
    'google sheet',
    'google sheets',
    'csv',
    'airtable',
    'notion',
    'warehouse',
  ]);
  const hasExplicitDataSourceHint =
    hasDbSourceSignal ||
    hasSpecificApiSignal ||
    hasStorageProviderSignal ||
    hasNamedTableSignal;
  const hasMetricFocusSignal = includesAny(normalizedText, [
    'kpi',
    'kpis',
    'metric',
    'metrics',
    'signups',
    'registrations',
    'conversions',
    'retention',
    'churn',
    'active users',
    'dau',
    'mau',
    'revenue',
    'errors',
      'incidents',
      'uptime',
      'latency',
  ]) ||
    /\b[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\b/.test(normalizedText);
  const hasInclusiveAnswer = isInclusiveDiscoveryAnswer(normalizedText);
  const questionExamples = extractDiscoveryQuestionExamples(question);

  if (isOutcomeCriticalDiscoveryQuestion(question)) {
    const hasExplicitAssignment = /\b(?:policy|rule|behavior|outcome)\s*(?:is|=|:)\b/.test(
      normalizedText
    );
    const hasConditionalDirective =
      /\b(if|when)\b/.test(normalizedText) &&
      /\b(then|else|approve|reject|escalate|notify|route)\b/.test(normalizedText);
    const hasThresholdPolicy =
      /\b(threshold|below|above|greater|less|confidence)\b/.test(normalizedText) &&
      /\b(should|must|will)\b/.test(normalizedText);

    if (!(hasExplicitAssignment || hasConditionalDirective || hasThresholdPolicy)) {
      return false;
    }
  }

  if (includesAny(questionText, ['database source', 'db source', 'which database'])) {
    return hasDbSourceSignal;
  }

  if (includesAny(questionText, ['signup signal', 'table', 'field', 'column'])) {
    return hasTableFieldSignal;
  }

  if (includesAny(questionText, ['api endpoint', 'endpoint', 'service url'])) {
    return hasUrl || includesAny(normalizedText, ['endpoint is', 'api is', 'service is']);
  }

  if (includesAny(questionText, ['trigger mode', 'polling', 'schedule', 'event'])) {
    return hasTriggerModeSignal;
  }

  if (includesAny(questionText, ['output destination', 'destination', 'alerts go', 'notification'])) {
    return hasDestinationSignal || hasUrl;
  }

  if (includesAny(questionText, ['mcp source', 'mcp server', 'mcp tool', 'mcp resource'])) {
    return (
      includesAny(normalizedText, ['mcp']) &&
      includesAny(normalizedText, ['server', 'tool', 'resource'])
    );
  }

  if (includesAny(questionText, ['activity data source', 'data source', 'source system'])) {
    return hasExplicitDataSourceHint;
  }

  if (includesAny(questionText, ['status update focus', 'weekly update focus', 'which metrics'])) {
    return hasMetricFocusSignal || (hasInclusiveAnswer && questionExamples.length > 0);
  }

  const questionTokens = new Set(tokenizeDiscoveryText(questionText));
  const messageTokens = tokenizeDiscoveryText(normalizedText);
  if (questionTokens.size === 0 || messageTokens.length === 0) return false;

  let overlap = 0;
  for (const token of messageTokens) {
    if (questionTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap >= 2 && messageTokens.length >= 5;
}

function isSameDiscoveryQuestion(a: DiscoveryQuestion, b: DiscoveryQuestion): boolean {
  const aId = normalizeDiscoveryToken(a.id);
  const bId = normalizeDiscoveryToken(b.id);
  const aLabel = normalizeDiscoveryToken(a.label);
  const bLabel = normalizeDiscoveryToken(b.label);

  return aId === bId || (aLabel.length > 0 && aLabel === bLabel);
}

function buildDiscoveryClarificationMessage(params: {
  question: DiscoveryQuestion;
  userMessage: string;
}): string {
  const normalizedReply = params.userMessage
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/["']/g, '')
    .slice(0, 120);
  const questionText = `${params.question.id} ${params.question.label} ${params.question.description}`.toLowerCase();
  const examples = extractDiscoveryQuestionExamples(params.question).slice(0, 5);

  if (includesAny(questionText, ['status update focus', 'weekly update focus', 'which metrics'])) {
    const examplesText = examples.length > 0 ? examples.join(', ') : 'the core metrics';
    return [
      `Got it. When you said "${normalizedReply}", should I include ${examplesText}?`,
      'If yes, reply "yes include all". You can also name a smaller set.',
    ].join('\n\n');
  }

  if (includesAny(questionText, ['data source', 'database source', 'source system'])) {
    return [
      `Thanks. I want to lock this in correctly.`,
      `For **${params.question.label}**, ${params.question.description}`,
    ].join('\n\n');
  }

  return [
    `Thanks, I want to make sure I interpret this correctly.`,
    `For **${params.question.label}**, ${params.question.description}`,
  ].join('\n\n');
}

function filterAnsweredDiscoveryQuestions(params: {
  questions: DiscoveryQuestion[];
  userMessage: string;
  answerHistory?: string[];
  workspaceConnections: DiscoveryConnectionContext[];
}): { remaining: DiscoveryQuestion[]; answered: DiscoveryQuestion[] } {
  const answerHistory = params.answerHistory ?? [];
  const labeledAnswers = [params.userMessage, ...answerHistory]
    .flatMap((text) => parseLabeledDiscoveryAnswers(text))
    .filter((answer) => isMeaningfulDiscoveryAnswer(answer.value));
  const freeformCandidates = [params.userMessage, ...answerHistory.slice(-2)].filter(Boolean);

  const answered: DiscoveryQuestion[] = [];
  const remaining: DiscoveryQuestion[] = [];

  for (const question of params.questions) {
    const matchedByLabel = labeledAnswers.some((answer) =>
      isDiscoveryQuestionAnsweredByKey(question, answer.key)
    );
    const matchedByFreeform = !matchedByLabel && freeformCandidates.some((text) =>
      isDiscoveryQuestionAnsweredByFreeform({
        question,
        text,
        workspaceConnections: params.workspaceConnections,
      })
    );

    if (matchedByLabel || matchedByFreeform) {
      answered.push(question);
    } else {
      remaining.push(question);
    }
  }

  return { remaining, answered };
}

function mergeDiscoveryAssessments(params: {
  ai: DiscoveryAssessment;
  deterministic: DiscoveryAssessment;
  prior: DiscoveryHistorySnapshot | null;
  userMessage: string;
  answerHistory: string[];
  workspaceConnections: DiscoveryConnectionContext[];
}): DiscoveryAssessment {
  const { ai, deterministic, prior, userMessage, answerHistory, workspaceConnections } = params;
  const hasDefaultsConsent = hasAssumptionConsent({
    userMessage,
    answerHistory,
  });

  const contextNotes = [...ai.contextNotes, ...deterministic.contextNotes];
  const mergedQuestions = dedupeDiscoveryQuestions([
    ...ai.questions,
    ...deterministic.questions,
  ]);

  const requiredNow = mergedQuestions.filter((question) => question.requiredNow !== false);
  const optionalLater = mergedQuestions.filter((question) => question.requiredNow === false);

  const keepPriorRequired =
    Boolean(prior?.requiredNow.length) &&
    isLikelyAcknowledgementReply(userMessage) &&
    requiredNow.length === 0;

  const effectiveRequiredNow = keepPriorRequired
    ? dedupeDiscoveryQuestions([...prior!.requiredNow, ...requiredNow])
    : requiredNow;
  const effectiveOptionalLater = keepPriorRequired
    ? dedupeDiscoveryQuestions([...prior!.optionalLater, ...optionalLater])
    : optionalLater;

  const requiredResolution = filterAnsweredDiscoveryQuestions({
    questions: effectiveRequiredNow,
    userMessage,
    answerHistory,
    workspaceConnections,
  });
  const optionalResolution = filterAnsweredDiscoveryQuestions({
    questions: effectiveOptionalLater,
    userMessage,
    answerHistory,
    workspaceConnections,
  });
  const resolvedQuestions = dedupeDiscoveryQuestions([
    ...requiredResolution.answered,
    ...optionalResolution.answered,
  ]);

  let finalRequiredNow = requiredResolution.remaining;
  let finalOptionalLater = optionalResolution.remaining;
  const exploratoryPrompt = isExploratoryCreatorPrompt(userMessage);

  if (exploratoryPrompt && finalRequiredNow.length > 0 && !(prior && prior.requiredNow.length > 0)) {
    finalOptionalLater = dedupeDiscoveryQuestions([
      ...finalOptionalLater,
      ...finalRequiredNow.map((question) => ({
        ...question,
        requiredNow: false,
      })),
    ]);
    finalRequiredNow = [];
    contextNotes.push(
      'User message is exploratory; deferred blocking discovery questions until explicit generation request.'
    );
  }

  if (keepPriorRequired) {
    contextNotes.push(
      'Latest user reply looked like acknowledgement; retaining unresolved required discovery questions.'
    );
  }

  if (resolvedQuestions.length > 0) {
    contextNotes.push(
      `Accepted discovery answers for: ${resolvedQuestions
        .map((question) => question.label)
        .join(', ')}.`
    );
  }
  if (hasDefaultsConsent) {
    contextNotes.push(
      'User granted consent to proceed with safe defaults for unresolved non-critical discovery details.'
    );
  }

  const hardBlockers: DiscoveryQuestion[] = [];
  const softBlockers: DiscoveryQuestion[] = [];
  const assumptions: DiscoveryAssumption[] = [];

  for (const question of finalRequiredNow) {
    const assumption = buildDiscoveryAssumption({
      question,
      workspaceConnections,
    });
    const isHardCategory =
      isOutcomeCriticalDiscoveryQuestion(question) ||
      isExecutionCriticalDiscoveryQuestion(question);

    if (isHardCategory) {
      const canProceedWithAssumption =
        Boolean(assumption) &&
        (assumption?.confidence === 'high' || hasDefaultsConsent);
      if (canProceedWithAssumption && assumption) {
        softBlockers.push({
          ...question,
          requiredNow: false,
        });
        assumptions.push(assumption);
        continue;
      }
      hardBlockers.push({
        ...question,
        requiredNow: true,
      });
      continue;
    }

    softBlockers.push({
      ...question,
      requiredNow: false,
    });
    if (assumption) {
      assumptions.push(assumption);
    }
  }

  if (assumptions.length > 0) {
    contextNotes.push(
      `Proceeding with assumptions: ${assumptions
        .map((assumption) => `${assumption.label} -> ${assumption.value}`)
        .join('; ')}.`
    );
  }

  const shouldBlock = hardBlockers.length > 0;
  const blockMode: DiscoveryAssessment['blockMode'] = shouldBlock
    ? 'hard'
    : softBlockers.length > 0
      ? 'soft'
      : 'none';
  const runnableConfidence = computeDiscoveryRunnableConfidence({
    hardBlockers,
    softBlockers,
    assumptions,
    hasAssumptionConsent: hasDefaultsConsent,
  });

  const optionalDiscoveryQuestions = dedupeDiscoveryQuestions([
    ...finalOptionalLater,
    ...softBlockers,
  ]);
  const focusedHardBlockers = hardBlockers.slice(0, 1);
  const focusedOptionalQuestions = optionalDiscoveryQuestions.slice(0, 3);
  const hiddenHardBlockerCount = Math.max(0, hardBlockers.length - focusedHardBlockers.length);
  const hiddenOptionalCount = Math.max(
    0,
    optionalDiscoveryQuestions.length - focusedOptionalQuestions.length
  );
  if (hiddenHardBlockerCount > 0) {
    contextNotes.push(
      `Queued ${hiddenHardBlockerCount} additional required discovery detail${hiddenHardBlockerCount === 1 ? '' : 's'} for subsequent turns.`
    );
  }
  if (hiddenOptionalCount > 0) {
    contextNotes.push(
      `Deferred ${hiddenOptionalCount} optional setup detail${hiddenOptionalCount === 1 ? '' : 's'} for later refinement.`
    );
  }
  const preface = exploratoryPrompt
    ? 'I can guide the approach now and generate the runnable design when you say proceed.'
    : shouldBlock
      ? undefined
      : softBlockers.length > 0
        ? 'I can proceed now with safe defaults for remaining setup details.'
        : 'Great, I have enough to generate the first runnable design.';

  const previousPrimaryQuestion = prior?.requiredNow[0];
  const currentPrimaryQuestion = focusedHardBlockers[0];
  const unresolvedPrimaryRepeated = Boolean(
    previousPrimaryQuestion &&
      currentPrimaryQuestion &&
      isSameDiscoveryQuestion(previousPrimaryQuestion, currentPrimaryQuestion) &&
      resolvedQuestions.length === 0 &&
      !isLikelyAcknowledgementReply(userMessage)
  );
  const aiSuggestedMessage = normalizeDiscoveryAssistantMessage(ai.message);
  const clarificationMessage = unresolvedPrimaryRepeated && currentPrimaryQuestion
    ? buildDiscoveryClarificationMessage({
        question: currentPrimaryQuestion,
        userMessage,
      })
    : undefined;

  if (clarificationMessage) {
    contextNotes.push(
      'Adjusted to a clarifying follow-up instead of repeating the same discovery question.'
    );
  }

  const questions = dedupeDiscoveryQuestions([
    ...focusedHardBlockers,
    ...focusedOptionalQuestions,
  ]);

  return {
    shouldBlock,
    blockMode,
    message: shouldBlock
      ? clarificationMessage ??
        aiSuggestedMessage ??
        buildDiscoveryMessage({
          requiredNow: focusedHardBlockers,
          optionalLater: focusedOptionalQuestions,
          preface,
        })
      : preface,
    questions,
    hardBlockers: focusedHardBlockers,
    softBlockers: focusedOptionalQuestions,
    assumptions,
    runnableConfidence,
    hasAssumptionConsent: hasDefaultsConsent,
    contextNotes: [...new Set(contextNotes.filter(Boolean))],
  };
}

function buildStageSummary(args: {
  whatIDid: string;
  currentStage: string;
  nextStage: string;
  nextAction: string;
}): string {
  return [
    `**What I did:** ${args.whatIDid}`,
    `**Current stage:** ${args.currentStage}`,
    `**Next stage:** ${args.nextStage} — ${args.nextAction}`,
  ].join('\n');
}

function determineNextStageForGeneratedOutput(
  output: CreatorOutput,
  options: CreatorBotOptions
): { stage: string; action: string } {
  const allTools = output.entities.flatMap((entity) => entity.tools);
  const connectionSummary = getConnectionSummary(allTools);
  const workspaceConnections = options.context.connections;

  const hasAiProvider = workspaceConnections.some(
    (conn) =>
      ['openai', 'anthropic', 'ollama'].includes(conn.type) &&
      conn.status === 'connected'
  );

  const missingConnectionTypes = connectionSummary.required
    .filter((req) =>
      !workspaceConnections.some(
        (conn) => conn.type === req.connectionType && conn.status === 'connected'
      )
    )
    .map((req) => req.connectionType);

  if (!hasAiProvider || missingConnectionTypes.length > 0) {
    const missing = [...new Set(missingConnectionTypes)];
    return {
      stage: 'Connections',
      action:
        missing.length > 0
          ? `Connect required services (${missing.join(', ')}) and verify tool access.`
          : 'Connect an AI provider and verify required tool connections.',
    };
  }

  return {
    stage: 'Testing',
    action: 'Generate or run tests to validate behavior and expected outputs.',
  };
}

function enrichGeneratedOutputNarrative(
  output: CreatorOutput,
  options: CreatorBotOptions,
  loopCycles: number
): CreatorOutput {
  const entityCount = output.entities.length;
  const totalTools = output.entities.reduce((sum, entity) => sum + entity.tools.length, 0);
  const next = determineNextStageForGeneratedOutput(output, options);
  const repairCount = Math.max(0, loopCycles - 1);
  const detectedSkills = detectBalSkills(output.balCode);
  const skillSummary = summarizeBalSkills(detectedSkills);

  const whatIDid = [
    `Designed ${entityCount} ${entityCount === 1 ? 'entity' : 'entities'}`,
    totalTools > 0
      ? `mapped ${totalTools} ${totalTools === 1 ? 'tool' : 'tools'}`
      : 'prepared a tool-light workflow',
    'generated BAL code',
    detectedSkills.length > 0 ? `applied ${skillSummary}` : '',
    repairCount > 0
      ? `and repaired ${repairCount} intermediate output ${repairCount === 1 ? 'issue' : 'issues'}`
      : '',
  ]
    .filter(Boolean)
    .join(', ')
    .replace(', and', ' and');

  const stageSummary = buildStageSummary({
    whatIDid,
    currentStage: 'Design Complete',
    nextStage: next.stage,
    nextAction: next.action,
  });

  const existingMessage = output.message?.trim();

  return {
    ...output,
    message: existingMessage ? `${stageSummary}\n\n${existingMessage}` : stageSummary,
  };
}

function assessDiscoveryNeeds(
  options: CreatorBotOptions,
  userMessage: string
): DiscoveryAssessment {
  const transcript = extractUserTranscript(options, userMessage);
  const lower = transcript.toLowerCase();

  const databaseConnections = options.context.connections.filter(
    (conn) =>
      (conn.type === 'postgres' || conn.type === 'mysql') &&
      (conn.status === 'connected' || conn.status === 'unconfigured')
  );
  const databaseConnectionNames = databaseConnections.map((conn) =>
    conn.name.toLowerCase()
  );
  const mentionedDbConnections = databaseConnectionNames.filter((name) =>
    lower.includes(name)
  );
  const likelyTables = extractLikelyTableNames(transcript);

  const hasDbIntent = includesAny(lower, [
    'database',
    ' db ',
    'postgres',
    'mysql',
    'sql',
    'table',
    'signup',
    'sign up',
    'registration',
    'new user',
  ]);
  const hasApiIntent = includesAny(lower, [
    ' api',
    'endpoint',
    'rest',
    'graphql',
    'webhook',
    'http://',
    'https://',
  ]);
  const hasMcpIntent = includesAny(lower, ['mcp', 'model context protocol']);
  const hasDataIntent = includesAny(lower, [
    'data',
    'dataset',
    'activity',
    'events',
    'event data',
    'analytics',
    'metrics',
    'usage',
    'logs',
    'telemetry',
    'warehouse',
  ]);
  const hasReportingIntent = includesAny(lower, [
    'status update',
    'status updates',
    'weekly update',
    'weekly status',
    'report',
    'reporting',
    'summary',
    'summarize',
    'digest',
    'brief',
    'recap',
  ]);
  const hasMonitoringIntent = includesAny(lower, [
    'monitor',
    'watch',
    'detect',
    'track',
    'alert',
  ]);
  const hasScheduleHint = includesAny(lower, [
    'every ',
    'hourly',
    'daily',
    'weekly',
    'monthly',
    'cron',
    'schedule',
    'interval',
  ]);
  const hasRealtimeHint = includesAny(lower, [
    'real-time',
    'realtime',
    'on insert',
    'on create',
    'event',
    'trigger',
  ]);
  const hasDestinationHint = includesAny(lower, [
    'notify',
    'notification',
    'email',
    'slack',
    'discord',
    'sms',
    'webhook',
    'dashboard',
    'store',
    'write back',
  ]);

  const questions: DiscoveryQuestion[] = [];
  const contextNotes: string[] = [];

  if (hasDbIntent && hasMonitoringIntent) {
    contextNotes.push('Intent: monitor database changes and trigger automated handling.');
    if (databaseConnections.length === 0) {
      questions.push({
        id: 'connect-db-source',
        label: 'Database Source',
        description:
          'I do not see a connected Postgres/MySQL source in this workspace. Which database should this bot monitor?',
        icon: '🗄️',
        requiredNow: true,
      });
    } else if (databaseConnections.length > 1 && mentionedDbConnections.length === 0) {
      questions.push({
        id: 'choose-db-source',
        label: 'Database Source',
        description: `Which database connection should be used? Available: ${databaseConnections
          .map((conn) => conn.name)
          .join(', ')}`,
        icon: '🗄️',
        requiredNow: true,
      });
    } else if (mentionedDbConnections.length > 0) {
      contextNotes.push(
        `Selected database mention: ${mentionedDbConnections.join(', ')}.`
      );
    }

    if (likelyTables.length === 0) {
      questions.push({
        id: 'db-table-signal',
        label: 'Signup Signal',
        description:
          'Which table/collection and fields define a new signup event (for example: users.created_at, status=new)?',
        icon: '🧾',
        requiredNow: true,
      });
    } else {
      contextNotes.push(`Likely table hints: ${likelyTables.join(', ')}.`);
    }

    if (!hasScheduleHint && !hasRealtimeHint) {
      questions.push({
        id: 'monitoring-mode',
        label: 'Trigger Mode',
        description:
          'Should this run on a schedule (for example every 5 minutes) or respond in real-time events?',
        icon: '⏱️',
        requiredNow: false,
      });
    } else {
      contextNotes.push(
        hasRealtimeHint
          ? 'Trigger preference appears event-driven/realtime.'
          : 'Trigger preference appears schedule-based.'
      );
    }

    if (!hasDestinationHint) {
      questions.push({
        id: 'alert-destination',
        label: 'Output Destination',
        description:
          'Where should alerts/results go (in-app notification, email, Slack, webhook, etc.)?',
        icon: '📣',
        requiredNow: false,
      });
    }
  } else if (hasApiIntent && hasMonitoringIntent) {
    contextNotes.push('Intent: monitor API responses and trigger automated handling.');
    if (!includesAny(lower, ['http://', 'https://', '/api', 'endpoint'])) {
      questions.push({
        id: 'api-endpoint',
        label: 'API Endpoint',
        description: 'Which API endpoint/service should be monitored?',
        icon: '🌐',
        requiredNow: true,
      });
    }
    if (!hasScheduleHint && !hasRealtimeHint) {
      questions.push({
        id: 'api-trigger-mode',
        label: 'Polling Or Event',
        description:
          'Should this poll on a schedule, or should it run from incoming webhook/API events?',
        icon: '⏱️',
        requiredNow: false,
      });
    }
    if (!hasDestinationHint) {
      questions.push({
        id: 'api-output-destination',
        label: 'Output Destination',
        description:
          'Where should results or alerts be delivered (notification/email/Slack/webhook)?',
        icon: '📣',
        requiredNow: false,
      });
    }
  } else if (hasMcpIntent) {
    contextNotes.push('Intent: use MCP-triggered workflows.');
    if (!includesAny(lower, ['server', 'tool', 'resource'])) {
      questions.push({
        id: 'mcp-source',
        label: 'MCP Source',
        description:
          'Which MCP server and tool/resource should trigger this workflow?',
        icon: '🧩',
        requiredNow: true,
      });
    }
    if (!hasDestinationHint) {
      questions.push({
        id: 'mcp-output-destination',
        label: 'Output Destination',
        description:
          'What should happen after the MCP event runs (notify, write data, call webhook, etc.)?',
        icon: '📣',
        requiredNow: false,
      });
    }
  } else if (hasDataIntent && hasReportingIntent) {
    contextNotes.push(
      'Intent: draft structured status updates from activity/metrics data.'
    );

    const hasStructuredDataScopeHint =
      /\b[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\b/.test(lower) ||
      /\b(table|collection|view|bucket)\s+[a-z_][a-z0-9_]{1,}\b/.test(lower);
    const hasExplicitDbSourceHint =
      includesAny(lower, [
        'database',
        ' db ',
        'postgres',
        'mysql',
        'sql',
        'warehouse',
        'snowflake',
        'bigquery',
      ]) || hasStructuredDataScopeHint;
    const hasSourceTypeHint =
      hasExplicitDbSourceHint ||
      hasApiIntent ||
      hasMcpIntent ||
      includesAny(lower, [
        'spreadsheet',
        'google sheet',
        'google sheets',
        'csv',
        'airtable',
        'notion',
        's3',
        'snowflake',
        'bigquery',
      ]);

    if (!hasSourceTypeHint) {
      questions.push({
        id: 'status-data-source',
        label: 'Activity Data Source',
        description:
          'Where does the activity data live (database, API, spreadsheet, warehouse, etc.)?',
        icon: '🗄️',
        requiredNow: true,
      });
    }

    if (hasDbIntent && likelyTables.length === 0) {
      questions.push({
        id: 'status-db-table-scope',
        label: 'Data Scope',
        description:
          'Which tables/fields should be used for the status update metrics?',
        icon: '🧾',
        requiredNow: true,
      });
    }

    if (
      hasApiIntent &&
      !includesAny(lower, ['http://', 'https://', '/api', 'endpoint'])
    ) {
      questions.push({
        id: 'status-api-endpoint',
        label: 'API Endpoint',
        description:
          'Which API endpoint should provide the activity metrics for the update?',
        icon: '🌐',
        requiredNow: true,
      });
    }

    const hasMetricScopeHint = includesAny(lower, [
        'kpi',
        'kpis',
        'metric',
        'metrics',
        'signups',
        'registrations',
        'conversions',
        'retention',
        'churn',
        'active users',
        'dau',
        'mau',
        'revenue',
        'errors',
        'incidents',
      ]) ||
      /\b[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\b/.test(lower);

    if (!hasMetricScopeHint) {
      questions.push({
        id: 'status-metrics-focus',
        label: 'Status Update Focus',
        description:
          'What should the weekly update cover (for example: signups, retention, engagement, incidents, revenue)?',
        icon: '📊',
        requiredNow: true,
      });
    }

    if (!hasScheduleHint) {
      questions.push({
        id: 'status-cadence',
        label: 'Cadence',
        description:
          'How often should the update be drafted (weekly, daily, monthly)?',
        icon: '⏱️',
        requiredNow: false,
      });
    }

    if (!hasDestinationHint) {
      questions.push({
        id: 'status-audience-destination',
        label: 'Audience Or Destination',
        description:
          'Who should receive the update and where should it be delivered (chat, email, dashboard)?',
        icon: '📣',
        requiredNow: false,
      });
    }
  }

  const normalizedQuestions = dedupeDiscoveryQuestions(questions);
  if (normalizedQuestions.length === 0) {
    return {
      shouldBlock: false,
      blockMode: 'none',
      questions: [],
      hardBlockers: [],
      softBlockers: [],
      assumptions: [],
      runnableConfidence: 0.95,
      hasAssumptionConsent: false,
      contextNotes,
    };
  }

  const requiredNow = normalizedQuestions.filter(
    (question) => question.requiredNow !== false
  );
  const optionalLater = normalizedQuestions.filter(
    (question) => question.requiredNow === false
  );

  if (requiredNow.length === 0) {
    return {
      shouldBlock: false,
      blockMode: optionalLater.length > 0 ? 'soft' : 'none',
      questions: normalizedQuestions,
      hardBlockers: [],
      softBlockers: optionalLater,
      assumptions: [],
      runnableConfidence: optionalLater.length > 0 ? 0.82 : 0.95,
      hasAssumptionConsent: false,
      contextNotes,
    };
  }

  return {
    shouldBlock: requiredNow.length > 0,
    blockMode: 'hard',
    message: buildDiscoveryMessage({ requiredNow, optionalLater }),
    questions: normalizedQuestions,
    hardBlockers: requiredNow,
    softBlockers: optionalLater,
    assumptions: [],
    runnableConfidence: 0.2,
    hasAssumptionConsent: false,
    contextNotes,
  };
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options for creating a Creator Bot instance
 */
export interface CreatorBotOptions {
  /** Context with available tools, policies, and connections */
  context: GeneratorContext;
  /** Previous conversation messages for continuity */
  conversationHistory?: CreatorMessage[];
  /** Optional callback for streaming progress updates */
  onProgress?: (event: CreatorProgressEvent) => void;
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Format existing BaleyBots as context for the Creator Bot
 */
function formatExistingBaleybots(
  baleybots: GeneratorContext['existingBaleybots']
): string {
  if (baleybots.length === 0) {
    return '';
  }

  const visibleBaleybots = baleybots.slice(0, CREATOR_CONTEXT_MAX_EXISTING_BBS);
  const hiddenCount = Math.max(0, baleybots.length - visibleBaleybots.length);

  const lines = [
    '',
    '## Existing BaleyBots in This Workspace',
    'Reference these when reusing patterns or integrating with existing workflows:',
    '',
  ];

  for (const bb of visibleBaleybots) {
    const description = bb.description
      ? truncateCompactText(bb.description, 120)
      : 'No description';
    lines.push(`- **${bb.name}**: ${description}`);
  }

  if (hiddenCount > 0) {
    lines.push(`- +${hiddenCount} more existing BaleyBots omitted for brevity`);
  }

  return lines.join('\n');
}

/**
 * Format conversation history as context for the Creator Bot
 */
function formatConversationHistory(messages: CreatorMessage[]): string {
  if (messages.length === 0) {
    return '';
  }

  const visibleMessages = messages.slice(-CREATOR_CONTEXT_MAX_HISTORY_MESSAGES);
  const hiddenCount = Math.max(0, messages.length - visibleMessages.length);
  const lines = ['', '## Previous Conversation', ''];

  if (hiddenCount > 0) {
    lines.push(
      `(Only most recent ${visibleMessages.length} turns included for speed; ${hiddenCount} earlier turns omitted.)`
    );
    lines.push('');
  }

  for (const msg of visibleMessages) {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    const compactContent = truncateCompactText(
      sanitizeCreatorText(msg.content),
      CREATOR_CONTEXT_MAX_HISTORY_CHARS
    );
    lines.push(`${role}: ${compactContent}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Build the context string for the Creator Bot
 */
function buildCreatorContext(options: CreatorBotOptions, additionalContext?: string): string {
  const { context, conversationHistory = [] } = options;

  const lines: string[] = [];
  lines.push(
    '## BAL Skills Decision Guide',
    '- Use `chain` for deterministic pipelines where each step depends on previous output.',
    '- Use `parallel` when branches are independent and should run concurrently.',
    '- Use `loop` for iterative refinement, retries, or self-healing workflows.',
    '- Loop guardrails are required: include clear `until` conditions and bounded `max` cycles.',
    '- Use `route`, `gate`, `filter`, `processor`, and `try/catch` when branching, guarding, transforming, or adding fallback behavior.',
    ''
  );

  // Add tool catalog (including connection-derived tools if database connections exist)
  const databaseConnections = context.connections
    .filter((c) => (c.type === 'postgres' || c.type === 'mysql') && c.status === 'connected')
    .map((c) => ({
      connectionId: c.id,
      connectionName: c.name,
      type: c.type as 'postgres' | 'mysql',
      config: {} as import('@/lib/connections/providers').DatabaseConnectionConfig, // Config not needed for catalog display
      schema: c.availableModels as import('./tools/connection-derived').DatabaseSchema | undefined,
    }));

  const fullCatalog = getToolCatalog({
    workspaceId: context.workspaceId,
    workspacePolicies: context.workspacePolicies,
    workspaceTools: context.availableTools,
    includeConnectionTools: databaseConnections.length > 0,
    databaseConnections,
  });
  lines.push(
    formatToolCatalogForCreatorBotCompact(fullCatalog, {
      maxPerSection: 10,
    })
  );

  // Add existing BaleyBots
  const existingBBText = formatExistingBaleybots(context.existingBaleybots);
  if (existingBBText) {
    lines.push(existingBBText);
  }

  // Add conversation history
  const historyText = formatConversationHistory(conversationHistory);
  if (historyText) {
    lines.push(historyText);
  }

  if (additionalContext?.trim()) {
    lines.push(
      '',
      '## Current Discovery Context',
      truncateCompactText(additionalContext.trim(), CREATOR_CONTEXT_MAX_ADDITIONAL_CHARS)
    );
  }

  return lines.join('\n');
}

function inferBalSkillHints(transcript: string): string[] {
  const lower = transcript.toLowerCase();
  const hints: string[] = [];

  if (
    includesAny(lower, [
      'loop',
      'iterate',
      'iterative',
      'retry',
      'self-heal',
      'self heal',
      'keep trying',
      'repeat',
      'refine until',
      'improve until',
      'until',
    ])
  ) {
    hints.push(
      'Skill hint: Prefer a BAL loop with explicit `until` and bounded `max` guardrails for iterative/self-healing behavior.'
    );
  }

  if (includesAny(lower, ['classify', 'route', 'branch', 'by type', 'category'])) {
    hints.push(
      'Skill hint: Consider route/if composition when behavior should branch by input category.'
    );
  }

  if (includesAny(lower, ['fallback', 'recover', 'on failure', 'error handling', 'failover'])) {
    hints.push('Skill hint: Consider try/catch for deterministic fallback handling.');
  }

  return hints;
}

function buildDiscoveryContext(options: CreatorBotOptions): string {
  const connectedServices = options.context.connections
    .filter((conn) => conn.status === 'connected')
    .slice(0, 16)
    .map((conn) => `${conn.name} (${conn.type})`);
  const connectedSummary =
    connectedServices.length > 0
      ? connectedServices.join(', ')
      : 'No connected services yet.';

  const availableToolNames = options.context.availableTools
    .map((tool) => tool.name)
    .filter(Boolean);
  const visibleToolNames = availableToolNames.slice(
    0,
    CREATOR_DISCOVERY_MAX_TOOL_NAMES
  );
  const hiddenToolCount = Math.max(
    0,
    availableToolNames.length - visibleToolNames.length
  );

  const existingNames = options.context.existingBaleybots
    .slice(0, CREATOR_DISCOVERY_MAX_EXISTING_BBS)
    .map((bb) => bb.name);
  const hiddenExistingCount = Math.max(
    0,
    options.context.existingBaleybots.length - existingNames.length
  );

  const recentUserTurns = extractRecentUserMessages(options.conversationHistory)
    .slice(-CREATOR_DISCOVERY_MAX_RECENT_USER_TURNS)
    .map((message, index) =>
      `${index + 1}. ${truncateCompactText(
        message,
        CREATOR_DISCOVERY_MAX_RECENT_USER_CHARS
      )}`
    );

  return [
    '## Discovery Agent Context',
    `Workspace: ${options.context.workspaceId}`,
    `Connected services: ${connectedSummary}`,
    visibleToolNames.length > 0
      ? `Available tools: ${visibleToolNames.join(', ')}${hiddenToolCount > 0 ? ` (+${hiddenToolCount} more)` : ''}`
      : 'Available tools: none',
    existingNames.length > 0
      ? `Existing BaleyBots: ${existingNames.join(', ')}${hiddenExistingCount > 0 ? ` (+${hiddenExistingCount} more)` : ''}`
      : 'Existing BaleyBots: none',
    recentUserTurns.length > 0
      ? `Recent user turns:\n${recentUserTurns.join('\n')}`
      : 'Recent user turns: none',
    '',
    '## Discovery Task',
    'Only decide whether we have enough information to generate a runnable first version.',
    'Delegate detailed design to creator_bot. Do not generate entities/BAL in this step.',
    'Use progressive disclosure: identify which details are required now versus can be configured later.',
  ].join('\n');
}

function buildDiscoveryInputPrompt(
  options: CreatorBotOptions,
  userMessage: string
): string {
  const latestDiscovery = extractLatestDiscoverySnapshot(options.conversationHistory);
  const unresolvedRequired = latestDiscovery?.requiredNow ?? [];
  const unresolvedOptional = latestDiscovery?.optionalLater ?? [];
  const recentUserMessages = extractRecentUserMessages(options.conversationHistory)
    .slice(-3)
    .map((message, index) => `${index + 1}. ${message}`)
    .join('\n');

  const lines: string[] = [
    `Latest user message: ${userMessage}`,
  ];

  if (unresolvedRequired.length > 0 || unresolvedOptional.length > 0) {
    lines.push(
      '',
      'Current discovery state from previous turn:',
      unresolvedRequired.length > 0
        ? `Required unresolved: ${unresolvedRequired
            .map((question) => `${question.label} (${question.id})`)
            .join('; ')}`
        : 'Required unresolved: none',
      unresolvedOptional.length > 0
        ? `Optional unresolved: ${unresolvedOptional
            .map((question) => `${question.label} (${question.id})`)
            .join('; ')}`
        : 'Optional unresolved: none'
    );
  }

  if (recentUserMessages.length > 0) {
    lines.push('', 'Recent user turns:', recentUserMessages);
  }

  lines.push(
    '',
    'Instructions:',
    '- Resolve any question the user already answered implicitly or explicitly.',
    '- If clarification is needed, ask a short conversational follow-up (do not repeat verbatim).',
    '- Ask only one focused next question in the message.'
  );

  return lines.join('\n');
}

async function assessDiscoveryNeedsWithInternalBB(
  options: CreatorBotOptions,
  userMessage: string
): Promise<DiscoveryAssessment> {
  try {
    emitCreatorProgress(options, {
      phase: 'discovery',
      message: 'Reviewing discovery requirements',
      highlightType: 'status',
    });
    const parsed = await runCreatorDiscovery(
      buildDiscoveryInputPrompt(options, userMessage),
      {
        userWorkspaceId: options.context.workspaceId,
        context: buildDiscoveryContext(options),
        triggeredBy: 'internal',
        onSegment: (segment) => {
          const normalized = toProgressEventFromSegment(segment);
          if (!normalized) return;
          emitCreatorProgress(options, {
            phase: 'discovery',
            ...normalized,
          });
        },
      }
    );

    const normalizedQuestions = dedupeDiscoveryQuestions(parsed.questions);
    const requiredNow = normalizedQuestions.filter(
      (question) => question.requiredNow !== false
    );
    const optionalLater = normalizedQuestions.filter(
      (question) => question.requiredNow === false
    );
    const shouldBlock = parsed.needsMoreInfo || requiredNow.length > 0;
    const discoveryMessage = normalizeDiscoveryAssistantMessage(parsed.message);
    emitCreatorProgress(options, {
      phase: 'discovery',
      message: shouldBlock
        ? 'Discovery needs one more required detail'
        : 'Discovery complete',
      highlight:
        requiredNow[0]?.label ??
        optionalLater[0]?.label ??
        parsed.contextNotes[0] ??
        undefined,
      highlightType: shouldBlock ? 'status' : 'loop',
    });

    return {
      shouldBlock,
      blockMode: shouldBlock ? 'hard' : optionalLater.length > 0 ? 'soft' : 'none',
      message: discoveryMessage ?? (shouldBlock
        ? buildDiscoveryMessage({
            requiredNow,
            optionalLater,
          })
        : undefined),
      questions: normalizedQuestions,
      hardBlockers: requiredNow,
      softBlockers: optionalLater,
      assumptions: [],
      runnableConfidence: shouldBlock ? 0.2 : optionalLater.length > 0 ? 0.82 : 0.95,
      hasAssumptionConsent: false,
      contextNotes: parsed.contextNotes,
    };
  } catch (error) {
    logger.warn('creator_discovery failed, using conversational fallback', {
      error: error instanceof Error ? error.message : String(error),
    });
    emitCreatorProgress(options, {
      phase: 'recovery',
      message: 'Discovery analyzer response needed cleanup, using a safe fallback',
      highlightType: 'status',
    });
    const answerHistory = extractRecentUserMessages(options.conversationHistory);
    const priorDiscovery = extractLatestDiscoverySnapshot(options.conversationHistory);
    const deterministic = assessDiscoveryNeeds(options, userMessage);
    const seededAiLikeFallback: DiscoveryAssessment = {
      shouldBlock: false,
      blockMode: 'none',
      message: undefined,
      questions: [],
      hardBlockers: [],
      softBlockers: [],
      assumptions: [],
      runnableConfidence: 0.65,
      hasAssumptionConsent: false,
      contextNotes: [
        'Fallback discovery mode activated due temporary analyzer failure.',
      ],
    };

    const mergedFallback = mergeDiscoveryAssessments({
      ai: seededAiLikeFallback,
      deterministic,
      prior: priorDiscovery,
      userMessage,
      answerHistory,
      workspaceConnections: options.context.connections.map((connection) => ({
        name: connection.name,
        type: connection.type,
        status: connection.status,
        isDefault: connection.isDefault,
      })),
    });

    const fallbackMessage = mergedFallback.shouldBlock
      ? buildDiscoveryMessage({
          requiredNow: mergedFallback.hardBlockers,
          optionalLater: mergedFallback.softBlockers,
          preface:
            'I hit a temporary analysis issue, but we can keep moving with one focused question.',
        })
      : mergedFallback.message ??
        'I can proceed now, or ask one clarifying question if you want a tighter first draft.';

    return {
      ...mergedFallback,
      message: fallbackMessage,
    };
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Process a message through the Creator Bot.
 * Executes via the internal BaleyBot system with full tracking.
 */
export async function processCreatorMessage(
  options: CreatorBotOptions,
  userMessage: string
): Promise<CreatorOutput> {
  const sanitizedUserMessage = sanitizeCreatorText(userMessage);
  emitCreatorProgress(options, {
    phase: 'discovery',
    message: 'Understanding your request',
    highlightType: 'status',
  });
  const exploratoryPrompt = isExploratoryCreatorPrompt(sanitizedUserMessage);
  const priorDiscovery = extractLatestDiscoverySnapshot(options.conversationHistory);
  const answerHistory = extractRecentUserMessages(options.conversationHistory);
  const aiDiscovery = await assessDiscoveryNeedsWithInternalBB(
    options,
    sanitizedUserMessage
  );
  const deterministicDiscovery = assessDiscoveryNeeds(options, sanitizedUserMessage);
  const discovery = mergeDiscoveryAssessments({
    ai: aiDiscovery,
    deterministic: deterministicDiscovery,
    prior: priorDiscovery,
    userMessage: sanitizedUserMessage,
    answerHistory,
    workspaceConnections: options.context.connections.map((connection) => ({
      name: connection.name,
      type: connection.type,
      status: connection.status,
      isDefault: connection.isDefault,
    })),
  });
  emitCreatorProgress(options, {
    phase: 'discovery',
    message: discovery.shouldBlock
      ? 'Need one focused detail before generation'
      : 'Discovery complete, preparing generation',
    highlight:
      discovery.hardBlockers[0]?.label ??
      discovery.softBlockers[0]?.label ??
      discovery.contextNotes[0] ??
      undefined,
    highlightType: 'status',
  });

  if (discovery.shouldBlock) {
    const requiredNow = discovery.hardBlockers;
    const optionalLater = discovery.softBlockers;
    const iteration = Math.max(1, (priorDiscovery?.iteration ?? 0) + 1);
    const discoveryPrompt =
      discovery.message ??
      buildDiscoveryMessage({
        requiredNow,
        optionalLater,
      });
    const promptMessage = discoveryPrompt.trim();
    const discoveryThinking = buildStageSummary({
      whatIDid:
        iteration > 1
          ? 'Re-evaluated your latest reply and checked what is still required for a runnable build.'
          : 'Reviewed your request and checked workspace context, tools, and required setup details.',
      currentStage: `Ideation (Round ${iteration})`,
      nextStage: 'Design Generation',
      nextAction:
        requiredNow.length > 0
          ? 'Answer the required question and I will generate BAL + visual design.'
          : 'I can proceed to generation now.',
    });
    emitCreatorProgress(options, {
      phase: 'complete',
      message: 'Waiting for your next detail',
      highlight:
        requiredNow[0]?.label ??
        optionalLater[0]?.label ??
        undefined,
      highlightType: 'status',
    });

    return {
      thinking: discoveryThinking,
      message: promptMessage,
      questions: discovery.questions,
      entities: [],
      connections: [],
      balCode: '',
      name: inferDraftName(sanitizedUserMessage),
      description: 'Collecting required setup details before final generation.',
      icon: '🧭',
      status: 'building',
      assumptions: discovery.assumptions,
      runnableConfidence: discovery.runnableConfidence,
      blockMode: discovery.blockMode,
    };
  }

  const context = buildCreatorContext(options, (() => {
    const transcript = extractUserTranscript(options, sanitizedUserMessage);
    const skillHints = inferBalSkillHints(transcript);
    const contextLines = [
      ...(exploratoryPrompt
        ? [
            'Conversation mode: user is exploring options or asking process questions. Be conversational, explain the recommended approach, and provide one concrete next step. Generate BAL only after explicit user confirmation to proceed.',
          ]
        : []),
      ...discovery.contextNotes.map((note) => `- ${note}`),
      ...discovery.assumptions.map(
        (assumption) =>
          `- Assumption (${assumption.confidence} confidence): ${assumption.label} -> ${assumption.value}`
      ),
      `- Runnable confidence for current scope: ${Math.round(discovery.runnableConfidence * 100)}%.`,
      ...skillHints.map((hint) => `- ${hint}`),
    ];
    return contextLines.length > 0 ? contextLines.join('\n') : undefined;
  })());
  emitCreatorProgress(options, {
    phase: 'orchestration',
    message: 'Starting generation loop',
    highlightType: 'loop',
  });
  const loopResult = await runInternalOrchestrationLoop<CreatorLoopState, CreatorCycleResult>({
    kind: 'creator',
    policy: {
      maxCycles: 4,
      maxDurationMs: 120000,
      maxRepeatSignature: 2,
      minImprovementDelta: 0,
    },
    initialState: {
      attempts: 0,
    },
    runCycle: async ({ cycleIndex, state }) => {
      emitCreatorProgress(options, {
        phase: 'orchestration',
        message: `Running generation cycle ${cycleIndex}`,
        highlight: cycleIndex === 1
          ? 'Drafting first runnable version'
          : 'Repairing and validating draft output',
        highlightType: 'loop',
        cycle: cycleIndex,
      });
      const prompt = cycleIndex === 1
        ? sanitizedUserMessage
        : buildCreatorRepairPrompt({
            originalUserMessage: sanitizedUserMessage,
            previousPrompt: sanitizedUserMessage,
            lastError: state.lastError,
            lastRawPreview: state.lastRawPreview,
          });

      const output = await runCreatorBot(prompt, {
        userWorkspaceId: options.context.workspaceId,
        context,
        triggeredBy: 'internal',
        // Keep one inline repair on first draft, then let orchestration loop drive retries.
        repairAttempts: cycleIndex === 1 ? 1 : 0,
        onSegment: (segment) => {
          const normalized = toProgressEventFromSegment(segment);
          if (!normalized) return;
          emitCreatorProgress(options, {
            phase: 'generation',
            ...normalized,
            cycle: cycleIndex,
          });
        },
      });

      return {
        prompt,
        validation: validateCreatorCandidate(output),
      };
    },
    applyCycle: (state, result) => ({
      attempts: state.attempts + 1,
      bestOutput: result.validation.success ? result.validation.output : state.bestOutput,
      lastError: result.validation.errorMessage,
      lastRawPreview: result.validation.rawPreview,
      lastCycleError: undefined,
    }),
    isSuccess: (_state, result) => result.validation.success,
    getCycleSignature: (_state, result) => result.validation.signature,
    getImprovement: (previous, next, result) => {
      if (result.validation.success && !previous.bestOutput && next.bestOutput) {
        return 1;
      }
      return 0;
    },
    onCycleError: ({ error, state }) => {
      const cycleError = error instanceof Error ? error.message : String(error);
      logger.error('Creator orchestration cycle failed', {
        error: cycleError,
      });
      emitCreatorProgress(options, {
        phase: 'recovery',
        message: 'Cycle failed, attempting safe retry',
        highlight: cycleError,
        highlightType: 'status',
      });
      return {
        nextState: {
          ...state,
          lastError: cycleError,
          lastRawPreview: cycleError.slice(0, 600),
          lastCycleError: cycleError,
        },
        continueLoop: true,
      };
    },
  });

  if (loopResult.finalState.bestOutput) {
    const bestOutput = loopResult.finalState.bestOutput;

    if (bestOutput.status === 'building') {
      const fallbackMessage =
        'I can guide this step-by-step. Share the outcome you want first, and I will drive the process from there.';
      emitCreatorProgress(options, {
        phase: 'complete',
        message: 'Generation paused for clarification',
        highlight: bestOutput.message || fallbackMessage,
        highlightType: 'status',
      });
      return {
        ...bestOutput,
        entities: [],
        connections: [],
        balCode: '',
        message: bestOutput.message?.trim() || bestOutput.thinking?.trim() || fallbackMessage,
        assumptions: discovery.assumptions,
        runnableConfidence: discovery.runnableConfidence,
        blockMode: discovery.blockMode,
      };
    }

    if (loopResult.cycles.length > 1) {
      logger.info('Creator orchestration recovered malformed output', {
        cycles: loopResult.cycles.length,
        stopReason: loopResult.stopReason,
      });
    }
    emitCreatorProgress(options, {
      phase: 'complete',
      message: 'Generation complete',
      highlight:
        loopResult.cycles.length > 1
          ? `Recovered after ${loopResult.cycles.length} cycles`
          : 'Built in a single cycle',
      highlightType: 'status',
    });
    return {
      ...enrichGeneratedOutputNarrative(
        bestOutput,
        options,
        loopResult.cycles.length
      ),
      assumptions: discovery.assumptions.length > 0 ? discovery.assumptions : undefined,
      runnableConfidence: discovery.runnableConfidence,
      blockMode: discovery.blockMode,
    };
  }

  const lastCycleError = loopResult.finalState.lastCycleError?.trim();
  const hasProviderError = Boolean(
    lastCycleError &&
      /provider|api key|connection|credential/i.test(lastCycleError)
  );
  const hasContractDriftError = Boolean(
    lastCycleError &&
      /response validation failed|schema|json/i.test(lastCycleError)
  );

  logger.error('Creator bot output validation failed after orchestration', {
    stopReason: loopResult.stopReason,
    status: loopResult.status,
    cycles: loopResult.cycles.length,
    lastError: loopResult.finalState.lastError,
    lastCycleError,
  });
  if (hasProviderError) {
    emitCreatorProgress(options, {
      phase: 'recovery',
      message: 'Generation blocked by provider connection issue',
      highlight: lastCycleError,
      highlightType: 'status',
    });
    return {
      thinking: buildStageSummary({
        whatIDid:
          'Attempted generation, then detected a provider connectivity issue before a valid output could be produced.',
        currentStage: 'Generation Blocked',
        nextStage: 'Connection Recovery',
        nextAction: 'Reconnect an AI provider in Settings, then send "retry build".',
      }),
      message:
        'I cannot reach your AI provider right now. Reconnect an AI provider in Settings, then tell me to retry.',
      questions: [],
      entities: [],
      connections: [],
      balCode: '',
      name: inferDraftName(sanitizedUserMessage),
      description: 'Waiting for AI provider connectivity before generation can continue.',
      icon: '🔌',
      status: 'building',
      assumptions: discovery.assumptions,
      runnableConfidence: 0.1,
      blockMode: 'hard',
    };
  }

  const fallbackRequired = discovery.hardBlockers;
  const fallbackOptional = discovery.softBlockers;
  const fallbackMessage =
    fallbackRequired.length > 0 || fallbackOptional.length > 0
      ? buildDiscoveryMessage({
          requiredNow: fallbackRequired,
          optionalLater: fallbackOptional,
          preface: hasContractDriftError
            ? 'I hit a formatting issue while generating, so I will continue in smaller steps.'
            : 'I hit a temporary generation issue, so I will continue in smaller steps.',
        })
      : 'I hit a temporary generation issue. Reply "continue with defaults" and I will retry with a simpler first version.';

  emitCreatorProgress(options, {
    phase: 'recovery',
    message: 'Generation needs recovery',
    highlight: fallbackMessage,
    highlightType: 'status',
  });

  return {
    thinking: buildStageSummary({
      whatIDid:
        'Attempted generation but internal output validation failed. Switched back to guided discovery to continue safely.',
      currentStage: 'Recovery',
      nextStage: 'Design Generation',
      nextAction:
        fallbackRequired.length > 0
          ? 'Answer the next short question so I can regenerate reliably.'
          : 'Reply "continue with defaults" so I can retry generation with a simplified plan.',
    }),
    message: fallbackMessage,
    questions: discovery.questions.slice(0, 8),
    entities: [],
    connections: [],
    balCode: '',
    name: inferDraftName(sanitizedUserMessage),
    description: 'Recovering from a generation issue and continuing guided setup.',
    icon: '🧭',
    status: 'building',
    assumptions: discovery.assumptions,
    runnableConfidence: discovery.runnableConfidence,
    blockMode: discovery.blockMode,
  };
}

// ============================================================================
// STREAMING (FUTURE)
// ============================================================================

/**
 * Stream the Creator Bot response.
 *
 * This async generator simulates streaming by yielding chunks as they become
 * available. In the future, this will be updated to use true streaming from
 * the underlying AI model.
 *
 * @param options - Creator Bot options
 * @param userMessage - The user's message to process
 * @yields Streaming chunks with status updates, entities, connections, and final result
 */
export async function* streamCreatorMessage(
  options: CreatorBotOptions,
  userMessage: string
): AsyncGenerator<CreatorStreamChunk> {
  // Yield initial status
  yield {
    type: 'status',
    data: { message: 'Understanding your request...' },
  };

  // Process the message (in the future, this will be streaming)
  const result = await processCreatorMessage(options, userMessage);

  if (result.status === 'building') {
    yield {
      type: 'complete',
      data: result,
    };
    return;
  }

  // Yield building status
  yield {
    type: 'status',
    data: { message: 'Designing entities...' },
  };

  // Yield entities one by one
  for (const entity of result.entities) {
    yield {
      type: 'entity',
      data: {
        id: entity.id,
        name: entity.name,
        icon: entity.icon,
        purpose: entity.purpose,
        tools: entity.tools,
      },
    } as CreatorStreamChunk;
  }

  // Yield connecting status
  if (result.connections.length > 0) {
    yield {
      type: 'status',
      data: { message: 'Connecting entities...' },
    };

    // Yield connections one by one
    for (const connection of result.connections) {
      yield {
        type: 'connection',
        data: {
          id: `conn-${connection.from}-${connection.to}`,
          from: connection.from,
          to: connection.to,
          label: connection.label,
        },
      } as CreatorStreamChunk;
    }
  }

  // Yield final status
  yield {
    type: 'status',
    data: { message: 'Generating BAL code...' },
  };

  // Yield the complete result
  yield {
    type: 'complete',
    data: result,
  };
}
