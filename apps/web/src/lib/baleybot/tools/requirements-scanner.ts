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
  description: string;
  required: boolean;
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

/** Scan a list of tool names and return their requirements */
export function scanToolRequirements(tools: string[]): ToolRequirement[] {
  return tools.map((toolName) => {
    const known = TOOL_REQUIREMENTS[toolName];
    if (known) return known;

    // Unknown tool — might be a connection-derived tool
    // Database tools follow patterns like "query_postgres_<name>" or "query_mysql_<name>"
    if (toolName.startsWith('query_postgres_') || toolName.startsWith('query_pg_')) {
      return {
        toolName,
        connectionType: 'postgres' as const,
        description: 'Database query tool (PostgreSQL)',
        required: true,
      };
    }
    if (toolName.startsWith('query_mysql_')) {
      return {
        toolName,
        connectionType: 'mysql' as const,
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
