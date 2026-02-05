/**
 * Notifications Router - User notification management
 *
 * Handles listing, reading, and dismissing notifications sent by BaleyBots
 * or system events. Requires session auth (userId must be present).
 */
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { notifications, eq, and, isNull, sql, desc } from '@baleyui/db';
import { uuidSchema } from '../helpers';

/**
 * Guard that ensures a userId is present on the context.
 * Notifications are per-user, so API key auth (which has no userId) is not supported.
 */
function requireUserId(userId: string | null): asserts userId is string {
  if (!userId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Notifications require user authentication',
    });
  }
}

export const notificationsRouter = router({
  /**
   * List notifications for the current user in the workspace.
   */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).optional().default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      requireUserId(ctx.userId);

      return ctx.db.query.notifications.findMany({
        where: and(
          eq(notifications.workspaceId, ctx.workspace.id),
          eq(notifications.userId, ctx.userId)
        ),
        orderBy: [desc(notifications.createdAt)],
        limit: input?.limit ?? 50,
      });
    }),

  /**
   * Mark a single notification as read.
   */
  markRead: protectedProcedure
    .input(z.object({ id: uuidSchema }))
    .mutation(async ({ ctx, input }) => {
      requireUserId(ctx.userId);

      const [updated] = await ctx.db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.id, input.id),
            eq(notifications.workspaceId, ctx.workspace.id),
            eq(notifications.userId, ctx.userId)
          )
        )
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Notification not found',
        });
      }

      return updated;
    }),

  /**
   * Mark all unread notifications as read for the current user in the workspace.
   */
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    requireUserId(ctx.userId);

    await ctx.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.workspaceId, ctx.workspace.id),
          eq(notifications.userId, ctx.userId),
          isNull(notifications.readAt)
        )
      );

    return { success: true };
  }),

  /**
   * Get the count of unread notifications for the current user in the workspace.
   */
  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    requireUserId(ctx.userId);

    const [result] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.workspaceId, ctx.workspace.id),
          eq(notifications.userId, ctx.userId),
          isNull(notifications.readAt)
        )
      );

    return { count: result?.count ?? 0 };
  }),
});
