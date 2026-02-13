/**
 * Action Tools for Baley Companion
 *
 * Provides recommendation management capabilities:
 * - list_pending_actions: View pending recommendations for the workspace
 * - apply_action: Accept a recommendation (with guardrails for code changes)
 */

import type { RuntimeToolDefinition } from '../../executor';
import type { CompanionToolContext } from './index';
import {
  db,
  recommendations,
  approvalPatterns,
  eq,
  and,
  desc,
  sql,
} from '@baleyui/db';

export function buildActionTools(
  ctx: CompanionToolContext
): Map<string, RuntimeToolDefinition> {
  const tools = new Map<string, RuntimeToolDefinition>();

  // ========================================================================
  // list_pending_actions
  // ========================================================================

  tools.set('list_pending_actions', {
    name: 'list_pending_actions',
    description:
      'List pending recommendations/actions for the workspace. Returns actionable suggestions from AI analysis of BaleyBot executions.',
    inputSchema: {
      type: 'object',
      properties: {
        severity: {
          type: 'string',
          enum: ['critical', 'warning', 'info'],
          description: 'Filter by severity level',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of items to return (default 10)',
        },
      },
    },
    async function(args: Record<string, unknown>) {
      const severity = args.severity as string | undefined;
      const limit = Math.min(Number(args.limit) || 10, 50);

      const filters = [
        eq(recommendations.workspaceId, ctx.workspaceId),
        eq(recommendations.status, 'pending'),
      ];

      if (severity) {
        filters.push(eq(recommendations.severity, severity));
      }

      const items = await db.query.recommendations.findMany({
        where: and(...filters),
        orderBy: [desc(recommendations.createdAt)],
        limit,
        with: {
          targetBaleybot: { columns: { id: true, name: true, icon: true } },
        },
      });

      // Total count for context
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(recommendations)
        .where(
          and(
            eq(recommendations.workspaceId, ctx.workspaceId),
            eq(recommendations.status, 'pending')
          )
        );
      const totalPending = countResult[0]?.count ?? 0;

      return {
        actions: items.map((item) => ({
          id: item.id,
          title: item.title,
          severity: item.severity,
          targetType: item.targetType,
          targetBotName: item.targetBaleybot?.name ?? null,
          createdAt: item.createdAt.toISOString(),
        })),
        total: totalPending,
      };
    },
  });

  // ========================================================================
  // apply_action
  // ========================================================================

  tools.set('apply_action', {
    name: 'apply_action',
    description:
      'Accept and apply a recommendation. For code changes (bal_patch), redirects the user to the Actions page to review the diff instead of applying directly.',
    inputSchema: {
      type: 'object',
      properties: {
        recommendationId: {
          type: 'string',
          description: 'UUID of the recommendation to apply',
        },
      },
      required: ['recommendationId'],
    },
    async function(args: Record<string, unknown>) {
      const recommendationId = String(args.recommendationId);

      const rec = await db.query.recommendations.findFirst({
        where: and(
          eq(recommendations.id, recommendationId),
          eq(recommendations.workspaceId, ctx.workspaceId)
        ),
      });

      if (!rec) {
        return { error: 'Recommendation not found' };
      }

      // Already handled — graceful, not an error
      if (rec.status !== 'pending') {
        return { alreadyHandled: true, currentStatus: rec.status };
      }

      // For code changes, redirect to Actions page for visual review
      if (
        rec.targetType === 'bal_patch' ||
        (rec.targetType === 'error_review' && rec.proposedAction &&
          typeof rec.proposedAction === 'object' &&
          'hardeningSteps' in (rec.proposedAction as Record<string, unknown>))
      ) {
        return {
          action: 'navigate',
          path: `/dashboard/actions?highlight=${rec.id}`,
          message: 'This changes BAL code — please review the diff on the Actions page.',
        };
      }

      // Apply directly for safe action types
      const applied = await db.transaction(async (tx) => {
        // Update recommendation status (status check prevents double-apply race condition)
        const updated = await tx
          .update(recommendations)
          .set({
            status: 'accepted',
            decidedBy: ctx.userId,
            decidedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(recommendations.id, rec.id), eq(recommendations.status, 'pending')))
          .returning({ id: recommendations.id });

        // Race condition: another process already applied this recommendation
        if (updated.length === 0) {
          return false;
        }

        // Apply action based on target type
        switch (rec.targetType) {
          case 'approval_pattern': {
            const action = rec.proposedAction as {
              tool: string;
              actionPattern: Record<string, unknown>;
              entityGoalPattern?: string;
            };
            await tx.insert(approvalPatterns).values({
              workspaceId: rec.workspaceId,
              tool: action.tool,
              actionPattern: action.actionPattern,
              entityGoalPattern: action.entityGoalPattern ?? null,
              trustLevel: 'provisional',
            });
            break;
          }
          case 'configuration':
          case 'insight':
          case 'performance':
            // Informational — no side effect beyond status change
            break;
        }
        return true;
      });

      if (!applied) {
        return { alreadyHandled: true, currentStatus: 'unknown' };
      }

      const typeLabels: Record<string, string> = {
        approval_pattern: 'Auto-approval rule applied',
        configuration: 'Configuration updated',
        insight: 'Insight acknowledged',
        performance: 'Performance suggestion acknowledged',
      };

      return {
        success: true,
        message: typeLabels[rec.targetType] ?? 'Recommendation applied',
      };
    },
  });

  return tools;
}
