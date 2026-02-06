import { z } from 'zod';
import { router, adminProcedure } from '../trpc';
import {
  baleybots,
  eq,
  and,
  desc,
  notDeleted,
  updateWithLock,
  baleybotExecutions,
} from '@baleyui/db';
import { TRPCError } from '@trpc/server';
import { INTERNAL_BALEYBOTS } from '@/lib/baleybot/internal-baleybots';
import {
  uuidSchema,
  nameSchema,
  descriptionSchema,
  balCodeSchema,
  versionSchema,
} from '../helpers';

/**
 * Admin router for managing internal BaleyBots.
 * All procedures require admin privileges.
 */
export const adminRouter = router({
  /**
   * Check if the current user is an admin.
   */
  isAdmin: adminProcedure.query(() => true),

  /**
   * List all internal BaleyBots in the system workspace.
   */
  listInternalBaleybots: adminProcedure.query(async ({ ctx }) => {
    const results = await ctx.db.query.baleybots.findMany({
      where: and(
        eq(baleybots.workspaceId, ctx.workspace.id),
        eq(baleybots.isInternal, true),
        notDeleted(baleybots)
      ),
      orderBy: [desc(baleybots.createdAt)],
    });

    return results.map((bb) => ({
      ...bb,
      hasDefaultCode: bb.name in INTERNAL_BALEYBOTS
        ? bb.balCode === INTERNAL_BALEYBOTS[bb.name]!.balCode.trim()
        : false,
    }));
  }),

  /**
   * Get a single internal BaleyBot by ID, including recent executions.
   */
  getInternalBaleybot: adminProcedure
    .input(z.object({ id: uuidSchema }))
    .query(async ({ ctx, input }) => {
      const bb = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.id),
          eq(baleybots.workspaceId, ctx.workspace.id),
          eq(baleybots.isInternal, true),
          notDeleted(baleybots)
        ),
        with: {
          executions: {
            limit: 10,
            orderBy: [desc(baleybotExecutions.createdAt)],
            columns: {
              id: true,
              status: true,
              createdAt: true,
              completedAt: true,
              durationMs: true,
              error: true,
              triggeredBy: true,
            },
          },
        },
      });

      if (!bb) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Internal BaleyBot not found',
        });
      }

      const defaultDef = INTERNAL_BALEYBOTS[bb.name];

      return {
        ...bb,
        hasDefaultCode: defaultDef
          ? bb.balCode === defaultDef.balCode.trim()
          : false,
        defaultBalCode: defaultDef?.balCode.trim() ?? null,
      };
    }),

  /**
   * Update an internal BaleyBot's BAL code, name, description, or icon.
   * Sets adminEdited = true.
   */
  updateInternalBaleybot: adminProcedure
    .input(
      z.object({
        id: uuidSchema,
        version: versionSchema,
        name: nameSchema.optional(),
        description: descriptionSchema,
        icon: z.string().max(100).optional(),
        balCode: balCodeSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.id),
          eq(baleybots.workspaceId, ctx.workspace.id),
          eq(baleybots.isInternal, true),
          notDeleted(baleybots)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Internal BaleyBot not found',
        });
      }

      const updates: Record<string, unknown> = {
        adminEdited: true,
        updatedAt: new Date(),
      };

      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (input.icon !== undefined) updates.icon = input.icon;
      if (input.balCode !== undefined) updates.balCode = input.balCode;

      await updateWithLock(baleybots, input.id, input.version, updates);

      return { success: true };
    }),

  /**
   * Reset an internal BaleyBot to its default code definition.
   * Sets adminEdited = false.
   */
  resetToDefault: adminProcedure
    .input(
      z.object({
        id: uuidSchema,
        version: versionSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.id),
          eq(baleybots.workspaceId, ctx.workspace.id),
          eq(baleybots.isInternal, true),
          notDeleted(baleybots)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Internal BaleyBot not found',
        });
      }

      const defaultDef = INTERNAL_BALEYBOTS[existing.name];
      if (!defaultDef) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No default definition found for "${existing.name}"`,
        });
      }

      await updateWithLock(baleybots, input.id, input.version, {
        balCode: defaultDef.balCode.trim(),
        description: defaultDef.description,
        icon: defaultDef.icon,
        adminEdited: false,
        updatedAt: new Date(),
      });

      return { success: true };
    }),
});
