/**
 * Recommendations Router — CRUD + accept/reject/dismiss pipeline
 *
 * Data layer for actionable findings from internal BaleyBots (pattern_learner,
 * execution_reviewer, analytics_interpreter). Phase 2 wires producers; Phase 3
 * builds the Actions Hub UI. This router provides the full API.
 */
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import {
  recommendations,
  approvalPatterns,
  baleybots,
  eq,
  and,
  lt,
  sql,
  desc,
  updateWithLock,
} from '@baleyui/db';
import { uuidSchema } from '../helpers';

export const recommendationsRouter = router({
  /**
   * List recommendations for the workspace, with optional filters.
   * Cursor-paginated, ordered by createdAt desc.
   */
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(['pending', 'accepted', 'rejected', 'dismissed']).optional(),
        sourceType: z.string().max(50).optional(),
        targetBaleybotId: uuidSchema.optional(),
        severity: z.enum(['info', 'warning', 'critical']).optional(),
        limit: z.number().int().min(1).max(100).optional().default(50),
        cursor: uuidSchema.optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const filters = [eq(recommendations.workspaceId, ctx.workspace.id)];

      if (input?.status) {
        filters.push(eq(recommendations.status, input.status));
      }
      if (input?.sourceType) {
        filters.push(eq(recommendations.sourceType, input.sourceType));
      }
      if (input?.targetBaleybotId) {
        filters.push(eq(recommendations.targetBaleybotId, input.targetBaleybotId));
      }
      if (input?.severity) {
        filters.push(eq(recommendations.severity, input.severity));
      }

      // Cursor-based pagination: fetch items older than the cursor's createdAt
      if (input?.cursor) {
        const cursorRec = await ctx.db.query.recommendations.findFirst({
          where: eq(recommendations.id, input.cursor),
          columns: { createdAt: true },
        });
        if (cursorRec) {
          filters.push(lt(recommendations.createdAt, cursorRec.createdAt));
        }
      }

      const items = await ctx.db.query.recommendations.findMany({
        where: and(...filters),
        orderBy: [desc(recommendations.createdAt)],
        limit: (input?.limit ?? 50) + 1,
        with: {
          sourceBaleybot: { columns: { id: true, name: true, icon: true } },
          targetBaleybot: { columns: { id: true, name: true, icon: true } },
        },
      });

      const hasMore = items.length > (input?.limit ?? 50);
      const results = hasMore ? items.slice(0, -1) : items;

      return {
        items: results,
        nextCursor: hasMore ? results[results.length - 1]?.id : undefined,
      };
    }),

  /**
   * Get a single recommendation by ID.
   */
  getById: protectedProcedure
    .input(z.object({ id: uuidSchema }))
    .query(async ({ ctx, input }) => {
      const rec = await ctx.db.query.recommendations.findFirst({
        where: and(
          eq(recommendations.id, input.id),
          eq(recommendations.workspaceId, ctx.workspace.id)
        ),
        with: {
          sourceBaleybot: { columns: { id: true, name: true, icon: true } },
          targetBaleybot: { columns: { id: true, name: true, icon: true } },
        },
      });

      if (!rec) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Recommendation not found' });
      }

      return rec;
    }),

  /**
   * Accept a recommendation and apply its proposed action.
   */
  accept: protectedProcedure
    .input(z.object({ id: uuidSchema, note: z.string().max(1000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const rec = await ctx.db.query.recommendations.findFirst({
        where: and(
          eq(recommendations.id, input.id),
          eq(recommendations.workspaceId, ctx.workspace.id)
        ),
      });

      if (!rec) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Recommendation not found' });
      }

      if (rec.status !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Recommendation is already ${rec.status}`,
        });
      }

      await ctx.db.transaction(async (tx) => {
        // Update recommendation status
        await tx
          .update(recommendations)
          .set({
            status: 'accepted',
            decidedBy: ctx.userId,
            decidedAt: new Date(),
            decisionNote: input.note ?? null,
            updatedAt: new Date(),
          })
          .where(eq(recommendations.id, rec.id));

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
          case 'bal_patch': {
            const action = rec.proposedAction as {
              currentCode: string;
              proposedCode: string;
            };
            if (rec.targetBaleybotId) {
              const bb = await tx.query.baleybots.findFirst({
                where: eq(baleybots.id, rec.targetBaleybotId),
              });
              if (bb) {
                await updateWithLock(baleybots, bb.id, bb.version, {
                  balCode: action.proposedCode,
                }, tx);
              }
            }
            break;
          }
          case 'configuration':
          case 'insight':
          case 'performance':
            // Informational or future — no side effect beyond status change
            break;
        }
      });

      return { success: true };
    }),

  /**
   * Reject a recommendation with an optional note.
   */
  reject: protectedProcedure
    .input(z.object({ id: uuidSchema, note: z.string().max(1000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const rec = await ctx.db.query.recommendations.findFirst({
        where: and(
          eq(recommendations.id, input.id),
          eq(recommendations.workspaceId, ctx.workspace.id)
        ),
      });

      if (!rec) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Recommendation not found' });
      }

      if (rec.status !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Recommendation is already ${rec.status}`,
        });
      }

      await ctx.db
        .update(recommendations)
        .set({
          status: 'rejected',
          decidedBy: ctx.userId,
          decidedAt: new Date(),
          decisionNote: input.note ?? null,
          updatedAt: new Date(),
        })
        .where(eq(recommendations.id, input.id));

      return { success: true };
    }),

  /**
   * Dismiss a recommendation (not actionable / not relevant).
   */
  dismiss: protectedProcedure
    .input(z.object({ id: uuidSchema }))
    .mutation(async ({ ctx, input }) => {
      const rec = await ctx.db.query.recommendations.findFirst({
        where: and(
          eq(recommendations.id, input.id),
          eq(recommendations.workspaceId, ctx.workspace.id)
        ),
      });

      if (!rec) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Recommendation not found' });
      }

      if (rec.status !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Recommendation is already ${rec.status}`,
        });
      }

      await ctx.db
        .update(recommendations)
        .set({
          status: 'dismissed',
          decidedBy: ctx.userId,
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(recommendations.id, input.id));

      return { success: true };
    }),

  /**
   * Get recommendation counts by status for the workspace.
   */
  counts: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        status: recommendations.status,
        count: sql<number>`count(*)::int`,
      })
      .from(recommendations)
      .where(eq(recommendations.workspaceId, ctx.workspace.id))
      .groupBy(recommendations.status);

    const counts: Record<string, number> = {
      pending: 0,
      accepted: 0,
      rejected: 0,
      dismissed: 0,
    };

    for (const row of rows) {
      counts[row.status] = row.count;
    }

    return counts;
  }),
});
