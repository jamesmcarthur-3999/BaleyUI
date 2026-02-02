/**
 * BAL Executor Service
 *
 * Executes BaleyBots by:
 * 1. Parsing BAL code into entity definitions
 * 2. Creating Baleybot instances from parsed entities
 * 3. Composing them using the functional pipeline API
 * 4. Executing with streaming and approval handling
 */

import {
  Baleybot,
  pipeline,
  type BaleybotStreamEvent,
  type Processable,
  type ToolDefinition as CoreToolDefinition,
} from '@baleybots/core';
import type {
  ExecuteOptions,
  ExecutionResult,
  ExecutionStatus,
  ApprovalRequest,
  ApprovalResponse,
  GeneratedEntity,
  WorkspacePolicies,
  ToolDefinition,
} from './types';
import { parseBalCode } from './generator';
import { categorizeToolName } from './tool-catalog';

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
 * Parsed control structure from BAL code
 */
interface ControlStructure {
  type: 'chain' | 'when' | 'parallel';
  entityNames?: string[];
  condition?: string;
  branches?: Record<string, string>;
}

// ============================================================================
// BAL PARSER HELPERS
// ============================================================================

/**
 * Parse control structures from BAL code
 */
function parseControlStructures(balCode: string): ControlStructure[] {
  const structures: ControlStructure[] = [];

  // Parse chain directive
  const chainMatch = balCode.match(/chain\s*\{([^}]+)\}/);
  if (chainMatch && chainMatch[1]) {
    const entityNames = chainMatch[1]
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    structures.push({ type: 'chain', entityNames });
  }

  // Parse when directive
  const whenMatch = balCode.match(/when\s+(\w+)\s*\{([^}]+)\}/);
  if (whenMatch && whenMatch[1] && whenMatch[2]) {
    const condition = whenMatch[1];
    const branchesStr = whenMatch[2];
    const branches: Record<string, string> = {};

    // Parse "pass": entity_name, "fail": entity_name
    const passMatch = branchesStr.match(/"pass"\s*:\s*(\w+)/);
    const failMatch = branchesStr.match(/"fail"\s*:\s*(\w+)/);

    if (passMatch?.[1]) branches.pass = passMatch[1];
    if (failMatch?.[1]) branches.fail = failMatch[1];

    structures.push({ type: 'when', condition, branches });
  }

  // Parse parallel directive
  const parallelMatch = balCode.match(/parallel\s*\{([^}]+)\}/);
  if (parallelMatch && parallelMatch[1]) {
    const branchesStr = parallelMatch[1];
    const branches: Record<string, string> = {};

    // Parse "branch_name": entity_name pairs
    const branchRegex = /"(\w+)"\s*:\s*(\w+)/g;
    let branchMatch;
    while ((branchMatch = branchRegex.exec(branchesStr)) !== null) {
      if (branchMatch[1] && branchMatch[2]) {
        branches[branchMatch[1]] = branchMatch[2];
      }
    }

    structures.push({ type: 'parallel', branches });
  }

  return structures;
}

// ============================================================================
// ENTITY TO BALEYBOT CONVERSION
// ============================================================================

/**
 * Convert a runtime tool definition to the format expected by @baleybots/core
 */
function toCoreTool(tool: RuntimeToolDefinition): CoreToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    function: tool.function as (...args: unknown[]) => unknown,
  };
}

/**
 * Convert a parsed entity definition to a Baleybot instance
 */
