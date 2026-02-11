/**
 * Connection Management Tools for Baley
 */

import type { RuntimeToolDefinition } from '../../executor';
import type { CompanionToolContext } from './index';
import {
  db,
  connections,
  notDeleted,
  eq,
  and,
  softDelete,
} from '@baleyui/db';
import { decrypt } from '@/lib/encryption';
import { createLogger } from '@/lib/logger';

const log = createLogger('companion-connections');

export function buildConnectionTools(
  ctx: CompanionToolContext
): Map<string, RuntimeToolDefinition> {
  const tools = new Map<string, RuntimeToolDefinition>();

  tools.set('list_connections', {
    name: 'list_connections',
    description:
      'List all connections in the workspace with their status, type, whether they are the default, and tool counts.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    async function() {
      const results = await db.query.connections.findMany({
        where: and(
          eq(connections.workspaceId, ctx.workspaceId),
          notDeleted(connections)
        ),
        columns: {
          id: true,
          name: true,
          type: true,
          status: true,
          isDefault: true,
          lastCheckedAt: true,
          createdAt: true,
        },
      });

      return {
        connections: results.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          status: c.status,
          isDefault: c.isDefault,
          lastChecked: c.lastCheckedAt?.toISOString() ?? null,
          createdAt: c.createdAt.toISOString(),
        })),
        total: results.length,
      };
    },
  });

  tools.set('test_connection', {
    name: 'test_connection',
    description:
      'Test a connection by ID. Returns detailed status and diagnostics.',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'The UUID of the connection to test',
        },
      },
      required: ['connectionId'],
    },
    async function(args) {
      const connectionId = args.connectionId as string;

      const conn = await db.query.connections.findFirst({
        where: and(
          eq(connections.id, connectionId),
          eq(connections.workspaceId, ctx.workspaceId),
          notDeleted(connections)
        ),
      });

      if (!conn) {
        return { success: false, error: 'Connection not found' };
      }

      try {
        const { testConnection } = await import(
          '@/lib/connections/test'
        );
        const config = conn.config as Record<string, string>;
        const decryptedConfig: Record<string, string> = {};
        for (const [key, value] of Object.entries(config)) {
          try {
            decryptedConfig[key] = decrypt(value);
          } catch {
            decryptedConfig[key] = value;
          }
        }

        const result = await testConnection(conn.type, decryptedConfig);

        await db
          .update(connections)
          .set({
            status: result.success ? 'connected' : 'error',
            lastCheckedAt: new Date(),
          })
          .where(eq(connections.id, connectionId));

        return {
          success: result.success,
          connectionName: conn.name,
          connectionType: conn.type,
          message: result.success
            ? `${conn.name} is working correctly.`
            : `${conn.name} test failed: ${result.message}`,
          details: result,
        };
      } catch (error) {
        log.error('Connection test failed', { connectionId, error });
        return {
          success: false,
          connectionName: conn.name,
          error: error instanceof Error ? error.message : 'Test failed',
        };
      }
    },
  });

  tools.set('set_default_connection', {
    name: 'set_default_connection',
    description:
      'Set a connection as the default for its type (AI provider or database).',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'The UUID of the connection to set as default',
        },
      },
      required: ['connectionId'],
    },
    async function(args) {
      const connectionId = args.connectionId as string;

      const conn = await db.query.connections.findFirst({
        where: and(
          eq(connections.id, connectionId),
          eq(connections.workspaceId, ctx.workspaceId),
          notDeleted(connections)
        ),
      });

      if (!conn) {
        return { success: false, error: 'Connection not found' };
      }

      // Unset all defaults of the same type
      const allSameType = await db.query.connections.findMany({
        where: and(
          eq(connections.workspaceId, ctx.workspaceId),
          eq(connections.type, conn.type),
          notDeleted(connections)
        ),
      });

      for (const c of allSameType) {
        if (c.isDefault) {
          await db
            .update(connections)
            .set({ isDefault: false })
            .where(eq(connections.id, c.id));
        }
      }

      await db
        .update(connections)
        .set({ isDefault: true })
        .where(eq(connections.id, connectionId));

      return {
        success: true,
        message: `${conn.name} is now the default ${conn.type} connection.`,
      };
    },
  });

  tools.set('delete_connection', {
    name: 'delete_connection',
    description:
      'Delete a connection. This is destructive — Baley should confirm with the user before calling this.',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: 'The UUID of the connection to delete',
        },
      },
      required: ['connectionId'],
    },
    needsApproval: true,
    async function(args) {
      const connectionId = args.connectionId as string;

      const conn = await db.query.connections.findFirst({
        where: and(
          eq(connections.id, connectionId),
          eq(connections.workspaceId, ctx.workspaceId),
          notDeleted(connections)
        ),
      });

      if (!conn) {
        return { success: false, error: 'Connection not found' };
      }

      await softDelete(connections, connectionId, ctx.userId);

      return {
        success: true,
        message: `Connection "${conn.name}" has been deleted.`,
      };
    },
  });

  tools.set('create_connection', {
    name: 'create_connection',
    description:
      'Create a new connection to an AI provider, database, or MCP server. Supported types: openai, anthropic, ollama, postgres, mysql, mcp. For AI providers, provide apiKey (and optionally baseUrl). For databases, provide host, port, database, username, password. For Ollama, provide baseUrl (e.g. http://localhost:11434). For MCP, provide url and transportType (http, sse, or stdio). Optionally provide authToken and toolPrefix for MCP.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['openai', 'anthropic', 'ollama', 'postgres', 'mysql', 'mcp'],
          description: 'The connection type',
        },
        name: {
          type: 'string',
          description:
            'Human-readable name for the connection (e.g. "Production DB", "Claude API", "GitHub MCP")',
        },
        apiKey: {
          type: 'string',
          description: 'API key for AI providers (openai, anthropic)',
        },
        baseUrl: {
          type: 'string',
          description:
            'Base URL override (required for ollama, optional for openai)',
        },
        host: {
          type: 'string',
          description: 'Database host',
        },
        port: {
          type: 'number',
          description: 'Database port (default: 5432 for postgres, 3306 for mysql)',
        },
        database: {
          type: 'string',
          description: 'Database name',
        },
        username: {
          type: 'string',
          description: 'Database username',
        },
        password: {
          type: 'string',
          description: 'Database password',
        },
        ssl: {
          type: 'boolean',
          description: 'Whether to use SSL for database connections',
        },
        url: {
          type: 'string',
          description: 'MCP server URL (for http/sse transport)',
        },
        transportType: {
          type: 'string',
          enum: ['http', 'sse', 'stdio'],
          description: 'MCP transport type (default: http)',
        },
        authToken: {
          type: 'string',
          description: 'Auth token for MCP server (bearer token)',
        },
        toolPrefix: {
          type: 'string',
          description: 'Prefix for MCP tool names (e.g. "github_")',
        },
      },
      required: ['type', 'name'],
    },
    async function(args) {
      const type = args.type as string;
      const name = args.name as string;

      // Build config based on type
      const config: Record<string, unknown> = {};
      const isDb = type === 'postgres' || type === 'mysql';
      const isMcp = type === 'mcp';

      if (isMcp) {
        config.transportType = args.transportType || 'http';
        if (args.url) config.url = args.url;
        if (args.toolPrefix) config.toolPrefix = args.toolPrefix;
        if (args.authToken) {
          const { encrypt: enc } = await import('@/lib/encryption');
          config.authToken = enc(args.authToken as string);
          config.authType = 'bearer';
        }
      } else if (isDb) {
        if (args.host) config.host = args.host;
        if (args.port) config.port = args.port;
        if (args.database) config.database = args.database;
        if (args.username) config.username = args.username;
        if (args.password) {
          const { encrypt: enc } = await import('@/lib/encryption');
          config.password = enc(args.password as string);
        }
        if (args.ssl !== undefined) config.ssl = args.ssl;
      } else {
        if (args.apiKey) {
          const { encrypt: enc } = await import('@/lib/encryption');
          config.apiKey = enc(args.apiKey as string);
        }
        if (args.baseUrl) config.baseUrl = args.baseUrl;
      }

      // Check if this is the first of its type (to auto-set as default)
      const existing = await db.query.connections.findMany({
        where: and(
          eq(connections.workspaceId, ctx.workspaceId),
          eq(connections.type, type),
          notDeleted(connections)
        ),
      });
      const isFirstOfType = existing.length === 0;

      const [created] = await db
        .insert(connections)
        .values({
          workspaceId: ctx.workspaceId,
          type,
          name,
          config,
          isDefault: isFirstOfType,
          status: 'unconfigured',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: connections.id, name: connections.name });

      // Auto-test the connection
      let testResult: { success: boolean; message?: string } = {
        success: false,
        message: 'Test skipped',
      };
      try {
        const { testConnection: testConn } = await import(
          '@/lib/connections/test'
        );
        const decryptedConfig: Record<string, string> = {};
        for (const [key, value] of Object.entries(config)) {
          if (typeof value === 'string') {
            try {
              decryptedConfig[key] = decrypt(value);
            } catch {
              decryptedConfig[key] = value;
            }
          } else {
            decryptedConfig[key] = String(value);
          }
        }
        testResult = await testConn(type, decryptedConfig);

        await db
          .update(connections)
          .set({
            status: testResult.success ? 'connected' : 'error',
            lastCheckedAt: new Date(),
          })
          .where(eq(connections.id, created!.id));
      } catch (err) {
        log.error('Auto-test failed after creating connection', { err });
      }

      return {
        success: true,
        connectionId: created!.id,
        connectionName: created!.name,
        isDefault: isFirstOfType,
        testResult: testResult.success
          ? `Connection test passed — ${name} is working.`
          : `Connection created but test failed: ${testResult.message ?? 'unknown error'}. You may want to check the credentials.`,
      };
    },
  });

  return tools;
}
