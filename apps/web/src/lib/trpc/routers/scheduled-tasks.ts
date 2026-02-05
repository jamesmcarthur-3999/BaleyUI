import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { scheduledTasks, eq, and, desc } from '@baleyui/db';
import { throwNotFound } from '../helpers';

/**
 * tRPC router for managing scheduled tasks.
 */
export const scheduledTasksRouter = router({
  /**
   * List scheduled tasks for the workspace.
   */
  list: protectedProcedure
    .input(
      z
        .object({
          status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']).optional(),
          limit: z.number().int().min(1).max(100).default(50),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(scheduledTasks.workspaceId, ctx.workspace.id)];

      if (input?.status) {
        conditions.push(eq(scheduledTasks.status, input.status));
      }

      return ctx.db.query.scheduledTasks.findMany({
        where: and(...conditions),
        with: {
          baleybot: { columns: { id: true, name: true, icon: true } },
        },
        orderBy: [desc(scheduledTasks.runAt)],
        limit: input?.limit ?? 50,
      });
    }),

  /**
   * Cancel a pending scheduled task.
   */
  cancel: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.query.scheduledTasks.findFirst({
        where: and(
          eq(scheduledTasks.id, input.id),
          eq(scheduledTasks.workspaceId, ctx.workspace.id)
        ),
      });

      if (!task) {
        throwNotFound('Scheduled task');
      }

      if (task.status !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only pending tasks can be cancelled',
        });
      }

      const [updated] = await ctx.db
        .update(scheduledTasks)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(scheduledTasks.id, input.id))
        .returning();

      return updated;
    }),

  /**
   * Reschedule a task with a new run time.
   */
  reschedule: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        runAt: z.string().datetime(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.query.scheduledTasks.findFirst({
        where: and(
          eq(scheduledTasks.id, input.id),
          eq(scheduledTasks.workspaceId, ctx.workspace.id)
        ),
      });

      if (!task) {
        throwNotFound('Scheduled task');
      }

      const [updated] = await ctx.db
        .update(scheduledTasks)
        .set({
          runAt: new Date(input.runAt),
          status: 'pending',
          updatedAt: new Date(),
        })
        .where(eq(scheduledTasks.id, input.id))
        .returning();

      return updated;
    }),
});
