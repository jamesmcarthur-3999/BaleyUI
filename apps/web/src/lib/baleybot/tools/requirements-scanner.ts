// apps/web/src/lib/baleybot/tools/requirements-scanner.ts

/**
 * Tool Requirements Scanner
 *
 * Resolves tool requirements and connection bindings.
 *
 * Two modes:
 * 1. **Catalog-based** (preferred): When a FullToolCatalog is available, requirements
 *    and health status come directly from the enriched ToolDefinition metadata.
 * 2. **Name-based** (fallback): Parses tool names (query_postgres_*, query_mysql_*)
 *    and checks against a built-in name list. Used when no catalog is available.
 *
 * Consumers should prefer catalog-based functions (`getToolRequirements`,
 * `getToolHealthStatus`) and pass a catalog when they have one.
 */

import type { ToolDefinition, ToolRequirement as EnrichedToolRequirement } from '../types';
import { isBuiltInTool, getBuiltInToolMetadata } from './built-in';

// ============================================================================
// TYPES (backward-compatible — kept for existing consumers)
// ============================================================================

/**
 * Legacy tool requirement from name-based scanning.
 * For new code, prefer the enriched `ToolRequirement` from types.ts.
 */
export interface ToolRequirement {
  toolName: string;
  connectionType: 'openai' | 'anthropic' | 'ollama' | 'postgres' | 'mysql' | 'none';
  connectionSlug?: string;
  description: string;
  required: boolean;
}

export interface ParsedConnectionTool {
  connectionType: 'postgres' | 'mysql' | null;
  connectionSlug?: string;
}

export interface ConnectionBindingStatus {
  status: 'ready' | 'needs-setup' | 'mismatch';
  connectionType: 'openai' | 'anthropic' | 'ollama' | 'postgres' | 'mysql' | 'none';
  expectedConnectionSlug?: string;
  matchedConnectionName?: string;
  reason: string;
}

export interface ConnectionSummary {
  /** Connection types that are required by the bot's tools */
  required: Array<{
    connectionType: string;
    tools: string[];
  }>;
  /** Whether an AI provider connection is needed (always true for BB execution) */
  needsAiProvider: boolean;
  /** Total unique connection types needed */
  totalRequired: number;
}

// ============================================================================
// CATALOG-BASED FUNCTIONS (preferred — uses enriched ToolDefinition)
// ============================================================================

/**
 * Get enriched requirements for a tool from the catalog.
 * Returns an empty array if the tool is not found or has no requirements.
 */
export function getToolRequirements(
  toolName: string,
  catalogTools: ToolDefinition[]
): EnrichedToolRequirement[] {
  const tool = catalogTools.find(t => t.name === toolName);
  return tool?.requirements ?? [];
}

/**
 * Get the health status of a tool from the catalog.
 * Returns 'unknown' if the tool is not found.
 */
export function getToolHealthStatus(
  toolName: string,
  catalogTools: ToolDefinition[]
): 'ready' | 'needs-setup' | 'error' | 'unknown' {
  const tool = catalogTools.find(t => t.name === toolName);
  return tool?.healthStatus ?? 'unknown';
}

/**
 * Get all tools from the catalog that need setup (healthStatus !== 'ready').
 */
export function getToolsNeedingSetup(
  catalogTools: ToolDefinition[]
): ToolDefinition[] {
  return catalogTools.filter(
    t => t.healthStatus && t.healthStatus !== 'ready'
  );
}

// ============================================================================
// NAME-BASED UTILITIES (kept for backward compatibility + string parsing)
// ============================================================================

/**
 * Convert a human connection name to the normalized slug used by
 * connection-derived tool names.
 */
export function connectionNameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Parse a connection-derived tool name (query_postgres_x / query_mysql_x).
 */
export function parseConnectionTool(toolName: string): ParsedConnectionTool {
  if (toolName.startsWith('query_postgres_')) {
    const slug = toolName.slice('query_postgres_'.length).trim();
    return {
      connectionType: 'postgres',
      connectionSlug: slug || undefined,
    };
  }

  if (toolName.startsWith('query_pg_')) {
    const slug = toolName.slice('query_pg_'.length).trim();
    return {
      connectionType: 'postgres',
      connectionSlug: slug || undefined,
    };
  }

  if (toolName.startsWith('query_mysql_')) {
    const slug = toolName.slice('query_mysql_'.length).trim();
    return {
      connectionType: 'mysql',
      connectionSlug: slug || undefined,
    };
  }

  return {
    connectionType: null,
    connectionSlug: undefined,
  };
}

/**
 * Evaluate whether a specific tool is wired to a concrete connection.
 * For connection-derived database tools, this enforces exact source mapping
 * by matching the derived tool suffix to a workspace connection slug.
 */
