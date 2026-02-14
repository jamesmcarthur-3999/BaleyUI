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
} from '@baleybots/core';
import { compileBALCode, executeBALCode } from '@baleyui/sdk';
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
  MissingCredentialsError,
  type AIProviderType,
} from './services/ai-credentials-service';
import { calculateCost as calculateExecutionCost } from './cost/usage-tracker';

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
  private readonly maxSize = 500;
  private readonly ttlMs = 10 * 60 * 1000; // 10 minutes

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
  /** BaleyBot name (for human-readable context in post-execution hooks) */
  baleybotName?: string;
  /** Available tools for the workspace (with actual functions) */
  availableTools: Map<string, RuntimeToolDefinition>;
  /** Workspace policies for tool governance */
  workspacePolicies: WorkspacePolicies | null;
  /** Trigger type for the execution */
  triggeredBy: 'manual' | 'schedule' | 'webhook' | 'other_bb' | 'internal';
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

type ExecuteBALCodeOptions = Parameters<typeof executeBALCode>[1];
type CompileBALCodeOptions = Parameters<typeof compileBALCode>[1];
type BALExecutionEvent = {
  type: string;
  event?: BaleybotStreamEvent;
  [key: string]: unknown;
};

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

    return 'openai:gpt-5-mini'; // Default fallback
  } catch {
    return 'openai:gpt-5-mini';
  }
}

// ============================================================================
// SHARED CONTEXT ENRICHMENT (with per-workspace cache)
// ============================================================================

/** Cached shared context per workspace (30-second TTL) */
const sharedContextCache = new Map<string, { block: string; timestamp: number }>();
const SHARED_CONTEXT_TTL = 30_000; // 30 seconds

async function getCachedSharedContextBlock(workspaceId: string): Promise<string> {
  const cached = sharedContextCache.get(workspaceId);
  if (cached && Date.now() - cached.timestamp < SHARED_CONTEXT_TTL) {
    return cached.block;
  }

  const { db, sharedContext, eq, and } = await import('@baleyui/db');

  const entries = await db.query.sharedContext.findMany({
    where: and(
      eq(sharedContext.workspaceId, workspaceId),
      eq(sharedContext.isActive, true)
    ),
  });

  const block = entries.length === 0
    ? ''
    : entries
        .map((e) => {
          const meta = e.fileMetadata as { fileName?: string } | null;
          const sourceHint = e.contentType === 'file' && meta?.fileName
            ? ` (from: ${meta.fileName})`
            : '';
          return `- ${e.key}${sourceHint}: ${e.value}`;
        })
        .join('\n');

  sharedContextCache.set(workspaceId, { block, timestamp: Date.now() });
  return block;
}

/**
 * Enrich user input with workspace-scoped shared context entries.
 * Returns the original input unchanged if no active entries exist.
 */
