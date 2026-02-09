import { createHash } from 'node:crypto';
import { runCreatorActionAdvisor } from './internal-bb/runner';
import type {
  CreatorGuidanceAction,
  CreatorMessage,
  CreatorPlanLedger,
} from './creator-types';
import { sanitizeCreatorText } from './creator-sanitization';
import { createLogger } from '@/lib/logger';

const log = createLogger('creator-guidance');

const GUIDANCE_CACHE_TTL_MS = 45_000;
const MAX_TRANSCRIPT_ITEMS = 12;

const cache = new Map<
  string,
  {
    expiresAt: number;
    actions: CreatorGuidanceAction[];
    generatedAt: number;
  }
>();

type GuidanceStatus = 'empty' | 'building' | 'ready' | 'running' | 'error';

export interface CreatorGuidanceInput {
  workspaceId: string;
  status: GuidanceStatus;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    metadata?: Record<string, unknown>;
  }>;
}

export interface CreatorGuidanceResult {
  actions: CreatorGuidanceAction[];
  generatedAt: number;
  stateHash: string;
  fromCache: boolean;
}

function sanitizePromptText(value: string, max = 300): string {
  return sanitizeCreatorText(value).slice(0, max).trim();
}

function normalizeAction(raw: CreatorGuidanceAction): CreatorGuidanceAction {
  return {
    label: sanitizePromptText(raw.label, 80),
    prompt: sanitizePromptText(raw.prompt, 2000),
    mode: raw.mode === 'insert' ? 'insert' : 'send',
    reason: raw.reason ? sanitizePromptText(raw.reason, 280) : undefined,
    priority:
      typeof raw.priority === 'number' && Number.isFinite(raw.priority)
        ? Math.max(1, Math.min(5, Math.round(raw.priority)))
        : undefined,
  };
}

function buildStateHash(input: CreatorGuidanceInput): string {
  const compactMessages = input.messages.slice(-MAX_TRANSCRIPT_ITEMS).map((message) => {
    const lifecycle = message.metadata?.creatorLifecycle as
      | {
          stage?: string;
          nextAction?: string;
          blockerMode?: string;
          runnableConfidence?: number;
          planLedger?: CreatorPlanLedger;
        }
      | undefined;

    return {
      role: message.role,
      content: sanitizePromptText(message.content, 380),
      stage: lifecycle?.stage,
      nextAction: lifecycle?.nextAction,
      blockerMode: lifecycle?.blockerMode,
      runnableConfidence: lifecycle?.runnableConfidence,
      openCount: lifecycle?.planLedger?.openDecisions?.length ?? 0,
      resolvedCount: lifecycle?.planLedger?.resolvedDecisions?.length ?? 0,
    };
  });

  const payload = JSON.stringify({
    status: input.status,
    messages: compactMessages,
  });

  return createHash('sha1').update(payload).digest('hex');
}

function pruneExpiredCache() {
  const now = Date.now();
  for (const [key, value] of cache) {
    if (value.expiresAt <= now) cache.delete(key);
  }
}

