/**
 * Models tRPC Router
 *
 * Provides model data for the UI (model picker, autocomplete, etc.)
 */

import { router, protectedProcedure } from '../trpc';
import { getModelsForWorkspace, resolveDisplayName } from '@/lib/models/model-registry';
import { z } from 'zod';

export const modelsRouter = router({
  /**
   * Get models available for the current workspace.
   * Filters by connected providers, SDK support, and sunset status.
   * Used by: NodeEditor model picker, bal-language autocomplete.
   */
  forWorkspace: protectedProcedure.query(async ({ ctx }) => {
    const models = await getModelsForWorkspace(ctx.workspace.id);

    // Group by provider, sorted by tier weight
    const tierWeight: Record<string, number> = { ultra: 0, powerful: 1, balanced: 2, fast: 3 };
    const grouped: Record<string, typeof models> = {};

    for (const model of models) {
      if (!grouped[model.provider]) {
        grouped[model.provider] = [];
      }
      grouped[model.provider]!.push(model);
    }

    // Sort within each provider group
    for (const provider of Object.keys(grouped)) {
      grouped[provider]!.sort((a, b) => (tierWeight[a.tier] ?? 99) - (tierWeight[b.tier] ?? 99));
    }

    return grouped;
  }),

  /**
   * Resolve a model string to its display name.
   */
  displayName: protectedProcedure
    .input(z.object({ modelString: z.string() }))
    .query(async ({ input }) => {
      return resolveDisplayName(input.modelString);
    }),
});
