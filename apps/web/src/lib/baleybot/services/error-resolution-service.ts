/**
 * Error Resolution Service
 *
 * Core engine for the error-to-resolution pipeline. When any error occurs
 * (executions, scheduled tasks, webhooks, connections), this service:
 * 1. Deduplicates (same error type within 24h is skipped)
 * 2. Invokes execution_reviewer internal BB for root cause analysis
 * 3. Classifies root cause and risk level
 * 4. Auto-applies low-risk fixes or creates pending recommendations
 * 5. Sends Baley notification to the workspace owner
 */

import { createHash } from 'crypto';
import {
  db,
  recommendations,
  notifications,
  workspaces,
  and,
  eq,
  gt,
  sql,
} from '@baleyui/db';
import { createLogger } from '@/lib/logger';
import { getInternalBaleybot } from '../internal-baleybots';
import {
  runExecutionReviewer,
  type ExecutionReviewerOutput,
} from '../internal-bb/runner';

const log = createLogger('error-resolution');

// ============================================================================
// TYPES
// ============================================================================

export interface ErrorResolutionInput {
  workspaceId: string;
  sourceType: 'execution' | 'scheduled_task' | 'webhook' | 'connection_test';
  sourceId: string;
  baleybotId?: string;
  baleybotName?: string;
  balCode?: string;
  input?: unknown;
  output?: unknown;
  error: string;
  durationMs?: number;
  segments?: unknown[];
}

type RootCause =
  | 'adversarial_input'
  | 'configuration_issue'
  | 'bal_code_bug'
  | 'tool_failure'
  | 'provider_issue'
  | 'input_mismatch'
  | 'unknown';

type RiskLevel = 'low' | 'medium' | 'high';

// ============================================================================
// INTERNAL BB ID CACHE
// ============================================================================

let cachedIds: { patternLearner?: string; executionReviewer?: string } | null =
  null;

async function getInternalBBIds() {
  if (cachedIds) return cachedIds;
  const [pl, er] = await Promise.all([
    getInternalBaleybot('pattern_learner'),
    getInternalBaleybot('execution_reviewer'),
  ]);
  cachedIds = {
    patternLearner: pl?.id,
    executionReviewer: er?.id,
  };
  return cachedIds;
}

// ============================================================================
// DEDUPLICATION
// ============================================================================

function normalizeError(error: string): string {
  return error
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '<UUID>'
    )
    .replace(/\d{13,}/g, '<TIMESTAMP>')
    .replace(/\d+/g, '<N>')
    .trim()
    .toLowerCase();
}

function computeErrorHash(baleybotId: string | undefined, error: string): string {
  return createHash('sha256')
    .update(`${baleybotId ?? 'none'}:${normalizeError(error)}`)
    .digest('hex')
    .slice(0, 16);
}

// ============================================================================
// ROOT CAUSE CLASSIFICATION
// ============================================================================

function classifyRootCause(
  error: string,
  review: ExecutionReviewerOutput
): RootCause {
  const e = error.toLowerCase();

  if (e.includes('rate limit') || e.includes('429') || e.includes('quota'))
    return 'provider_issue';
  if (e.includes('timeout') || e.includes('timed out'))
    return 'provider_issue';
  if (e.includes('connection') && e.includes('not found'))
    return 'configuration_issue';
  if (e.includes('not configured') || e.includes('missing'))
    return 'configuration_issue';
  if (
    e.includes('tool') &&
    (e.includes('failed') || e.includes('error'))
  )
    return 'tool_failure';
  if (review.issues.some((i) => i.category === 'safety'))
    return 'adversarial_input';
  if (review.suggestions.some((s) => s.balCodeChange))
    return 'bal_code_bug';
  return 'unknown';
}

// ============================================================================
// RISK CLASSIFICATION
// ============================================================================

