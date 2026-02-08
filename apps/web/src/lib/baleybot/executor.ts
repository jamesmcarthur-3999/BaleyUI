/**
 * BAL Executor Service
 *
 * Executes BAL v2 via @baleybots/tools (wrapped by @baleyui/sdk).
 * This keeps BaleyUI aligned with the canonical BAL implementation.
 */

import crypto from 'crypto';
import { tokenize } from '@baleybots/tools/dsl/lexer';
import { parse } from '@baleybots/tools/dsl/parser';
import type { OutputSchemaNode, ProgramNode } from '@baleybots/tools/dsl/types';
import { buildZodSchema } from '@baleybots/tools/dsl/type-builder';
import type {
  BaleybotStreamEvent,
  ToolCall,
  ProviderConfig,
} from '@baleybots/core';
import { compileBALCode, executeBALCode } from '@baleyui/sdk';
import type { BALExecutionOptions, BALExecutionEvent } from '@baleyui/sdk';
import { createLogger } from '@/lib/logger';
import type {
  ExecuteOptions,
  ExecutionResult,
  ExecutionStatus,
  ApprovalRequest,
  ApprovalResponse,
  WorkspacePolicies,
  SchemaValidationResult,
} from './types';
import { buildAvailableTools } from './tools/core-tool-adapter';
import {
  resolveProviderConfig,
  type AIProviderType,
} from './services/ai-credentials-service';

// ============================================================================
// PERF-008: BAL PARSING CACHE
// ============================================================================

interface CachedBALParse {
  ast: ProgramNode;
  timestamp: number;
}

/**
 * Simple in-memory cache for parsed BAL ASTs.
 * Uses a hash of the BAL code as the key, with a TTL to prevent stale entries.
 */
class BALParseCache {
  private cache = new Map<string, CachedBALParse>();
  private readonly maxSize = 100;
  private readonly ttlMs = 5 * 60 * 1000; // 5 minutes

  private hash(balCode: string): string {
    return crypto.createHash('sha256').update(balCode).digest('hex');
  }

  get(balCode: string): ProgramNode | null {
    const key = this.hash(balCode);
    const cached = this.cache.get(key);

    if (!cached) return null;

    // Check if entry has expired
    if (Date.now() - cached.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return cached.ast;
  }

  set(balCode: string, ast: ProgramNode): void {
    const key = this.hash(balCode);

    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { ast, timestamp: Date.now() });
  }

  /**
   * Parse BAL code with caching
   */
  parse(balCode: string): ProgramNode {
    const cached = this.get(balCode);
    if (cached) return cached;

    const tokens = tokenize(balCode);
    const ast = parse(tokens, balCode);
    this.set(balCode, ast);
    return ast;
  }

  clear(): void {
    this.cache.clear();
  }
}

// Singleton cache instance
const balParseCache = new BALParseCache();

/**
 * Export for testing and cache management
 */
export { balParseCache };

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
  /** BaleyBot ID (for trigger processing after completion) */
  baleybotId?: string;
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
    // PERF-008: Use cached parsing
    const ast = balParseCache.parse(balCode);
    const goals = new Map<string, string>();
    for (const [name, entity] of ast.entities.entries()) {
      goals.set(name, entity.goal);
    }
    return goals;
  } catch {
    return new Map();
  }
}

/**
 * Get the combined output schema from all entities in the BAL code.
 * For chains, we use the last entity's output schema.
 * For single entities, we use that entity's schema.
 */
