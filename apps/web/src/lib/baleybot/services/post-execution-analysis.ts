/**
 * Post-Execution Analysis Service
 *
 * Handles intelligence for *successful* executions (separate from error resolution).
 * Triggers:
 * 1. First 3 executions → quick review for early guidance
 * 2. Slow execution (> 2x median of last 20) → performance-focused review
 * 3. Used approval-requiring tools → pattern learner analysis
 *
 * All triggers are non-blocking, throttled (1 per BB per 5 min), and never throw.
 */

import {
  db,
  recommendations,
  baleybotExecutions,
  eq,
  and,
  desc,
} from '@baleyui/db';
import { createLogger } from '@/lib/logger';
import { getInternalBaleybot } from '../internal-baleybots';
import {
  runExecutionReviewer,
  runPatternLearner,
  type ExecutionReviewerOutput,
} from '../internal-bb/runner';

const log = createLogger('post-execution-analysis');

// ============================================================================
// TYPES
// ============================================================================

export interface SuccessAnalysisInput {
  workspaceId: string;
  baleybotId: string;
  baleybotName: string;
  balCode: string;
  executionId: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  segments: unknown[];
}

// ============================================================================
// THROTTLE
// ============================================================================

const successThrottle = new Map<string, number>();
const SUCCESS_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

