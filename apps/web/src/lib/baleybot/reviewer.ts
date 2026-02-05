/**
 * Review Agent Service
 *
 * Analyzes BaleyBot execution results and proposes improvements.
 * Uses the internal execution_reviewer BaleyBot.
 */

import { z } from 'zod';
import { executeInternalBaleybot } from './internal-baleybots';
import { createLogger } from '@/lib/logger';

const logger = createLogger('baleybot/reviewer');

export interface ExecutionContext {
  baleybotId: string;
  baleybotName: string;
  originalIntent: string;
  balCode: string;
  input: string;
  output: unknown;
  error?: string;
  durationMs?: number;
  tokenCount?: number;
  segments?: unknown[];
}

export interface ReviewIssue {
  id: string;
  severity: 'error' | 'warning' | 'suggestion';
  category:
    | 'accuracy'
    | 'completeness'
    | 'performance'
    | 'safety'
    | 'clarity'
    | 'efficiency';
  title: string;
  description: string;
  affectedEntity?: string;
  suggestedFix?: string;
}

export interface ReviewSuggestion {
  id: string;
  type: 'bal_change' | 'tool_config' | 'prompt_improvement' | 'workflow_change';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  balCodeChange?: {
    original: string;
    proposed: string;
    entityName?: string;
  };
  reasoning: string;
}

export interface ReviewResult {
  executionId?: string;
  overallAssessment: 'excellent' | 'good' | 'needs_improvement' | 'failed';
  summary: string;
  issues: ReviewIssue[];
  suggestions: ReviewSuggestion[];
  metrics?: {
    outputQualityScore: number; // 0-100
    intentAlignmentScore: number; // 0-100
    efficiencyScore: number; // 0-100
  };
}

export interface ReviewerConfig {
  maxSuggestions?: number;
}

// Schema for the review result
const reviewResultSchema = z.object({
  overallAssessment: z.enum(['excellent', 'good', 'needs_improvement', 'failed']),
  summary: z.string().describe('Brief summary of the execution quality'),
  issues: z.array(
    z.object({
      id: z.string(),
      severity: z.enum(['error', 'warning', 'suggestion']),
      category: z.enum([
        'accuracy',
        'completeness',
        'performance',
        'safety',
        'clarity',
        'efficiency',
      ]),
      title: z.string(),
      description: z.string(),
      affectedEntity: z.string().optional(),
      suggestedFix: z.string().optional(),
    })
  ),
  suggestions: z.array(
    z.object({
      id: z.string(),
      type: z.enum([
        'bal_change',
        'tool_config',
        'prompt_improvement',
        'workflow_change',
      ]),
      title: z.string(),
      description: z.string(),
      impact: z.enum(['high', 'medium', 'low']),
      balCodeChange: z
        .object({
          original: z.string(),
          proposed: z.string(),
          entityName: z.string().optional(),
        })
        .optional(),
      reasoning: z.string(),
    })
  ),
  metrics: z
    .object({
      outputQualityScore: z.number().min(0).max(100),
      intentAlignmentScore: z.number().min(0).max(100),
      efficiencyScore: z.number().min(0).max(100),
    })
    .optional(),
});

/**
 * Format output for display in the review prompt.
 */
function formatOutput(output: unknown): string {
  if (output === null || output === undefined) {
    return 'No output generated';
  }

  if (typeof output === 'string') {
    return output.length > 2000 ? output.slice(0, 2000) + '...' : output;
  }

  try {
    const json = JSON.stringify(output, null, 2);
    return json.length > 2000 ? json.slice(0, 2000) + '...' : json;
  } catch {
    return String(output);
  }
}

/**
 * Validate and normalize the review result.
 */
