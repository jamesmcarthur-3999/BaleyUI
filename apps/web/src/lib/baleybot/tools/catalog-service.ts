/**
 * Tool Catalog Service
 *
 * Provides a unified interface for discovering and accessing all available tools
 * for BaleyBots. This service integrates:
 * - Built-in tools (always available)
 * - Connection-derived tools (auto-generated from database connections, etc.)
 * - Workspace tools (custom tools defined in the tools table)
 *
 * The catalog is used by:
 * - Creator Bot: to understand what tools are available when designing BBs
 * - Executor: to get runtime tool implementations
 * - Tool Catalog UI: to show available tools to users
 */

import type { ToolDefinition, WorkspacePolicies } from '../types';
import { buildToolCatalog, type ToolCatalog } from '../tool-catalog';
import {
  BUILT_IN_TOOLS_METADATA,
  getBuiltInToolDefinitions,
  getApprovalRequiredTools,
  isBuiltInTool,
  type BuiltInToolMetadata,
} from './built-in';
import {
  getBuiltInRuntimeTools,
  setSpawnBaleybotExecutor,
  setNotificationSender,
  setTaskScheduler,
  setMemoryStorage,
  setWebSearchService,
  configureWebSearch,
  type BuiltInToolContext,
} from './built-in/implementations';
import type { RuntimeToolDefinition } from '../executor';
import {
  generateDatabaseToolDefinition,
  generateDatabaseRuntimeTool,
  createDatabaseExecutor,
  introspectPostgres,
  introspectMySQL,
  type DatabaseConnectionInfo,
  type DatabaseSchema,
} from './connection-derived';
import type { DatabaseConnectionConfig, MCPConnectionConfig } from '@/lib/connections/providers';
import { createLogger } from '@/lib/logger';

const logger = createLogger('tool-catalog');

// Re-export injection functions for external use
export {
  setSpawnBaleybotExecutor,
  setNotificationSender,
  setTaskScheduler,
  setMemoryStorage,
  setWebSearchService,
  configureWebSearch,
};

// ============================================================================
// TYPES
// ============================================================================

/**
 * Database connection info for tool generation
 */
export interface DatabaseConnectionInput {
  connectionId: string;
  connectionName: string;
  type: 'postgres' | 'mysql';
  config: DatabaseConnectionConfig;
  /** Pre-introspected schema (optional, will be introspected if not provided) */
  schema?: DatabaseSchema;
}

/**
 * MCP connection info for tool generation
 */
export interface MCPConnectionInput {
  connectionId: string;
  connectionName: string;
  config: MCPConnectionConfig;
  /** Pre-discovered tools (optional, will be discovered if not provided) */
  discoveredTools?: Array<{ name: string; description: string; inputSchema: unknown }>;
}

/**
 * Context for building the tool catalog
 */
export interface CatalogContext {
  workspaceId: string;
  /** Workspace policies for tool governance */
  workspacePolicies: WorkspacePolicies | null;
  /** Custom tools from the database */
  workspaceTools?: ToolDefinition[];
  /** Whether to include connection-derived tools */
  includeConnectionTools?: boolean;
  /** Database connections for generating database tools */
  databaseConnections?: DatabaseConnectionInput[];
  /** MCP connections for generating MCP-derived tools */
  mcpConnections?: MCPConnectionInput[];
}

/**
 * Full tool catalog with all tool sources
 */
export interface FullToolCatalog extends ToolCatalog {
  /** Built-in tools only */
  builtIn: ToolDefinition[];
  /** Connection-derived tools only */
  connectionDerived: ToolDefinition[];
  /** Workspace custom tools only */
  workspace: ToolDefinition[];
  /** MCP server tools */
  mcp: ToolDefinition[];
}

// ============================================================================
// DATABASE TOOL GENERATION
// ============================================================================

/**
 * Generate tool definitions from database connections.
 * This creates smart database tools that understand the schema.
 */
export function generateDatabaseTools(
  connections: DatabaseConnectionInput[]
): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  for (const conn of connections) {
    if (conn.schema) {
      // Schema is available, generate tool definition
      const toolConfig: DatabaseConnectionInfo = {
        connectionId: conn.connectionId,
        connectionName: conn.connectionName,
        type: conn.type,
        schema: conn.schema,
      };

      tools.push(generateDatabaseToolDefinition({ connection: toolConfig }));
    }
  }

  return tools;
}

