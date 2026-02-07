/**
 * Execution Tools Loader
 *
 * Shared utility for loading all tool categories (built-in + connection-derived + workspace)
 * during BaleyBot execution. Used by both the tRPC execute mutation and the streaming route.
 */

import {
  db,
  connections,
  tools as toolsTable,
  eq,
  and,
  inArray,
  notDeleted,
} from '@baleyui/db';
import { decrypt } from '@/lib/encryption';
import type { DatabaseConnectionConfig } from '@/lib/connections/providers';
import type { ConnectionConfig } from '@/lib/types';
import {
  getRuntimeTools,
  type CatalogContext,
  type RuntimeToolsContext,
  type DatabaseConnectionInput,
} from '../tools/catalog-service';
import type { BuiltInToolContext } from '../tools/built-in';
import type { RuntimeToolDefinition } from '../executor';
import { createSQLGenerator } from './nl-to-sql-service';
import { createLogger } from '@/lib/logger';

const log = createLogger('execution-tools-loader');

// ============================================================================
// TYPES
// ============================================================================

export interface LoadToolsInput {
  workspaceId: string;
  toolCtx: BuiltInToolContext;
  /** Tool names declared in the BAL code's "tools" array (if parsed) */
  declaredTools?: string[];
}

export interface LoadToolsResult {
  runtimeTools: Map<string, RuntimeToolDefinition>;
  toolNames: string[];
}

// ============================================================================
// DECRYPT HELPERS
// ============================================================================

function decryptMaybe(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

function decryptDatabaseConfig(config: ConnectionConfig): DatabaseConnectionConfig {
  return {
    host: config.host as string | undefined,
    port: config.port as number | undefined,
    database: config.database as string | undefined,
    username: config.username as string | undefined,
    password: decryptMaybe(config.password as string | undefined),
    connectionUrl: config.connectionUrl as string | undefined,
    ssl: config.ssl as boolean | undefined,
    schema: config.schema as string | undefined,
  };
}

// ============================================================================
// MAIN LOADER
// ============================================================================

/**
 * Load all tool categories for a BaleyBot execution.
 *
 * Fetches:
 * 1. Built-in tools (always available)
 * 2. Connection-derived database tools (from connected Postgres/MySQL connections)
 * 3. Workspace custom tools (from the tools table)
 *
 * Returns a Map of runtime tools ready for the executor.
 */
export async function loadExecutionTools(input: LoadToolsInput): Promise<LoadToolsResult> {
  const { workspaceId, toolCtx, declaredTools } = input;

  // Fetch database connections and workspace tools in parallel
  const [dbConnections, workspaceTools] = await Promise.all([
    loadDatabaseConnections(workspaceId),
    loadWorkspaceTools(workspaceId),
  ]);

  // Build catalog context
  const catalogCtx: CatalogContext = {
    workspaceId,
    workspacePolicies: null,
    includeConnectionTools: dbConnections.length > 0,
    databaseConnections: dbConnections,
    workspaceTools: workspaceTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    })),
  };

  // Build runtime context with SQL generator for the first DB type found
  const primaryDbType = dbConnections[0]?.type ?? 'postgres';
  const runtimeCtx: RuntimeToolsContext = {
    toolCtx,
    sqlGenerator: dbConnections.length > 0
      ? createSQLGenerator({ databaseType: primaryDbType })
      : undefined,
  };

  // Get combined runtime tools
  const runtimeTools = getRuntimeTools(catalogCtx, runtimeCtx);

  // Add workspace custom tools as NL-powered tools
  for (const tool of workspaceTools) {
    if (!runtimeTools.has(tool.name)) {
      runtimeTools.set(tool.name, createNLPoweredTool(tool));
    }
  }

  // Filter to only declared tools if specified (but always keep built-in tools)
  if (declaredTools && declaredTools.length > 0) {
    const declaredSet = new Set(declaredTools);
    // Import built-in tool checker
    const { isBuiltInTool } = await import('../tools/built-in');

    for (const [name] of runtimeTools) {
      // Keep if: declared in BAL, or is a built-in tool (always available)
      if (!declaredSet.has(name) && !isBuiltInTool(name)) {
        runtimeTools.delete(name);
      }
    }
  }

  const toolNames = Array.from(runtimeTools.keys());
  log.info('Loaded execution tools', {
    executionId: toolCtx.executionId,
    totalTools: toolNames.length,
    builtIn: toolNames.filter((n) => !n.startsWith('query_') && !workspaceTools.some((t) => t.name === n)).length,
    database: toolNames.filter((n) => n.startsWith('query_')).length,
    custom: workspaceTools.filter((t) => toolNames.includes(t.name)).length,
  });

  return { runtimeTools, toolNames };
}

