/**
 * Analytics Tools for Baley
 */

import type { RuntimeToolDefinition } from '../../executor';
import type { CompanionToolContext } from './index';
import {
  db,
  baleybots,
  baleybotExecutions,
  notDeleted,
  eq,
  and,
  gte,
} from '@baleyui/db';

export function buildAnalyticsTools(
  ctx: CompanionToolContext
): Map<string, RuntimeToolDefinition> {
  const tools = new Map<string, RuntimeToolDefinition>();

  tools.set('get_analytics_summary', {
    name: 'get_analytics_summary',
    description:
      'Get an analytics summary for the workspace: execution counts, cost estimates, top BaleyBots, and trends.',
    inputSchema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          description:
            'Time period: "7d" (week), "30d" (month), "90d" (quarter). Defaults to 30d.',
        },
      },
    },
    async function(args) {
      const period = (args.period as string) || '30d';
      const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // Get workspace BBs
      const workspaceBBs = await db.query.baleybots.findMany({
        where: and(
          eq(baleybots.workspaceId, ctx.workspaceId),
          eq(baleybots.isInternal, false),
          notDeleted(baleybots)
        ),
        columns: {
          id: true,
          name: true,
          executionCount: true,
        },
      });

      if (workspaceBBs.length === 0) {
        return {
          period,
          totalExecutions: 0,
          totalBaleybots: 0,
          topBaleybots: [],
          message: 'No BaleyBots created yet.',
        };
      }

      // Aggregate execution stats per BB
      const bbStats = await Promise.all(
        workspaceBBs.map(async (bb) => {
          const executions = await db.query.baleybotExecutions.findMany({
            where: and(
              eq(baleybotExecutions.baleybotId, bb.id),
              gte(baleybotExecutions.createdAt, since)
            ),
            columns: { status: true, durationMs: true },
          });

          return {
            name: bb.name,
            totalExecutions: executions.length,
            successful: executions.filter((e) => e.status === 'completed')
              .length,
            failed: executions.filter((e) => e.status === 'failed').length,
            avgDurationMs:
              executions.length > 0
                ? Math.round(
                    executions.reduce(
                      (sum, e) => sum + (e.durationMs ?? 0),
                      0
                    ) / executions.length
                  )
                : 0,
          };
        })
      );

      const totalExecutions = bbStats.reduce(
        (sum, bb) => sum + bb.totalExecutions,
        0
      );
      const topBaleybots = bbStats
        .sort((a, b) => b.totalExecutions - a.totalExecutions)
        .slice(0, 5);

      return {
        period,
        days,
        totalBaleybots: workspaceBBs.length,
        totalExecutions,
        successRate:
          totalExecutions > 0
            ? Math.round(
                (bbStats.reduce((s, b) => s + b.successful, 0) /
                  totalExecutions) *
                  100
              )
            : 0,
        topBaleybots,
      };
    },
  });

  return tools;
}
