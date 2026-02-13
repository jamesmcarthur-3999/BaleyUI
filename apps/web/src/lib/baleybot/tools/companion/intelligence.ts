/**
 * Intelligence Tools for Baley Companion
 *
 * Provides on-demand analysis capabilities:
 * - review_execution: Review any execution for issues
 * - diagnose_failure: Deep root cause analysis on failed executions
 * - suggest_approval_patterns: Analyze approval history and suggest patterns
 */

import type { RuntimeToolDefinition } from '../../executor';
import type { CompanionToolContext } from './index';
import {
  db,
  baleybotExecutions,
  recommendations,
  eq,
  and,
  desc,
} from '@baleyui/db';
import {
  runExecutionReviewer,
  runPatternLearner,
} from '../../internal-bb/runner';
import { getInternalBaleybot } from '../../internal-baleybots';
import {
  classifyRootCause,
} from '../../services/error-resolution-service';

export function buildIntelligenceTools(
  ctx: CompanionToolContext
): Map<string, RuntimeToolDefinition> {
  const tools = new Map<string, RuntimeToolDefinition>();

  // ========================================================================
  // review_execution
  // ========================================================================

  tools.set('review_execution', {
    name: 'review_execution',
    description:
      'Review a BaleyBot execution to identify issues and suggest improvements. Use when a user asks about execution results or wants to improve their bot.',
    inputSchema: {
      type: 'object',
      properties: {
        executionId: {
          type: 'string',
          description: 'UUID of the execution to review',
        },
      },
      required: ['executionId'],
    },
    async function(args: Record<string, unknown>) {
      const executionId = String(args.executionId);

      // Fetch execution with baleybot relation
      const execution = await db.query.baleybotExecutions.findFirst({
        where: eq(baleybotExecutions.id, executionId),
        with: { baleybot: true },
      });

      if (!execution) {
        return { error: 'Execution not found' };
      }

      // Verify workspace ownership
      if (execution.baleybot.workspaceId !== ctx.workspaceId) {
        return { error: 'Execution not found in this workspace' };
      }

      // Build context for review
      const contextParts = [
        `BaleyBot: ${execution.baleybot.name}`,
        `Status: ${execution.status}`,
        execution.error && `Error: ${execution.error}`,
        execution.durationMs != null && `Duration: ${execution.durationMs}ms`,
        execution.baleybot.balCode && `BAL Code:\n${execution.baleybot.balCode}`,
        execution.input != null &&
          `Input: ${JSON.stringify(execution.input).slice(0, 500)}`,
        execution.output != null &&
          `Output: ${JSON.stringify(execution.output).slice(0, 500)}`,
      ]
        .filter(Boolean)
        .join('\n');

      const review = await runExecutionReviewer(contextParts, {
        userWorkspaceId: ctx.workspaceId,
        fallbackMode: 'value',
        fallbackValue: {
          overallAssessment: 'needs_improvement' as const,
          summary: 'Analysis unavailable',
          issues: [],
          suggestions: [],
        },
      });

      // If failed, add root cause info
      const result: Record<string, unknown> = {
        assessment: review.overallAssessment,
        summary: review.summary,
        issues: review.issues,
        suggestions: review.suggestions,
        metrics: review.metrics,
      };

      if (execution.status === 'failed' && execution.error) {
        result.rootCause = classifyRootCause(execution.error, review);
      }

      return result;
    },
  });

  // ========================================================================
  // diagnose_failure
  // ========================================================================

  tools.set('diagnose_failure', {
    name: 'diagnose_failure',
    description:
      'Deep root cause analysis on a failed execution. Returns error classification, hardening recommendations, and suggested fixes.',
    inputSchema: {
      type: 'object',
      properties: {
        executionId: {
          type: 'string',
          description: 'UUID of the failed execution',
        },
      },
      required: ['executionId'],
    },
    async function(args: Record<string, unknown>) {
      const executionId = String(args.executionId);

      const execution = await db.query.baleybotExecutions.findFirst({
        where: eq(baleybotExecutions.id, executionId),
        with: { baleybot: true },
      });

      if (!execution) {
        return { error: 'Execution not found' };
      }

      if (execution.baleybot.workspaceId !== ctx.workspaceId) {
        return { error: 'Execution not found in this workspace' };
      }

      if (execution.status !== 'failed') {
        return {
          error: `Execution status is "${execution.status}", not "failed". Use review_execution for non-failed executions.`,
        };
      }

      // Deep analysis
      const contextParts = [
        `Deep root cause analysis for failed execution`,
        `BaleyBot: ${execution.baleybot.name}`,
        `Error: ${execution.error}`,
        execution.durationMs != null && `Duration: ${execution.durationMs}ms`,
        execution.baleybot.balCode && `BAL Code:\n${execution.baleybot.balCode}`,
        execution.input != null &&
          `Input: ${JSON.stringify(execution.input).slice(0, 500)}`,
        execution.output != null &&
          `Output: ${JSON.stringify(execution.output).slice(0, 500)}`,
      ]
        .filter(Boolean)
        .join('\n');

      const review = await runExecutionReviewer(contextParts, {
        userWorkspaceId: ctx.workspaceId,
        fallbackMode: 'value',
        fallbackValue: {
          overallAssessment: 'failed' as const,
          summary: execution.error ?? 'Unknown failure',
          issues: [],
          suggestions: [],
        },
      });

      const rootCause = classifyRootCause(
        execution.error ?? '',
        review
      );

      // Persist as recommendation
      const internalBBIds = await getInternalBBIdsForIntelligence();
      await db.insert(recommendations).values({
        workspaceId: ctx.workspaceId,
        sourceType: 'execution_reviewer',
        sourceBaleybotId: internalBBIds.executionReviewer ?? undefined,
        sourceExecutionId: executionId,
        targetBaleybotId: execution.baleybot.id,
        targetType: 'error_review',
        title: `Diagnosis: ${review.summary}`,
        description: review.issues
          .map(
            (i) =>
              `[${i.severity ?? 'info'}] ${i.title ?? 'Issue'}: ${i.description ?? ''}`
          )
          .join('\n') || review.summary,
        severity: 'critical',
        status: 'pending',
        proposedAction: {
          rootCause,
          error: execution.error,
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
        },
        metadata: {
          rootCause,
          sourceType: 'companion_diagnose',
          overallAssessment: review.overallAssessment,
        },
      });

      return {
        rootCause,
        assessment: review.overallAssessment,
        summary: review.summary,
        issues: review.issues,
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
        suggestedFixes: review.suggestions
          .filter((s) => s.balCodeChange)
          .map((s) => ({
            original: s.balCodeChange!.original,
            proposed: s.balCodeChange!.proposed,
          })),
      };
    },
  });

  // ========================================================================
  // suggest_approval_patterns
  // ========================================================================

  tools.set('suggest_approval_patterns', {
    name: 'suggest_approval_patterns',
    description:
      "Analyze a BaleyBot's execution history and suggest approval patterns for tools that keep requiring manual approval.",
    inputSchema: {
      type: 'object',
      properties: {
        baleybotId: {
          type: 'string',
          description: 'UUID of the BaleyBot',
        },
      },
      required: ['baleybotId'],
    },
    async function(args: Record<string, unknown>) {
      const baleybotId = String(args.baleybotId);

      // Fetch recent executions with segments
      const executions = await db.query.baleybotExecutions.findMany({
        where: and(
          eq(baleybotExecutions.baleybotId, baleybotId),
          eq(baleybotExecutions.status, 'completed')
        ),
        columns: {
          id: true,
          segments: true,
        },
        orderBy: [desc(baleybotExecutions.createdAt)],
        limit: 20,
        with: { baleybot: true },
      });

      if (executions.length === 0) {
        return { suggestions: [], message: 'No completed executions found' };
      }

      // Verify workspace ownership
      const firstExec = executions[0]!;
      if (firstExec.baleybot.workspaceId !== ctx.workspaceId) {
        return { error: 'BaleyBot not found in this workspace' };
      }

      // Extract approval tool usage from all segments
      const approvalTools = new Set([
        'schedule_task',
        'create_agent',
        'create_tool',
      ]);

      const approvalEvents: Array<{
        tool: string;
        executionId: string;
      }> = [];

      for (const exec of executions) {
        const segments = (exec.segments ?? []) as Array<
          Record<string, unknown>
        >;
        for (const seg of segments) {
          if (
            seg.type === 'tool_call_stream_complete' &&
            typeof seg.toolName === 'string' &&
            approvalTools.has(seg.toolName)
          ) {
            approvalEvents.push({
              tool: seg.toolName,
              executionId: exec.id,
            });
          }
        }
      }

      if (approvalEvents.length === 0) {
        return {
          suggestions: [],
          message:
            'No approval-requiring tools were used in recent executions',
        };
      }

      // Analyze with pattern learner
      const approvalContext = approvalEvents
        .map(
          (e) =>
            `Tool "${e.tool}" used in execution ${e.executionId}`
        )
        .join('\n');

      const result = await runPatternLearner(
        `Analyze these approval events and suggest auto-approval patterns:\n${approvalContext}\nBaleyBot: ${firstExec.baleybot.name}\nBAL Code:\n${firstExec.baleybot.balCode}`,
        {
          userWorkspaceId: ctx.workspaceId,
          fallbackMode: 'value',
          fallbackValue: {
            suggestions: [],
            warnings: [],
            recommendations: [],
          },
        }
      );

      // Persist suggestions as recommendations
      if (result.suggestions.length > 0) {
        const internalBBIds = await getInternalBBIdsForIntelligence();
        await db.insert(recommendations).values({
          workspaceId: ctx.workspaceId,
          sourceType: 'pattern_learner',
          sourceBaleybotId: internalBBIds.patternLearner ?? undefined,
          targetBaleybotId: baleybotId,
          targetType: 'approval_pattern',
          title: `Approval pattern suggestions for ${firstExec.baleybot.name}`,
          description: result.suggestions
            .map(
              (s) =>
                `[${s.riskAssessment}] Tool "${s.tool}": ${s.explanation}`
            )
            .join('\n'),
          severity: 'info',
          status: 'pending',
          proposedAction: { suggestions: result.suggestions },
          metadata: {
            sourceType: 'companion_suggest_patterns',
            approvalEventCount: approvalEvents.length,
          },
        });
      }

      return {
        suggestions: result.suggestions,
        warnings: result.warnings,
        recommendations: result.recommendations,
        approvalEventCount: approvalEvents.length,
      };
    },
  });

  return tools;
}

// ============================================================================
// HELPERS
// ============================================================================

let cachedIntelligenceIds: {
  patternLearner?: string;
  executionReviewer?: string;
} | null = null;

async function getInternalBBIdsForIntelligence() {
  if (cachedIntelligenceIds) return cachedIntelligenceIds;
  const [pl, er] = await Promise.all([
    getInternalBaleybot('pattern_learner'),
    getInternalBaleybot('execution_reviewer'),
  ]);
  cachedIntelligenceIds = {
    patternLearner: pl?.id,
    executionReviewer: er?.id,
  };
  return cachedIntelligenceIds;
}
