import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { connections, eq, and, isNull } from '@baleyui/db';
import { TRPCError } from '@trpc/server';
import { encrypt, decrypt } from '@/lib/encryption';
import { testConnection } from '@/lib/connections/test';
import { listOllamaModels } from '@/lib/connections/ollama';

/**
 * Encrypt an object's sensitive fields.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function encryptObject<T extends Record<string, any>>(
  obj: T,
  sensitiveFields: (keyof T)[]
): T {
  const result = { ...obj };
  for (const field of sensitiveFields) {
    if (result[field] && typeof result[field] === 'string') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result[field] = encrypt(result[field] as string) as any;
    }
  }
  return result;
}

/**
 * Decrypt an object's sensitive fields.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function decryptObject<T extends Record<string, any>>(
  obj: T,
  sensitiveFields: (keyof T)[]
): T {
  const result = { ...obj };
  for (const field of sensitiveFields) {
    if (result[field] && typeof result[field] === 'string') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result[field] = decrypt(result[field] as string) as any;
      } catch (error) {
        // If decryption fails, leave as is (might not be encrypted)
        console.error(`Failed to decrypt field ${String(field)}:`, error);
      }
    }
  }
  return result;
}

/**
 * tRPC router for managing AI provider and database connections.
 */

const connectionConfigSchema = z.object({
  // AI provider fields
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  organization: z.string().optional(),
  // Database fields
  host: z.string().optional(),
  port: z.number().optional(),
  database: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  connectionUrl: z.string().optional(),
  ssl: z.boolean().optional(),
  schema: z.string().optional(),
});

const connectionTypeSchema = z.enum(['openai', 'anthropic', 'ollama', 'postgres', 'mysql']);

export const connectionsRouter = router({
  /**
   * List all connections for the workspace.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const allConnections = await ctx.db.query.connections.findMany({
      where: and(
        eq(connections.workspaceId, ctx.workspace.id),
        isNull(connections.deletedAt)
      ),
      orderBy: (connections, { desc }) => [desc(connections.createdAt)],
    });

    // Decrypt and mask sensitive fields for display
    return allConnections.map((conn) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = conn.config as Record<string, any>;
      const maskedConfig = { ...config };

      // Mask API key for AI providers
      if (config.apiKey) {
        try {
          const decryptedKey = decrypt(config.apiKey);
          maskedConfig.apiKey = decryptedKey.slice(0, 8) + '...' + decryptedKey.slice(-4);
          maskedConfig._hasApiKey = true;
        } catch {
          maskedConfig.apiKey = '********';
          maskedConfig._hasApiKey = true;
        }
      }

      // Mask password for database connections
      if (config.password) {
        maskedConfig.password = '********';
        maskedConfig._hasPassword = true;
      }

      // Mask connection URL for database connections
      if (config.connectionUrl) {
        maskedConfig.connectionUrl = '********';
        maskedConfig._hasConnectionUrl = true;
      }

      return {
        ...conn,
        config: maskedConfig,
      };
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
          isNull(connections.deletedAt)
        ),
      });

      if (!connection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Connection not found',
        });
      }

      // Decrypt sensitive fields for editing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = connection.config as Record<string, any>;
      const decryptedConfig = decryptObject(config, ['apiKey', 'password', 'connectionUrl']);

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
        type: connectionTypeSchema,
        name: z.string().min(1).max(255),
        config: connectionConfigSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Encrypt sensitive fields based on connection type
      const sensitiveFields: (keyof typeof input.config)[] = ['apiKey', 'password', 'connectionUrl'];
      const encryptedConfig = encryptObject(input.config, sensitiveFields);

      // If this is the first connection of its type, make it default
      const existingConnections = await ctx.db.query.connections.findMany({
        where: and(
          eq(connections.workspaceId, ctx.workspace.id),
          eq(connections.type, input.type),
          isNull(connections.deletedAt)
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
          isNull(connections.deletedAt)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Connection not found',
        });
      }

      // Prepare update data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: any = {
        updatedAt: new Date(),
        version: existing.version + 1,
      };

      if (input.name) {
        updateData.name = input.name;
      }

      if (input.config) {
        // Encrypt sensitive fields (both AI and database credentials)
        const encryptedConfig = encryptObject(input.config, ['apiKey', 'password', 'connectionUrl']);
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
          isNull(connections.deletedAt)
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
        type: connectionTypeSchema.optional(),
        config: connectionConfigSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let config: Record<string, any>;
      let type: string;

      if (input.id) {
        // Test existing connection
        const connection = await ctx.db.query.connections.findFirst({
          where: and(
            eq(connections.id, input.id),
            eq(connections.workspaceId, ctx.workspace.id),
            isNull(connections.deletedAt)
          ),
        });

        if (!connection) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Connection not found',
          });
        }

        type = connection.type;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config = decryptObject(connection.config as Record<string, any>, ['apiKey', 'password', 'connectionUrl']);
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
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify connection exists and belongs to workspace
      const connection = await ctx.db.query.connections.findFirst({
        where: and(
          eq(connections.id, input.id),
          eq(connections.workspaceId, ctx.workspace.id),
          isNull(connections.deletedAt)
        ),
      });

      if (!connection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Connection not found',
        });
      }

      // Unset all other defaults for this provider type
      await ctx.db
        .update(connections)
        .set({
          isDefault: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(connections.workspaceId, ctx.workspace.id),
            eq(connections.type, connection.type),
            isNull(connections.deletedAt)
          )
        );

      // Set this connection as default
      const [updated] = await ctx.db
        .update(connections)
        .set({
          isDefault: true,
          updatedAt: new Date(),
        })
        .where(eq(connections.id, input.id))
        .returning();

      return updated;
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
          isNull(connections.deletedAt)
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = decryptObject(connection.config as Record<string, any>, ['apiKey']);
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