function entityToBaleybot(
  entity: GeneratedEntity,
  availableTools: Map<string, RuntimeToolDefinition>,
  policies: WorkspacePolicies | null
): Processable<string, unknown> {
  // Build tools object from entity's tool list
  const tools: Record<string, CoreToolDefinition> = {};

  // Add immediate tools
  for (const toolName of entity.tools) {
    const toolDef = availableTools.get(toolName);
    if (toolDef) {
      // Verify it's allowed as immediate
      const category = categorizeToolName(toolName, policies);
      if (category === 'immediate') {
        tools[toolName] = toCoreTool(toolDef);
      }
    }
  }

  // Add can_request tools (they'll be handled via approval callback)
  for (const toolName of entity.canRequest) {
    const toolDef = availableTools.get(toolName);
    if (toolDef) {
      const category = categorizeToolName(toolName, policies);
      if (category !== 'forbidden') {
        tools[toolName] = toCoreTool(toolDef);
      }
    }
  }

  // Create the Baleybot
  const config: {
    name: string;
    goal: string;
    model?: string;
    tools?: Record<string, CoreToolDefinition>;
    outputSchema?: Record<string, unknown>;
  } = {
    name: entity.name,
    goal: entity.goal,
    model: entity.model || 'openai:gpt-4o-mini',
  };

  if (Object.keys(tools).length > 0) {
    config.tools = tools;
  }

  if (entity.output) {
    config.outputSchema = createOutputSchema(entity.output);
  }

  return Baleybot.create(config as Parameters<typeof Baleybot.create>[0]);
}

/**
 * Create a simple output schema from entity output definition
 */
function createOutputSchema(
  output: Record<string, string>
): Record<string, unknown> {
  // Convert simple type definitions to JSON Schema
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, type] of Object.entries(output)) {
    required.push(key);

    switch (type.toLowerCase()) {
      case 'string':
        properties[key] = { type: 'string' };
        break;
      case 'number':
        properties[key] = { type: 'number' };
        break;
      case 'boolean':
        properties[key] = { type: 'boolean' };
        break;
      case 'array':
        properties[key] = { type: 'array', items: {} };
        break;
      case 'object':
        properties[key] = { type: 'object' };
        break;
      default:
        properties[key] = { type: 'string' };
    }
  }

  return {
    type: 'object',
    properties,
    required,
  };
}

// ============================================================================
// PIPELINE COMPOSITION
// ============================================================================

/**
 * Compose a pipeline from entities and control structures
 */