/**
 * Introspect a database connection and return the schema.
 * This is an async operation that connects to the database.
 */
export async function introspectDatabaseConnection(
  conn: DatabaseConnectionInput
): Promise<DatabaseSchema | null> {
  try {
    const executor = createDatabaseExecutor(conn.type, conn.config);

    let schema: DatabaseSchema;
    if (conn.type === 'postgres') {
      schema = await introspectPostgres(executor.query.bind(executor));
    } else if (conn.type === 'mysql') {
      schema = await introspectMySQL(executor.query.bind(executor));
    } else {
      logger.warn('Unknown database type', { type: conn.type });
      return null;
    }

    return schema;
  } catch (error) {
    logger.error('Failed to introspect database', { connectionName: conn.connectionName, error });
    return null;
  }
}

// ============================================================================
// MCP TOOL GENERATION
// ============================================================================

/**
 * Generate tool definitions from MCP connections using pre-discovered tools.
 * For runtime tool generation (with live connections), use getMCPRuntimeTools.
 */
function generateMCPToolDefinitions(
  connections: MCPConnectionInput[]
): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  for (const conn of connections) {
    if (!conn.discoveredTools || conn.discoveredTools.length === 0) continue;

    for (const mcpTool of conn.discoveredTools) {
      const prefix = conn.config.toolPrefix ?? '';
      const toolName = `${prefix}${mcpTool.name}`;

      tools.push({
        name: toolName,
        description: `[${conn.connectionName}] ${mcpTool.description}`,
        inputSchema: mcpTool.inputSchema as Record<string, unknown>,
        source: {
          kind: 'mcp' as const,
          connectionId: conn.connectionId,
        },
        tags: ['mcp', conn.connectionName.toLowerCase()],
        healthStatus: 'ready',
      });
    }
  }

  return tools;
}

// ============================================================================
// CATALOG SERVICE
// ============================================================================

/**
 * Resolve the health status for a tool based on whether its requirements are met.
 * Called during catalog assembly for tools that don't already have a healthStatus.
 */
function resolveHealthStatus(
  tool: ToolDefinition,
  connections: Array<{ id: string; type: string; status: string }>
): ToolDefinition['healthStatus'] {
  // If already resolved (e.g. connection-derived tools set it at generation time)
  if (tool.healthStatus && tool.healthStatus !== 'unknown') {
    return tool.healthStatus;
  }

  const reqs = tool.requirements;
  if (!reqs || reqs.length === 0) {
    return 'ready';
  }

  for (const req of reqs) {
    if (req.type === 'connection' && req.connectionType) {
      const match = connections.find(
        c => c.type === req.connectionType && c.status === 'connected'
      );
      if (!match) return 'needs-setup';
      req.satisfied = true;
      req.connectionId = match.id;
    }
    // api_key requirements are soft (fallback exists for web_search)
    // permission requirements are always satisfied (checked at runtime)
  }

  return 'ready';
}

/**
 * Get all available tools for a workspace, combining built-in and workspace tools.
 * Applies workspace policies to categorize tools.
 * Resolves health status for all tools based on available connections.
 */
