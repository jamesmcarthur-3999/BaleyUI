/**
 * BAL Executor Service
 *
 * Executes BAL v2 via @baleybots/tools (wrapped by @baleyui/sdk).
 * This keeps BaleyUI aligned with the canonical BAL implementation.
 */

import { parse, tokenize } from '@baleybots/tools';
import type {
  BaleybotStreamEvent,
  ToolDefinition as CoreToolDefinition,
  ToolCall,
  ProviderConfig,
} from '@baleybots/core';
import { compileBALCode, executeBALCode } from '@baleyui/sdk';
import type { BALExecutionOptions } from '@baleyui/sdk';
import { db, connections, and, eq, inArray, notDeleted } from '@baleyui/db';
import type { AIConnectionConfig } from '@/lib/connections/providers';
import { decrypt } from '@/lib/encryption';
import { createLogger } from '@/lib/logger';
import type {
  ExecuteOptions,
  ExecutionResult,
  ExecutionStatus,
  ApprovalRequest,
  ApprovalResponse,
  WorkspacePolicies,
} from './types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Runtime tool definition that includes the actual function
 */
export interface RuntimeToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  function: (args: Record<string, unknown>) => Promise<unknown>;
  needsApproval?: boolean | ((args: Record<string, unknown>) => boolean | Promise<boolean>);
  category?: string;
  dangerLevel?: 'safe' | 'moderate' | 'dangerous';
}

/**
 * Context for BAL execution
 */
export interface ExecutorContext {
  /** Workspace ID */
  workspaceId: string;
  /** Available tools for the workspace (with actual functions) */
  availableTools: Map<string, RuntimeToolDefinition>;
  /** Workspace policies for tool governance */
  workspacePolicies: WorkspacePolicies | null;
  /** Trigger type for the execution */
  triggeredBy: 'manual' | 'schedule' | 'webhook' | 'other_bb';
  /** Trigger source (e.g., BB ID if triggered by another BB) */
  triggerSource?: string;
}

/**
 * Parsed control structure from BAL code (legacy shape; kept for compatibility)
 */
interface ControlStructure {
  type: 'chain' | 'when' | 'parallel';
  entityNames?: string[];
  condition?: string;
  branches?: Record<string, string>;
}

// ============================================================================
// HELPERS
// ============================================================================

const logger = createLogger('baleybot-executor');

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

function buildAvailableTools(
  availableTools: Map<string, RuntimeToolDefinition>
): Record<string, CoreToolDefinition> {
  const tools: Record<string, CoreToolDefinition> = {};
  for (const tool of availableTools.values()) {
    tools[tool.name] = toCoreTool(tool);
  }
  return tools;
}

function mapStatus(resultStatus: string): ExecutionStatus {
  switch (resultStatus) {
    case 'success':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    case 'timeout':
      return 'failed';
    case 'error':
    default:
      return 'failed';
  }
}

function getEntityGoals(balCode: string): Map<string, string> {
  try {
    const tokens = tokenize(balCode);
    const ast = parse(tokens, balCode);
    const goals = new Map<string, string>();
    for (const [name, entity] of ast.entities.entries()) {
      goals.set(name, entity.goal);
    }
    return goals;
  } catch {
    return new Map();
  }
}

type ProviderType = 'openai' | 'anthropic' | 'ollama';

function getPreferredProvider(balCode: string): ProviderType | null {
  try {
    const tokens = tokenize(balCode);
    const ast = parse(tokens, balCode);
    const providers = new Set<ProviderType>();

    for (const entity of ast.entities.values()) {
      if (entity.model && typeof entity.model === 'string' && entity.model.includes(':')) {
        const [provider] = entity.model.split(':');
        if (provider === 'openai' || provider === 'anthropic' || provider === 'ollama') {
          providers.add(provider);
        }
      }
    }

    return providers.size === 1 ? (Array.from(providers)[0] ?? null) : null;
  } catch {
    return null;
  }
}