function isSuccessThrottled(baleybotId: string): boolean {
  const key = `success:${baleybotId}`;
  const last = successThrottle.get(key);
  if (last && Date.now() - last < SUCCESS_THROTTLE_MS) return true;
  successThrottle.set(key, Date.now());
  return false;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Analyze a successful execution. Never throws.
 */
export async function analyzeSuccessfulExecution(
  params: SuccessAnalysisInput
): Promise<void> {
  try {
    if (isSuccessThrottled(params.baleybotId)) {
      log.debug('Skipping success analysis (throttled)', {
        baleybotId: params.baleybotId,
      });
      return;
    }

    // Run analyses in parallel (each is independent)
    await Promise.allSettled([
      analyzeEarlyExecution(params),
      analyzeSlowExecution(params),
      analyzeApprovalTools(params),
    ]);
  } catch (err) {
    log.warn('Post-execution analysis failed (non-fatal)', {
      executionId: params.executionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ============================================================================
// EARLY EXECUTION REVIEW (first 3 runs)
// ============================================================================

async function analyzeEarlyExecution(
  params: SuccessAnalysisInput
): Promise<void> {
  // Count total executions for this BB
  const executions = await db.query.baleybotExecutions.findMany({
    where: eq(baleybotExecutions.baleybotId, params.baleybotId),
    columns: { id: true },
    limit: 4,
  });

  if (executions.length > 3) return; // Only for first 3

  const review = await quickReview(params, 'early guidance');
  if (
    review.overallAssessment === 'needs_improvement' ||
    review.overallAssessment === 'failed'
  ) {
    await persistRecommendation(params, review, 'early_guidance');
  }
}

// ============================================================================
// SLOW EXECUTION DETECTION
// ============================================================================

async function analyzeSlowExecution(
  params: SuccessAnalysisInput
): Promise<void> {
  // Get last 20 durations for this BB
  const recentExecs = await db.query.baleybotExecutions.findMany({
    where: and(
      eq(baleybotExecutions.baleybotId, params.baleybotId),
      eq(baleybotExecutions.status, 'completed')
    ),
    columns: { durationMs: true },
    orderBy: [desc(baleybotExecutions.createdAt)],
    limit: 20,
  });

  const durations = recentExecs
    .map((e) => e.durationMs)
    .filter((d): d is number => d != null);

  if (durations.length < 3) return; // Need enough data

  // Calculate median
  const sorted = [...durations].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;

  // Only flag if > 2x median
  if (params.durationMs <= median * 2) return;

  const review = await quickReview(
    params,
    `Performance review: This execution took ${params.durationMs}ms which is over 2x the median of ${median}ms.`
  );

  await persistRecommendation(params, review, 'performance');
}

// ============================================================================
// APPROVAL TOOL ANALYSIS
// ============================================================================

async function analyzeApprovalTools(
  params: SuccessAnalysisInput
): Promise<void> {
  // Extract approval-requiring tool usage from segments
  const approvalTools = new Set([
    'schedule_task',
    'create_agent',
    'create_tool',
  ]);

  const usedApprovalTools = (params.segments ?? [])
    .filter((s): s is Record<string, unknown> => {
      if (!s || typeof s !== 'object') return false;
      const seg = s as Record<string, unknown>;
      return (
        seg.type === 'tool_call_stream_complete' &&
        typeof seg.toolName === 'string' &&
        approvalTools.has(seg.toolName)
      );
    })
    .map((s) => s.toolName as string);

  if (usedApprovalTools.length === 0) return;

  // Build approval requests context
  const approvalContext = usedApprovalTools
    .map(
      (tool) =>
        `Tool "${tool}" was used and required approval during execution.`
    )
    .join('\n');

  const patternResult = await runPatternLearner(
    `Analyze these approval events and suggest patterns:\n${approvalContext}\nBaleyBot: ${params.baleybotName}\nBAL Code:\n${params.balCode}`,
    {
      userWorkspaceId: params.workspaceId,
      fallbackMode: 'value',
      fallbackValue: { suggestions: [], warnings: [], recommendations: [] },
    }
  );

  if (patternResult.suggestions.length > 0) {
    const internalBBIds = await getInternalBBIdsForAnalysis();
    await db.insert(recommendations).values({
      workspaceId: params.workspaceId,
      sourceType: 'pattern_learner',
      sourceBaleybotId: internalBBIds.patternLearner ?? undefined,
      sourceExecutionId: params.executionId,
      targetBaleybotId: params.baleybotId,
      targetType: 'approval_pattern',
      title: `Approval pattern suggestions for ${params.baleybotName || 'BaleyBot'}`,
      description: patternResult.suggestions
        .map(
          (s) =>
            `[${s.riskAssessment}] Tool "${s.tool}": ${s.explanation}`
        )
        .join('\n'),
      severity: 'info',
      status: 'pending',
      proposedAction: { suggestions: patternResult.suggestions },
      metadata: {
        usedApprovalTools,
        sourceType: 'post_execution_analysis',
      },
    });
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function quickReview(
  params: SuccessAnalysisInput,
  focus: string
): Promise<ExecutionReviewerOutput> {
  const contextParts = [
    `Focus: ${focus}`,
    `BaleyBot: ${params.baleybotName}`,
    `Duration: ${params.durationMs}ms`,
    `BAL Code:\n${params.balCode}`,
    params.input != null &&
      `Input: ${typeof params.input === 'string' ? params.input : JSON.stringify(params.input).slice(0, 500)}`,
    params.output != null &&
      `Output: ${typeof params.output === 'string' ? params.output : JSON.stringify(params.output).slice(0, 500)}`,
  ]
    .filter(Boolean)
    .join('\n');

  return runExecutionReviewer(contextParts, {
    userWorkspaceId: params.workspaceId,
    fallbackMode: 'value',
    fallbackValue: {
      overallAssessment: 'good' as const,
      summary: 'Analysis unavailable',
      issues: [],
      suggestions: [],
    },
  });
}

let cachedAnalysisIds: {
  patternLearner?: string;
  executionReviewer?: string;
} | null = null;

async function getInternalBBIdsForAnalysis() {
  if (cachedAnalysisIds) return cachedAnalysisIds;
  const [pl, er] = await Promise.all([
    getInternalBaleybot('pattern_learner'),
    getInternalBaleybot('execution_reviewer'),
  ]);
  cachedAnalysisIds = {
    patternLearner: pl?.id,
    executionReviewer: er?.id,
  };
  return cachedAnalysisIds;
}

async function persistRecommendation(
  params: SuccessAnalysisInput,
  review: ExecutionReviewerOutput,
  targetType: string
): Promise<void> {
  const internalBBIds = await getInternalBBIdsForAnalysis();

  await db.insert(recommendations).values({
    workspaceId: params.workspaceId,
    sourceType: 'execution_reviewer',
    sourceBaleybotId: internalBBIds.executionReviewer ?? undefined,
    sourceExecutionId: params.executionId,
    targetBaleybotId: params.baleybotId,
    targetType,
    title: `${targetType === 'performance' ? 'Performance' : 'Early guidance'}: ${review.summary}`,
    description:
      review.issues
        .map(
          (i) =>
            `[${i.severity ?? 'info'}] ${i.title ?? 'Issue'}: ${i.description ?? ''}`
        )
        .join('\n') || review.summary,
    severity: targetType === 'performance' ? 'warning' : 'info',
    status: 'pending',
    proposedAction: {
      suggestions: review.suggestions,
      overallAssessment: review.overallAssessment,
    },
    metadata: {
      sourceType: 'post_execution_analysis',
      targetType,
      overallAssessment: review.overallAssessment,
    },
  });
}

// Exported for testing
export { isSuccessThrottled, successThrottle };