export function getToolCatalog(ctx: CatalogContext): FullToolCatalog {
  // 1. Get built-in tool definitions (already enriched with source, tags, etc.)
  const builtInTools = getBuiltInToolDefinitions();

  // 2. Get workspace custom tools (if provided), tag with source
  const workspaceTools = (ctx.workspaceTools ?? []).map(tool => ({
    ...tool,
    source: tool.source ?? { kind: 'workspace' as const, toolId: tool.name },
    healthStatus: tool.healthStatus ?? ('ready' as const),
  }));

  // 3. Get connection-derived tools from database connections (already enriched)
  let connectionTools: ToolDefinition[] = [];
  if (ctx.includeConnectionTools && ctx.databaseConnections) {
    connectionTools = generateDatabaseTools(ctx.databaseConnections);
  }

  // 3b. Get MCP-derived tools from MCP connections
  let mcpTools: ToolDefinition[] = [];
  if (ctx.mcpConnections && ctx.mcpConnections.length > 0) {
    mcpTools = generateMCPToolDefinitions(ctx.mcpConnections);
  }

  // 4. Build a flat connections list for health resolution
  const connectionsList = [
    ...(ctx.databaseConnections ?? []).map(c => ({
      id: c.connectionId,
      type: c.type,
      status: c.schema ? 'connected' : 'disconnected',
    })),
    ...(ctx.mcpConnections ?? []).map(c => ({
      id: c.connectionId,
      type: 'mcp',
      status: 'connected',
    })),
  ];

  // 5. Resolve health status for all tools
  const resolvedBuiltIn = builtInTools.map(t => ({
    ...t,
    healthStatus: resolveHealthStatus(t, connectionsList),
  }));

  // 6. Combine all tools
  const allTools: ToolDefinition[] = [
    ...resolvedBuiltIn,
    ...connectionTools,
    ...mcpTools,
    ...workspaceTools,
  ];

  // 7. Build categorized catalog using existing logic
  const baseCatalog = buildToolCatalog({
    availableTools: allTools,
    policies: ctx.workspacePolicies,
  });

  // 8. Return extended catalog with source tracking
  return {
    ...baseCatalog,
    builtIn: resolvedBuiltIn,
    connectionDerived: connectionTools,
    workspace: workspaceTools,
    mcp: mcpTools,
  };
}

/**
 * SQL generation function type for database tools
 */
export type SQLGeneratorFn = (query: string, schema: string) => Promise<string>;

/**
 * Extended context for runtime tools including database connections
 */
export interface RuntimeToolsContext {
  /** Context for built-in tools */
  toolCtx: BuiltInToolContext;
  /** SQL generator function for database tools */
  sqlGenerator?: SQLGeneratorFn;
}

/**
 * Get runtime tools for execution, bound to the provided context.
 * Returns a Map of tool name -> RuntimeToolDefinition.
 */
