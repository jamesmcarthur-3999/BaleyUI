/**
 * Ephemeral Agent Service
 *
 * Creates and executes temporary AI agents within a BaleyBot execution.
 * Ephemeral agents:
 * - Are created dynamically based on a goal and configuration
 * - Exist only for the current execution
 * - Can use tools from the parent context
 * - Are NOT persisted to the database (unless promoted later)
 *
 * This enables BaleyBots to dynamically create specialized sub-agents
 * for specific tasks without needing to pre-define them.
 */

import { Baleybot, type ToolDefinition as CoreToolDefinition } from '@baleybots/core';
import type { BuiltInToolContext, CreateAgentResult } from '../tools/built-in';
import type { RuntimeToolDefinition } from '../executor';
import { createLogger } from '@/lib/logger';

const logger = createLogger('ephemeral-agent');

// ============================================================================
// TYPES
// ============================================================================

export interface EphemeralAgentConfig {
  /** Unique name/identifier for the agent */
  name: string;
  /** What the agent should accomplish */
  goal: string;
  /** AI model to use (e.g., "openai:gpt-4o", "anthropic:claude-sonnet-4-20250514") */
  model?: string;
  /** List of tool names this agent can use (from parent context) */
  tools?: string[];
}

export interface EphemeralAgentService {
  /**
   * Create and execute an ephemeral agent
   *
   * @param config - Agent configuration
   * @param input - Input to pass to the agent
   * @param parentTools - Tools available from the parent execution context
   * @returns Agent execution result
   */
  createAndExecute(
    config: EphemeralAgentConfig,
    input: unknown,
    parentTools: Map<string, RuntimeToolDefinition>
  ): Promise<CreateAgentResult>;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

/**
 * Convert a runtime tool definition to the format expected by @baleybots/core
 */
function toCoreTool(tool: RuntimeToolDefinition): CoreToolDefinition {
  // Build base tool definition
  const coreTool: CoreToolDefinition = {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    function: tool.function as (...args: unknown[]) => unknown,
  };

  // Add needsApproval if present (may not exist on all core versions)
  if (tool.needsApproval !== undefined) {
    (coreTool as unknown as Record<string, unknown>).needsApproval = tool.needsApproval;
  }

  return coreTool;
}

/**
 * Generate BAL code for an ephemeral agent
 */
function generateAgentBAL(config: EphemeralAgentConfig): string {
  const toolsArray = config.tools && config.tools.length > 0
    ? `"tools": [${config.tools.map(t => `"${t}"`).join(', ')}],`
    : '';

  const model = config.model
    ? `"model": "${config.model}",`
    : '';

  return `
{
  "name": "${config.name}",
  "goal": "${config.goal.replace(/"/g, '\\"')}",
  ${model}
  ${toolsArray}
  "output": {
    "result": "string"
  }
}
`.trim();
}

/**
 * Create an ephemeral agent service
 */
export function createEphemeralAgentService(): EphemeralAgentService {
  return {
    async createAndExecute(
      config: EphemeralAgentConfig,
      input: unknown,
      parentTools: Map<string, RuntimeToolDefinition>
    ): Promise<CreateAgentResult> {
      // Validate config
      if (!config.name || config.name.trim().length === 0) {
        throw new Error('Ephemeral agent name is required');
      }
      if (!config.goal || config.goal.trim().length === 0) {
        throw new Error('Ephemeral agent goal is required');
      }

      logger.info('Creating ephemeral agent', { name: config.name, goal: config.goal });

      // Filter tools to only those requested
      const agentTools: Record<string, CoreToolDefinition> = {};
      if (config.tools && config.tools.length > 0) {
        for (const toolName of config.tools) {
          const tool = parentTools.get(toolName);
          if (tool) {
            agentTools[toolName] = toCoreTool(tool);
          } else {
            logger.warn('Tool not found in parent context, skipping', { toolName });
          }
        }
      }

      // Create the Baleybot instance
      const botConfig: {
        name: string;
        goal: string;
        model?: string;
        tools?: Record<string, CoreToolDefinition>;
      } = {
        name: config.name,
        goal: config.goal,
        model: config.model || 'openai:gpt-4o-mini',
      };

      if (Object.keys(agentTools).length > 0) {
        botConfig.tools = agentTools;
      }

      try {
        // Create and execute the ephemeral agent
        const agent = Baleybot.create(
          botConfig as Parameters<typeof Baleybot.create>[0]
        );

        // Convert input to string format
        const inputStr = typeof input === 'string' ? input : JSON.stringify(input);

        // Execute the agent
        const result = await agent.process(inputStr);

        logger.info('Ephemeral agent completed successfully', { name: config.name });

        return {
          output: result,
          agentName: config.name,
        };
      } catch (error) {
        logger.error('Ephemeral agent failed', { name: config.name, error });

        throw new Error(
          `Ephemeral agent "${config.name}" execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  };
}

/**
 * Default ephemeral agent service instance
 */
export const ephemeralAgentService = createEphemeralAgentService();

// ============================================================================
// TOOL IMPLEMENTATION HELPER
// ============================================================================

/**
 * Create the create_agent tool implementation function.
 * This wraps the ephemeral agent service for use by the built-in tool system.
 *
 * @param parentTools - Tools available in the parent execution context
 */
export function createAgentToolImpl(
  parentTools: Map<string, RuntimeToolDefinition>
): (
  args: EphemeralAgentConfig & { input?: unknown },
  ctx: BuiltInToolContext
) => Promise<CreateAgentResult> {
  return async (args, _ctx) => {
    // Extract input from args if provided, otherwise use empty string
    const { name, goal, model, tools } = args;
    const input = args.input ?? '';

    return ephemeralAgentService.createAndExecute(
      { name, goal, model, tools },
      input,
      parentTools
    );
  };
}