export function evaluateToolConnectionBinding(
  toolName: string,
  connections: Array<{ id: string; type: string; name: string; status: string }>
): ConnectionBindingStatus {
  if (isBuiltInTool(toolName)) {
    // Check if this built-in tool has unmet API key requirements
    const metadata = getBuiltInToolMetadata(toolName);
    if (metadata?.requirements.some(r => r.type === 'api_key')) {
      const hasKey = toolName === 'web_search'
        ? !!process.env.TAVILY_API_KEY
        : true; // Future API-key tools can be added here
      if (!hasKey) {
        return {
          status: 'needs-setup',
          connectionType: 'none',
          reason: metadata.requirements.find(r => r.type === 'api_key')?.description ?? 'API key required',
        };
      }
    }
    return {
      status: 'ready',
      connectionType: 'none',
      reason: 'Built-in tool',
    };
  }

  const parsed = parseConnectionTool(toolName);
  if (!parsed.connectionType) {
    return {
      status: 'ready',
      connectionType: 'none',
      reason: 'Custom tool',
    };
  }

  const sameType = connections.filter((conn) => conn.type === parsed.connectionType);
  const connectedSameType = sameType.filter((conn) => conn.status === 'connected');

  if (sameType.length === 0) {
    return {
      status: 'needs-setup',
      connectionType: parsed.connectionType,
      expectedConnectionSlug: parsed.connectionSlug,
      reason: `Requires a ${parsed.connectionType === 'postgres' ? 'PostgreSQL' : 'MySQL'} connection`,
    };
  }

  const bySlug = sameType.find(
    (conn) => parsed.connectionSlug && connectionNameToSlug(conn.name) === parsed.connectionSlug
  );

  if (bySlug) {
    if (bySlug.status === 'connected') {
      return {
        status: 'ready',
        connectionType: parsed.connectionType,
        expectedConnectionSlug: parsed.connectionSlug,
        matchedConnectionName: bySlug.name,
        reason: `Mapped to ${bySlug.name}`,
      };
    }
    return {
      status: 'needs-setup',
      connectionType: parsed.connectionType,
      expectedConnectionSlug: parsed.connectionSlug,
      matchedConnectionName: bySlug.name,
      reason: `${bySlug.name} is ${bySlug.status}`,
    };
  }

  if (connectedSameType.length > 0) {
    return {
      status: 'mismatch',
      connectionType: parsed.connectionType,
      expectedConnectionSlug: parsed.connectionSlug,
      reason: `No exact source match for ${toolName}; available ${parsed.connectionType} connection(s): ${connectedSameType
        .map((conn) => conn.name)
        .join(', ')}`,
    };
  }

  return {
    status: 'needs-setup',
    connectionType: parsed.connectionType,
    expectedConnectionSlug: parsed.connectionSlug,
    reason: `A ${parsed.connectionType} connection exists but is not connected`,
  };
}

/**
 * Scan a list of tool names and return their requirements.
 *
 * When `catalogTools` is provided, requirements are resolved from the enriched
 * catalog (connection-derived tools already have source metadata). Falls back
 * to name-based heuristics for tools not in the catalog.
 */
export function scanToolRequirements(
  tools: string[],
  catalogTools?: ToolDefinition[]
): ToolRequirement[] {
  return tools.map((toolName) => {
    // Catalog-based resolution (preferred)
    if (catalogTools) {
      const catalogTool = catalogTools.find(t => t.name === toolName);
      if (catalogTool) {
        // Derive connectionType from source metadata
        const source = catalogTool.source;
        if (source?.kind === 'connection') {
          return {
            toolName,
            connectionType: source.connectionType as ToolRequirement['connectionType'],
            description: catalogTool.description,
            required: true,
          };
        }
        // Built-in or workspace tool with no connection requirement
        return {
          toolName,
          connectionType: 'none' as const,
          description: catalogTool.description,
          required: false,
        };
      }
    }

    // Fallback: name-based heuristic for tools not in catalog
    if (isBuiltInTool(toolName)) {
      return {
        toolName,
        connectionType: 'none' as const,
        description: 'Built-in tool',
        required: false,
      };
    }

    const parsed = parseConnectionTool(toolName);
    if (parsed.connectionType === 'postgres') {
      return {
        toolName,
        connectionType: 'postgres' as const,
        connectionSlug: parsed.connectionSlug,
        description: 'Database query tool (PostgreSQL)',
        required: true,
      };
    }
    if (parsed.connectionType === 'mysql') {
      return {
        toolName,
        connectionType: 'mysql' as const,
        connectionSlug: parsed.connectionSlug,
        description: 'Database query tool (MySQL)',
        required: true,
      };
    }

    return {
      toolName,
      connectionType: 'none' as const,
      description: 'Custom tool',
      required: false,
    };
  });
}

/**
 * Get a summary of all connections needed by the bot's tools.
 *
 * When `catalogTools` is provided, uses enriched catalog metadata.
 */
export function getConnectionSummary(
  tools: string[],
  catalogTools?: ToolDefinition[]
): ConnectionSummary {
  const requirements = scanToolRequirements(tools, catalogTools);
  const byType = new Map<string, string[]>();

  for (const req of requirements) {
    if (req.connectionType !== 'none') {
      const existing = byType.get(req.connectionType) ?? [];
      existing.push(req.toolName);
      byType.set(req.connectionType, existing);
    }
  }

  const required = Array.from(byType.entries()).map(([connectionType, toolNames]) => ({
    connectionType,
    tools: toolNames,
  }));

  return {
    required,
    needsAiProvider: true, // All BBs need an AI provider
    totalRequired: required.length + 1, // +1 for AI provider
  };
}