function buildGuidancePrompt(input: CreatorGuidanceInput): string {
  const recentMessages = input.messages.slice(-MAX_TRANSCRIPT_ITEMS);
  const transcript = recentMessages
    .map((message, index) => {
      const content = sanitizePromptText(message.content, 320);
      return `${index + 1}. ${message.role}: ${content}`;
    })
    .join('\n');

  const latestAssistantLifecycle = [...recentMessages]
    .reverse()
    .find((message) => message.role === 'assistant')?.metadata?.creatorLifecycle as
    | {
        stage?: string;
        nextStage?: string;
        nextAction?: string;
        blockerMode?: string;
        runnableConfidence?: number;
        assumptions?: unknown[];
        requiredQuestions?: unknown[];
        optionalQuestions?: unknown[];
        planLedger?: CreatorPlanLedger;
      }
    | undefined;

  const requiredQuestions = Array.isArray(latestAssistantLifecycle?.requiredQuestions)
    ? latestAssistantLifecycle.requiredQuestions.length
    : 0;
  const optionalQuestions = Array.isArray(latestAssistantLifecycle?.optionalQuestions)
    ? latestAssistantLifecycle.optionalQuestions.length
    : 0;
  const assumptionCount = Array.isArray(latestAssistantLifecycle?.assumptions)
    ? latestAssistantLifecycle.assumptions.length
    : 0;

  const planLedger = latestAssistantLifecycle?.planLedger;
  const openPlanCount = planLedger?.openDecisions?.length ?? 0;
  const resolvedPlanCount = planLedger?.resolvedDecisions?.length ?? 0;

  return [
    'Suggest up to three high-impact next actions for this creator session.',
    'Return only actions that can be executed now and are specific to current blockers.',
    '',
    `Creator status: ${input.status}`,
    latestAssistantLifecycle?.stage ? `Current stage: ${latestAssistantLifecycle.stage}` : '',
    latestAssistantLifecycle?.nextStage
      ? `Next stage hint: ${latestAssistantLifecycle.nextStage}`
      : '',
    latestAssistantLifecycle?.nextAction
      ? `Latest next-action note: ${latestAssistantLifecycle.nextAction}`
      : '',
    latestAssistantLifecycle?.blockerMode
      ? `Blocker mode: ${latestAssistantLifecycle.blockerMode}`
      : '',
    typeof latestAssistantLifecycle?.runnableConfidence === 'number'
      ? `Runnable confidence: ${Math.round(latestAssistantLifecycle.runnableConfidence * 100)}%`
      : '',
    requiredQuestions > 0 ? `Required questions remaining: ${requiredQuestions}` : '',
    optionalQuestions > 0 ? `Optional questions remaining: ${optionalQuestions}` : '',
    assumptionCount > 0 ? `Assumptions in play: ${assumptionCount}` : '',
    openPlanCount > 0 ? `Open plan decisions: ${openPlanCount}` : '',
    resolvedPlanCount > 0 ? `Resolved plan decisions: ${resolvedPlanCount}` : '',
    '',
    'Recent transcript:',
    transcript || '(no transcript)',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function getCreatorGuidance(
  input: CreatorGuidanceInput
): Promise<CreatorGuidanceResult> {
  if (input.status === 'running') {
    return {
      actions: [],
      generatedAt: Date.now(),
      stateHash: buildStateHash(input),
      fromCache: false,
    };
  }

  pruneExpiredCache();
  const stateHash = buildStateHash(input);
  const cacheKey = `${input.workspaceId}:${stateHash}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      actions: cached.actions,
      generatedAt: cached.generatedAt,
      stateHash,
      fromCache: true,
    };
  }

  try {
    const parsed = await runCreatorActionAdvisor(buildGuidancePrompt(input), {
      userWorkspaceId: input.workspaceId,
      triggeredBy: 'internal',
      repairAttempts: 1,
      fallbackMode: 'value',
      fallbackValue: { actions: [] },
    });

    const seen = new Set<string>();
    const actions = parsed.actions
      .map(normalizeAction)
      .filter((action) => action.label.length > 0 && action.prompt.length > 0)
      .filter((action) => {
        const key = `${action.label}::${action.prompt}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3))
      .slice(0, 3);

    const generatedAt = Date.now();
    cache.set(cacheKey, {
      actions,
      generatedAt,
      expiresAt: generatedAt + GUIDANCE_CACHE_TTL_MS,
    });

    return {
      actions,
      generatedAt,
      stateHash,
      fromCache: false,
    };
  } catch (error) {
    log.warn('creator guidance failed', {
      workspaceId: input.workspaceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      actions: [],
      generatedAt: Date.now(),
      stateHash,
      fromCache: false,
    };
  }
}

export function toCreatorGuidanceInputFromHistory(args: {
  workspaceId: string;
  status: GuidanceStatus;
  messages: CreatorMessage[];
}): CreatorGuidanceInput {
  return {
    workspaceId: args.workspaceId,
    status: args.status,
    messages: args.messages.slice(-30).map((message) => ({
      role: message.role,
      content: message.content.slice(0, 4000),
      metadata: message.metadata as Record<string, unknown> | undefined,
    })),
  };
}