export async function buildInputWithSharedContext(
  workspaceId: string,
  userInput: string
): Promise<string> {
  const contextBlock = await getCachedSharedContextBlock(workspaceId);
  if (!contextBlock) return userInput;
  return `[Shared Context]\n${contextBlock}\n\n[User Input]\n${userInput}`;
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

  // Parallel: resolve provider config + pre-fetch shared context concurrently
  const shouldEnrichContext = ctx.triggeredBy !== 'internal';
  const [providerConfigResult, prefetchedContextBlock] = await Promise.all([
    resolveProviderConfig(ctx.workspaceId, preferredProvider).catch((err: unknown) => {
      logger.warn('Failed to resolve provider config', {
        workspaceId: ctx.workspaceId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      return undefined;
    }),
    shouldEnrichContext
      ? getCachedSharedContextBlock(ctx.workspaceId)
      : Promise.resolve(''),
  ]);

  const providerConfig = providerConfigResult;
  let actualProvider: AIProviderType | null = preferredProvider;

  if (providerConfig?.apiKey) {
    if (preferredProvider === 'anthropic' && !process.env.ANTHROPIC_API_KEY && process.env.OPENAI_API_KEY) {
      actualProvider = 'openai';
    } else if (preferredProvider === 'openai' && !process.env.OPENAI_API_KEY && process.env.ANTHROPIC_API_KEY) {
      actualProvider = 'anthropic';
    }
  }

  if (!providerConfig) {
    throw new MissingCredentialsError(
      'No AI provider configured. Connect an AI provider (OpenAI or Anthropic) in Integrations to start using BaleyBots.'
    );
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
    // Enrich input with workspace shared context (skip for internal BBs — they
    // do their own context enrichment and we don't want to dilute their prompts)
    const enrichedInput = !shouldEnrichContext || !prefetchedContextBlock
      ? input
      : `[Shared Context]\n${prefetchedContextBlock}\n\n[User Input]\n${input}`;

    // Build multimodal input if attachments are present
    const multimodalInput = options?.attachments?.length
      ? {
          text: enrichedInput,
          images: options.attachments
            .filter(a => a.mimeType.startsWith('image/'))
            .map(a => ({
              data: a.data,
              mediaType: a.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            })),
          file: options.attachments.find(a => a.mimeType === 'application/pdf')
            ? {
                data: options.attachments.find(a => a.mimeType === 'application/pdf')!.data,
                mimeType: 'application/pdf' as const,
              }
            : undefined,
        }
      : undefined;

    // Note: Using type assertion because we pass extended options (onToolCallApproval,
    // multimodalInput) that the SDK's public BALExecutionOptions doesn't fully expose.
    // input, model, providerConfig, and availableTools are all now properly typed.
    const executionOptions = {
      input: enrichedInput,
      multimodalInput,
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
        if (event.type === 'token' && event.event) {
          // Tag the event with entity name for downstream consumers
          const botName = event.botName as string | undefined;
          if (botName) {
            (event.event as Record<string, unknown>).__entityName = botName;
          }
          segments.push(event.event);
          options?.onSegment?.(event.event);
        }
      },
      signal: options?.signal,
    } as unknown as ExecuteBALCodeOptions;

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
  // EXTRACT TOKEN USAGE FROM SEGMENTS
  // ============================================================================

  let tokensInput = 0;
  let tokensOutput = 0;
  let apiCalls = 0;
  let toolCallCount = 0;
  let cacheCreationInputTokens = 0;
  let cacheReadInputTokens = 0;

  for (const segment of segments) {
    const seg = segment as Record<string, unknown>;
    if (seg.type === 'done' && typeof seg.usage === 'object' && seg.usage !== null) {
      const usage = seg.usage as Record<string, number>;
      tokensInput += usage.inputTokens ?? 0;
      tokensOutput += usage.outputTokens ?? 0;
      cacheCreationInputTokens += usage.cacheCreationInputTokens ?? 0;
      cacheReadInputTokens += usage.cacheReadInputTokens ?? 0;
      apiCalls += 1;
    }
    if (seg.type === 'tool_use_start') {
      toolCallCount += 1;
    }
  }

  const totalTokens = tokensInput + tokensOutput;
  const estimatedCost = totalTokens > 0
    ? calculateExecutionCost(tokensInput, tokensOutput, model, {
        cacheCreationInputTokens,
        cacheReadInputTokens,
      })
    : undefined;

  // ============================================================================
  // POST-EXECUTION: Analytics, Usage Tracking, and Alerts (parallel, non-blocking)
  // All service calls are fire-and-forget — failures don't affect results.
  // ============================================================================

  if (ctx.baleybotId) {
    const postHooks: Promise<void>[] = [];

    // 1. Record metrics (built-in defaults + BAL analytics block if present)
    postHooks.push(
      (async () => {
        const { metricsService } = await import('./analytics/metrics-service');
        const { getDefaultMetrics, extractAnalyticsFromBAL } = await import('./analytics/schema-parser');

        const metricsCtx = {
          workspaceId: ctx.workspaceId,
          baleybotId: ctx.baleybotId!,
          executionId,
          status: status === 'completed' ? 'completed' as const : 'failed' as const,
          durationMs,
          output,
        };

        const metricDefs = getDefaultMetrics();
        const analyticsSchema = extractAnalyticsFromBAL(balCode);
        if (analyticsSchema?.track) {
          metricDefs.push(...analyticsSchema.track);
        }
        await metricsService.recordMetrics(metricsCtx, metricDefs);
      })().catch((metricsErr) => {
        logger.warn('Metrics recording failed (non-fatal)', {
          executionId,
          error: metricsErr instanceof Error ? metricsErr.message : 'Unknown error',
        });
      })
    );

    // 2. Record usage/cost tracking
    postHooks.push(
      (async () => {
        const { recordUsageFromExecution } = await import('./cost/usage-tracker');
        await recordUsageFromExecution(
          ctx.workspaceId,
          ctx.baleybotId!,
          executionId,
          segments,
          durationMs,
        );
      })().catch((usageErr) => {
        logger.error('Usage tracking failed — billing data may be lost', {
          executionId,
          billing_data_lost: true,
          workspaceId: ctx.workspaceId,
          baleybotId: ctx.baleybotId,
          durationMs,
          error: usageErr instanceof Error ? usageErr.message : 'Unknown error',
        });
      })
    );

    // 3. Evaluate alert conditions on failure
    if (status === 'failed') {
      postHooks.push(
        (async () => {
          const { alertService } = await import('./analytics/alert-service');
          const { extractAnalyticsFromBAL } = await import('./analytics/schema-parser');
          const analyticsSchema = extractAnalyticsFromBAL(balCode);
          if (analyticsSchema?.alertWhen) {
            await alertService.evaluateAlerts(
              {
                workspaceId: ctx.workspaceId,
                baleybotId: ctx.baleybotId!,
                executionId,
              },
              analyticsSchema.alertWhen,
            );
          }
        })().catch((alertErr) => {
          logger.warn('Alert evaluation failed (non-fatal)', {
            executionId,
            error: alertErr instanceof Error ? alertErr.message : 'Unknown error',
          });
        })
      );
    }

    // 4. Error resolution pipeline
    if (status === 'failed' && ctx.triggeredBy !== 'internal') {
      postHooks.push(
        (async () => {
          const { processError } = await import('./services/error-resolution-service');
          await processError({
            workspaceId: ctx.workspaceId,
            sourceType: 'execution',
            sourceId: executionId,
            baleybotId: ctx.baleybotId!,
            baleybotName: ctx.baleybotName ?? '',
            balCode,
            input,
            output,
            error: error ?? 'Unknown error',
            durationMs,
            segments,
          });
        })().catch(() => {
          logger.warn('Error resolution failed (non-fatal)', { executionId });
        })
      );
    }

    // 5. Success analysis pipeline
    if (status === 'completed' && ctx.triggeredBy !== 'internal') {
      postHooks.push(
        (async () => {
          const { analyzeSuccessfulExecution } = await import('./services/post-execution-analysis');
          await analyzeSuccessfulExecution({
            workspaceId: ctx.workspaceId,
            baleybotId: ctx.baleybotId!,
            baleybotName: ctx.baleybotName ?? '',
            balCode,
            executionId,
            input,
            output,
            durationMs,
            segments,
          });
        })().catch(() => {
          logger.warn('Post-execution analysis failed (non-fatal)', { executionId });
        })
      );
    }

    // Fire all post-execution hooks in parallel (don't await — fire-and-forget)
    void Promise.allSettled(postHooks);
  }

  return {
    executionId,
    status,
    output,
    error,
    segments,
    durationMs,
    model,
    tokensInput: tokensInput || undefined,
    tokensOutput: tokensOutput || undefined,
    tokenCount: totalTokens || undefined,
    estimatedCost,
    schemaValidation,
    apiCalls: apiCalls || undefined,
    toolCallCount: toolCallCount || undefined,
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
      ? { availableTools: buildAvailableTools(availableTools) } as unknown as CompileBALCodeOptions
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
      ? { availableTools: buildAvailableTools(availableTools) } as unknown as CompileBALCodeOptions
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
