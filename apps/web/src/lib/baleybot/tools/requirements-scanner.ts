// apps/web/src/lib/baleybot/tools/requirements-scanner.ts

/**
 * Tool Requirements Scanner
 *
 * Maps tool names to the connection types they require.
 * Used by the Connections Panel to show what's needed vs what's configured.
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

/**
 * Mapping of built-in tools to their connection requirements.
 * 'none' means the tool works without any external connection.
 */
const TOOL_REQUIREMENTS: Record<string, ToolRequirement> = {
  web_search: {
    toolName: 'web_search',
    connectionType: 'none',
    description: 'Search the web (uses Tavily or AI fallback)',
    required: false,
  },
  fetch_url: {
    toolName: 'fetch_url',
    connectionType: 'none',
    description: 'Fetch content from a URL',
    required: false,
  },
  spawn_baleybot: {
    toolName: 'spawn_baleybot',
    connectionType: 'none',
    description: 'Execute another BaleyBot',
    required: false,
  },
  send_notification: {
    toolName: 'send_notification',
    connectionType: 'none',
    description: 'Send a notification to the user',
    required: false,
  },
  store_memory: {
    toolName: 'store_memory',
    connectionType: 'none',
    description: 'Persist key-value data',
    required: false,
  },
  shared_storage: {
    toolName: 'shared_storage',
    connectionType: 'none',
    description: 'Cross-bot shared storage',
    required: false,
  },
  schedule_task: {
    toolName: 'schedule_task',
    connectionType: 'none',
    description: 'Schedule future execution (requires approval)',
    required: false,
  },
  create_agent: {
    toolName: 'create_agent',
    connectionType: 'none',
    description: 'Create an ephemeral agent (requires approval)',
    required: false,
  },
  create_tool: {
    toolName: 'create_tool',
    connectionType: 'none',
    description: 'Create an ephemeral tool (requires approval)',
    required: false,
  },
};

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
  const builtIn = TOOL_REQUIREMENTS[toolName];
  if (builtIn) {
    return {
      status: 'ready',
      connectionType: builtIn.connectionType,
      reason: builtIn.description,
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

/** Scan a list of tool names and return their requirements */
export function scanToolRequirements(tools: string[]): ToolRequirement[] {
  return tools.map((toolName) => {
    const known = TOOL_REQUIREMENTS[toolName];
    if (known) return known;

    // Unknown tool — might be a connection-derived tool.
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

/** Get a summary of all connections needed by the bot */
export function getConnectionSummary(tools: string[]): ConnectionSummary {
  const requirements = scanToolRequirements(tools);
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
