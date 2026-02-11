import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import {
  baleybotExecutions,
  baleybots,
  blocks,
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
import {
  getWorkspaceBilling,
  createCheckoutSession,
  createPortalSession,
} from '@/lib/billing/service';

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
 *
 * All cost/latency/trend queries use `baleybotExecutions` which now stores
 * model, tokensInput, tokensOutput, and estimatedCost directly on each execution.
 */
export const analyticsRouter = router({
  /**
   * Get cost summary with breakdown by BaleyBot and model.
   */
  getCostSummary: protectedProcedure
    .input(
      dateRangeInput.and(z.object({
        baleybotId: z.string().uuid().optional(),
      }))
    )
    .query(async ({ ctx, input }) => {
      const { start, end } = defaultDateRange(input.startDate, input.endDate);

      const conditions = [
        eq(baleybots.workspaceId, ctx.workspace.id),
        notDeleted(baleybots),
        gte(baleybotExecutions.createdAt, start),
        lte(baleybotExecutions.createdAt, end),
        isNotNull(baleybotExecutions.model),
        isNotNull(baleybotExecutions.tokensInput),
      ];

      if (input.baleybotId) {
        conditions.push(eq(baleybotExecutions.baleybotId, input.baleybotId));
      }

      // Cost by BaleyBot
      const costByBotResult = await ctx.db
        .select({
          baleybotId: baleybotExecutions.baleybotId,
          baleybotName: baleybots.name,
          baleybotIcon: baleybots.icon,
          model: baleybotExecutions.model,
          inputTokens: sql<number>`COALESCE(SUM(${baleybotExecutions.tokensInput}), 0)::int`,
          outputTokens: sql<number>`COALESCE(SUM(${baleybotExecutions.tokensOutput}), 0)::int`,
          totalCost: sql<number>`COALESCE(SUM(${baleybotExecutions.estimatedCost}), 0)`,
          executions: sql<number>`COUNT(*)::int`,
        })
        .from(baleybotExecutions)
        .innerJoin(baleybots, eq(baleybotExecutions.baleybotId, baleybots.id))
        .where(and(...conditions))
        .groupBy(baleybotExecutions.baleybotId, baleybots.name, baleybots.icon, baleybotExecutions.model);

      // Aggregate by bot (a bot may use multiple models)
      const costByBot = costByBotResult.reduce((acc, item) => {
        const cost = item.totalCost > 0
          ? item.totalCost
          : calculateCost(item.model || '', item.inputTokens, item.outputTokens);

        const existing = acc.find((b) => b.baleybotId === item.baleybotId);
        if (existing) {
          existing.cost += cost;
          existing.executions += item.executions;
        } else {
          acc.push({
            baleybotId: item.baleybotId,
            name: item.baleybotName,
            icon: item.baleybotIcon,
            cost,
            executions: item.executions,
          });
        }
        return acc;
      }, [] as Array<{ baleybotId: string; name: string; icon: string | null; cost: number; executions: number }>);

      // Cost by model
      const costByModelResult = await ctx.db
        .select({
          model: baleybotExecutions.model,
          inputTokens: sql<number>`COALESCE(SUM(${baleybotExecutions.tokensInput}), 0)::int`,
          outputTokens: sql<number>`COALESCE(SUM(${baleybotExecutions.tokensOutput}), 0)::int`,
          totalCost: sql<number>`COALESCE(SUM(${baleybotExecutions.estimatedCost}), 0)`,
          executions: sql<number>`COUNT(*)::int`,
        })
        .from(baleybotExecutions)
        .innerJoin(baleybots, eq(baleybotExecutions.baleybotId, baleybots.id))
        .where(and(...conditions))
        .groupBy(baleybotExecutions.model);

      const costByModel = costByModelResult.map((item) => {
        const cost = item.totalCost > 0
          ? item.totalCost
          : calculateCost(item.model || '', item.inputTokens, item.outputTokens);
        return {
          model: item.model || 'unknown',
          cost,
          tokenCount: item.inputTokens + item.outputTokens,
          executions: item.executions,
        };
      });

      const totalCost = costByModel.reduce((sum, item) => sum + item.cost, 0);

      return {
        totalCost,
        costByBot: costByBot.sort((a, b) => b.cost - a.cost),
        costByModel: costByModel.sort((a, b) => b.cost - a.cost),
      };
    }),

  /**
   * Get latency metrics with percentiles across BaleyBot executions.
   */
  getLatencyMetrics: protectedProcedure
    .input(
      dateRangeInput.and(z.object({
        baleybotId: z.string().uuid().optional(),
      }))
    )
    .query(async ({ ctx, input }) => {
      const { start, end } = defaultDateRange(input.startDate, input.endDate);

      const conditions = [
        eq(baleybots.workspaceId, ctx.workspace.id),
        notDeleted(baleybots),
        isNotNull(baleybotExecutions.durationMs),
        gte(baleybotExecutions.createdAt, start),
        lte(baleybotExecutions.createdAt, end),
      ];

      if (input.baleybotId) {
        conditions.push(eq(baleybotExecutions.baleybotId, input.baleybotId));
      }

      // Overall percentiles
      const overallResult = await ctx.db
        .select({
          p50: sql<number>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${baleybotExecutions.durationMs})::int`,
          p95: sql<number>`PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${baleybotExecutions.durationMs})::int`,
          p99: sql<number>`PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY ${baleybotExecutions.durationMs})::int`,
          avgMs: sql<number>`AVG(${baleybotExecutions.durationMs})::int`,
        })
        .from(baleybotExecutions)
        .innerJoin(baleybots, eq(baleybotExecutions.baleybotId, baleybots.id))
        .where(and(...conditions));

      const overall = overallResult[0] || { p50: 0, p95: 0, p99: 0, avgMs: 0 };

      // Latency by bot
      const byBotResult = await ctx.db
        .select({
          baleybotId: baleybotExecutions.baleybotId,
          baleybotName: baleybots.name,
          baleybotIcon: baleybots.icon,
          p50: sql<number>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${baleybotExecutions.durationMs})::int`,
          p95: sql<number>`PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${baleybotExecutions.durationMs})::int`,
          p99: sql<number>`PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY ${baleybotExecutions.durationMs})::int`,
          avgMs: sql<number>`AVG(${baleybotExecutions.durationMs})::int`,
          executions: sql<number>`COUNT(*)::int`,
        })
        .from(baleybotExecutions)
        .innerJoin(baleybots, eq(baleybotExecutions.baleybotId, baleybots.id))
        .where(and(...conditions))
        .groupBy(baleybotExecutions.baleybotId, baleybots.name, baleybots.icon);

      const byBot = byBotResult.map((item) => ({
        baleybotId: item.baleybotId,
        name: item.baleybotName,
        icon: item.baleybotIcon,
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
        byBot: byBot.sort((a, b) => b.executions - a.executions),
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
        eq(baleybots.workspaceId, ctx.workspace.id),
        notDeleted(baleybots),
        gte(baleybotExecutions.createdAt, input.startDate),
        lte(baleybotExecutions.createdAt, input.endDate),
      ];

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
          date: sql<Date>`DATE_TRUNC('${sql.raw(dateTrunc)}', ${baleybotExecutions.createdAt})`,
          model: baleybotExecutions.model,
          inputTokens: sql<number>`COALESCE(SUM(${baleybotExecutions.tokensInput}), 0)::int`,
          outputTokens: sql<number>`COALESCE(SUM(${baleybotExecutions.tokensOutput}), 0)::int`,
          totalCost: sql<number>`COALESCE(SUM(${baleybotExecutions.estimatedCost}), 0)`,
          executions: sql<number>`COUNT(*)::int`,
        })
        .from(baleybotExecutions)
        .innerJoin(baleybots, eq(baleybotExecutions.baleybotId, baleybots.id))
        .where(and(...conditions))
        .groupBy(sql`DATE_TRUNC('${sql.raw(dateTrunc)}', ${baleybotExecutions.createdAt})`, baleybotExecutions.model)
        .orderBy(sql`DATE_TRUNC('${sql.raw(dateTrunc)}', ${baleybotExecutions.createdAt})`);

      // Aggregate by date (across models)
      const dataByDate = trendResult.reduce((acc, item) => {
        const dateKey = item.date.toISOString();
        const cost = item.totalCost > 0
          ? item.totalCost
          : calculateCost(item.model || '', item.inputTokens, item.outputTokens);

        if (!acc[dateKey]) {
          acc[dateKey] = { date: item.date, cost: 0, executions: 0 };
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
   * Export training data as JSONL from decision records.
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
        .limit(5000);

      const jsonlLines: TrainingDataItem[] = exportData.map((item) => {
        const trainingItem: TrainingDataItem = {
          messages: [
            { role: 'user', content: JSON.stringify(item.input) },
            { role: 'assistant', content: JSON.stringify(item.feedbackCorrectedOutput || item.output) },
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
   * Get per-bot analytics: execution counts, success rate, duration, tokens, cost, daily trend, top errors.
   */
  getBaleybotAnalytics: protectedProcedure
    .input(z.object({ baleybotId: z.string().uuid(), days: z.number().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      const since = new Date();
      since.setDate(since.getDate() - input.days);

      const executions = await ctx.db
        .select({
          id: baleybotExecutions.id,
          status: baleybotExecutions.status,
          durationMs: baleybotExecutions.durationMs,
          tokenCount: baleybotExecutions.tokenCount,
          tokensInput: baleybotExecutions.tokensInput,
          tokensOutput: baleybotExecutions.tokensOutput,
          estimatedCost: baleybotExecutions.estimatedCost,
          model: baleybotExecutions.model,
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
      const totalCost = executions.reduce((s, e) => s + (e.estimatedCost || 0), 0);

      // Daily trend
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
        const msg = String(e.error).slice(0, 100);
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
        totalCost,
        dailyTrend: Object.entries(dailyCounts)
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        topErrors,
      };
    }),

  /**
   * Get aggregate dashboard overview: total executions, success rate, avg duration, cost, top bots, daily trend.
   */
  getDashboardOverview: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      const since = new Date();
      since.setDate(since.getDate() - input.days);

      const executions = await ctx.db
        .select({
          id: baleybotExecutions.id,
          baleybotId: baleybotExecutions.baleybotId,
          baleybotName: baleybots.name,
          baleybotIcon: baleybots.icon,
          status: baleybotExecutions.status,
          durationMs: baleybotExecutions.durationMs,
          estimatedCost: baleybotExecutions.estimatedCost,
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
      const totalCost = executions.reduce((s, e) => s + (e.estimatedCost || 0), 0);

      // Top bots by execution count
      const botInfo: Record<string, { count: number; name: string; icon: string | null; cost: number }> = {};
      executions.forEach(e => {
        if (e.baleybotId) {
          const existing = botInfo[e.baleybotId];
          if (existing) {
            existing.count++;
            existing.cost += e.estimatedCost || 0;
          } else {
            botInfo[e.baleybotId] = { count: 1, name: e.baleybotName, icon: e.baleybotIcon, cost: e.estimatedCost || 0 };
          }
        }
      });
      const topBots = Object.entries(botInfo)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5)
        .map(([baleybotId, info]) => ({ baleybotId, count: info.count, name: info.name, icon: info.icon, cost: info.cost }));

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
        totalCost,
        topBots,
        dailyTrend: Object.entries(dailyCounts)
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      };
    }),

  // ========================================================================
  // PER-BOT EXECUTION LIST (for Monitor panel)
  // ========================================================================

  /**
   * Get recent executions for a specific BaleyBot with pagination.
   */
  getBaleybotExecutions: protectedProcedure
    .input(z.object({
      baleybotId: z.string().uuid(),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const executions = await ctx.db
        .select({
          id: baleybotExecutions.id,
          status: baleybotExecutions.status,
          input: baleybotExecutions.input,
          output: baleybotExecutions.output,
          error: baleybotExecutions.error,
          durationMs: baleybotExecutions.durationMs,
          tokenCount: baleybotExecutions.tokenCount,
          model: baleybotExecutions.model,
          estimatedCost: baleybotExecutions.estimatedCost,
          triggeredBy: baleybotExecutions.triggeredBy,
          conversationId: baleybotExecutions.conversationId,
          startedAt: baleybotExecutions.startedAt,
          completedAt: baleybotExecutions.completedAt,
          createdAt: baleybotExecutions.createdAt,
        })
        .from(baleybotExecutions)
        .innerJoin(baleybots, eq(baleybotExecutions.baleybotId, baleybots.id))
        .where(
          and(
            eq(baleybotExecutions.baleybotId, input.baleybotId),
            eq(baleybots.workspaceId, ctx.workspace.id),
            notDeleted(baleybots),
          )
        )
        .orderBy(desc(baleybotExecutions.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return executions;
    }),

  /**
   * Get conversations grouped by conversationId for chat-type BBs.
   */
  getBaleybotConversations: protectedProcedure
    .input(z.object({
      baleybotId: z.string().uuid(),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          conversationId: baleybotExecutions.conversationId,
          messageCount: sql<number>`count(*)::int`,
          firstAt: sql<Date>`min(${baleybotExecutions.createdAt})`,
          lastAt: sql<Date>`max(${baleybotExecutions.createdAt})`,
          lastStatus: sql<string>`coalesce((array_agg(${baleybotExecutions.status} ORDER BY ${baleybotExecutions.createdAt} DESC))[1], 'unknown')`,
          totalTokens: sql<number>`coalesce(sum(${baleybotExecutions.tokenCount}), 0)::int`,
          totalCost: sql<number>`coalesce(sum(${baleybotExecutions.estimatedCost}), 0)`,
          totalDurationMs: sql<number>`coalesce(sum(${baleybotExecutions.durationMs}), 0)::int`,
        })
        .from(baleybotExecutions)
        .innerJoin(baleybots, eq(baleybotExecutions.baleybotId, baleybots.id))
        .where(
          and(
            eq(baleybotExecutions.baleybotId, input.baleybotId),
            eq(baleybots.workspaceId, ctx.workspace.id),
            notDeleted(baleybots),
            isNotNull(baleybotExecutions.conversationId),
          )
        )
        .groupBy(baleybotExecutions.conversationId)
        .orderBy(sql`max(${baleybotExecutions.createdAt}) DESC`)
        .limit(input.limit);

      return rows;
    }),

  // ========================================================================
  // BILLING PROCEDURES (contained within analytics)
  // ========================================================================

  /**
   * Get current plan, usage summary, and subscription status.
   */
  getBilling: protectedProcedure.query(async ({ ctx }) => {
    return getWorkspaceBilling(ctx.workspace.id);
  }),

  /**
   * Create a Stripe Checkout session for plan upgrade.
   * Returns the checkout URL.
   */
  upgrade: protectedProcedure
    .input(z.object({ planId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const url = await createCheckoutSession(ctx.workspace.id, input.planId);
        return { url };
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err instanceof Error ? err.message : 'Failed to create checkout session',
        });
      }
    }),

  /**
   * Create a Stripe Billing Portal session.
   * Returns the portal URL for managing invoices, payment methods, cancellation.
   */
  manageBilling: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const url = await createPortalSession(ctx.workspace.id);
      return { url };
    } catch (err) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: err instanceof Error ? err.message : 'Failed to create portal session',
      });
    }
  }),
});
