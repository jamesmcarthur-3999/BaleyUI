/**
 * MCP Connection Service
 *
 * Server-side service that manages MCP connections using @baleybots/mcp.
 * Handles testing, tool discovery, and runtime tool generation.
 */

import { MCPClient, mcpTools } from '@baleybots/mcp';
import type {
  MCPServerConfig,
  MCPTransportConfig,
} from '@baleybots/mcp';
import type { MCPConnectionConfig, TestConnectionResult } from './providers';
import type { RuntimeToolDefinition } from '@/lib/baleybot/executor';
import { createLogger } from '@/lib/logger';

const log = createLogger('mcp-service');

export interface MCPDiscoveredTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Build an MCPServerConfig from our connection config.
 */
function buildServerConfig(
  name: string,
  config: MCPConnectionConfig
): MCPServerConfig {
  let transport: MCPTransportConfig;

  if (config.transportType === 'stdio') {
    transport = {
      type: 'stdio',
      command: config.command ?? '',
      args: config.args,
      env: config.env,
    };
  } else {
    // http or sse
    const httpTransport: MCPTransportConfig = {
      type: config.transportType,
      url: config.url ?? '',
    };

    if (config.headers) {
      (httpTransport as unknown as Record<string, unknown>).headers = config.headers;
    }

    if (config.authType && config.authType !== 'none' && config.authToken) {
      (httpTransport as unknown as Record<string, unknown>).auth = {
        type: config.authType,
        token: config.authToken,
      };
    }

    transport = httpTransport;
  }

  return {
    name,
    transport,
    toolPrefix: config.toolPrefix,
  };
}

/**
 * Test an MCP connection by connecting, listing tools, then disconnecting.
 */
export async function testMCPConnection(
  config: MCPConnectionConfig
): Promise<TestConnectionResult> {
  let client: MCPClient | null = null;

  try {
    const serverConfig = buildServerConfig('test', config);
    client = new MCPClient(serverConfig);

    await client.connect();
    const tools = await client.listTools();
    const toolNames = tools.map((t) => t.name);

    return {
      success: true,
      message: `Connected successfully. Discovered ${tools.length} tools.`,
      details: {
        toolCount: tools.length,
        toolNames: toolNames.slice(0, 50),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('ECONNREFUSED')) {
      return {
        success: false,
        message: 'Connection refused. Check that the MCP server is running and the URL is correct.',
        details: { error: message },
      };
    }

    if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
      return {
        success: false,
        message: 'Connection timed out. Check the server URL and network access.',
        details: { error: message },
      };
    }

    return {
      success: false,
      message: `MCP connection failed: ${message}`,
      details: { error: message },
    };
  } finally {
    if (client) {
      try {
        await client.disconnect();
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Discover all tools from an MCP server with full schemas.
 */
export async function discoverMCPTools(
  config: MCPConnectionConfig
): Promise<MCPDiscoveredTool[]> {
  let client: MCPClient | null = null;

  try {
    const serverConfig = buildServerConfig('discover', config);
    client = new MCPClient(serverConfig);

    await client.connect();
    const tools = await client.listTools();

    return tools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
  } catch (error) {
    log.error('Failed to discover MCP tools', { error });
    return [];
  } finally {
    if (client) {
      try {
        await client.disconnect();
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Get MCP tools as RuntimeToolDefinitions for use during BB execution.
 * Connects to the MCP server, converts tools, and returns them.
 * The caller is responsible for managing the client lifecycle.
 */
export async function getMCPRuntimeTools(
  connectionId: string,
  connectionName: string,
  config: MCPConnectionConfig
): Promise<{ tools: Map<string, RuntimeToolDefinition>; client: MCPClient }> {
  const serverConfig = buildServerConfig(connectionName, config);
  const client = new MCPClient(serverConfig);

  await client.connect();

  const convertedTools = await mcpTools(client, {
    prefix: config.toolPrefix,
  });

  const runtimeTools = new Map<string, RuntimeToolDefinition>();

  for (const [name, tool] of Object.entries(convertedTools)) {
    runtimeTools.set(name, {
      name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>,
      function: tool.function as (args: Record<string, unknown>) => Promise<unknown>,
      category: 'mcp',
    });
  }

  log.info('Loaded MCP runtime tools', {
    connectionId,
    connectionName,
    toolCount: runtimeTools.size,
  });

  return { tools: runtimeTools, client };
}
