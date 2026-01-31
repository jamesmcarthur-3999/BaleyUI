import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { decisions, blocks, eq, and, desc, gte, lte, isNotNull, isNull, sql } from '@baleyui/db';
import { TRPCError } from '@trpc/server';

/**
 * tRPC router for managing AI decisions (observability).
 */
export const decisionsRouter = router({
  /**
   * List decisions with filtering and pagination.
   */
  list: protectedProcedure
    .input(
      z.object({
        blockId: z.string().uuid().optional(),
        model: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        hasFeedback: z.boolean().optional(),
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().uuid().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Build where conditions for filtering
      const conditions = [eq(blocks.workspaceId, ctx.workspace.id)];

      if (input.blockId) {
        conditions.push(eq(decisions.blockId, input.blockId));
      }

      if (input.model) {
        conditions.push(eq(decisions.model, input.model));
      }

      if (input.startDate) {
        conditions.push(gte(decisions.createdAt, input.startDate));
      }

      if (input.endDate) {
        conditions.push(lte(decisions.createdAt, input.endDate));
      }

      if (input.hasFeedback === true) {
        conditions.push(isNotNull(decisions.feedbackCorrect));
      } else if (input.hasFeedback === false) {
        conditions.push(isNull(decisions.feedbackCorrect));
      }

      // Get total count for the current filters
      const totalCountResult = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(decisions)
        .innerJoin(blocks, eq(decisions.blockId, blocks.id))
        .where(and(...conditions));

      const totalCount = totalCountResult[0]?.count || 0;

      // Handle cursor-based pagination
      // For stable pagination, we need to handle cases where multiple items have the same createdAt
      if (input.cursor) {
        const cursorDecision = await ctx.db.query.decisions.findFirst({
          where: eq(decisions.id, input.cursor),
        });

        if (cursorDecision) {
          // Use a compound condition: createdAt < cursor.createdAt OR (createdAt = cursor.createdAt AND id > cursor.id)
          // This ensures stable ordering and prevents duplicates
          conditions.push(
            sql`(${decisions.createdAt} < ${cursorDecision.createdAt} OR (${decisions.createdAt} = ${cursorDecision.createdAt} AND ${decisions.id} > ${cursorDecision.id}))`
          );
        }
      }

      // Fetch decisions with block info
      const items = await ctx.db
        .select({
          id: decisions.id,
          blockId: decisions.blockId,
          blockName: blocks.name,
          blockExecutionId: decisions.blockExecutionId,
          input: decisions.input,
          output: decisions.output,
          reasoning: decisions.reasoning,
          model: decisions.model,
          tokensInput: decisions.tokensInput,
          tokensOutput: decisions.tokensOutput,
          latencyMs: decisions.latencyMs,
          cost: decisions.cost,
          feedbackCorrect: decisions.feedbackCorrect,
          feedbackCategory: decisions.feedbackCategory,
          feedbackNotes: decisions.feedbackNotes,
          feedbackCorrectedOutput: decisions.feedbackCorrectedOutput,
          feedbackAt: decisions.feedbackAt,
          createdAt: decisions.createdAt,
        })
        .from(decisions)
        .innerJoin(blocks, eq(decisions.blockId, blocks.id))
        .where(and(...conditions))
        .orderBy(desc(decisions.createdAt), desc(decisions.id))
        .limit(input.limit + 1); // Fetch one extra to check if there are more

      // Determine next cursor
      let nextCursor: string | undefined = undefined;
      if (items.length > input.limit) {
        const nextItem = items.pop();
        nextCursor = nextItem?.id;
      }

      return {
        items,
        nextCursor,
        totalCount,
      };
    }),

  /**
   * Get a single decision by ID with full details.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const decision = await ctx.db
        .select({
          id: decisions.id,
          blockId: decisions.blockId,
          blockName: blocks.name,
          blockType: blocks.type,
          blockExecutionId: decisions.blockExecutionId,
          input: decisions.input,
          output: decisions.output,
          reasoning: decisions.reasoning,
          model: decisions.model,
          tokensInput: decisions.tokensInput,
          tokensOutput: decisions.tokensOutput,
          latencyMs: decisions.latencyMs,
          cost: decisions.cost,
          feedbackCorrect: decisions.feedbackCorrect,
          feedbackCategory: decisions.feedbackCategory,
          feedbackNotes: decisions.feedbackNotes,
          feedbackCorrectedOutput: decisions.feedbackCorrectedOutput,
          feedbackAt: decisions.feedbackAt,
          createdAt: decisions.createdAt,
        })
        .from(decisions)
        .innerJoin(blocks, eq(decisions.blockId, blocks.id))
        .where(and(eq(decisions.id, input.id), eq(blocks.workspaceId, ctx.workspace.id)))
        .limit(1);

      if (!decision || decision.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Decision not found',
        });
      }

      return decision[0];
    }),

  /**
   * Submit feedback for a decision.
   */
  submitFeedback: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        correct: z.boolean(),
        category: z.enum(['hallucination', 'wrong_format', 'missing_info', 'perfect', 'partial']).optional(),
        notes: z.string().optional(),
        correctedOutput: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify decision exists and belongs to workspace
      const existing = await ctx.db
        .select({ id: decisions.id })
        .from(decisions)
        .innerJoin(blocks, eq(decisions.blockId, blocks.id))
        .where(and(eq(decisions.id, input.id), eq(blocks.workspaceId, ctx.workspace.id)))
        .limit(1);

      if (!existing || existing.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Decision not found',
        });
      }

      // Update feedback
      const [updated] = await ctx.db
        .update(decisions)
        .set({
          feedbackCorrect: input.correct,
          feedbackCategory: input.category || null,
          feedbackNotes: input.notes || null,
          feedbackCorrectedOutput: input.correctedOutput || null,
          feedbackAt: new Date(),
        })
        .where(eq(decisions.id, input.id))
        .returning();

      return updated;
    }),

  /**
   * Get aggregate statistics for decisions.
   */
  getStats: protectedProcedure
    .input(
      z.object({
        blockId: z.string().uuid().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Build where conditions
      const conditions = [eq(blocks.workspaceId, ctx.workspace.id)];

      if (input.blockId) {
        conditions.push(eq(decisions.blockId, input.blockId));
      }

      if (input.startDate) {
        conditions.push(gte(decisions.createdAt, input.startDate));
      }

      if (input.endDate) {
        conditions.push(lte(decisions.createdAt, input.endDate));
      }

      // Get aggregate stats
      const stats = await ctx.db
        .select({
          total: sql<number>`count(*)::int`,
          totalWithFeedback: sql<number>`count(${decisions.feedbackCorrect})::int`,
          totalCorrect: sql<number>`count(*) filter (where ${decisions.feedbackCorrect} = true)::int`,
          avgLatency: sql<number>`avg(${decisions.latencyMs})::int`,
          totalCost: sql<string>`sum(${decisions.cost})::numeric`,
        })
        .from(decisions)
        .innerJoin(blocks, eq(decisions.blockId, blocks.id))
        .where(and(...conditions));

      const result = stats[0] ?? {
        total: 0,
        totalWithFeedback: 0,
        totalCorrect: 0,
        avgLatency: 0,
        totalCost: '0',
      };

      // Calculate accuracy rate
      const accuracyRate =
        result.totalWithFeedback > 0 ? (result.totalCorrect / result.totalWithFeedback) * 100 : 0;

      // Get cost breakdown by model
      const costByModel = await ctx.db
        .select({
          model: decisions.model,
          count: sql<number>`count(*)::int`,
          totalCost: sql<string>`sum(${decisions.cost})::numeric`,
        })
        .from(decisions)
        .innerJoin(blocks, eq(decisions.blockId, blocks.id))
        .where(and(...conditions))
        .groupBy(decisions.model)
        .orderBy(desc(sql`sum(${decisions.cost})`));

      return {
        total: result.total,
        totalWithFeedback: result.totalWithFeedback,
        totalCorrect: result.totalCorrect,
        accuracyRate,
        avgLatency: result.avgLatency,
        totalCost: parseFloat(result.totalCost || '0'),
        costByModel: costByModel.map((item) => ({
          model: item.model || 'unknown',
          count: item.count,
          totalCost: parseFloat(item.totalCost || '0'),
        })),
      };
    }),

  /**
   * Get unique models used in decisions.
   */
  getModels: protectedProcedure.query(async ({ ctx }) => {
    const models = await ctx.db
      .selectDistinct({ model: decisions.model })
      .from(decisions)
      .innerJoin(blocks, eq(decisions.blockId, blocks.id))
      .where(and(eq(blocks.workspaceId, ctx.workspace.id), isNotNull(decisions.model)))
      .orderBy(decisions.model);

    return models.map((m) => m.model).filter((m): m is string => m !== null);
  }),
});
