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
  type BuiltInToolContext,
} from './built-in/implementations';
import type { RuntimeToolDefinition } from '../executor';

// Re-export injection functions for external use
export {
  setSpawnBaleybotExecutor,
  setNotificationSender,
  setTaskScheduler,
  setMemoryStorage,
};

// ============================================================================
// TYPES
// ============================================================================

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
}

// ============================================================================
// CATALOG SERVICE
// ============================================================================

/**
 * Get all available tools for a workspace, combining built-in and workspace tools.
 * Applies workspace policies to categorize tools.
 */
export function getToolCatalog(ctx: CatalogContext): FullToolCatalog {
  // 1. Get built-in tool definitions
  const builtInTools = getBuiltInToolDefinitions();

  // 2. Get workspace custom tools (if provided)
  const workspaceTools = ctx.workspaceTools ?? [];

  // 3. Get connection-derived tools (placeholder for Phase 2)
  const connectionTools: ToolDefinition[] = [];
  if (ctx.includeConnectionTools) {
    // TODO: Phase 2 - Generate tools from database connections
    // connectionTools = generateConnectionTools(ctx.workspaceId);
  }

  // 4. Combine all tools
  const allTools: ToolDefinition[] = [
    ...builtInTools,
    ...connectionTools,
    ...workspaceTools,
  ];

  // 5. Build categorized catalog using existing logic
  const baseCatalog = buildToolCatalog({
    availableTools: allTools,
    policies: ctx.workspacePolicies,
  });

  // 6. Return extended catalog with source tracking
  return {
    ...baseCatalog,
    builtIn: builtInTools,
    connectionDerived: connectionTools,
    workspace: workspaceTools,
  };
}

/**
 * Get runtime tools for execution, bound to the provided context.
 * Returns a Map of tool name -> RuntimeToolDefinition.
 */
export function getRuntimeTools(
  ctx: CatalogContext,
  toolCtx: BuiltInToolContext
): Map<string, RuntimeToolDefinition> {
  // 1. Get built-in runtime tools
  const builtInRuntimeTools = getBuiltInRuntimeTools(toolCtx);

  // 2. Get workspace tools as runtime tools
  // (these would come from the database with actual implementations)
  // For now, workspace tools aren't executable - they're just definitions
  // TODO: Support executable workspace tools in Phase 2

  // 3. Return combined tools
  return builtInRuntimeTools;
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
  lines.push('When designing BaleyBots, you can use these tools. Place read-only/safe tools');
  lines.push('in the "tools" array, and tools requiring approval in "can_request".');
  lines.push('');

  // Built-in tools section
  if (catalog.builtIn.length > 0) {
    lines.push('## Built-in Tools (Always Available)');
    lines.push('');

    for (const tool of catalog.builtIn) {
      const metadata = BUILT_IN_TOOLS_METADATA.find((t) => t.name === tool.name);
      const approvalNote = metadata?.approvalRequired
        ? ' **(Requires Approval - use can_request)**'
        : '';

      lines.push(`### ${tool.name}${approvalNote}`);
      lines.push('');
      lines.push(tool.description);
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
  lines.push('**Use in "tools" array (immediate access):**');
  lines.push('- Read-only operations (web_search, fetch_url)');
  lines.push('- Inter-BB communication (spawn_baleybot)');
  lines.push('- Notifications (send_notification)');
  lines.push('- Memory storage (store_memory)');
  lines.push('');
  lines.push('**Use in "can_request" array (requires approval):**');
  lines.push('- Scheduling tasks (schedule_task)');
  lines.push('- Creating agents (create_agent)');
  lines.push('- Creating tools (create_tool)');
  lines.push('- Any operation that modifies external data');
  lines.push('- Database write operations');
  lines.push('- Sending emails or external communications');
  lines.push('');

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
