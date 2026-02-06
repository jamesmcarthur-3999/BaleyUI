import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import {
  blockExecutions,
  blocks,
  baleybotExecutions,
  baleybots,
  decisions,
  eq,
  and,
  gte,
  lte,
  desc,
  sql,
  isNotNull,
  notDeleted,
} from '@baleyui/db';
import { TRPCError } from '@trpc/server';
import { calculateCost } from '@/lib/analytics/cost-calculator';
import type { TrainingDataItem } from '@/lib/types';

const dateRangeInput = z.object({
  startDate: z.date().optional(),
  endDate: z.date().optional(),
}).refine(data => {
  if (data.startDate && data.endDate) {
    const days = (data.endDate.getTime() - data.startDate.getTime()) / 86_400_000;
    return days <= 365;
  }
  return true;
}, { message: 'Date range cannot exceed 365 days' });

function defaultDateRange(startDate?: Date, endDate?: Date) {
  const end = endDate ?? new Date();
  const start = startDate ?? new Date(end.getTime() - 30 * 86_400_000);
  return { start, end };
}

/**
 * tRPC router for analytics and metrics.
 */
export const analyticsRouter = router({
  /**
   * Get cost summary with breakdown by block and model.
   */
  getCostSummary: protectedProcedure
    .input(
      dateRangeInput.and(z.object({
        blockId: z.string().uuid().optional(),
      }))
    )
    .query(async ({ ctx, input }) => {
      const { start, end } = defaultDateRange(input.startDate, input.endDate);

      // Build where conditions
      const conditions = [
        eq(blocks.workspaceId, ctx.workspace.id),
        notDeleted(blocks),
        gte(blockExecutions.createdAt, start),
        lte(blockExecutions.createdAt, end),
      ];

      if (input.blockId) {
        conditions.push(eq(blockExecutions.blockId, input.blockId));
      }

      // Get cost by block
      const costByBlockResult = await ctx.db
        .select({
          blockId: blockExecutions.blockId,
          blockName: blocks.name,
          model: blockExecutions.model,
          inputTokens: sql<number>`COALESCE(SUM(${blockExecutions.tokensInput}), 0)::int`,
          outputTokens: sql<number>`COALESCE(SUM(${blockExecutions.tokensOutput}), 0)::int`,
          executions: sql<number>`COUNT(*)::int`,
        })
        .from(blockExecutions)
        .innerJoin(blocks, eq(blockExecutions.blockId, blocks.id))
        .where(
          and(
            ...conditions,
            isNotNull(blockExecutions.model),
            isNotNull(blockExecutions.tokensInput)
          )
        )
        .groupBy(blockExecutions.blockId, blocks.name, blockExecutions.model);

      // Calculate costs for each block
      const costByBlock = costByBlockResult.reduce((acc, item) => {
        const cost = calculateCost(
          item.model || '',
          item.inputTokens,
          item.outputTokens
        );

        const existing = acc.find((b) => b.blockId === item.blockId);
        if (existing) {
          existing.cost += cost;
          existing.executions += item.executions;
        } else {
          acc.push({
            blockId: item.blockId,
            name: item.blockName,
            cost,
            executions: item.executions,
          });
        }

        return acc;
      }, [] as Array<{ blockId: string; name: string; cost: number; executions: number }>);

      // Get cost by model
      const costByModelResult = await ctx.db
        .select({
          model: blockExecutions.model,
          inputTokens: sql<number>`COALESCE(SUM(${blockExecutions.tokensInput}), 0)::int`,
          outputTokens: sql<number>`COALESCE(SUM(${blockExecutions.tokensOutput}), 0)::int`,
          executions: sql<number>`COUNT(*)::int`,
        })
        .from(blockExecutions)
        .innerJoin(blocks, eq(blockExecutions.blockId, blocks.id))
        .where(
          and(
            ...conditions,
            isNotNull(blockExecutions.model),
            isNotNull(blockExecutions.tokensInput)
          )
        )
        .groupBy(blockExecutions.model);

      const costByModel = costByModelResult.map((item) => ({
        model: item.model || 'unknown',
        cost: calculateCost(item.model || '', item.inputTokens, item.outputTokens),
        tokenCount: item.inputTokens + item.outputTokens,
        executions: item.executions,
      }));

      // Calculate total cost
      const totalCost = costByModel.reduce((sum, item) => sum + item.cost, 0);

      return {
        totalCost,
        costByBlock: costByBlock.sort((a, b) => b.cost - a.cost),
        costByModel: costByModel.sort((a, b) => b.cost - a.cost),
      };
    }),

  /**
   * Get latency metrics with percentiles.
   */
  getLatencyMetrics: protectedProcedure
    .input(
      dateRangeInput.and(z.object({
        blockId: z.string().uuid().optional(),
      }))
    )
    .query(async ({ ctx, input }) => {
      const { start, end } = defaultDateRange(input.startDate, input.endDate);

      // Build where conditions
      const conditions = [
        eq(blocks.workspaceId, ctx.workspace.id),
        notDeleted(blocks),
        isNotNull(blockExecutions.durationMs),
        gte(blockExecutions.createdAt, start),
        lte(blockExecutions.createdAt, end),
      ];

      if (input.blockId) {
        conditions.push(eq(blockExecutions.blockId, input.blockId));
      }

      // Get overall percentiles
      const overallResult = await ctx.db
        .select({
          p50: sql<number>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${blockExecutions.durationMs})::int`,
          p95: sql<number>`PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${blockExecutions.durationMs})::int`,
          p99: sql<number>`PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY ${blockExecutions.durationMs})::int`,
          avgMs: sql<number>`AVG(${blockExecutions.durationMs})::int`,
        })
        .from(blockExecutions)
        .innerJoin(blocks, eq(blockExecutions.blockId, blocks.id))
        .where(and(...conditions));

      const overall = overallResult[0] || { p50: 0, p95: 0, p99: 0, avgMs: 0 };

      // Get latency by block
      const byBlockResult = await ctx.db
        .select({
          blockId: blockExecutions.blockId,
          blockName: blocks.name,
          blockType: blocks.type,
          p50: sql<number>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${blockExecutions.durationMs})::int`,
          p95: sql<number>`PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${blockExecutions.durationMs})::int`,
          p99: sql<number>`PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY ${blockExecutions.durationMs})::int`,
          avgMs: sql<number>`AVG(${blockExecutions.durationMs})::int`,
          executions: sql<number>`COUNT(*)::int`,
        })
        .from(blockExecutions)
        .innerJoin(blocks, eq(blockExecutions.blockId, blocks.id))
        .where(and(...conditions))
        .groupBy(blockExecutions.blockId, blocks.name, blocks.type);

      const byBlock = byBlockResult.map((item) => ({
        blockId: item.blockId,
        name: item.blockName,
        type: item.blockType,
        p50: item.p50,
        p95: item.p95,
        p99: item.p99,
        avgMs: item.avgMs,
        executions: item.executions,
      }));

      return {
        p50: overall.p50,
        p95: overall.p95,
        p99: overall.p99,
        avgMs: overall.avgMs,
        byBlock: byBlock.sort((a, b) => b.executions - a.executions),
      };
    }),

  /**
   * Get cost trend over time for charts.
   */
  getCostTrend: protectedProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
        granularity: z.enum(['day', 'week', 'month']).default('day'),
      }).refine(data => {
        const days = (data.endDate.getTime() - data.startDate.getTime()) / 86_400_000;
        return days <= 365;
      }, { message: 'Date range cannot exceed 365 days' })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(blocks.workspaceId, ctx.workspace.id),
        notDeleted(blocks),
        gte(blockExecutions.createdAt, input.startDate),
        lte(blockExecutions.createdAt, input.endDate),
        isNotNull(blockExecutions.model),
        isNotNull(blockExecutions.tokensInput),
      ];

      // Determine date truncation based on granularity
      let dateTrunc: string;
      switch (input.granularity) {
        case 'week':
          dateTrunc = 'week';
          break;
        case 'month':
          dateTrunc = 'month';
          break;
        default:
          dateTrunc = 'day';
      }

      const trendResult = await ctx.db
        .select({
          date: sql<Date>`DATE_TRUNC('${sql.raw(dateTrunc)}', ${blockExecutions.createdAt})`,
          model: blockExecutions.model,
          inputTokens: sql<number>`COALESCE(SUM(${blockExecutions.tokensInput}), 0)::int`,
          outputTokens: sql<number>`COALESCE(SUM(${blockExecutions.tokensOutput}), 0)::int`,
          executions: sql<number>`COUNT(*)::int`,
        })
        .from(blockExecutions)
        .innerJoin(blocks, eq(blockExecutions.blockId, blocks.id))
        .where(and(...conditions))
        .groupBy(sql`DATE_TRUNC('${sql.raw(dateTrunc)}', ${blockExecutions.createdAt})`, blockExecutions.model)
        .orderBy(sql`DATE_TRUNC('${sql.raw(dateTrunc)}', ${blockExecutions.createdAt})`);

      // Aggregate by date
      const dataByDate = trendResult.reduce((acc, item) => {
        const dateKey = item.date.toISOString();
        const cost = calculateCost(item.model || '', item.inputTokens, item.outputTokens);

        if (!acc[dateKey]) {
          acc[dateKey] = {
            date: item.date,
            cost: 0,
            executions: 0,
          };
        }

        acc[dateKey].cost += cost;
        acc[dateKey].executions += item.executions;

        return acc;
      }, {} as Record<string, { date: Date; cost: number; executions: number }>);

      const data = Object.values(dataByDate).sort(
        (a, b) => a.date.getTime() - b.date.getTime()
      );

      return { data };
    }),

  /**
   * Compare code vs AI execution metrics for a specific block.
   */
  getCodeVsAiComparison: protectedProcedure
    .input(
      z.object({
        blockId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify block exists and belongs to workspace
      const block = await ctx.db.query.blocks.findFirst({
        where: and(
          eq(blocks.id, input.blockId),
          eq(blocks.workspaceId, ctx.workspace.id),
          notDeleted(blocks)
        ),
      });

      if (!block) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Block not found',
        });
      }

      // Get AI execution stats
      const aiStats = await ctx.db
        .select({
          avgLatency: sql<number>`AVG(${blockExecutions.durationMs})::int`,
          inputTokens: sql<number>`COALESCE(SUM(${blockExecutions.tokensInput}), 0)::int`,
          outputTokens: sql<number>`COALESCE(SUM(${blockExecutions.tokensOutput}), 0)::int`,
          executions: sql<number>`COUNT(*)::int`,
        })
        .from(blockExecutions)
        .where(
          and(
            eq(blockExecutions.blockId, input.blockId),
            isNotNull(blockExecutions.model)
          )
        );

      const aiResult = aiStats[0] || {
        avgLatency: 0,
        inputTokens: 0,
        outputTokens: 0,
        executions: 0,
      };

      const aiCost =
        block.model && aiResult.executions > 0
          ? calculateCost(block.model, aiResult.inputTokens, aiResult.outputTokens)
          : 0;

      // Get code execution stats (executions without a model)
      const codeStats = await ctx.db
        .select({
          avgLatency: sql<number>`AVG(${blockExecutions.durationMs})::int`,
          executions: sql<number>`COUNT(*)::int`,
        })
        .from(blockExecutions)
        .where(
          and(
            eq(blockExecutions.blockId, input.blockId),
            sql`${blockExecutions.model} IS NULL`
          )
        );

      const codeResult = codeStats[0] || { avgLatency: 0, executions: 0 };

      return {
        ai: {
          avgLatency: aiResult.avgLatency,
          avgCost: aiResult.executions > 0 ? aiCost / aiResult.executions : 0,
          executions: aiResult.executions,
        },
        code: {
          avgLatency: codeResult.avgLatency,
          avgCost: 0,
          executions: codeResult.executions,
        },
      };
    }),

  /**
   * Export training data as JSONL.
   * Returns metadata about the export (actual file generation would be handled separately).
   */
  exportTrainingData: protectedProcedure
    .input(
      z.object({
        blockId: z.string().uuid().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        feedbackOnly: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      // Build where conditions
      const conditions = [
        eq(blocks.workspaceId, ctx.workspace.id),
        notDeleted(blocks),
      ];

      if (input.blockId) {
        conditions.push(eq(decisions.blockId, input.blockId));
      }

      if (input.startDate) {
        conditions.push(gte(decisions.createdAt, input.startDate));
      }

      if (input.endDate) {
        conditions.push(lte(decisions.createdAt, input.endDate));
      }

      if (input.feedbackOnly) {
        conditions.push(isNotNull(decisions.feedbackCorrect));
      }

      // Fetch decisions for export
      const exportData = await ctx.db
        .select({
          id: decisions.id,
          blockName: blocks.name,
          input: decisions.input,
          output: decisions.output,
          reasoning: decisions.reasoning,
          model: decisions.model,
          feedbackCorrect: decisions.feedbackCorrect,
          feedbackCorrectedOutput: decisions.feedbackCorrectedOutput,
          createdAt: decisions.createdAt,
        })
        .from(decisions)
        .innerJoin(blocks, eq(decisions.blockId, blocks.id))
        .where(and(...conditions))
        .orderBy(desc(decisions.createdAt))
        .limit(5000); // Limit to prevent extremely large exports

      // Transform to JSONL format
      const jsonlLines: TrainingDataItem[] = exportData.map((item) => {
        const trainingItem: TrainingDataItem = {
          messages: [
            {
              role: 'user',
              content: JSON.stringify(item.input),
            },
            {
              role: 'assistant',
              content: JSON.stringify(
                item.feedbackCorrectedOutput || item.output
              ),
            },
          ],
        };

        if (item.reasoning) {
          trainingItem.reasoning = item.reasoning;
        }

        return trainingItem;
      });

      return {
        rowCount: exportData.length,
        data: jsonlLines,
        preview: jsonlLines.slice(0, 3),
      };
    }),

  /**
   * Get per-bot analytics: execution counts, success rate, duration, tokens, daily trend, top errors.
   */
  getBaleybotAnalytics: protectedProcedure
    .input(z.object({ baleybotId: z.string(), days: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const since = new Date();
      since.setDate(since.getDate() - input.days);

      // Join through baleybots to verify workspace ownership
      const executions = await ctx.db
        .select({
          id: baleybotExecutions.id,
          status: baleybotExecutions.status,
          durationMs: baleybotExecutions.durationMs,
          tokenCount: baleybotExecutions.tokenCount,
          error: baleybotExecutions.error,
          startedAt: baleybotExecutions.startedAt,
        })
        .from(baleybotExecutions)
        .innerJoin(baleybots, eq(baleybotExecutions.baleybotId, baleybots.id))
        .where(
          and(
            eq(baleybotExecutions.baleybotId, input.baleybotId),
            eq(baleybots.workspaceId, ctx.workspace.id),
            notDeleted(baleybots),
            gte(baleybotExecutions.createdAt, since),
          )
        )
        .orderBy(desc(baleybotExecutions.startedAt));

      const total = executions.length;
      const successes = executions.filter(e => e.status === 'completed').length;
      const failures = executions.filter(e => e.status === 'failed').length;
      const avgDuration = total > 0 ? executions.reduce((s, e) => s + (e.durationMs || 0), 0) / total : 0;
      const totalTokens = executions.reduce((s, e) => s + (e.tokenCount || 0), 0);

      // Daily trend (last N days)
      const dailyCounts: Record<string, number> = {};
      executions.forEach(e => {
        if (e.startedAt) {
          const day = new Date(e.startedAt).toISOString().slice(0, 10);
          dailyCounts[day] = (dailyCounts[day] || 0) + 1;
        }
      });

      // Top errors
      const errorCounts: Record<string, number> = {};
      executions.filter(e => e.error).forEach(e => {
        const msg = (e.error as string).slice(0, 100);
        errorCounts[msg] = (errorCounts[msg] || 0) + 1;
      });
      const topErrors = Object.entries(errorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([message, count]) => ({ message, count }));

      return {
        total,
        successes,
        failures,
        successRate: total > 0 ? successes / total : 0,
        avgDurationMs: Math.round(avgDuration),
        totalTokens,
        dailyTrend: Object.entries(dailyCounts)
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        topErrors,
      };
    }),

  /**
   * Get aggregate dashboard overview: total executions, success rate, avg duration, top bots, daily trend.
   */
  getDashboardOverview: protectedProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const since = new Date();
      since.setDate(since.getDate() - input.days);

      // Join through baleybots to verify workspace ownership
      const executions = await ctx.db
        .select({
          id: baleybotExecutions.id,
          baleybotId: baleybotExecutions.baleybotId,
          status: baleybotExecutions.status,
          durationMs: baleybotExecutions.durationMs,
          startedAt: baleybotExecutions.startedAt,
        })
        .from(baleybotExecutions)
        .innerJoin(baleybots, eq(baleybotExecutions.baleybotId, baleybots.id))
        .where(
          and(
            eq(baleybots.workspaceId, ctx.workspace.id),
            notDeleted(baleybots),
            gte(baleybotExecutions.createdAt, since),
          )
        )
        .orderBy(desc(baleybotExecutions.startedAt));

      const total = executions.length;
      const successes = executions.filter(e => e.status === 'completed').length;
      const avgDuration = total > 0 ? executions.reduce((s, e) => s + (e.durationMs || 0), 0) / total : 0;

      // Top bots by execution count
      const botCounts: Record<string, number> = {};
      executions.forEach(e => {
        if (e.baleybotId) botCounts[e.baleybotId] = (botCounts[e.baleybotId] || 0) + 1;
      });
      const topBots = Object.entries(botCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([baleybotId, count]) => ({ baleybotId, count }));

      // Daily trend
      const dailyCounts: Record<string, number> = {};
      executions.forEach(e => {
        if (e.startedAt) {
          const day = new Date(e.startedAt).toISOString().slice(0, 10);
          dailyCounts[day] = (dailyCounts[day] || 0) + 1;
        }
      });

      return {
        totalExecutions: total,
        successRate: total > 0 ? successes / total : 0,
        avgDurationMs: Math.round(avgDuration),
        topBots,
        dailyTrend: Object.entries(dailyCounts)
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      };
    }),
});
