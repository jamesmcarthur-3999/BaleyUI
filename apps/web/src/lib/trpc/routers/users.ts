import { z } from 'zod';
import { router, authenticatedProcedure } from '../trpc';
import { users, eq, db } from '@baleyui/db';
import { TRPCError } from '@trpc/server';

export const usersRouter = router({
  /**
   * Get the current user's profile from the local users table.
   * Falls back to creating a stub record if the webhook hasn't synced yet.
   */
  getProfile: authenticatedProcedure.query(async ({ ctx }) => {
    let user = await db.query.users.findFirst({
      where: eq(users.id, ctx.userId),
    });

    // If no local user record exists yet (webhook hasn't fired), create a stub
    if (!user) {
      try {
        const [created] = await db
          .insert(users)
          .values({
            id: ctx.userId,
            email: '', // Will be filled by the next webhook event
          })
          .onConflictDoNothing()
          .returning();
        user = created ?? await db.query.users.findFirst({
          where: eq(users.id, ctx.userId),
        });
      } catch {
        // Race condition — another request might have created it
        user = await db.query.users.findFirst({
          where: eq(users.id, ctx.userId),
        });
      }
    }

    if (!user) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not resolve user profile',
      });
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      preferences: user.preferences ?? {},
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }),

  /**
   * Update user preferences (theme, notification settings, timezone).
   */
  updatePreferences: authenticatedProcedure
    .input(
      z.object({
        theme: z.enum(['light', 'dark', 'system']).optional(),
        notificationEmail: z.boolean().optional(),
        displayTimezone: z.string().max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await db.query.users.findFirst({
        where: eq(users.id, ctx.userId),
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      const currentPrefs = (user.preferences ?? {}) as Record<string, unknown>;
      const updatedPrefs = { ...currentPrefs };

      if (input.theme !== undefined) updatedPrefs.theme = input.theme;
      if (input.notificationEmail !== undefined) updatedPrefs.notificationEmail = input.notificationEmail;
      if (input.displayTimezone !== undefined) updatedPrefs.displayTimezone = input.displayTimezone;

      const [updated] = await db
        .update(users)
        .set({
          preferences: updatedPrefs,
          updatedAt: new Date(),
        })
        .where(eq(users.id, ctx.userId))
        .returning();

      return {
        id: updated!.id,
        preferences: updated!.preferences ?? {},
      };
    }),
});