// ============================================================================
// DATABASE CONNECTIONS LOADER
// ============================================================================

async function loadDatabaseConnections(workspaceId: string): Promise<DatabaseConnectionInput[]> {
  try {
    const dbConns = await db.query.connections.findMany({
      where: and(
        eq(connections.workspaceId, workspaceId),
        inArray(connections.type, ['postgres', 'mysql']),
        eq(connections.status, 'connected'),
        notDeleted(connections)
      ),
    });

    return dbConns.map((conn) => {
      const config = conn.config as ConnectionConfig;
      const decryptedConfig = decryptDatabaseConfig(config);

      // Try to use cached schema from availableModels JSONB column
      const cachedSchema = conn.availableModels as import('../tools/connection-derived').DatabaseSchema | null;
      const hasValidSchema = cachedSchema && Array.isArray(cachedSchema.tables);

      return {
        connectionId: conn.id,
        connectionName: conn.name,
        type: conn.type as 'postgres' | 'mysql',
        config: decryptedConfig,
        schema: hasValidSchema ? cachedSchema : undefined,
      };
    });
  } catch (error) {
    log.error('Failed to load database connections', { workspaceId, error });
    return [];
  }
}

// ============================================================================
// WORKSPACE TOOLS LOADER
// ============================================================================

interface WorkspaceTool {
  id: string;
  name: string;
  description: string;
  inputSchema: unknown;
  code: string;
}

async function loadWorkspaceTools(workspaceId: string): Promise<WorkspaceTool[]> {
  try {
    const wsTools = await db.query.tools.findMany({
      where: and(
        eq(toolsTable.workspaceId, workspaceId),
        notDeleted(toolsTable)
      ),
      columns: {
        id: true,
        name: true,
        description: true,
        inputSchema: true,
        code: true,
      },
    });

    return wsTools;
  } catch (error) {
    log.error('Failed to load workspace tools', { workspaceId, error });
    return [];
  }
}

// ============================================================================
// NL-POWERED TOOL FACTORY
// ============================================================================

/**
 * Create a runtime tool that uses natural language implementation.
 * The tool's `code` field is treated as a description of what the tool does,
 * and execution is AI-powered (same pattern as ephemeral tools from create_tool).
 */
function createNLPoweredTool(tool: WorkspaceTool): RuntimeToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: (tool.inputSchema as Record<string, unknown>) || { type: 'object', properties: {} },
    function: async (args: Record<string, unknown>) => {
      // Use the ephemeral tool service pattern — execute via internal BB
      const { executeInternalBaleybot } = await import('../internal-baleybots');

      const prompt = `You are executing a custom tool called "${tool.name}".

TOOL DESCRIPTION: ${tool.description}

IMPLEMENTATION INSTRUCTIONS:
${tool.code}

INPUT ARGUMENTS:
${JSON.stringify(args, null, 2)}

Execute the tool based on the implementation instructions and return the result. If the implementation is code-like, interpret it. If it's natural language, follow the instructions. Return your result as JSON if structured, or plain text otherwise.`;

      try {
        const { output } = await executeInternalBaleybot('creator_bot', prompt, {
          triggeredBy: 'internal',
        });
        return output;
      } catch (error) {
        return {
          error: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    },
  };
}
