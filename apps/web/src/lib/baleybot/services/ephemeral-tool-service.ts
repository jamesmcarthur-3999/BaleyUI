/**
 * Ephemeral Tool Service
 *
 * Creates custom tools at runtime within a BaleyBot execution.
 * Ephemeral tools:
 * - Are defined with natural language implementations
 * - The NL implementation is interpreted by AI when the tool is called
 * - Exist only for the current execution
 * - Are NOT persisted to the database (unless promoted later)
 *
 * This enables BaleyBots to dynamically create specialized tools
 * for one-off tasks without needing to pre-define them.
 */

import { Baleybot } from '@baleybots/core';
import type { BuiltInToolContext, CreateToolResult } from '../tools/built-in';
import type { RuntimeToolDefinition } from '../executor';
import { createLogger } from '@/lib/logger';

const log = createLogger('ephemeral-tool');

// ============================================================================
// TYPES
// ============================================================================

export interface EphemeralToolConfig {
  /** Unique name for the tool */
  name: string;
  /** Description of what the tool does */
  description: string;
  /** JSON Schema for tool inputs (optional) */
  inputSchema?: Record<string, unknown>;
  /** Natural language description of the tool's behavior */
  implementation: string;
}

export interface EphemeralToolService {
  /**
   * Create an ephemeral tool that can be used in the current execution
   *
   * @param config - Tool configuration
   * @param ctx - Built-in tool context
   * @returns Tool creation result with created status and tool name
   */
  create(config: EphemeralToolConfig, ctx: BuiltInToolContext): Promise<CreateToolResult>;

  /**
   * Get all ephemeral tools created in the current execution context
   */
  getTools(): Map<string, RuntimeToolDefinition>;

  /**
   * Get a specific ephemeral tool by name
   */
  getTool(name: string): RuntimeToolDefinition | undefined;

  /**
   * Clear all ephemeral tools (usually called at end of execution)
   */
  clear(): void;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

/**
 * Execute a natural language tool implementation using a specialized Baleybot
 */
async function executeNLImplementation(
  toolName: string,
  implementation: string,
  args: Record<string, unknown>
): Promise<unknown> {
  log.debug(`Executing "${toolName}" with NL implementation`, { toolName });

  try {
    // Create a specialized Baleybot for executing this tool
    const toolExecutorBot = Baleybot.create({
      name: `ephemeral-tool-${toolName}`,
      goal: `You are executing a custom tool. The tool is defined by the following natural language implementation:

"${implementation}"

You must execute this tool based on its description and return the result.
- If the tool should compute something, compute it and return the result.
- If the tool should format data, format it and return the formatted output.
- If the tool should validate something, validate and return the validation result.
- Always return your response in a structured format if possible.

Respond ONLY with the tool's output. Do not explain what you're doing.`,
      model: 'openai:gpt-4o-mini',
    });

    const prompt = `Execute this tool with the following arguments:
${JSON.stringify(args, null, 2)}

Return the tool's output:`;

    const result = await toolExecutorBot.process(prompt);

    // Try to parse as JSON if it looks like JSON
    const text = typeof result === 'string' ? result.trim() : String(result);
    try {
      // Handle code blocks if present
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1]?.trim() : text;

      if (jsonStr && (jsonStr.startsWith('{') || jsonStr.startsWith('['))) {
        return JSON.parse(jsonStr);
      }
    } catch {
      // Not JSON, return as string
    }

    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Error executing "${toolName}"`, { toolName, error: message });
    throw new Error(`Ephemeral tool "${toolName}" execution failed: ${message}`);
  }
}

/**
 * Create an ephemeral tool service instance
 */
export function createEphemeralToolService(): EphemeralToolService {
  // Store ephemeral tools for the current execution
  const ephemeralTools = new Map<string, RuntimeToolDefinition>();

  return {
    async create(
      config: EphemeralToolConfig,
      _ctx: BuiltInToolContext
    ): Promise<CreateToolResult> {
      // Validate config
      if (!config.name || config.name.trim().length === 0) {
        throw new Error('Ephemeral tool name is required');
      }
      if (!config.description || config.description.trim().length === 0) {
        throw new Error('Ephemeral tool description is required');
      }
      if (!config.implementation || config.implementation.trim().length === 0) {
        throw new Error('Ephemeral tool implementation is required');
      }

      // Validate tool name format (alphanumeric and underscores only)
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(config.name)) {
        throw new Error(
          'Tool name must start with a letter and contain only letters, numbers, and underscores'
        );
      }

      // Check for reserved names
      const reservedNames = [
        'web_search',
        'fetch_url',
        'spawn_baleybot',
        'send_notification',
        'schedule_task',
        'store_memory',
        'create_agent',
        'create_tool',
      ];
      if (reservedNames.includes(config.name.toLowerCase())) {
        throw new Error(
          `Tool name "${config.name}" is reserved. Please choose a different name.`
        );
      }

      log.info(`Creating ephemeral tool "${config.name}"`, {
        name: config.name,
        description: config.description,
      });

      // Create the runtime tool definition
      const runtimeTool: RuntimeToolDefinition = {
        name: config.name,
        description: config.description,
        inputSchema: config.inputSchema ?? {
          type: 'object',
          properties: {
            input: {
              type: 'string',
              description: 'Input to the tool',
            },
          },
        },
        function: async (args: Record<string, unknown>) => {
          return executeNLImplementation(config.name, config.implementation, args);
        },
        category: 'ephemeral',
        dangerLevel: 'moderate', // Ephemeral tools are moderate danger since they execute AI
        needsApproval: true,
      };

      // Store the tool
      ephemeralTools.set(config.name, runtimeTool);

      log.info(`Ephemeral tool "${config.name}" created successfully`, {
        name: config.name,
      });

      return {
        created: true,
        tool_name: config.name,
      };
    },

    getTools(): Map<string, RuntimeToolDefinition> {
      return ephemeralTools;
    },

    getTool(name: string): RuntimeToolDefinition | undefined {
      return ephemeralTools.get(name);
    },

    clear(): void {
      ephemeralTools.clear();
    },
  };
}

/**
 * Default ephemeral tool service instance
 */
export const ephemeralToolService = createEphemeralToolService();

// ============================================================================
// TOOL IMPLEMENTATION HELPER
// ============================================================================

/**
 * Create the create_tool implementation function.
 * This wraps the ephemeral tool service for use by the built-in tool system.
 */
export function createToolImplFactory(): (
  args: EphemeralToolConfig,
  ctx: BuiltInToolContext
) => Promise<CreateToolResult> {
  return async (args, ctx) => {
    const result = await ephemeralToolService.create(args, ctx);

    // Note: The tool is now available in ephemeralToolService.getTools()
    // The executor needs to be aware of this to include ephemeral tools
    // in subsequent tool calls within the same execution.

    return result;
  };
}