function getOutputSchema(balCode: string): OutputSchemaNode | null {
  try {
    // PERF-008: Use cached parsing
    const ast = balParseCache.parse(balCode);

    // If there's a root composition, find the last entity in execution order
    if (ast.root) {
      const lastEntityName = findLastEntityInComposition(ast.root);
      if (lastEntityName) {
        const entity = ast.entities.get(lastEntityName);
        return entity?.output ?? null;
      }
    }

    // If there's only one entity, use its output schema
    if (ast.entities.size === 1) {
      const [entity] = ast.entities.values();
      return entity?.output ?? null;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Find the last entity name that will produce output in a composition
 */
function findLastEntityInComposition(expr: unknown): string | null {
  if (!expr || typeof expr !== 'object') return null;

  const node = expr as { type: string; body?: unknown[]; name?: string };

  switch (node.type) {
    case 'ChainExpr':
      // For chains, the last element produces the final output
      if (node.body && node.body.length > 0) {
        return findLastEntityInComposition(node.body[node.body.length - 1]);
      }
      return null;

    case 'ParallelExpr':
      // For parallel, all outputs are merged - return null (complex case)
      // In practice, parallel usually isn't the final step
      return null;

    case 'EntityRef':
    case 'EntityRefWithContext':
      return node.name ?? null;

    case 'IfExpr':
    case 'LoopExpr':
    case 'SelectExpr':
    case 'MergeExpr':
    case 'MapExpr':
      // These transform data but don't necessarily have entity schemas
      return null;

    default:
      return null;
  }
}

/**
 * Validate output against the declared schema
 */
function validateOutput(
  output: unknown,
  schema: OutputSchemaNode
): SchemaValidationResult {
  try {
    const zodSchema = buildZodSchema(schema);
    const result = zodSchema.safeParse(output);

    if (result.success) {
      return { valid: true, issues: [] };
    }

    return {
      valid: false,
      issues: result.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
        code: issue.code,
      })),
    };
  } catch (err: unknown) {
    logger.warn('Schema validation error', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    // If we can't build the schema, treat it as valid (lenient mode)
    return { valid: true, issues: [] };
  }
}

export type ProviderType = AIProviderType;

export function getPreferredProvider(balCode: string): AIProviderType | null {
  try {
    // PERF-008: Use cached parsing
    const ast = balParseCache.parse(balCode);
    const providers = new Set<AIProviderType>();

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

/**
 * Extract the model string from BAL code.
 * Returns the first entity's model or default.
 */
export function getPreferredModel(balCode: string): string {
  try {
    const ast = balParseCache.parse(balCode);

    // Get the first entity's model
    for (const entity of ast.entities.values()) {
      if (entity.model && typeof entity.model === 'string') {
        return entity.model;
      }
    }

    return 'openai:gpt-4o-mini'; // Default fallback
  } catch {
    return 'openai:gpt-4o-mini';
  }
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
  let actualProvider: AIProviderType | null = preferredProvider;
  try {
    providerConfig = await resolveProviderConfig(ctx.workspaceId, preferredProvider);

    // Detect which provider we're actually using based on what key is available
    // This is needed to override the model string if we fell back to a different provider
    if (providerConfig?.apiKey) {
      if (preferredProvider === 'anthropic' && !process.env.ANTHROPIC_API_KEY && process.env.OPENAI_API_KEY) {
        actualProvider = 'openai';
      } else if (preferredProvider === 'openai' && !process.env.OPENAI_API_KEY && process.env.ANTHROPIC_API_KEY) {
        actualProvider = 'anthropic';
      }
    }
  } catch (err: unknown) {
    logger.warn('Failed to resolve provider config', {
      workspaceId: ctx.workspaceId,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }

  // Get the model from BAL code, but override if we had to fall back to a different provider
  let model = getPreferredModel(balCode);
  if (actualProvider && actualProvider !== preferredProvider) {
    // Model string needs to match the actual provider we're using
    if (actualProvider === 'openai') {
      model = 'openai:gpt-4o'; // Fall back to capable OpenAI model
      logger.info('Model override: falling back to OpenAI', {
        originalModel: getPreferredModel(balCode),
        newModel: model,
      });
    } else if (actualProvider === 'anthropic') {
      model = 'anthropic:claude-sonnet-4-20250514';
      logger.info('Model override: falling back to Anthropic', {
        originalModel: getPreferredModel(balCode),
        newModel: model,
      });
    }
  }

  logger.info('Executing BAL with provider config', {
    executionId,
    model,
    preferredProvider,
    actualProvider,
    hasProviderConfig: !!providerConfig,
    hasApiKey: !!providerConfig?.apiKey,
  });

  try {
    // Note: Using type assertion because we pass extended options (onToolCallApproval)
    // that the SDK's public BALExecutionOptions doesn't expose.
    // input, model, providerConfig, and availableTools are all now properly typed.
    const executionOptions = {
      input, // Now properly typed - passed through to executeBAL
      model,
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
      onEvent: (event: BALExecutionEvent) => {
        if (event.type === 'token') {
          segments.push(event.event);
          options?.onSegment?.(event.event);
        }
      },
      signal: options?.signal,
    } as unknown as BALExecutionOptions;

    const result = await executeBALCode(balCode, executionOptions);

    output = result.result ?? null;
    status = mapStatus(result.status);
    if (result.status === 'error' || result.status === 'timeout') {
      error = result.error ?? 'BAL execution failed';
    }
  } catch (err: unknown) {
    status = 'failed';
    error = err instanceof Error ? err.message : 'Unknown error during execution';
  }

  // Fire BB completion triggers (non-blocking, failures don't affect result)
  if (ctx.baleybotId) {
    try {
      const { processBBCompletion } = await import('./services/bb-completion-trigger-service');
      await processBBCompletion({
        sourceBaleybotId: ctx.baleybotId,
        status: status === 'completed' ? 'completed' : 'failed',
        output,
        executionId,
      });
    } catch (triggerErr) {
      logger.warn('BB completion trigger processing failed (non-fatal)', {
        baleybotId: ctx.baleybotId,
        executionId,
        error: triggerErr instanceof Error ? triggerErr.message : 'Unknown error',
      });
    }
  }

  // Validate output against schema if execution completed successfully
  let schemaValidation: SchemaValidationResult | undefined;
  if (status === 'completed' && output !== null) {
    const outputSchema = getOutputSchema(balCode);
    if (outputSchema) {
      schemaValidation = validateOutput(output, outputSchema);
      if (!schemaValidation.valid) {
        logger.warn('Output schema validation failed', {
          executionId,
          issues: schemaValidation.issues,
          output: typeof output === 'object' ? JSON.stringify(output).slice(0, 200) : String(output),
        });
      }
    }
  }

  const durationMs = Date.now() - startTime;

  // ============================================================================
  // POST-EXECUTION: Analytics, Usage Tracking, and Alerts (non-blocking)
  // All service calls are wrapped in try/catch so failures don't affect results.
  // ============================================================================

  // Record metrics (built-in defaults + BAL analytics block if present)
  if (ctx.baleybotId) {
    try {
      const { metricsService } = await import('./analytics/metrics-service');
      const { getDefaultMetrics, extractAnalyticsFromBAL } = await import('./analytics/schema-parser');

      const metricsCtx = {
        workspaceId: ctx.workspaceId,
        baleybotId: ctx.baleybotId,
        executionId,
        status: status === 'completed' ? 'completed' as const : 'failed' as const,
        durationMs,
        output,
      };

      // Always record default metrics (count, success rate, duration)
      const metricDefs = getDefaultMetrics();

      // Also record any custom metrics from the BAL analytics block
      const analyticsSchema = extractAnalyticsFromBAL(balCode);
      if (analyticsSchema?.track) {
        metricDefs.push(...analyticsSchema.track);
      }

      await metricsService.recordMetrics(metricsCtx, metricDefs);
    } catch (metricsErr) {
      logger.warn('Metrics recording failed (non-fatal)', {
        executionId,
        error: metricsErr instanceof Error ? metricsErr.message : 'Unknown error',
      });
    }
  }

  // Record usage/cost tracking from execution segments
  if (ctx.baleybotId) {
    try {
      const { recordUsageFromExecution } = await import('./cost/usage-tracker');
      await recordUsageFromExecution(
        ctx.workspaceId,
        ctx.baleybotId,
        executionId,
        segments,
        durationMs,
      );
    } catch (usageErr) {
      logger.warn('Usage tracking failed (non-fatal)', {
        executionId,
        error: usageErr instanceof Error ? usageErr.message : 'Unknown error',
      });
    }
  }

  // Evaluate alert conditions on failure (check if error rate exceeds thresholds)
  if (ctx.baleybotId && status === 'failed') {
    try {
      const { alertService } = await import('./analytics/alert-service');
      const { extractAnalyticsFromBAL } = await import('./analytics/schema-parser');

      const analyticsSchema = extractAnalyticsFromBAL(balCode);
      if (analyticsSchema?.alertWhen) {
        await alertService.evaluateAlerts(
          {
            workspaceId: ctx.workspaceId,
            baleybotId: ctx.baleybotId,
            executionId,
          },
          analyticsSchema.alertWhen,
        );
      }
    } catch (alertErr) {
      logger.warn('Alert evaluation failed (non-fatal)', {
        executionId,
        error: alertErr instanceof Error ? alertErr.message : 'Unknown error',
      });
    }
  }

  return {
    executionId,
    status,
    output,
    error,
    segments,
    durationMs,
    schemaValidation,
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
      ? { availableTools: buildAvailableTools(availableTools) } as unknown as BALExecutionOptions
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
      ? { availableTools: buildAvailableTools(availableTools) } as unknown as BALExecutionOptions
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
