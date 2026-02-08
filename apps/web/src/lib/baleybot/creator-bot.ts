/**
 * Creator Bot Service
 *
 * The Creator Bot is an internal BaleyBot that helps users build other BaleyBots
 * through natural conversation. It executes through the standard BaleyBot path
 * with full execution tracking.
 */

import { executeInternalBaleybot } from './internal-baleybots';
import { normalizeBalCodeForCompatibility, parseBalCode } from './bal-parser-pure';
import { runInternalOrchestrationLoop } from './internal-orchestration';
import {
  creatorOutputSchema,
  type CreatorOutput,
  type CreatorMessage,
  type CreatorStreamChunk,
} from './creator-types';
import type { GeneratorContext } from './types';
import {
  getToolCatalog,
  formatToolCatalogForCreatorBot,
} from './tools/catalog-service';
import { getConnectionSummary } from './tools/requirements-scanner';
import { detectBalSkills, summarizeBalSkills } from './bal-skills';
import { sanitizeCreatorText } from './creator-sanitization';
import { createLogger } from '@/lib/logger';
import { z } from 'zod';

const logger = createLogger('creator-bot');

interface DiscoveryQuestion {
  id: string;
  label: string;
  description: string;
  icon?: string;
  requiredNow?: boolean;
}

interface DiscoveryAssessment {
  shouldBlock: boolean;
  message?: string;
  questions: DiscoveryQuestion[];
  contextNotes: string[];
}

interface DiscoveryHistorySnapshot {
  iteration: number;
  requiredNow: DiscoveryQuestion[];
  optionalLater: DiscoveryQuestion[];
}

const discoveryQuestionSchema = z.object({
  id: z.string().min(1).catch(() => crypto.randomUUID()),
  label: z.string().min(1).catch('Required Detail'),
  description: z.string().min(1).catch('Please provide this detail.'),
  icon: z.string().optional().catch(undefined),
  requiredNow: z.boolean().optional().catch(undefined),
});

const discoveryOutputSchema = z.object({
  needsMoreInfo: z.boolean().catch(false),
  message: z.string().optional().catch(undefined),
  questions: z.array(discoveryQuestionSchema).max(8).catch([]),
  contextNotes: z.array(z.string()).max(16).catch([]),
});

// ============================================================================
// OUTPUT RESOLUTION
// ============================================================================

/**
 * Resolve the raw output from executeInternalBaleybot into a valid object
 * that can be parsed by creatorOutputSchema.
 *
 * The SDK's buildZodSchema marks all output fields as optional, which causes
 * models to sometimes return partial/malformed structured output. This handles:
 * 1. Valid object output (pass through)
 * 2. String output containing JSON (parse it)
 * 3. String with markdown fences around JSON (extract and parse)
 */
function resolveStructuredOutput(output: unknown): unknown {
  logger.info('resolveStructuredOutput received', {
    type: typeof output,
    isNull: output === null,
    isUndefined: output === undefined,
    preview: typeof output === 'string'
      ? output.slice(0, 300)
      : typeof output === 'object' && output !== null
        ? JSON.stringify(output).slice(0, 300)
        : String(output),
  });

  // Already an object with entities — pass through
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    return output;
  }

  // String output — try to extract JSON
  if (typeof output === 'string') {
    const text = output.trim();

    // Try direct JSON parse
    try {
      const parsed = JSON.parse(text);
      logger.info('Direct JSON parse succeeded');
      return parsed;
    } catch {
      // Try extracting from markdown code fences
      const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch?.[1]) {
        try {
          const parsed = JSON.parse(jsonMatch[1].trim());
          logger.info('Markdown fence JSON extraction succeeded');
          return parsed;
        } catch {
          // Fall through
        }
      }

      // Try finding the first { ... } block
      const braceStart = text.indexOf('{');
      const braceEnd = text.lastIndexOf('}');
      if (braceStart !== -1 && braceEnd > braceStart) {
        try {
          const parsed = JSON.parse(text.slice(braceStart, braceEnd + 1));
          logger.info('Brace extraction JSON parse succeeded');
          return parsed;
        } catch {
          // Fall through
        }
      }

      logger.error('All JSON extraction methods failed', {
        textLength: text.length,
        firstChars: text.slice(0, 200),
        lastChars: text.slice(-200),
      });
    }
  }

  // Return as-is and let creatorOutputSchema.parse() produce a clear error
  return output;
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
}

