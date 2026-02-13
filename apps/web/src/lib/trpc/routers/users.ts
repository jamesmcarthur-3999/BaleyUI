import { z } from 'zod';
import { router, authenticatedProcedure } from '../trpc';
import { users, eq, db } from '@baleyui/db';
import { TRPCError } from '@trpc/server';
import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';

export const usersRouter = router({
  /**
   * Get the current user's profile.
   * Better Auth creates user records directly — no webhook stub needed.
   */
  getProfile: authenticatedProcedure.query(async ({ ctx }) => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, ctx.userId),
    });

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User profile not found',
      });
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
      preferences: user.preferences ?? {},
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }),

  /**
   * Update user profile (name).
   */
  updateProfile: authenticatedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const reqHeaders = await headers();
      await auth.api.updateUser({
        headers: reqHeaders,
        body: { name: input.name },
      });

      // Also update local DB for immediate consistency
      await db
        .update(users)
        .set({ name: input.name, updatedAt: new Date() })
        .where(eq(users.id, ctx.userId));

      return { success: true };
    }),

  /**
   * Change password (requires current password).
   */
  changePassword: authenticatedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8),
      })
    )
    .mutation(async ({ input }) => {
      const reqHeaders = await headers();
      const result = await auth.api.changePassword({
        headers: reqHeaders,
        body: {
          currentPassword: input.currentPassword,
          newPassword: input.newPassword,
        },
      });

      if (!result) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Failed to change password. Check your current password.',
        });
      }

      return { success: true };
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
