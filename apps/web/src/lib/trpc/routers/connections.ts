import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { connections, eq, and, notDeleted, softDelete, updateWithLock, sql } from '@baleyui/db';
import { encrypt, decrypt } from '@/lib/encryption';
import { testConnection } from '@/lib/connections/test';
import { listOllamaModels } from '@/lib/connections/ollama';
import { isDatabaseProvider } from '@/lib/connections/providers';
import type { ProviderType } from '@/lib/connections/providers';
import type { ConnectionConfig } from '@/lib/types';
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

// ============================================================================
// SENSITIVE FIELDS
// ============================================================================

/**
 * Get the list of sensitive fields that should be encrypted for a given provider type.
 */
type SensitiveField = 'apiKey' | 'password';

function getSensitiveFields(type: string): SensitiveField[] {
  if (isDatabaseProvider(type as ProviderType)) {
    return ['password'];
  }
  return ['apiKey'];
}

/**
 * Encrypt an object's sensitive fields.
 */
function encryptObject<T extends ConnectionConfig>(
  obj: T,
  sensitiveFields: SensitiveField[]
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
  sensitiveFields: SensitiveField[]
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

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * AI provider config schema (OpenAI, Anthropic, Ollama)
 */
const aiConfigSchema = z.object({
  apiKey: z.string().min(10, 'API key is too short').max(500, 'API key is too long').optional(),
  baseUrl: urlSchema,
  organization: z.string().max(255).optional(),
});

/**
 * Database provider config schema (PostgreSQL, MySQL)
 */
const databaseConfigSchema = z.object({
  host: z.string().min(1, 'Host is required').max(500).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  database: z.string().min(1, 'Database name is required').max(255).optional(),
  username: z.string().max(255).optional(),
  password: z.string().max(1000).optional(),
  connectionUrl: z.string().max(2000).optional(),
  ssl: z.boolean().optional(),
  schema: z.string().max(255).optional(),
});

/**
 * Flexible connection config schema that accepts both AI and database fields.
 * The router enforces which fields are required based on the provider type.
 */
const connectionConfigSchema = aiConfigSchema.merge(databaseConfigSchema);

const providerTypeSchema = z.enum(['openai', 'anthropic', 'ollama', 'postgres', 'mysql']);

// ============================================================================
// ROUTER
// ============================================================================

export const connectionsRouter = router({
  /**
   * List all connections for the workspace.
   */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).optional().default(50),
        cursor: uuidSchema.optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const allConnections = await ctx.db.query.connections.findMany({
        where: and(
          eq(connections.workspaceId, ctx.workspace.id),
          notDeleted(connections)
        ),
        columns: {
          id: true,
          type: true,
          name: true,
          config: true,
          isDefault: true,
          status: true,
          lastCheckedAt: true,
          availableModels: true,
          createdAt: true,
          updatedAt: true,
          version: true,
        },
        orderBy: (connections, { desc }) => [desc(connections.createdAt)],
        limit: input?.limit ?? 50,
      });

      // Mask sensitive fields without decrypting
      return allConnections.map((conn) => {
        const config = conn.config as ConnectionConfig;

        // Mask API keys for AI providers
        if (config.apiKey) {
          return {
            ...conn,
            config: {
              ...config,
              apiKey: '••••••••',
              _hasApiKey: true,
            },
          };
        }

        // Mask passwords for database providers
        if (config.password) {
          return {
            ...conn,
            config: {
              ...config,
              password: '••••••••',
              _hasPassword: true,
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
      const sensitiveFields = getSensitiveFields(connection.type);
      const decryptedConfig = decryptObject(config, sensitiveFields);

      // Mask the sensitive value - only show last 4 characters
      const maskedConfig = { ...decryptedConfig };
      for (const field of sensitiveFields) {
        const value = maskedConfig[field];
        if (typeof value === 'string' && value.length > 4 && value !== '[DECRYPTION_FAILED]') {
          (maskedConfig as Record<string, unknown>)[field as string] = `****${value.slice(-4)}`;
        }
      }

      return {
        ...connection,
        config: maskedConfig,
      };
    }),

  /**
   * Create a new connection.
   */
  create: protectedProcedure
    .input(
      z.object({
        type: providerTypeSchema,
        name: nameSchema,
        config: connectionConfigSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Encrypt sensitive fields based on type
      const sensitiveFields = getSensitiveFields(input.type);
      const encryptedConfig = encryptObject(input.config, sensitiveFields);

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

      // Enforce single default: if multiple were created concurrently,
      // keep only the earliest one as default
      if (isFirstOfType) {
        await ctx.db.execute(sql`
          UPDATE connections SET is_default = false
          WHERE workspace_id = ${ctx.workspace.id}
            AND type = ${input.type}
            AND is_default = true
            AND deleted_at IS NULL
            AND id != (
              SELECT id FROM connections
              WHERE workspace_id = ${ctx.workspace.id}
                AND type = ${input.type}
                AND is_default = true
                AND deleted_at IS NULL
              ORDER BY created_at ASC LIMIT 1
            )
        `);
      }

      return connection;
    }),

  /**
   * Update a connection.
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
        columns: { id: true, type: true },
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
        // Encrypt sensitive fields based on connection type
        const sensitiveFields = getSensitiveFields(existing.type);
        const encryptedConfig = encryptObject(input.config, sensitiveFields);
        updateData.config = encryptedConfig;
      }

      return await withErrorHandling(
        () => updateWithLock(connections, input.id, input.version, updateData),
        'Connection'
      );
    }),

  /**
   * Delete a connection (soft delete).
   */
  delete: protectedProcedure
    .input(z.object({ id: uuidSchema }))
    .mutation(async ({ ctx, input }) => {
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

      const deleted = await softDelete(connections, input.id, ctx.userId ?? 'system:api-key');

      return deleted;
    }),

  /**
   * Test a connection by calling the provider's API or database server.
   * On success for database connections, introspects the schema and caches it.
   */
  test: protectedProcedure
    .input(
      z.object({
        id: uuidSchema.optional(),
        type: providerTypeSchema.optional(),
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
        const sensitiveFields = getSensitiveFields(type);
        config = decryptObject(connection.config as ConnectionConfig, sensitiveFields);
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
        const statusUpdate: Record<string, unknown> = {
          status: result.success ? 'connected' : 'error',
          lastCheckedAt: new Date(),
          updatedAt: new Date(),
        };

        // For Ollama, also update available models
        if (type === 'ollama' && result.success) {
          try {
            const models = await listOllamaModels(config.baseUrl || 'http://localhost:11434');
            statusUpdate.availableModels = models;
          } catch (error) {
            log.error('Failed to fetch Ollama models', { error });
          }
        }

        // For database connections, introspect and cache the schema on success
        if (isDatabaseProvider(type as ProviderType) && result.success) {
          try {
            const { introspectDatabaseConnection } = await import(
              '@/lib/baleybot/tools/catalog-service'
            );
            const schema = await introspectDatabaseConnection({
              connectionId: input.id,
              connectionName: 'test',
              type: type as 'postgres' | 'mysql',
              config: config as import('@/lib/connections/providers').DatabaseConnectionConfig,
            });

            if (schema) {
              statusUpdate.availableModels = schema; // Reuse availableModels JSONB column for cached schema
              log.info('Cached database schema', {
                connectionId: input.id,
                tableCount: schema.tables?.length ?? 0,
              });
            }
          } catch (error) {
            log.error('Failed to introspect database schema', { connectionId: input.id, error });
          }
        }

        await ctx.db
          .update(connections)
          .set(statusUpdate)
          .where(and(eq(connections.id, input.id), notDeleted(connections)));
      }

      return result;
    }),

  /**
   * Set a connection as the default for its provider type.
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