interface CreatorCycleResult {
  prompt: string;
  validation: CreatorValidationResult;
}

function validateCreatorCandidate(rawOutput: unknown): CreatorValidationResult {
  const resolved = resolveStructuredOutput(rawOutput);
  const parsed = creatorOutputSchema.safeParse(resolved);

  if (!parsed.success) {
    return {
      success: false,
      signature: 'schema_validation_failed',
      errorMessage: parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; '),
      rawPreview: typeof rawOutput === 'string'
        ? rawOutput.slice(0, 600)
        : JSON.stringify(rawOutput).slice(0, 600),
    };
  }

  if (parsed.data.status === 'building') {
    return {
      success: true,
      signature: 'building_needs_input',
      output: parsed.data,
    };
  }

  const normalizedBalCode = normalizeBalCodeForCompatibility(parsed.data.balCode);
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
      ...parsed.data,
      balCode: normalizedBalCode,
    },
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
    /\bfrom\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/gi,
    /\bcollection\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
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
  const lines: string[] = [];

  if (preface?.trim()) {
    lines.push(preface.trim(), '');
  }

  if (requiredNow.length > 0) {
    lines.push('To continue right now, I need these details:', '');
    for (const q of requiredNow) {
      lines.push(`- **${q.label}**: ${q.description}`);
    }
  }

  if (optionalLater.length > 0) {
    lines.push(
      '',
      'You can answer these now if you want, but they can also wait until Connections/Launch:',
      ''
    );
    for (const q of optionalLater) {
      lines.push(`- **${q.label}**: ${q.description}`);
    }
  }

  lines.push(
    '',
    requiredNow.length > 0
      ? 'Reply with the required answers and I will generate the runnable design immediately.'
      : 'I can proceed now and we can configure remaining details later.'
  );

  return lines.join('\n');
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
    'database source',
    'connection',
    'api endpoint',
    'credential',
    'api key',
    'trigger mode',
    'schedule',
    'polling',
    'mcp source',
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

