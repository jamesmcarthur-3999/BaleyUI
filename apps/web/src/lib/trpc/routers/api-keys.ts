import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { apiKeys, eq, and, isNull } from '@baleyui/db';
import { TRPCError } from '@trpc/server';
import crypto from 'crypto';

/**
 * Generate a new API key with the format: bui_live_<32 random hex chars>
 */
function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(16);
  const randomHex = randomBytes.toString('hex');
  return `bui_live_${randomHex}`;
}

/**
 * Hash an API key using SHA256
 */
function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Get the prefix of an API key (first 12 chars: bui_live_XXX)
 */
function getKeyPrefix(apiKey: string): string {
  return apiKey.substring(0, 12);
}

/**
 * Get the last 4 characters of an API key
 */
function getKeyLast4(apiKey: string): string {
  return apiKey.slice(-4);
}

/**
 * Format an API key for display (prefix...last4)
 */
function formatKeyForDisplay(prefix: string, last4: string): string {
  return `${prefix}...${last4}`;
}

const permissionsSchema = z.array(z.enum(['read', 'execute', 'admin'])).min(1);

export const apiKeysRouter = router({
  /**
   * List all API keys for the workspace.
   * Returns keys with masked values (prefix...last4).
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const keys = await ctx.db.query.apiKeys.findMany({
      where: and(
        eq(apiKeys.workspaceId, ctx.workspace.id),
        isNull(apiKeys.revokedAt)
      ),
      orderBy: (apiKeys, { desc }) => [desc(apiKeys.createdAt)],
    });

    return keys.map((key) => ({
      id: key.id,
      name: key.name,
      keyDisplay: formatKeyForDisplay(key.keyPrefix, key.keySuffix),
      permissions: key.permissions as string[],
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      createdAt: key.createdAt,
      createdBy: key.createdBy,
    }));
  }),

  /**
   * Create a new API key.
   * Returns the full key ONCE - it will never be shown again.
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        permissions: permissionsSchema,
        expiresAt: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Generate a new API key
      const apiKey = generateApiKey();
      const keyHash = hashApiKey(apiKey);
      const keyPrefix = getKeyPrefix(apiKey);
      const keySuffix = getKeyLast4(apiKey);

      // Store the hashed key in the database
      const [newKey] = await ctx.db
        .insert(apiKeys)
        .values({
          workspaceId: ctx.workspace.id,
          name: input.name,
          keyHash,
          keyPrefix,
          keySuffix,
          permissions: input.permissions,
          expiresAt: input.expiresAt,
          createdBy: ctx.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      if (!newKey) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create API key',
        });
      }

      // Return the full API key ONCE
      return {
        id: newKey.id,
        name: newKey.name,
        apiKey, // Full key - only shown this once
        keyDisplay: formatKeyForDisplay(keyPrefix, keySuffix),
        permissions: newKey.permissions as string[],
        createdAt: newKey.createdAt,
      };
    }),

  /**
   * Revoke an API key (soft delete by setting revokedAt).
   */
  revoke: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify the key exists and belongs to the workspace
      const existingKey = await ctx.db.query.apiKeys.findFirst({
        where: and(
          eq(apiKeys.id, input.id),
          eq(apiKeys.workspaceId, ctx.workspace.id),
          isNull(apiKeys.revokedAt)
        ),
      });

      if (!existingKey) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'API key not found',
        });
      }

      // Soft delete by setting revokedAt
      const [revokedKey] = await ctx.db
        .update(apiKeys)
        .set({
          revokedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(apiKeys.id, input.id))
        .returning();

      if (!revokedKey) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to revoke API key',
        });
      }

      return {
        id: revokedKey.id,
        name: revokedKey.name,
        revokedAt: revokedKey.revokedAt,
      };
    }),
});