export async function getRuntimeTools(
  ctx: CatalogContext,
  runtimeCtx: RuntimeToolsContext
): Promise<Map<string, RuntimeToolDefinition>> {
  // 1. Get built-in runtime tools
  const builtInRuntimeTools = getBuiltInRuntimeTools(runtimeCtx.toolCtx);

  // 2. Generate database runtime tools if connections are provided
  if (ctx.includeConnectionTools && ctx.databaseConnections && runtimeCtx.sqlGenerator) {
    for (const conn of ctx.databaseConnections) {
      if (conn.schema) {
        try {
          const executor = createDatabaseExecutor(conn.type, conn.config);
          const toolConfig: DatabaseConnectionInfo = {
            connectionId: conn.connectionId,
            connectionName: conn.connectionName,
            type: conn.type,
            schema: conn.schema,
          };

          const runtimeTool = generateDatabaseRuntimeTool(
            { connection: toolConfig },
            executor.query.bind(executor),
            runtimeCtx.sqlGenerator
          );

          builtInRuntimeTools.set(runtimeTool.name, runtimeTool);
        } catch (error) {
          logger.error('Failed to create runtime tool', { connectionName: conn.connectionName, error });
        }
      }
    }
  }

  // 3. Load MCP runtime tools if connections are provided
  if (ctx.mcpConnections && ctx.mcpConnections.length > 0) {
    try {
      const { getMCPRuntimeTools: loadMCPTools } = await import(
        '@/lib/connections/mcp-service'
      );

      for (const conn of ctx.mcpConnections) {
        try {
          const { tools: mcpRuntimeTools } = await loadMCPTools(
            conn.connectionId,
            conn.connectionName,
            conn.config
          );

          for (const [name, tool] of mcpRuntimeTools) {
            builtInRuntimeTools.set(name, tool);
          }
        } catch (error) {
          logger.error('Failed to load MCP runtime tools', {
            connectionName: conn.connectionName,
            error,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to import MCP service', { error });
    }
  }

  // 4. Return combined tools
  return builtInRuntimeTools;
}

/**
 * Backward-compatible version of getRuntimeTools
 * @deprecated Use the version with RuntimeToolsContext instead
 */
export async function getRuntimeToolsLegacy(
  ctx: CatalogContext,
  toolCtx: BuiltInToolContext
): Promise<Map<string, RuntimeToolDefinition>> {
  return getRuntimeTools(ctx, { toolCtx });
}

// ============================================================================
// AI CONTEXT FORMATTING
// ============================================================================

/**
 * Format the tool catalog as comprehensive context for the Creator Bot.
 * This gives the AI detailed information about each tool.
 */
export function formatToolCatalogForCreatorBot(catalog: FullToolCatalog): string {
  const lines: string[] = [];

  lines.push('# Available Tools for BaleyBots');
  lines.push('');
  lines.push('When designing BaleyBots, you can use these tools. Assign tools in the "tools"');
  lines.push('set as needed (BAL syntax: "tools": { "tool_a", "tool_b" }).');
  lines.push('Approval is handled at runtime for sensitive tools.');
  lines.push('');

  // Built-in tools section
  if (catalog.builtIn.length > 0) {
    lines.push('## Built-in Tools (Always Available)');
    lines.push('');

    for (const tool of catalog.builtIn) {
      const metadata = BUILT_IN_TOOLS_METADATA.find((t) => t.name === tool.name);
      const approvalNote = metadata?.approvalRequired
        ? ' **(Requires Approval at Runtime)**'
        : '';
      const healthNote = tool.healthStatus === 'needs-setup'
        ? ' ⚠️ Needs Setup'
        : tool.healthStatus === 'error'
          ? ' ❌ Error'
          : '';

      lines.push(`### ${tool.name}${approvalNote}${healthNote}`);
      lines.push('');
      lines.push(tool.description);
      if (tool.tags && tool.tags.length > 0) {
        lines.push(`**Tags:** ${tool.tags.join(', ')}`);
      }
      lines.push('');
      lines.push('**Input:**');
      lines.push('```json');
      lines.push(JSON.stringify(tool.inputSchema, null, 2));
      lines.push('```');
      lines.push('');
    }
  }

  // Connection-derived tools section
  if (catalog.connectionDerived.length > 0) {
    lines.push('## Connection Tools (From Your Data Sources)');
    lines.push('');

    for (const tool of catalog.connectionDerived) {
      lines.push(`### ${tool.name}`);
      lines.push('');
      lines.push(tool.description);
      lines.push('');
    }
  }

  // MCP tools section
  if (catalog.mcp.length > 0) {
    lines.push('## MCP Server Tools (External Integrations)');
    lines.push('');

    for (const tool of catalog.mcp) {
      lines.push(`### ${tool.name}`);
      lines.push('');
      lines.push(tool.description);
      lines.push('');
    }
  }

  // Workspace tools section
  if (catalog.workspace.length > 0) {
    lines.push('## Custom Workspace Tools');
    lines.push('');

    for (const tool of catalog.workspace) {
      lines.push(`### ${tool.name}`);
      lines.push('');
      lines.push(tool.description);
      lines.push('');
    }
  }

  // Tool categorization guidance
  lines.push('## Tool Categorization Guide');
  lines.push('');
  lines.push('**Use in the "tools" set (immediate access):**');
  lines.push('- Read-only operations (web_search, fetch_url)');
  lines.push('- Inter-BB communication (spawn_baleybot)');
  lines.push('- Notifications (send_notification)');
  lines.push('- Memory storage (store_memory)');
  lines.push('');
  lines.push('**Approvals happen at runtime for sensitive tools:**');
  lines.push('- Scheduling tasks (schedule_task)');
  lines.push('- Creating agents (create_agent)');
  lines.push('- Creating tools (create_tool)');
  lines.push('- Any operation that modifies external data');
  lines.push('- Database write operations');
  lines.push('- Sending emails or external communications');
  lines.push('');

  return lines.join('\n');
}

interface CompactCatalogOptions {
  maxPerSection?: number;
}

function compactToolDescription(description: string, maxLength = 140): string {
  const compact = description.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}...`;
}

/**
 * Format the tool catalog as compact context for fast creator interactions.
 * Keeps only names + short descriptions so internal BBs can reason quickly.
 */
export function formatToolCatalogForCreatorBotCompact(
  catalog: FullToolCatalog,
  options?: CompactCatalogOptions
): string {
  const maxPerSection = Math.max(4, options?.maxPerSection ?? 12);
  const lines: string[] = [];

  lines.push('# Tool Snapshot');
  lines.push('Use the smallest viable tool set for the goal.');
  lines.push('');

  const appendSection = (
    title: string,
    sectionTools: ToolDefinition[],
    toolTag?: (tool: ToolDefinition) => string | undefined
  ) => {
    if (sectionTools.length === 0) return;
    lines.push(`## ${title}`);
    for (const tool of sectionTools.slice(0, maxPerSection)) {
      const tag = toolTag ? toolTag(tool) : undefined;
      const tagSuffix = tag ? ` (${tag})` : '';
      lines.push(`- ${tool.name}${tagSuffix}: ${compactToolDescription(tool.description)}`);
    }
    const hiddenCount = sectionTools.length - maxPerSection;
    if (hiddenCount > 0) {
      lines.push(`- +${hiddenCount} more tools available in this section`);
    }
    lines.push('');
  };

  appendSection('Built-in', catalog.builtIn, (tool) => {
    const metadata = BUILT_IN_TOOLS_METADATA.find((entry) => entry.name === tool.name);
    if (tool.healthStatus === 'needs-setup') return 'needs setup';
    return metadata?.approvalRequired ? 'approval at runtime' : undefined;
  });
  appendSection('Connection Tools', catalog.connectionDerived, (tool) =>
    tool.healthStatus === 'ready' ? 'connected' : 'needs setup'
  );
  appendSection('MCP Server Tools', catalog.mcp, () => 'mcp');
  appendSection('Custom Workspace Tools', catalog.workspace, () => 'workspace');

  lines.push('## Selection Rules');
  lines.push('- Prioritize connected tools before optional integrations.');
  lines.push('- Prefer read-only and deterministic tools for first runnable drafts.');
  lines.push('- Add advanced tools only when required by the user outcome.');

  return lines.join('\n');
}

/**
 * Get a short summary of available tools for quick reference.
 */
export function getToolSummary(catalog: FullToolCatalog): string {
  const lines: string[] = [];

  const immediateTools = catalog.immediate.map((t) => t.name);
  const approvalTools = catalog.requiresApproval.map((t) => t.name);

  if (immediateTools.length > 0) {
    lines.push(`**Available tools:** ${immediateTools.join(', ')}`);
  }

  if (approvalTools.length > 0) {
    lines.push(`**Requires approval:** ${approvalTools.join(', ')}`);
  }

  if (catalog.forbidden.length > 0) {
    lines.push(`**Forbidden:** ${catalog.forbidden.join(', ')}`);
  }

  return lines.join('\n');
}

// ============================================================================
// TOOL LOOKUP
// ============================================================================

/**
 * Check if a tool is available in the catalog
 */
export function isToolAvailable(toolName: string, catalog: FullToolCatalog): boolean {
  return catalog.all.some((t) => t.name === toolName);
}

/**
 * Get tool definition by name
 */
export function getToolByName(
  toolName: string,
  catalog: FullToolCatalog
): ToolDefinition | undefined {
  return catalog.all.find((t) => t.name === toolName);
}

/**
 * Check if a tool requires approval
 */
export function toolRequiresApproval(toolName: string, catalog: FullToolCatalog): boolean {
  return catalog.requiresApproval.some((t) => t.name === toolName);
}

/**
 * Check if a tool is forbidden
 */
export function isToolForbidden(toolName: string, catalog: FullToolCatalog): boolean {
  return catalog.forbidden.includes(toolName);
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  isBuiltInTool,
  getApprovalRequiredTools,
  BUILT_IN_TOOLS_METADATA,
  getBuiltInToolDefinitions,
};
export type { BuiltInToolMetadata, BuiltInToolContext };

// Re-export catalog-based requirement functions
export {
  getToolRequirements,
  getToolHealthStatus,
  getToolsNeedingSetup,
} from './requirements-scanner';
