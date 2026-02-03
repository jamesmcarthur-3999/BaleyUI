import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { connections, eq, and, notDeleted, softDelete } from '@baleyui/db';
import { TRPCError } from '@trpc/server';
import { encrypt, decrypt } from '@/lib/encryption';
import { testConnection } from '@/lib/connections/test';
import { listOllamaModels } from '@/lib/connections/ollama';
import type { ConnectionConfig, PartialUpdateData } from '@/lib/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('connections-router');

/**
 * Encrypt an object's sensitive fields.
 */
function encryptObject<T extends ConnectionConfig>(
  obj: T,
  sensitiveFields: (keyof T)[]
): T {
  const result = { ...obj };
  for (const field of sensitiveFields) {
    if (result[field] && typeof result[field] === 'string') {
      (result as Record<string, unknown>)[field as string] = encrypt(result[field] as string);
    }
  }
  return result;
}

/**
 * Decrypt an object's sensitive fields.
 */
function decryptObject<T extends ConnectionConfig>(
  obj: T,
  sensitiveFields: (keyof T)[]
): T {
  const result = { ...obj };
  for (const field of sensitiveFields) {
    if (result[field] && typeof result[field] === 'string') {
      try {
        (result as Record<string, unknown>)[field as string] = decrypt(result[field] as string);
      } catch (error) {
        // If decryption fails, leave as is (might not be encrypted)
        log.warn(`Failed to decrypt field ${String(field)}`, { error });
      }
    }
  }
  return result;
}

/**
 * tRPC router for managing AI provider connections.
 */

const connectionConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  organization: z.string().optional(),
});