function composePipeline(
  entities: Map<string, Processable<string, unknown>>,
  controlStructures: ControlStructure[],
  entityDefinitions: GeneratedEntity[]
): Processable<string, unknown> {
  // If no control structures, check if we have a single entity
  if (controlStructures.length === 0) {
    if (entities.size === 1) {
      const firstEntity = entities.values().next().value;
      if (!firstEntity) {
        throw new Error('No entities found');
      }
      return firstEntity;
    }

    // Default: chain all entities in definition order
    const orderedBots = entityDefinitions
      .map((e) => entities.get(e.name))
      .filter((b): b is Processable<string, unknown> => b !== undefined);

    if (orderedBots.length === 0) {
      throw new Error('No valid entities to execute');
    }

    if (orderedBots.length === 1) {
      const bot = orderedBots[0];
      if (!bot) throw new Error('No valid entities to execute');
      return bot;
    }

    return pipeline(...orderedBots);
  }

  // Build pipeline from control structures
  // For now, handle the most common case: a single chain
  const chainStructure = controlStructures.find((s) => s.type === 'chain');
  if (chainStructure && chainStructure.entityNames) {
    const chainedBots = chainStructure.entityNames
      .map((name) => entities.get(name))
      .filter((b): b is Processable<string, unknown> => b !== undefined);

    if (chainedBots.length === 0) {
      throw new Error('No valid entities in chain');
    }

    if (chainedBots.length === 1) {
      const bot = chainedBots[0];
      if (!bot) throw new Error('No valid entities in chain');
      return bot;
    }

    return pipeline(...chainedBots);
  }

  // For complex control structures (when, parallel), fall back to sequential for now
  // TODO: Implement proper conditional and parallel execution

  // Fallback: return first entity or chain all
  const allBots = Array.from(entities.values());
  if (allBots.length === 0) {
    throw new Error('No entities found');
  }
  if (allBots.length === 1) {
    const bot = allBots[0];
    if (!bot) throw new Error('No entities found');
    return bot;
  }
  return pipeline(...allBots);
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

  try {
    // 1. Parse BAL code
    const { entities: parsedEntities, errors: parseErrors } =
      parseBalCode(balCode);

    if (parseErrors.length > 0) {
      throw new Error(`BAL parsing errors: ${parseErrors.join(', ')}`);
    }

    if (parsedEntities.length === 0) {
      throw new Error('No entities found in BAL code');
    }

    // Convert parsed entities to GeneratedEntity format
    const entityDefinitions: GeneratedEntity[] = parsedEntities.map(
      ({ name, config }) => ({
        name,
        goal: (config.goal as string) || `Entity ${name}`,
        model: config.model as string | undefined,
        tools: (config.tools as string[]) || [],
        canRequest: (config.can_request as string[]) || [],
        output: config.output as Record<string, string> | undefined,
        history: config.history as 'none' | 'inherit' | undefined,
      })
    );

    // 2. Parse control structures
    const controlStructures = parseControlStructures(balCode);

    // 3. Create Baleybot instances
    const entities = new Map<string, Processable<string, unknown>>();

    for (const entityDef of entityDefinitions) {
      const bot = entityToBaleybot(
        entityDef,
        ctx.availableTools,
        ctx.workspacePolicies
      );
      entities.set(entityDef.name, bot);
    }

    // 4. Compose pipeline
    const composedPipeline = composePipeline(
      entities,
      controlStructures,
      entityDefinitions
    );

    // 5. Set up streaming subscription
    const subscription = composedPipeline.subscribeToAll?.({
      onStreamEvent: (_botId, _botName, event) => {
        segments.push(event);
        options?.onSegment?.(event);
      },
      onProgressUpdate: (_botId, _botName, event) => {
        segments.push(event);
        options?.onSegment?.(event);
      },
      onError: (_botId, _botName, event) => {
        segments.push(event);
        options?.onSegment?.(event);
      },
    });

    try {
      // 6. Execute
      output = await composedPipeline.process(input, {
        signal: options?.signal,
        onToolCallApproval: options?.onApprovalNeeded
          ? async (botName, toolCalls) => {
              // Convert to ApprovalRequest and call handler
              for (const toolCall of toolCalls) {
                const entityDef = entityDefinitions.find(
                  (e) => e.name === botName
                );
                const request: ApprovalRequest = {
                  tool: toolCall.name,
                  arguments: toolCall.arguments as Record<string, unknown>,
                  entityName: botName,
                  entityGoal: entityDef?.goal || '',
                  reason: `Entity "${botName}" is requesting to use tool "${toolCall.name}"`,
                };

                const response = await options.onApprovalNeeded!(request);

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
      });

      status = 'completed';
    } finally {
      subscription?.unsubscribe();
    }
  } catch (err) {
    status = 'failed';
    error =
      err instanceof Error ? err.message : 'Unknown error during execution';
  }

  const endTime = Date.now();

  return {
    executionId,
    status,
    output,
    error,
    segments,
    durationMs: endTime - startTime,
  };
}

/**
 * Validate BAL code can be executed
 */
export function canExecute(balCode: string): {
  valid: boolean;
  errors: string[];
} {
  const { entities, errors } = parseBalCode(balCode);

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  if (entities.length === 0) {
    return { valid: false, errors: ['No entities found in BAL code'] };
  }

  // Check that all entities have goals
  const missingGoals = entities
    .filter((e) => !e.config.goal)
    .map((e) => e.name);

  if (missingGoals.length > 0) {
    return {
      valid: false,
      errors: [`Entities missing goals: ${missingGoals.join(', ')}`],
    };
  }

  return { valid: true, errors: [] };
}

/**
 * Get entity names from BAL code
 */
export function getEntityNames(balCode: string): string[] {
  const { entities } = parseBalCode(balCode);
  return entities.map((e) => e.name);
}

/**
 * Get structure information from BAL code
 */
export function getStructure(balCode: string): {
  entities: Array<{ name: string; goal: string }>;
  controlFlow: ControlStructure[];
} {
  const { entities } = parseBalCode(balCode);
  const controlFlow = parseControlStructures(balCode);

  return {
    entities: entities.map(({ name, config }) => ({
      name,
      goal: (config.goal as string) || '',
    })),
    controlFlow,
  };
}
