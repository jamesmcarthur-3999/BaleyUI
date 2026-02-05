/**
 * Triggers Router - BB completion chain management
 *
 * Handles CRUD operations for BaleyBot triggers that enable BB chaining.
 * When a source BB completes, it can automatically trigger downstream BBs.
 */
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { baleybotTriggers, baleybots, eq, and, notDeleted } from '@baleyui/db';
import {
  createTrigger,
  deleteTrigger,
  enableTrigger,
  disableTrigger,
  getTriggersForSource,
} from '@/lib/baleybot/services/bb-completion-trigger-service';

export const triggersRouter = router({
  /**
   * List all triggers for the workspace.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.baleybotTriggers.findMany({
      where: eq(baleybotTriggers.workspaceId, ctx.workspace.id),
      with: {
        sourceBaleybot: { columns: { id: true, name: true } },
        targetBaleybot: { columns: { id: true, name: true } },
      },
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
  }),

  /**
   * Get triggers where a specific BB is the source (what it triggers).
   */
  getForSource: protectedProcedure
    .input(z.object({ sourceBaleybotId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify BB belongs to workspace
      const bb = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.sourceBaleybotId),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots)
        ),
      });

      if (!bb) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'BaleyBot not found',
        });
      }

      return getTriggersForSource(input.sourceBaleybotId);
    }),

  /**
   * Get triggers where a specific BB is the target (what triggers it).
   */
  getForTarget: protectedProcedure
    .input(z.object({ targetBaleybotId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify BB belongs to workspace
      const bb = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.targetBaleybotId),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots)
        ),
      });

      if (!bb) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'BaleyBot not found',
        });
      }

      return ctx.db.query.baleybotTriggers.findMany({
        where: and(
          eq(baleybotTriggers.targetBaleybotId, input.targetBaleybotId),
          eq(baleybotTriggers.workspaceId, ctx.workspace.id)
        ),
        with: {
          sourceBaleybot: { columns: { id: true, name: true } },
        },
      });
    }),

  /**
   * Create a new trigger between two BBs.
   */
  create: protectedProcedure
    .input(
      z.object({
        sourceBaleybotId: z.string().uuid(),
        targetBaleybotId: z.string().uuid(),
        triggerType: z.enum(['completion', 'success', 'failure']),
        inputMapping: z.record(z.string(), z.string()).optional(),
        staticInput: z.record(z.string(), z.unknown()).optional(),
        condition: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify both BBs belong to workspace
      const [sourceBB, targetBB] = await Promise.all([
        ctx.db.query.baleybots.findFirst({
          where: and(
            eq(baleybots.id, input.sourceBaleybotId),
            eq(baleybots.workspaceId, ctx.workspace.id),
            notDeleted(baleybots)
          ),
        }),
        ctx.db.query.baleybots.findFirst({
          where: and(
            eq(baleybots.id, input.targetBaleybotId),
            eq(baleybots.workspaceId, ctx.workspace.id),
            notDeleted(baleybots)
          ),
        }),
      ]);

      if (!sourceBB) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Source BaleyBot not found',
        });
      }

      if (!targetBB) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Target BaleyBot not found',
        });
      }

      if (input.sourceBaleybotId === input.targetBaleybotId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'A BaleyBot cannot trigger itself',
        });
      }

      // Check for existing trigger with same source/target
      const existing = await ctx.db.query.baleybotTriggers.findFirst({
        where: and(
          eq(baleybotTriggers.sourceBaleybotId, input.sourceBaleybotId),
          eq(baleybotTriggers.targetBaleybotId, input.targetBaleybotId),
          eq(baleybotTriggers.workspaceId, ctx.workspace.id)
        ),
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A trigger already exists between these BaleyBots',
        });
      }

      const triggerId = await createTrigger(
        ctx.workspace.id,
        input.sourceBaleybotId,
        input.targetBaleybotId,
        {
          triggerType: input.triggerType,
          inputMapping: input.inputMapping,
          staticInput: input.staticInput,
          condition: input.condition,
        }
      );

      return { id: triggerId };
    }),

  /**
   * Delete a trigger.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const trigger = await ctx.db.query.baleybotTriggers.findFirst({
        where: and(
          eq(baleybotTriggers.id, input.id),
          eq(baleybotTriggers.workspaceId, ctx.workspace.id)
        ),
      });

      if (!trigger) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Trigger not found',
        });
      }

      await deleteTrigger(input.id);
      return { success: true };
    }),

  /**
   * Enable a trigger.
   */
  enable: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const trigger = await ctx.db.query.baleybotTriggers.findFirst({
        where: and(
          eq(baleybotTriggers.id, input.id),
          eq(baleybotTriggers.workspaceId, ctx.workspace.id)
        ),
      });

      if (!trigger) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Trigger not found',
        });
      }

      await enableTrigger(input.id);
      return { success: true };
    }),

  /**
   * Disable a trigger.
   */
  disable: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const trigger = await ctx.db.query.baleybotTriggers.findFirst({
        where: and(
          eq(baleybotTriggers.id, input.id),
          eq(baleybotTriggers.workspaceId, ctx.workspace.id)
        ),
      });

      if (!trigger) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Trigger not found',
        });
      }

      await disableTrigger(input.id);
      return { success: true };
    }),

  /**
   * Update trigger configuration.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        triggerType: z.enum(['completion', 'success', 'failure']).optional(),
        inputMapping: z.record(z.string(), z.string()).nullable().optional(),
        staticInput: z.record(z.string(), z.unknown()).nullable().optional(),
        condition: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const trigger = await ctx.db.query.baleybotTriggers.findFirst({
        where: and(
          eq(baleybotTriggers.id, id),
          eq(baleybotTriggers.workspaceId, ctx.workspace.id)
        ),
      });

      if (!trigger) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Trigger not found',
        });
      }

      const [updated] = await ctx.db
        .update(baleybotTriggers)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(baleybotTriggers.id, id))
        .returning();

      return updated;
    }),
});