function coerceDiscoveryOutput(output: unknown): z.infer<typeof discoveryOutputSchema> | null {
  const resolved = resolveStructuredOutput(output);
  const strict = discoveryOutputSchema.safeParse(resolved);
  if (strict.success) {
    return strict.data;
  }

  if (!resolved || typeof resolved !== 'object' || Array.isArray(resolved)) {
    return null;
  }

  const record = resolved as Record<string, unknown>;
  const fallbackQuestions = coerceDiscoveryQuestions(
    record.questions ?? record.requiredQuestions ?? record.followUpQuestions
  );
  const fallbackNotes =
    Array.isArray(record.contextNotes)
      ? record.contextNotes.filter((note): note is string => typeof note === 'string')
      : Array.isArray(record.notes)
        ? record.notes.filter((note): note is string => typeof note === 'string')
        : [];

  const fallback = {
    needsMoreInfo:
      typeof record.needsMoreInfo === 'boolean'
        ? record.needsMoreInfo
        : typeof record.status === 'string'
          ? record.status.toLowerCase() === 'building'
          : fallbackQuestions.length > 0,
    message:
      typeof record.message === 'string'
        ? record.message
        : typeof record.summary === 'string'
          ? record.summary
          : typeof record.thinking === 'string'
            ? record.thinking
            : undefined,
    questions: fallbackQuestions,
    contextNotes: fallbackNotes,
  };

  const parsedFallback = discoveryOutputSchema.safeParse(fallback);
  return parsedFallback.success ? parsedFallback.data : null;
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
    'connection',
    'api endpoint',
    'endpoint',
    'credential',
    'api key',
    'token',
    'secret',
    'webhook',
    'slack',
    'email',
    'destination',
    'trigger mode',
    'schedule',
    'poll',
    'mcp',
    'table',
    'field',
    'column',
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

function isDiscoveryQuestionAnsweredByFreeform(params: {
  question: DiscoveryQuestion;
  text: string;
  workspaceConnections: Array<{ name: string }>;
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

function filterAnsweredDiscoveryQuestions(params: {
  questions: DiscoveryQuestion[];
  userMessage: string;
  answerHistory?: string[];
  workspaceConnections: Array<{ name: string }>;
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
  workspaceConnections: Array<{ name: string }>;
}): DiscoveryAssessment {
  const { ai, deterministic, prior, userMessage, answerHistory, workspaceConnections } = params;

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

  const deferredSetupQuestions = requiredResolution.remaining.filter(
    (question) => !isOutcomeCriticalDiscoveryQuestion(question)
  );
  const finalRequiredNow = requiredResolution.remaining.filter((question) =>
    isOutcomeCriticalDiscoveryQuestion(question)
  );
  const finalOptionalLater = dedupeDiscoveryQuestions([
    ...optionalResolution.remaining,
    ...deferredSetupQuestions.map((question) => ({
      ...question,
      requiredNow: false,
    })),
  ]);

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

  if (deferredSetupQuestions.length > 0) {
    contextNotes.push(
      `Deferred setup details to Connections stage: ${deferredSetupQuestions
        .map((question) => question.label)
        .join(', ')}.`
    );
  }

  const shouldBlock = finalRequiredNow.length > 0;
  const preface =
    ai.message?.trim() ||
    deterministic.message?.trim() ||
    (shouldBlock
      ? 'I reviewed your request and identified the minimum required details before generation.'
      : undefined);

  const questions = dedupeDiscoveryQuestions([
    ...finalRequiredNow,
    ...finalOptionalLater,
  ]);

  return {
    shouldBlock,
    message: shouldBlock
      ? buildDiscoveryMessage({
          requiredNow: finalRequiredNow,
          optionalLater: finalOptionalLater,
          preface,
        })
      : preface,
    questions,
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
  }

  const normalizedQuestions = dedupeDiscoveryQuestions(questions);
  if (normalizedQuestions.length === 0) {
    return {
      shouldBlock: false,
      questions: [],
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
      questions: normalizedQuestions,
      contextNotes,
    };
  }

  return {
    shouldBlock: requiredNow.length > 0,
    message: buildDiscoveryMessage({ requiredNow, optionalLater }),
    questions: normalizedQuestions,
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

  const lines = [
    '',
    '## Existing BaleyBots in This Workspace',
    'You can reference these when building new BaleyBots:',
    '',
  ];

  for (const bb of baleybots) {
    lines.push(`- **${bb.name}** (${bb.id}): ${bb.description || 'No description'}`);
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

  const lines = ['', '## Previous Conversation', ''];

  for (const msg of messages) {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    lines.push(`${role}: ${sanitizeCreatorText(msg.content)}`);
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
  lines.push(formatToolCatalogForCreatorBot(fullCatalog));

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
    lines.push('', '## Current Discovery Context', additionalContext.trim());
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
  const connectionsSummary = options.context.connections.length > 0
    ? options.context.connections
        .map((conn) => `${conn.name} (${conn.type}, ${conn.status})`)
        .join('; ')
    : 'No workspace connections found.';

  return [
    buildCreatorContext(options),
    '',
    '## Discovery Task',
    'Only decide whether we have enough information to generate a runnable first version.',
    'Use progressive disclosure: identify which details are required now versus can be configured later.',
    '',
    `Workspace connections: ${connectionsSummary}`,
  ].join('\n');
}

async function assessDiscoveryNeedsWithInternalBB(
  options: CreatorBotOptions,
  userMessage: string
): Promise<DiscoveryAssessment> {
  try {
    const { output } = await executeInternalBaleybot(
      'creator_discovery',
      userMessage,
      {
        userWorkspaceId: options.context.workspaceId,
        context: buildDiscoveryContext(options),
        triggeredBy: 'internal',
      }
    );

    const parsed = coerceDiscoveryOutput(output);

    if (!parsed) {
      logger.warn('creator_discovery returned invalid shape, using deterministic fallback', {
        outputType: typeof output,
      });
      return assessDiscoveryNeeds(options, userMessage);
    }

    const normalizedQuestions = dedupeDiscoveryQuestions(parsed.questions);
    const requiredNow = normalizedQuestions.filter(
      (question) => question.requiredNow !== false
    );
    const optionalLater = normalizedQuestions.filter(
      (question) => question.requiredNow === false
    );

    return {
      shouldBlock: requiredNow.length > 0,
      message: requiredNow.length > 0
        ? buildDiscoveryMessage({
            requiredNow,
            optionalLater,
            preface: parsed.message,
          })
        : parsed.message,
      questions: normalizedQuestions,
      contextNotes: parsed.contextNotes,
    };
  } catch (error) {
    logger.warn('creator_discovery failed, using deterministic fallback', {
      error: error instanceof Error ? error.message : String(error),
    });
    return assessDiscoveryNeeds(options, userMessage);
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
  const priorDiscovery = extractLatestDiscoverySnapshot(options.conversationHistory);
  const answerHistory = extractRecentUserMessages(options.conversationHistory);
  const aiDiscovery = await assessDiscoveryNeedsWithInternalBB(options, sanitizedUserMessage);
  const deterministicDiscovery = assessDiscoveryNeeds(options, sanitizedUserMessage);
  const discovery = mergeDiscoveryAssessments({
    ai: aiDiscovery,
    deterministic: deterministicDiscovery,
    prior: priorDiscovery,
    userMessage: sanitizedUserMessage,
    answerHistory,
    workspaceConnections: options.context.connections.map((connection) => ({
      name: connection.name,
    })),
  });

  if (discovery.shouldBlock) {
    const requiredNow = discovery.questions.filter(
      (question) => question.requiredNow !== false
    );
    const optionalLater = discovery.questions.filter(
      (question) => question.requiredNow === false
    );
    const iteration = Math.max(1, (priorDiscovery?.iteration ?? 0) + 1);
    const discoveryPrompt =
      discovery.message ??
      buildDiscoveryMessage({
        requiredNow,
        optionalLater,
      });

    const stageSummary = buildStageSummary({
      whatIDid:
        iteration > 1
          ? 'Re-evaluated your latest reply and checked what is still required for a runnable build.'
          : 'Reviewed your request and checked workspace context, tools, and required setup details.',
      currentStage: `Discovery (Round ${iteration})`,
      nextStage: 'Design Generation',
      nextAction:
        requiredNow.length > 0
          ? 'Answer the required questions and I will generate BAL + visual design.'
          : 'I can proceed to generation now, with optional details handled later.',
    });

    const promptMessage = `${stageSummary}\n\n${discoveryPrompt}`.trim();

    return {
      thinking: promptMessage,
      message: promptMessage,
      questions: discovery.questions,
      entities: [],
      connections: [],
      balCode: '',
      name: inferDraftName(sanitizedUserMessage),
      description: 'Collecting required setup details before final generation.',
      icon: '🧭',
      status: 'building',
    };
  }

  const context = buildCreatorContext(options, (() => {
    const transcript = extractUserTranscript(options, sanitizedUserMessage);
    const skillHints = inferBalSkillHints(transcript);
    const contextLines = [
      ...discovery.contextNotes.map((note) => `- ${note}`),
      ...skillHints.map((hint) => `- ${hint}`),
    ];
    return contextLines.length > 0 ? contextLines.join('\n') : undefined;
  })());
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
      const prompt = cycleIndex === 1
        ? sanitizedUserMessage
        : buildCreatorRepairPrompt({
            originalUserMessage: sanitizedUserMessage,
            previousPrompt: sanitizedUserMessage,
            lastError: state.lastError,
            lastRawPreview: state.lastRawPreview,
          });

      const { output } = await executeInternalBaleybot(
        'creator_bot',
        prompt,
        {
          userWorkspaceId: options.context.workspaceId,
          context,
          triggeredBy: 'internal',
        }
      );

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
    }),
    isSuccess: (_state, result) => result.validation.success,
    getCycleSignature: (_state, result) => result.validation.signature,
    getImprovement: (previous, next, result) => {
      if (result.validation.success && !previous.bestOutput && next.bestOutput) {
        return 1;
      }
      return 0;
    },
    onCycleError: ({ error }) => {
      logger.error('Creator orchestration cycle failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        continueLoop: true,
      };
    },
  });

  if (loopResult.finalState.bestOutput) {
    if (loopResult.cycles.length > 1) {
      logger.info('Creator orchestration recovered malformed output', {
        cycles: loopResult.cycles.length,
        stopReason: loopResult.stopReason,
      });
    }
    return enrichGeneratedOutputNarrative(
      loopResult.finalState.bestOutput,
      options,
      loopResult.cycles.length
    );
  }

  logger.error('Creator bot output validation failed after orchestration', {
    stopReason: loopResult.stopReason,
    status: loopResult.status,
    cycles: loopResult.cycles.length,
    lastError: loopResult.finalState.lastError,
  });
  throw new Error(
    'The AI returned an incomplete response. Please try again with a simpler description.'
  );
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