export const connectionsRouter = router({
  /**
   * List all connections for the workspace.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const allConnections = await ctx.db.query.connections.findMany({
      where: and(
        eq(connections.workspaceId, ctx.workspace.id),
        notDeleted(connections)
      ),
      orderBy: (connections, { desc }) => [desc(connections.createdAt)],
    });

    // Decrypt API keys for display (masked)
    return allConnections.map((conn) => {
      const config = conn.config as ConnectionConfig;

      // Return masked API key for security
      if (config.apiKey) {
        const decryptedKey = decrypt(config.apiKey);
        const maskedKey = decryptedKey.slice(0, 8) + '...' + decryptedKey.slice(-4);

        return {
          ...conn,
          config: {
            ...config,
            apiKey: maskedKey,
            _hasApiKey: true,
          },
        };
      }

      return conn;
    });
  }),

  /**
   * Get a single connection by ID.
   */
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const connection = await ctx.db.query.connections.findFirst({
        where: and(
          eq(connections.id, input.id),
          eq(connections.workspaceId, ctx.workspace.id),
          notDeleted(connections)
        ),
      });

      if (!connection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Connection not found',
        });
      }

      // Decrypt sensitive fields for editing
      const config = connection.config as ConnectionConfig;
      const decryptedConfig = decryptObject(config, ['apiKey']);

      return {
        ...connection,
        config: decryptedConfig,
      };
    }),

  /**
   * Create a new connection.
   */
  create: protectedProcedure
    .input(
      z.object({
        type: z.enum(['openai', 'anthropic', 'ollama']),
        name: z.string().min(1).max(255),
        config: connectionConfigSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Encrypt API key if present
      const encryptedConfig = encryptObject(input.config, ['apiKey']);

      // If this is the first connection of its type, make it default
      const existingConnections = await ctx.db.query.connections.findMany({
        where: and(
          eq(connections.workspaceId, ctx.workspace.id),
          eq(connections.type, input.type),
          notDeleted(connections)
        ),
      });

      const isFirstOfType = existingConnections.length === 0;

      const [connection] = await ctx.db
        .insert(connections)
        .values({
          workspaceId: ctx.workspace.id,
          type: input.type,
          name: input.name,
          config: encryptedConfig,
          isDefault: isFirstOfType,
          status: 'unconfigured',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      return connection;
    }),

  /**
   * Update a connection.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        config: connectionConfigSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify connection exists and belongs to workspace
      const existing = await ctx.db.query.connections.findFirst({
        where: and(
          eq(connections.id, input.id),
          eq(connections.workspaceId, ctx.workspace.id),
          notDeleted(connections)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Connection not found',
        });
      }

      // Prepare update data
      const updateData: PartialUpdateData = {
        updatedAt: new Date(),
        version: existing.version + 1,
      };

      if (input.name) {
        updateData.name = input.name;
      }

      if (input.config) {
        // Encrypt sensitive fields
        const encryptedConfig = encryptObject(input.config, ['apiKey']);
        updateData.config = encryptedConfig;
      }

      const [updated] = await ctx.db
        .update(connections)
        .set(updateData)
        .where(eq(connections.id, input.id))
        .returning();

      return updated;
    }),

  /**
   * Delete a connection (soft delete).
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify connection exists and belongs to workspace
      const existing = await ctx.db.query.connections.findFirst({
        where: and(
          eq(connections.id, input.id),
          eq(connections.workspaceId, ctx.workspace.id),
          notDeleted(connections)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Connection not found',
        });
      }

      // Soft delete
      const [deleted] = await ctx.db
        .update(connections)
        .set({
          deletedAt: new Date(),
          deletedBy: ctx.userId,
          updatedAt: new Date(),
        })
        .where(eq(connections.id, input.id))
        .returning();

      return deleted;
    }),

  /**
   * Test a connection by calling the provider's API.
   */
  test: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        type: z.enum(['openai', 'anthropic', 'ollama']).optional(),
        config: connectionConfigSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let config: ConnectionConfig;
      let type: string;

      if (input.id) {
        // Test existing connection
        const connection = await ctx.db.query.connections.findFirst({
          where: and(
            eq(connections.id, input.id),
            eq(connections.workspaceId, ctx.workspace.id),
            notDeleted(connections)
          ),
        });

        if (!connection) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Connection not found',
          });
        }

        type = connection.type;
        config = decryptObject(connection.config as ConnectionConfig, ['apiKey']);
      } else if (input.type && input.config) {
        // Test new connection config
        type = input.type;
        config = input.config;
      } else {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Either id or type and config must be provided',
        });
      }

      // Test the connection
      const result = await testConnection(type, config);

      // Update connection status if testing an existing connection
      if (input.id) {
        await ctx.db
          .update(connections)
          .set({
            status: result.success ? 'connected' : 'error',
            lastCheckedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(connections.id, input.id));

        // For Ollama, also update available models
        if (type === 'ollama' && result.success) {
          try {
            const models = await listOllamaModels(config.baseUrl || 'http://localhost:11434');
            await ctx.db
              .update(connections)
              .set({
                availableModels: models,
                updatedAt: new Date(),
              })
              .where(eq(connections.id, input.id));
          } catch (error) {
            console.error('Failed to fetch Ollama models:', error);
          }
        }
      }

      return result;
    }),

  /**
   * Set a connection as the default for its provider type.
   */
  setDefault: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.transaction(async (tx) => {
        // First, unset all defaults in workspace
        await tx
          .update(connections)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(
            and(
              eq(connections.workspaceId, ctx.workspace.id),
              eq(connections.isDefault, true)
            )
          );

        // Then set the new default
        const [updated] = await tx
          .update(connections)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(
            and(
              eq(connections.id, input.id),
              eq(connections.workspaceId, ctx.workspace.id)
            )
          )
          .returning();

        if (!updated) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Connection not found',
          });
        }

        return updated;
      });
    }),

  /**
   * Refresh Ollama models for a connection.
   */
  refreshOllamaModels: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const connection = await ctx.db.query.connections.findFirst({
        where: and(
          eq(connections.id, input.id),
          eq(connections.workspaceId, ctx.workspace.id),
          notDeleted(connections)
        ),
      });

      if (!connection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Connection not found',
        });
      }

      if (connection.type !== 'ollama') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This endpoint is only for Ollama connections',
        });
      }

      const config = decryptObject(connection.config as ConnectionConfig, ['apiKey']);
      const models = await listOllamaModels(config.baseUrl || 'http://localhost:11434');

      const [updated] = await ctx.db
        .update(connections)
        .set({
          availableModels: models,
          lastCheckedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(connections.id, input.id))
        .returning();

      return updated;
    }),
});