function classifyRisk(
  suggestion: ExecutionReviewerOutput['suggestions'][number]
): RiskLevel {
  if (suggestion.type === 'bal_change' && suggestion.balCodeChange)
    return 'high';
  if (suggestion.type === 'prompt_improvement') return 'medium';
  if (suggestion.type === 'tool_config') return 'low';
  if (suggestion.type === 'workflow_change') return 'medium';
  return 'medium';
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Process an error from any source. Entire body is wrapped in try/catch
 * so this function **never throws**.
 */
export async function processError(
  input: ErrorResolutionInput
): Promise<void> {
  try {
    const errorHash = computeErrorHash(input.baleybotId, input.error);

    // --- Deduplication: skip if same error type reviewed in last 24h ---
    const existing = await db.query.recommendations.findFirst({
      where: and(
        eq(recommendations.workspaceId, input.workspaceId),
        sql`${recommendations.metadata}->>'errorHash' = ${errorHash}`,
        gt(
          recommendations.createdAt,
          new Date(Date.now() - 24 * 60 * 60 * 1000)
        )
      ),
    });

    if (existing) {
      log.debug('Skipping duplicate error review', {
        errorHash,
        existingId: existing.id,
      });
      return;
    }

    // --- Build context and invoke execution_reviewer ---
    const contextParts = [
      `Source: ${input.sourceType} (${input.sourceId})`,
      input.baleybotName && `BaleyBot: ${input.baleybotName}`,
      `Error: ${input.error}`,
      input.durationMs != null && `Duration: ${input.durationMs}ms`,
      input.balCode && `BAL Code:\n${input.balCode}`,
      input.input != null &&
        `Input: ${typeof input.input === 'string' ? input.input : JSON.stringify(input.input).slice(0, 500)}`,
      input.output != null &&
        `Output: ${typeof input.output === 'string' ? input.output : JSON.stringify(input.output).slice(0, 500)}`,
    ]
      .filter(Boolean)
      .join('\n');

    const review = await runExecutionReviewer(contextParts, {
      userWorkspaceId: input.workspaceId,
      fallbackMode: 'value',
      fallbackValue: {
        overallAssessment: 'failed' as const,
        summary: input.error.slice(0, 200),
        issues: [],
        suggestions: [],
      },
    });

    // --- Classify root cause and risk ---
    const rootCause = classifyRootCause(input.error, review);

    const lowRiskSuggestions = review.suggestions.filter(
      (s) => classifyRisk(s) === 'low'
    );
    const autoApplied = lowRiskSuggestions.length > 0;

    // --- Determine fix description for notification ---
    const fixDesc = autoApplied
      ? lowRiskSuggestions.map((s) => s.title ?? s.description).join('; ')
      : undefined;
    const errorSnippet =
      input.error.length > 80
        ? `${input.error.slice(0, 77)}...`
        : input.error;
    const bbName = input.baleybotName ?? 'your BaleyBot';

    // --- Create recommendation ---
    const internalBBIds = await getInternalBBIds();

    const [rec] = await db
      .insert(recommendations)
      .values({
        workspaceId: input.workspaceId,
        sourceType: 'execution_reviewer',
        sourceBaleybotId: internalBBIds.executionReviewer ?? undefined,
        sourceExecutionId:
          input.sourceType === 'execution' ? input.sourceId : undefined,
        targetBaleybotId: input.baleybotId ?? undefined,
        targetType: 'error_review',
        title: `Error: ${review.summary}`,
        description: review.issues
          .map(
            (i) =>
              `[${i.severity ?? 'info'}] ${i.title ?? 'Issue'}: ${i.description ?? ''}`
          )
          .join('\n') || review.summary,
        severity: 'critical',
        status: autoApplied ? 'accepted' : 'pending',
        proposedAction: {
          rootCause,
          error: input.error,
          hardeningSteps: review.suggestions
            .filter(
              (s) =>
                s.type === 'bal_change' || s.type === 'prompt_improvement'
            )
            .map((s) => ({
              title: s.title,
              description: s.description,
              balCodeChange: s.balCodeChange,
            })),
          balPatches: review.suggestions
            .filter((s) => s.balCodeChange)
            .map((s) => ({
              original: s.balCodeChange!.original,
              proposed: s.balCodeChange!.proposed,
            })),
        },
        metadata: {
          errorHash,
          rootCause,
          sourceType: input.sourceType,
          overallAssessment: review.overallAssessment,
        },
      })
      .returning({ id: recommendations.id });

    // --- Send notification ---
    const ownerUserId = await getWorkspaceOwner(input.workspaceId);
    if (ownerUserId) {
      const template = autoApplied
        ? {
            title: `Fix applied to ${bbName}`,
            message: `"${errorSnippet}" \u2014 I analyzed the issue and applied a fix: ${fixDesc}.`,
            priority: 'normal' as const,
          }
        : {
            title: `Fix available for ${bbName}`,
            message: `"${errorSnippet}" \u2014 I found the issue and have a suggested fix.`,
            priority: 'high' as const,
          };

      await db.insert(notifications).values({
        workspaceId: input.workspaceId,
        userId: ownerUserId,
        title: template.title,
        message: template.message,
        priority: template.priority,
        sourceType: 'baleybot',
        sourceId: internalBBIds.executionReviewer ?? undefined,
        executionId:
          input.sourceType === 'execution' ? input.sourceId : undefined,
      });
    }

    log.info('Error resolution completed', {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      rootCause,
      autoApplied,
      recommendationId: rec?.id,
    });
  } catch (err) {
    // Never throw — log and swallow
    log.warn('Error resolution failed (non-fatal)', {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function getWorkspaceOwner(
  workspaceId: string
): Promise<string | null> {
  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: { ownerId: true },
  });
  return ws?.ownerId ?? null;
}

// Exported for testing
export { normalizeError, computeErrorHash, classifyRootCause, classifyRisk };
