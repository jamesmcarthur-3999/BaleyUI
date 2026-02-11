/**
 * Approval Pattern Tools for Baley
 */

import type { RuntimeToolDefinition } from '../../executor';
import type { CompanionToolContext } from './index';
import { db, approvalPatterns, eq, and, isNull } from '@baleyui/db';

export function buildApprovalTools(
  ctx: CompanionToolContext
): Map<string, RuntimeToolDefinition> {
  const tools = new Map<string, RuntimeToolDefinition>();

  tools.set('list_approval_patterns', {
    name: 'list_approval_patterns',
    description:
      'List all active approval patterns in the workspace, grouped by tool name.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    async function() {
      const patterns = await db.query.approvalPatterns.findMany({
        where: and(
          eq(approvalPatterns.workspaceId, ctx.workspaceId),
          isNull(approvalPatterns.revokedAt)
        ),
        columns: {
          id: true,
          tool: true,
          actionPattern: true,
          trustLevel: true,
          timesUsed: true,
          approvedBy: true,
          approvedAt: true,
          expiresAt: true,
          createdAt: true,
        },
      });

      // Group by tool
      const grouped: Record<string, typeof patterns> = {};
      for (const p of patterns) {
        const group = grouped[p.tool];
        if (!group) {
          grouped[p.tool] = [p];
        } else {
          group.push(p);
        }
      }

      return {
        patterns: patterns.map((p) => ({
          id: p.id,
          tool: p.tool,
          actionPattern: p.actionPattern,
          trustLevel: p.trustLevel,
          timesUsed: p.timesUsed,
          expiresAt: p.expiresAt?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString(),
        })),
        groupedByTool: Object.entries(grouped).map(([tool, items]) => ({
          tool,
          count: items.length,
          totalUsage: items.reduce((s, p) => s + p.timesUsed, 0),
        })),
        total: patterns.length,
      };
    },
  });

  tools.set('revoke_approval_pattern', {
    name: 'revoke_approval_pattern',
    description:
      'Revoke an approval pattern. This is destructive — Baley should confirm with the user first.',
    inputSchema: {
      type: 'object',
      properties: {
        patternId: {
          type: 'string',
          description: 'The UUID of the approval pattern to revoke',
        },
      },
      required: ['patternId'],
    },
    needsApproval: true,
    async function(args) {
      const patternId = args.patternId as string;

      const pattern = await db.query.approvalPatterns.findFirst({
        where: and(
          eq(approvalPatterns.id, patternId),
          eq(approvalPatterns.workspaceId, ctx.workspaceId),
          isNull(approvalPatterns.revokedAt)
        ),
      });

      if (!pattern) {
        return {
          success: false,
          error: 'Approval pattern not found or already revoked',
        };
      }

      await db
        .update(approvalPatterns)
        .set({
          revokedAt: new Date(),
          revokedBy: ctx.userId,
        })
        .where(eq(approvalPatterns.id, patternId));

      return {
        success: true,
        message: `Approval pattern for "${pattern.tool}" has been revoked.`,
      };
    },
  });

  return tools;
}
