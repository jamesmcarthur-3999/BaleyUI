import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { connections, eq, and, notDeleted, softDelete, updateWithLock, OptimisticLockError } from '@baleyui/db';
import { TRPCError } from '@trpc/server';
import { encrypt, decrypt } from '@/lib/encryption';
import { testConnection } from '@/lib/connections/test';
import { listOllamaModels } from '@/lib/connections/ollama';
import type { ConnectionConfig, PartialUpdateData } from '@/lib/types';
import { createLogger } from '@/lib/logger';
import {
  withErrorHandling,
  throwNotFound,
  throwBadRequest,
  nameSchema,
  uuidSchema,
  versionSchema,
  urlSchema,
} from '../helpers';

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
        // Return placeholder instead of encrypted value to prevent leaking ciphertext
        log.warn(`Failed to decrypt field ${String(field)}`, { error });
        (result as Record<string, unknown>)[field as string] = '[DECRYPTION_FAILED]';
      }
    }
  }
  return result;
}

/**
 * tRPC router for managing AI provider connections.
 */

/**
 * API-001: Stricter connection config validation
 */
const connectionConfigSchema = z.object({
  apiKey: z.string().min(10, 'API key is too short').max(500, 'API key is too long').optional(),
  baseUrl: urlSchema,
  organization: z.string().max(255).optional(),
});

export const connectionsRouter = router({
  /**
   * List all connections for the workspace.
   * API-003: Add pagination support
   * API-004: Return only necessary fields for list view
   */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).optional().default(50),
        cursor: uuidSchema.optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      // API-004: Select only fields needed for list display
      // Note: availableModels is included as it's needed for model selection dropdowns
      const allConnections = await ctx.db.query.connections.findMany({
        where: and(
          eq(connections.workspaceId, ctx.workspace.id),
          notDeleted(connections)
        ),
        columns: {
          id: true,
          type: true,
          name: true,
          config: true, // Needed for masking apiKey
          isDefault: true,
          status: true,
          lastCheckedAt: true,
          availableModels: true, // Needed for model selection
          createdAt: true,
          updatedAt: true,
          version: true,
        },
        orderBy: (connections, { desc }) => [desc(connections.createdAt)],
        limit: input?.limit ?? 50,
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
   * API-001: Use standardized UUID schema
   */
  get: protectedProcedure
    .input(z.object({ id: uuidSchema }))
    .query(async ({ ctx, input }) => {
      const connection = await ctx.db.query.connections.findFirst({
        where: and(
          eq(connections.id, input.id),
          eq(connections.workspaceId, ctx.workspace.id),
          notDeleted(connections)
        ),
      });

      if (!connection) {
        throwNotFound('Connection');
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
   * API-001: Use standardized name schema
   */
  create: protectedProcedure
    .input(
      z.object({
        type: z.enum(['openai', 'anthropic', 'ollama', 'postgres', 'mysql']),
        name: nameSchema,
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
   * API-001: Stricter input validation
   * API-002: Use shared error handling
   */
  update: protectedProcedure
    .input(
      z.object({
        id: uuidSchema,
        version: versionSchema,
        name: nameSchema.optional(),
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
        columns: { id: true },
      });

      if (!existing) {
        throwNotFound('Connection');
      }

      // Prepare update data (version increment handled by updateWithLock)
      const updateData: Partial<Record<string, unknown>> = {};

      if (input.name) {
        updateData.name = input.name;
      }

      if (input.config) {
        // Encrypt sensitive fields
        const encryptedConfig = encryptObject(input.config, ['apiKey']);
        updateData.config = encryptedConfig;
      }

      // API-002: Use shared error handling helper
      return await withErrorHandling(
        () => updateWithLock(connections, input.id, input.version, updateData),
        'Connection'
      );
    }),

  /**
   * Delete a connection (soft delete).
   * API-001: Use standardized UUID schema
   */
  delete: protectedProcedure
    .input(z.object({ id: uuidSchema }))
    .mutation(async ({ ctx, input }) => {
      // Verify connection exists and belongs to workspace
      const existing = await ctx.db.query.connections.findFirst({
        where: and(
          eq(connections.id, input.id),
          eq(connections.workspaceId, ctx.workspace.id),
          notDeleted(connections)
        ),
        columns: { id: true },
      });

      if (!existing) {
        throwNotFound('Connection');
      }

      // Soft delete - API key auth has null userId, use fallback for audit trail
      const deleted = await softDelete(connections, input.id, ctx.userId ?? 'system:api-key');

      return deleted;
    }),

  /**
   * Test a connection by calling the provider's API.
   * API-001: Use standardized UUID schema
   * API-002: Use shared error helpers
   */
  test: protectedProcedure
    .input(
      z.object({
        id: uuidSchema.optional(),
        type: z.enum(['openai', 'anthropic', 'ollama', 'postgres', 'mysql']).optional(),
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
          throwNotFound('Connection');
        }

        type = connection.type;
        config = decryptObject(connection.config as ConnectionConfig, ['apiKey']);
      } else if (input.type && input.config) {
        // Test new connection config
        type = input.type;
        config = input.config;
      } else {
        throwBadRequest('Either id or type and config must be provided');
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
          .where(and(eq(connections.id, input.id), notDeleted(connections)));

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
              .where(and(eq(connections.id, input.id), notDeleted(connections)));
          } catch (error) {
            log.error('Failed to fetch Ollama models', { error });
          }
        }
      }

      return result;
    }),

  /**
   * Set a connection as the default for its provider type.
   * API-001: Use standardized UUID schema
   */
  setDefault: protectedProcedure
    .input(z.object({ id: uuidSchema }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.transaction(async (tx) => {
        // First, unset all defaults in workspace (only non-deleted connections)
        await tx
          .update(connections)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(
            and(
              eq(connections.workspaceId, ctx.workspace.id),
              eq(connections.isDefault, true),
              notDeleted(connections)
            )
          );

        // Then set the new default (only if connection is not deleted)
        const [updated] = await tx
          .update(connections)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(
            and(
              eq(connections.id, input.id),
              eq(connections.workspaceId, ctx.workspace.id),
              notDeleted(connections)
            )
          )
          .returning();

        if (!updated) {
          throwNotFound('Connection');
        }

        return updated;
      });
    }),

  /**
   * Refresh Ollama models for a connection.
   * API-001: Use standardized UUID schema
   * API-002: Use shared error helpers
   */
  refreshOllamaModels: protectedProcedure
    .input(z.object({ id: uuidSchema }))
    .mutation(async ({ ctx, input }) => {
      const connection = await ctx.db.query.connections.findFirst({
        where: and(
          eq(connections.id, input.id),
          eq(connections.workspaceId, ctx.workspace.id),
          notDeleted(connections)
        ),
      });

      if (!connection) {
        throwNotFound('Connection');
      }

      if (connection.type !== 'ollama') {
        throwBadRequest('This endpoint is only for Ollama connections');
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
        .where(and(eq(connections.id, input.id), notDeleted(connections)))
        .returning();

      return updated;
    }),
});
