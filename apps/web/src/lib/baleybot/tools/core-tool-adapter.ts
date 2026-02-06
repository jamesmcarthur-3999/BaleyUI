/**
 * Core Tool Adapter
 *
 * Converts RuntimeToolDefinition (BaleyUI's internal tool format) to
 * CoreToolDefinition (@baleybots/core format). Shared by the executor
 * and ephemeral agent service.
 */

import type { ToolDefinition as CoreToolDefinition } from '@baleybots/core';
import type { RuntimeToolDefinition } from '../executor';

/**
 * Convert a single RuntimeToolDefinition to the format expected by @baleybots/core
 */
export function toCoreTool(tool: RuntimeToolDefinition): CoreToolDefinition {
  const coreTool: CoreToolDefinition = {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    function: tool.function as (...args: unknown[]) => unknown,
  };

  if (tool.needsApproval !== undefined) {
    (coreTool as unknown as Record<string, unknown>).needsApproval = tool.needsApproval;
  }

  return coreTool;
}

/**
 * Convert a Map of RuntimeToolDefinitions to a Record of CoreToolDefinitions
 */
export function buildAvailableTools(
  availableTools: Map<string, RuntimeToolDefinition>
): Record<string, CoreToolDefinition> {
  const tools: Record<string, CoreToolDefinition> = {};
  for (const tool of availableTools.values()) {
    tools[tool.name] = toCoreTool(tool);
  }
  return tools;
}
