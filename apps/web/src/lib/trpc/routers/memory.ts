import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { baleybotMemory, eq, and, desc } from '@baleyui/db';
import { throwNotFound } from '../helpers';

/**
 * tRPC router for managing baleybot memory (key-value storage per BB).
 */
export const memoryRouter = router({
  /**
   * List all memory entries for a specific baleybot.
   */
  listForBaleybot: protectedProcedure
    .input(z.object({ baleybotId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const entries = await ctx.db.query.baleybotMemory.findMany({
        where: and(
          eq(baleybotMemory.workspaceId, ctx.workspace.id),
          eq(baleybotMemory.baleybotId, input.baleybotId)
        ),
        orderBy: [desc(baleybotMemory.updatedAt)],
      });

      return entries;
    }),

  /**
   * Get a single memory entry by baleybot ID and key.
   */
  get: protectedProcedure
    .input(
      z.object({
        baleybotId: z.string().uuid(),
        key: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const entry = await ctx.db.query.baleybotMemory.findFirst({
        where: and(
          eq(baleybotMemory.workspaceId, ctx.workspace.id),
          eq(baleybotMemory.baleybotId, input.baleybotId),
          eq(baleybotMemory.key, input.key)
        ),
      });

      if (!entry) {
        throwNotFound('Memory entry');
      }

      return entry;
    }),

  /**
   * Delete a single memory entry by ID.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.query.baleybotMemory.findFirst({
        where: and(
          eq(baleybotMemory.id, input.id),
          eq(baleybotMemory.workspaceId, ctx.workspace.id)
        ),
      });

      if (!entry) {
        throwNotFound('Memory entry');
      }

      await ctx.db
        .delete(baleybotMemory)
        .where(eq(baleybotMemory.id, input.id));

      return { success: true };
    }),

  /**
   * Clear all memory entries for a specific baleybot.
   */
  clear: protectedProcedure
    .input(z.object({ baleybotId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(baleybotMemory)
        .where(
          and(
            eq(baleybotMemory.workspaceId, ctx.workspace.id),
            eq(baleybotMemory.baleybotId, input.baleybotId)
          )
        );

      return { success: true };
    }),
});