function validateReviewResult(result: Partial<ReviewResult>): ReviewResult {
  const validAssessments = ['excellent', 'good', 'needs_improvement', 'failed'];
  const assessment = validAssessments.includes(result.overallAssessment ?? '')
    ? (result.overallAssessment as ReviewResult['overallAssessment'])
    : 'needs_improvement';

  return {
    overallAssessment: assessment,
    summary: result.summary || 'No summary available',
    issues: Array.isArray(result.issues)
      ? result.issues.map((issue, idx) => ({
          id: issue.id || `issue-${idx}`,
          severity: validateSeverity(issue.severity),
          category: validateCategory(issue.category),
          title: issue.title || 'Unknown Issue',
          description: issue.description || '',
          affectedEntity: issue.affectedEntity,
          suggestedFix: issue.suggestedFix,
        }))
      : [],
    suggestions: Array.isArray(result.suggestions)
      ? result.suggestions.map((suggestion, idx) => ({
          id: suggestion.id || `suggestion-${idx}`,
          type: validateSuggestionType(suggestion.type),
          title: suggestion.title || 'Improvement',
          description: suggestion.description || '',
          impact: validateImpact(suggestion.impact),
          balCodeChange: suggestion.balCodeChange,
          reasoning: suggestion.reasoning || '',
        }))
      : [],
    metrics: result.metrics
      ? {
          outputQualityScore: clamp(result.metrics.outputQualityScore || 0, 0, 100),
          intentAlignmentScore: clamp(
            result.metrics.intentAlignmentScore || 0,
            0,
            100
          ),
          efficiencyScore: clamp(result.metrics.efficiencyScore || 0, 0, 100),
        }
      : undefined,
  };
}

function validateSeverity(severity: unknown): 'error' | 'warning' | 'suggestion' {
  const valid = ['error', 'warning', 'suggestion'];
  return valid.includes(severity as string)
    ? (severity as 'error' | 'warning' | 'suggestion')
    : 'suggestion';
}

function validateCategory(category: unknown): ReviewIssue['category'] {
  const valid = [
    'accuracy',
    'completeness',
    'performance',
    'safety',
    'clarity',
    'efficiency',
  ];
  return valid.includes(category as string)
    ? (category as ReviewIssue['category'])
    : 'accuracy';
}

function validateSuggestionType(type: unknown): ReviewSuggestion['type'] {
  const valid = [
    'bal_change',
    'tool_config',
    'prompt_improvement',
    'workflow_change',
  ];
  return valid.includes(type as string)
    ? (type as ReviewSuggestion['type'])
    : 'prompt_improvement';
}

function validateImpact(impact: unknown): 'high' | 'medium' | 'low' {
  const valid = ['high', 'medium', 'low'];
  return valid.includes(impact as string)
    ? (impact as 'high' | 'medium' | 'low')
    : 'medium';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Create and return a reviewer function configured with the provided settings.
 */
export function createReviewer(config: ReviewerConfig = {}) {
  const maxSuggestions = config.maxSuggestions || 5;

  /**
   * Review an execution and generate improvement suggestions.
   * Executes via the internal execution_reviewer BaleyBot.
   */
  async function reviewExecution(ctx: ExecutionContext): Promise<ReviewResult> {
    const input = `## Original Intent
${ctx.originalIntent}

## BaleyBot: ${ctx.baleybotName}

## BAL Code
\`\`\`bal
${ctx.balCode}
\`\`\`

## Input
${typeof ctx.input === 'string' ? ctx.input : JSON.stringify(ctx.input, null, 2)}

## Output
${formatOutput(ctx.output)}

${ctx.error ? `## Error\n${ctx.error}` : ''}
${ctx.durationMs ? `## Execution Time: ${ctx.durationMs}ms` : ''}

Analyze this execution and provide improvement suggestions. Limit to ${maxSuggestions} suggestions maximum, prioritized by impact.`;

    try {
      const { output } = await executeInternalBaleybot('execution_reviewer', input, {
        triggeredBy: 'internal',
      });

      return validateReviewResult(output as Partial<ReviewResult>);
    } catch (error) {
      logger.error('Review failed', error);

      // Return a basic review result on failure
      return {
        overallAssessment: 'needs_improvement' as const,
        summary:
          'Unable to complete automated review. Please check the execution manually.',
        issues: [],
        suggestions: [],
      };
    }
  }

  return {
    reviewExecution,
  };
}

/**
 * Quick review function for simple cases.
 * Executes via the internal execution_reviewer BaleyBot.
 */
export async function quickReview(ctx: ExecutionContext): Promise<ReviewResult> {
  const reviewer = createReviewer();
  return reviewer.reviewExecution(ctx);
}