function decryptMaybe(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

function buildProviderConfig(
  connection: { type: string; config: unknown }
): ProviderConfig | undefined {
  const config = connection.config as AIConnectionConfig;
  const apiKey = typeof config.apiKey === 'string' ? decryptMaybe(config.apiKey) : undefined;
  const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl : undefined;

  if (!apiKey && !baseUrl) {
    return undefined;
  }

  const providerConfig: ProviderConfig = {
    apiKey,
    baseUrl,
  };

  if (connection.type === 'openai' && config.organization) {
    providerConfig.headers = {
      'OpenAI-Organization': config.organization,
    };
  }

  return providerConfig;
}

async function resolveProviderConfig(
  workspaceId: string,
  preferredProvider: ProviderType | null
): Promise<ProviderConfig | undefined> {
  const allConnections = await db.query.connections.findMany({
    where: and(
      eq(connections.workspaceId, workspaceId),
      inArray(connections.type, ['openai', 'anthropic', 'ollama']),
      notDeleted(connections)
    ),
  });

  if (allConnections.length === 0) {
    return undefined;
  }

  const candidates = preferredProvider
    ? allConnections.filter((conn) => conn.type === preferredProvider)
    : allConnections;

  const connected = candidates.filter((conn) => conn.status === 'connected');

  const selected =
    connected.find((conn) => conn.isDefault) ??
    connected[0] ??
    candidates.find((conn) => conn.isDefault) ??
    candidates[0];

  if (!selected) return undefined;

  return buildProviderConfig(selected);
}

// ============================================================================
// MAIN EXECUTOR
// ============================================================================

/**
 * Execute a BaleyBot from its BAL code
 */
export async function executeBaleybot(
  balCode: string,
  input: string,
  ctx: ExecutorContext,
  options?: ExecuteOptions
): Promise<ExecutionResult> {
  const executionId = crypto.randomUUID();
  const startTime = Date.now();
  const segments: BaleybotStreamEvent[] = [];

  let status: ExecutionStatus = 'running';
  let output: unknown = null;
  let error: string | undefined;

  const entityGoals = getEntityGoals(balCode);
  const preferredProvider = getPreferredProvider(balCode);
  let providerConfig: ProviderConfig | undefined;
  try {
    providerConfig = await resolveProviderConfig(ctx.workspaceId, preferredProvider);
  } catch (err) {
    logger.warn('Failed to resolve provider config', {
      workspaceId: ctx.workspaceId,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }

  try {
    const result = await executeBALCode(balCode, {
      input,
      model: 'openai:gpt-4o-mini',
      providerConfig,
      availableTools: buildAvailableTools(ctx.availableTools),
      onToolCallApproval: options?.onApprovalNeeded
        ? async (botName: string, toolCalls: ToolCall[]) => {
            for (const toolCall of toolCalls) {
              const request: ApprovalRequest = {
                tool: toolCall.name,
                arguments: toolCall.arguments as Record<string, unknown>,
                entityName: botName,
                entityGoal: entityGoals.get(botName) ?? '',
                reason: `Entity "${botName}" is requesting to use tool "${toolCall.name}"`,
              };

              const response: ApprovalResponse = await options.onApprovalNeeded!(request);

              if (!response.approved) {
                return {
                  approved: false,
                  reason: response.reason,
                };
              }

              if (response.modifiedArguments) {
                return {
                  approved: true,
                  modified: [
                    {
                      ...toolCall,
                      arguments: response.modifiedArguments,
                    },
                  ],
                };
              }
            }

            return { approved: true };
          }
        : undefined,
      onEvent: (event) => {
        if (event.type === 'token') {
          segments.push(event.event);
          options?.onSegment?.(event.event);
        }
      },
      signal: options?.signal,
    });

    output = result.result ?? null;
    status = mapStatus(result.status);
    if (result.status === 'error' || result.status === 'timeout') {
      error = result.error ?? 'BAL execution failed';
    }
  } catch (err) {
    status = 'failed';
    error = err instanceof Error ? err.message : 'Unknown error during execution';
  }

  return {
    executionId,
    status,
    output,
    error,
    segments,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Validate BAL code can be executed
 */
export function canExecute(
  balCode: string,
  availableTools?: Map<string, RuntimeToolDefinition>
): {
  valid: boolean;
  errors: string[];
} {
  const { entities, errors } = compileBALCode(
    balCode,
    availableTools
      ? { availableTools: buildAvailableTools(availableTools) as BALExecutionOptions['availableTools'] }
      : {}
  );

  if (errors && errors.length > 0) {
    return { valid: false, errors };
  }

  if (entities.length === 0) {
    return { valid: false, errors: ['No entities found in BAL code'] };
  }

  return { valid: true, errors: [] };
}

/**
 * Get entity names from BAL code
 */
export function getEntityNames(
  balCode: string,
  availableTools?: Map<string, RuntimeToolDefinition>
): string[] {
  const { entities } = compileBALCode(
    balCode,
    availableTools
      ? { availableTools: buildAvailableTools(availableTools) as BALExecutionOptions['availableTools'] }
      : {}
  );
  return entities;
}

/**
 * Get structure information from BAL code
 */
export function getStructure(balCode: string): {
  entities: Array<{ name: string; goal: string }>;
  controlFlow: ControlStructure[];
} {
  const goals = getEntityGoals(balCode);

  return {
    entities: Array.from(goals.entries()).map(([name, goal]) => ({ name, goal })),
    controlFlow: [],
  };
}
