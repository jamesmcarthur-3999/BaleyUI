import { z } from 'zod';
import { router, roleProcedure, editorProcedure, operatorProcedure, adminProcedure } from '../trpc';
import {
  baleybots,
  baleybotExecutions,
  baleybotTriggers,
  connections,
  sharedContext,
  eq,
  lt,
  and,
  desc,
  notDeleted,
  softDelete,
  updateWithLock,
  sql,
  inArray,
} from '@baleyui/db';
import { TRPCError } from '@trpc/server';
import { sanitizeCreatorText } from '@/lib/baleybot/creator-sanitization';
import { canExecute, executeBaleybot, type ExecutorContext } from '@/lib/baleybot/executor';
import { buildCreatorRequestContext } from '@/lib/baleybot/creator-request-context';
import { executeInternalBaleybot } from '@/lib/baleybot/internal-baleybots';
import { runCreatorActionAdvisor } from '@/lib/baleybot/internal-bb/runner';
import { buildConnectionTools } from '@/lib/baleybot/tools/companion/connections';
import { creatorOutputSchema } from '@/lib/baleybot/creator-types';
import { compileBALCode } from '@baleyui/sdk';
import { sanitizeErrorMessage, isUserFacingError } from '@/lib/errors/sanitize';
import { parseBalCode } from '@/lib/baleybot/bal-parser-pure';
import { evaluateLaunchReadiness, buildLaunchKit, buildDefaultRuntimeInterface } from '@/lib/baleybot/launch-prep';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import {
  verifyNestedOwnership,
  withErrorHandling,
  throwNotFound,
  nameSchema,
  descriptionSchema,
  uuidSchema,
  versionSchema,
} from '../helpers';
import { createLogger } from '@/lib/logger';
import {
  runConnectionAdvisor,
  runDeploymentAdvisor,
  runTestGenerator,
  runTestOrchestrator,
  runTestResultsAnalyzer,
  runTestValidator,
} from '@/lib/baleybot/internal-bb/runner';
import { initializeBuiltInToolServices, getWorkspaceTavilyKey } from '@/lib/baleybot/services';
import { sharedStorageService } from '@/lib/baleybot/services/shared-storage-service';
import { configureWebSearch } from '@/lib/baleybot/tools/built-in/implementations';
import type { BuiltInToolContext } from '@/lib/baleybot/tools/built-in';
import { loadExecutionTools } from '@/lib/baleybot/services/execution-tools-loader';
import type { TriggerType } from '@/lib/baleybot/types';
import { decrypt } from '@/lib/encryption';
import { assertQuota } from '@/lib/billing/service';
import { testConnection } from '@/lib/connections/test';
import type { ConnectionConfig } from '@/lib/types';
import {
  evaluateToolConnectionBinding,
  parseConnectionTool,
  connectionNameToSlug,
} from '@/lib/baleybot/tools/requirements-scanner';
import { validateAndNormalizeTriggerConfig } from '@/lib/baleybot/types';
import {
  evaluateOutputMatch,
  MATCH_STRATEGIES,
  type MatchStrategy,
} from '@/lib/baleybot/testing/output-match';

const log = createLogger('baleybots-router');

/**
 * Status values for BaleyBots
 */
const baleybotStatusSchema = z.enum(['draft', 'active', 'paused', 'error']);

/**
 * Status values for BaleyBot executions
 */
const executionStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']);

/**
 * Trigger types for executions
 */
const triggerTypeSchema = z.enum(['manual', 'schedule', 'webhook', 'other_bb', 'db_event', 'mcp_event', 'file_upload']);

type WorkspaceConnectionLite = {
  id: string;
  type: string;
  name: string;
  status: string | null;
  config?: unknown;
};

function decryptMaybe(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

function decryptConfigForProvider(type: string, rawConfig: unknown): ConnectionConfig {
  const config = (rawConfig ?? {}) as ConnectionConfig;
  if (type === 'postgres' || type === 'mysql') {
    return {
      ...config,
      password: decryptMaybe(config.password as string | undefined),
    };
  }
  return {
    ...config,
    apiKey: decryptMaybe(config.apiKey as string | undefined),
  };
}

function buildToolProbeArgs(toolName: string): Record<string, unknown> | null {
  if (toolName === 'fetch_url') {
    return {
      url: 'https://example.com',
      format: 'text',
    };
  }
  if (toolName === 'web_search') {
    return {
      query: 'BaleyUI platform',
      num_results: 1,
      search_depth: 'basic',
    };
  }
  if (toolName === 'store_memory') {
    return {
      action: 'list',
    };
  }
  if (toolName === 'shared_storage') {
    return {
      action: 'list',
    };
  }
  return null;
}

function getToolVerificationNextSteps(args: {
  toolName: string;
  status: 'needs_setup' | 'failed';
  reason: string;
  hasAiProvider: boolean;
  expectedConnectionType?: 'postgres' | 'mysql' | null;
  expectedConnectionSlug?: string;
}): string[] {
  const steps: string[] = [];

  if (
    args.toolName === 'web_search' &&
    !hasProcessEnvKey('TAVILY_API_KEY') &&
    !args.hasAiProvider
  ) {
    steps.push('Add an AI provider connection (OpenAI, Anthropic, or Ollama).');
    steps.push('Optional: configure TAVILY_API_KEY for higher-quality search results.');
  }

  if (args.expectedConnectionType === 'postgres' || args.expectedConnectionType === 'mysql') {
    const typeLabel = args.expectedConnectionType === 'postgres' ? 'PostgreSQL' : 'MySQL';
    if (args.expectedConnectionSlug) {
      steps.push(
        `Create or map a ${typeLabel} source named "${args.expectedConnectionSlug}" (slug match) or remap the tool binding.`
      );
    } else {
      steps.push(`Add a connected ${typeLabel} source.`);
    }
    steps.push('After connecting, click "Verify Tool" again to confirm runtime readiness.');
  }

  if (steps.length === 0) {
    steps.push(args.reason);
  }

  return steps;
}

function hasProcessEnvKey(name: string): boolean {
  const value = process.env[name];
  return Boolean(value && value.trim().length > 0);
}

function sanitizeConversationHistoryForStorage(
  history: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
  }> | undefined
) {
  if (!history) return undefined;

  return history.slice(-50).map((message) => ({
    id: message.id,
    role: message.role,
    content: sanitizeCreatorText(message.content),
    timestamp: message.timestamp.toISOString(),
    ...(message.metadata ? { metadata: message.metadata } : {}),
  }));
}

/**
 * tRPC router for managing BaleyBots (BAL-first architecture).
 */
export const baleybotsRouter = router({
  // ========================================================================
  // QUERIES
  // ========================================================================

  /**
   * List all BaleyBots for the workspace.
   * API-004: Return only necessary fields for list view
   */
  list: roleProcedure
    .input(
      z.object({
        status: baleybotStatusSchema.optional(),
        limit: z.number().int().min(1).max(100).optional().default(50),
        cursor: uuidSchema.optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(baleybots.workspaceId, ctx.workspace.id),
        eq(baleybots.isInternal, false),
        notDeleted(baleybots),
      ];

      if (input?.status) {
        conditions.push(eq(baleybots.status, input.status));
      }

      // Cursor-based pagination: fetch items created before the cursor
      if (input?.cursor) {
        const cursorBot = await ctx.db.query.baleybots.findFirst({
          where: eq(baleybots.id, input.cursor),
          columns: { createdAt: true },
        });
        if (cursorBot) {
          conditions.push(lt(baleybots.createdAt, cursorBot.createdAt));
        }
      }

      const limit = input?.limit ?? 50;

      // API-004: Select only fields needed for list display
      const allBaleybots = await ctx.db.query.baleybots.findMany({
        where: and(...conditions),
        columns: {
          id: true,
          name: true,
          description: true,
          icon: true,
          status: true,
          executionCount: true,
          lastExecutedAt: true,
          createdAt: true,
          updatedAt: true,
          version: true,
          // Exclude heavy fields: balCode, structure, entityNames, dependencies, conversationHistory
        },
        orderBy: [desc(baleybots.createdAt)],
        limit: limit + 1, // Fetch one extra to determine if there's a next page
        with: {
          executions: {
            limit: 1,
            orderBy: [desc(baleybotExecutions.createdAt)],
            columns: {
              id: true,
              status: true,
              createdAt: true,
              completedAt: true,
              durationMs: true,
            },
          },
        },
      });

      const hasMore = allBaleybots.length > limit;
      const items = hasMore ? allBaleybots.slice(0, limit) : allBaleybots;
      const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

      return {
        items: items.map((bb) => ({
          ...bb,
          lastExecution: bb.executions[0] ?? null,
          executions: undefined, // Don't include full executions array
        })),
        nextCursor,
      };
    }),

  /**
   * Get a single BaleyBot by ID with recent executions.
   */
  get: roleProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const baleybot = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.id),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots)
        ),
        with: {
          executions: {
            columns: {
              id: true,
              status: true,
              error: true,
              triggeredBy: true,
              startedAt: true,
              completedAt: true,
              durationMs: true,
              createdAt: true,
            },
            limit: 10,
            orderBy: [desc(baleybotExecutions.createdAt)],
          },
        },
      });

      if (!baleybot) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'BaleyBot not found',
        });
      }

      return baleybot;
    }),

  // ========================================================================
  // MUTATIONS
  // ========================================================================

  /**
   * Create a new BaleyBot from BAL code.
   * API-001: Stricter input validation
   */
  create: editorProcedure
    .input(
      z.object({
        name: nameSchema,
        description: descriptionSchema,
        icon: z.string().max(100).regex(/^[\p{Emoji}\w-]*$/u, 'Invalid icon format').optional(),
        balCode: z.string().min(1, 'BAL code is required').max(100000, 'BAL code exceeds maximum size'),
        // Optional structure cache (computed by BAL generator)
        structure: z.record(z.string(), z.unknown()).optional(),
        entityNames: z.array(z.string().min(1).max(255)).max(100).optional(),
        dependencies: z.array(uuidSchema).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify any BB dependencies exist and belong to workspace
      if (input.dependencies && input.dependencies.length > 0) {
        // PERF-002: Use inArray() filter at database level instead of loading all and filtering in JS
        const existingBBs = await ctx.db.query.baleybots.findMany({
          where: and(
            eq(baleybots.workspaceId, ctx.workspace.id),
            notDeleted(baleybots),
            inArray(baleybots.id, input.dependencies)
          ),
          columns: { id: true },
        });

        // PERF-004: Use Set.has() for O(1) lookup instead of Array.includes()
        const existingIdSet = new Set(existingBBs.map((bb) => bb.id));
        const invalidIds = input.dependencies.filter((id) => !existingIdSet.has(id));

        if (invalidIds.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid BaleyBot dependencies: ${invalidIds.join(', ')}`,
          });
        }
      }

      const [baleybot] = await ctx.db
        .insert(baleybots)
        .values({
          workspaceId: ctx.workspace.id,
          name: input.name,
          description: input.description,
          icon: input.icon,
          status: 'draft',
          balCode: input.balCode,
          structure: input.structure,
          entityNames: input.entityNames,
          dependencies: input.dependencies,
          executionCount: 0,
          createdBy: ctx.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      return baleybot;
    }),

  /**
   * Update a BaleyBot with optimistic locking.
   * API-001: Stricter input validation
   */
  update: editorProcedure
    .input(
      z.object({
        id: uuidSchema,
        version: versionSchema,
        name: nameSchema.optional(),
        description: descriptionSchema,
        icon: z.string().max(100).regex(/^[\p{Emoji}\w-]*$/u, 'Invalid icon format').optional(),
        balCode: z.string().min(1, 'BAL code is required').max(100000, 'BAL code exceeds maximum size').optional(),
        status: baleybotStatusSchema.optional(),
        structure: z.record(z.string(), z.unknown()).optional(),
        entityNames: z.array(z.string().min(1).max(255)).max(100).optional(),
        dependencies: z.array(uuidSchema).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate BAL syntax if balCode is being updated
      if (input.balCode) {
        const validation = canExecute(input.balCode);
        if (!validation.valid) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid BAL code: ${validation.errors.slice(0, 3).join('; ')}`,
          });
        }
      }

      // Verify BaleyBot exists and belongs to workspace
      const existing = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.id),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'BaleyBot not found',
        });
      }

      // Verify any BB dependencies exist and belong to workspace
      if (input.dependencies && input.dependencies.length > 0) {
        // Filter out self-reference before querying
        const depsToCheck = input.dependencies.filter((id) => id !== input.id);

        if (depsToCheck.length > 0) {
          // PERF-002: Use inArray() filter at database level instead of loading all and filtering in JS
          const existingBBs = await ctx.db.query.baleybots.findMany({
            where: and(
              eq(baleybots.workspaceId, ctx.workspace.id),
              notDeleted(baleybots),
              inArray(baleybots.id, depsToCheck)
            ),
            columns: { id: true },
          });

          // PERF-004: Use Set.has() for O(1) lookup instead of Array.includes()
          const existingIdSet = new Set(existingBBs.map((bb) => bb.id));
          const invalidIds = depsToCheck.filter((id) => !existingIdSet.has(id));

          if (invalidIds.length > 0) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Invalid BaleyBot dependencies: ${invalidIds.join(', ')}`,
            });
          }
        }
      }

      // Prepare update data (only include fields that are provided)
      const updateData: Record<string, unknown> = {};

      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.icon !== undefined) updateData.icon = input.icon;
      if (input.balCode !== undefined) updateData.balCode = input.balCode;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.structure !== undefined) updateData.structure = input.structure;
      if (input.entityNames !== undefined) updateData.entityNames = input.entityNames;
      if (input.dependencies !== undefined) updateData.dependencies = input.dependencies;

      // API-002: Use shared error handling helper
      return await withErrorHandling(
        () => updateWithLock(baleybots, input.id, input.version, updateData),
        'BaleyBot'
      );
    }),

  /**
   * Delete a BaleyBot (soft delete).
   */
  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify BaleyBot exists and belongs to workspace
      const existing = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.id),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'BaleyBot not found',
        });
      }

      // API key auth has null userId - use fallback for audit trail
      const deleted = await softDelete(baleybots, input.id, ctx.userId ?? 'system:api-key');

      return deleted;
    }),

  /**
   * Activate a BaleyBot (set status to active).
   */
  activate: editorProcedure
    .input(z.object({ id: z.string().uuid(), version: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.id),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'BaleyBot not found',
        });
      }

      const updated = await updateWithLock(baleybots, input.id, input.version, {
        status: 'active',
        lifecycleStage: existing.lifecycleStage === 'paused' ? 'live' : existing.lifecycleStage,
        liveAt: existing.liveAt ?? new Date(),
      });

      return updated;
    }),

  /**
   * Pause a BaleyBot (set status to paused).
   */
  pause: editorProcedure
    .input(z.object({ id: z.string().uuid(), version: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.id),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'BaleyBot not found',
        });
      }

      const updated = await updateWithLock(baleybots, input.id, input.version, {
        status: 'paused',
        lifecycleStage: 'paused',
        pausedAt: new Date(),
      });

      return updated;
    }),

  // ========================================================================
  // EXECUTION
  // ========================================================================

  /**
   * Execute a BaleyBot with input.
   * Uses a database transaction to prevent race conditions during execution.
   * The BAL execution runs inside the transaction so it will be rolled back on error.
   */
  execute: operatorProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        input: z.unknown().optional(),
        triggeredBy: triggerTypeSchema.optional().default('manual'),
        triggerSource: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const isTestExecution =
        typeof input.triggerSource === 'string' &&
        input.triggerSource.startsWith('test_runner');

      // Use a higher budget for test-suite executions while keeping user/workspace scoping.
      await checkRateLimit(
        `execute:${ctx.workspace.id}:${ctx.userId}:${isTestExecution ? 'test' : 'default'}`,
        isTestExecution ? RATE_LIMITS.executeTest : RATE_LIMITS.execute
      );

      log.info('Executing baleybot', { baleybotId: input.id, triggeredBy: input.triggeredBy });

      // Check billing quota before execution
      await assertQuota(ctx.workspace.id);

      // Verify BaleyBot exists and belongs to workspace (outside transaction for early validation)
      const baleybot = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.id),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots)
        ),
      });

      if (!baleybot) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'BaleyBot not found',
        });
      }

      // Check if BaleyBot is active (or allow execution in draft for testing)
      if (baleybot.status === 'error') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Cannot execute BaleyBot in error state',
        });
      }

      // Create execution record and update count in a transaction
      const execution = await ctx.db.transaction(async (tx) => {
        const [exec] = await tx
          .insert(baleybotExecutions)
          .values({
            baleybotId: input.id,
            status: 'pending',
            input: input.input,
            triggeredBy: input.triggeredBy,
            triggerSource: input.triggerSource,
            createdAt: new Date(),
          })
          .returning();

        if (!exec) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create execution record',
          });
        }

        // Update execution count atomically using sql template literal
        await tx
          .update(baleybots)
          .set({
            executionCount: sql`${baleybots.executionCount} + 1`,
            lastExecutedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(baleybots.id, input.id));

        return exec;
      });

      // Execute through the unified executor (handles analytics, usage tracking, alerts)
      const startTime = Date.now();
      try {
        // Update status to running
        await ctx.db
          .update(baleybotExecutions)
          .set({ status: 'running', startedAt: new Date() })
          .where(eq(baleybotExecutions.id, execution.id));

        // Configure web search if Tavily key is available (env or workspace DB)
        const tavilyKey = await getWorkspaceTavilyKey(ctx.workspace.id);
        if (tavilyKey) {
          configureWebSearch(tavilyKey);
        }

        // Initialize built-in tool services (spawn, notify, schedule, memory)
        initializeBuiltInToolServices();

        // Build tool context for this execution
        const toolCtx: BuiltInToolContext = {
          workspaceId: ctx.workspace.id,
          baleybotId: input.id,
          executionId: execution.id,
          userId: ctx.userId!,
        };

        // Load all tool categories (built-in + connection-derived + workspace)
        const { runtimeTools } = await loadExecutionTools({
          workspaceId: ctx.workspace.id,
          toolCtx,
        });

        log.info('Loaded tools for execution', {
          executionId: execution.id,
          tools: Array.from(runtimeTools.keys()),
        });

        // Execute through the unified executor path
        const executorCtx: ExecutorContext = {
          workspaceId: ctx.workspace.id,
          baleybotId: input.id,
          baleybotName: baleybot.name,
          availableTools: runtimeTools,
          workspacePolicies: null,
          triggeredBy: (input.triggeredBy as ExecutorContext['triggeredBy']) || 'manual',
          triggerSource: input.triggerSource ?? undefined,
        };

        const inputStr = input.input ? JSON.stringify(input.input) : undefined;
        const result = await executeBaleybot(baleybot.balCode, inputStr ?? '', executorCtx);

        log.info('Baleybot execution completed', {
          baleybotId: input.id,
          executionId: execution.id,
          status: result.status,
          durationMs: result.durationMs,
          model: result.model,
          tokensInput: result.tokensInput,
          tokensOutput: result.tokensOutput,
        });

        // Update execution with result (including usage data for analytics)
        await ctx.db
          .update(baleybotExecutions)
          .set({
            status: result.status,
            output: result.output,
            error: result.error,
            segments: result.segments,
            completedAt: new Date(),
            durationMs: result.durationMs,
            tokenCount: result.tokenCount,
            model: result.model,
            tokensInput: result.tokensInput,
            tokensOutput: result.tokensOutput,
            estimatedCost: result.estimatedCost,
          })
          .where(eq(baleybotExecutions.id, execution.id));

        // Return updated execution
        const updatedExecution = await ctx.db.query.baleybotExecutions.findFirst({
          where: eq(baleybotExecutions.id, execution.id),
        });

        return updatedExecution || execution;
      } catch (error) {
        const duration = Date.now() - startTime;
        const internalErrorMessage = error instanceof Error ? error.message : String(error);

        log.error('Baleybot execution failed', {
          error: error instanceof Error ? error.message : String(error),
          baleybotId: input.id,
          executionId: execution.id,
          durationMs: duration,
        });

        // Update execution with error OUTSIDE transaction so it persists
        await ctx.db
          .update(baleybotExecutions)
          .set({
            status: 'failed',
            error: internalErrorMessage,
            completedAt: new Date(),
            durationMs: duration,
          })
          .where(eq(baleybotExecutions.id, execution.id));

        // Sanitize error message before sending to client
        const errorMessage = isUserFacingError(error)
          ? sanitizeErrorMessage(error)
          : 'Execution failed due to an internal error';

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: errorMessage,
        });
      }
    }),

  /**
   * List executions for a BaleyBot.
   * API-004: Return only necessary fields for list view
   */
  listExecutions: roleProcedure
    .input(
      z.object({
        baleybotId: uuidSchema,
        status: executionStatusSchema.optional(),
        limit: z.number().int().min(1).max(100).optional().default(20),
        cursor: uuidSchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify BaleyBot exists and belongs to workspace
      const baleybot = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.baleybotId),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots)
        ),
        columns: { id: true }, // Only need to verify existence
      });

      if (!baleybot) {
        throwNotFound('BaleyBot');
      }

      const conditions = [eq(baleybotExecutions.baleybotId, input.baleybotId)];

      if (input.status) {
        conditions.push(eq(baleybotExecutions.status, input.status));
      }

      // API-004: Select only fields needed for list display
      const executions = await ctx.db.query.baleybotExecutions.findMany({
        where: and(...conditions),
        columns: {
          id: true,
          baleybotId: true,
          status: true,
          triggeredBy: true,
          triggerSource: true,
          startedAt: true,
          completedAt: true,
          durationMs: true,
          createdAt: true,
          // Exclude heavy fields: input, output, error, segments
        },
        orderBy: [desc(baleybotExecutions.createdAt)],
        limit: input.limit,
      });

      return executions;
    }),

  /**
   * Get a single execution by ID.
   */
  getExecution: roleProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const execution = await ctx.db.query.baleybotExecutions.findFirst({
        where: eq(baleybotExecutions.id, input.id),
        with: {
          baleybot: true,
        },
      });

      if (!execution) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Execution not found',
        });
      }

      // Verify the BaleyBot exists and belongs to the workspace
      verifyNestedOwnership(execution.baleybot, ctx.workspace.id, 'Execution');

      return execution;
    }),

  /**
   * Get recent activity across all BaleyBots in the workspace.
   */
  getRecentActivity: roleProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).optional().default(20),
        cursor: z.string().uuid().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      const cursor = input?.cursor;

      // Build where conditions
      const conditions = [
        eq(baleybots.workspaceId, ctx.workspace.id),
        notDeleted(baleybots),
      ];

      // Cursor-based pagination: fetch items older than the cursor
      if (cursor) {
        conditions.push(lt(baleybotExecutions.id, cursor));
      }

      // Fetch one extra to determine if there's a next page
      const executions = await ctx.db
        .select({
          id: baleybotExecutions.id,
          baleybotId: baleybotExecutions.baleybotId,
          status: baleybotExecutions.status,
          triggeredBy: baleybotExecutions.triggeredBy,
          startedAt: baleybotExecutions.startedAt,
          completedAt: baleybotExecutions.completedAt,
          durationMs: baleybotExecutions.durationMs,
          error: baleybotExecutions.error,
          createdAt: baleybotExecutions.createdAt,
          baleybotName: baleybots.name,
          baleybotIcon: baleybots.icon,
        })
        .from(baleybotExecutions)
        .innerJoin(baleybots, eq(baleybotExecutions.baleybotId, baleybots.id))
        .where(and(...conditions))
        .orderBy(desc(baleybotExecutions.createdAt))
        .limit(limit + 1);

      const hasMore = executions.length > limit;
      const items = hasMore ? executions.slice(0, limit) : executions;
      const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

      return {
        items: items.map((exec) => ({
          ...exec,
          baleybot: { id: exec.baleybotId, name: exec.baleybotName, icon: exec.baleybotIcon },
        })),
        nextCursor,
      };
    }),

  /**
   * Get BaleyBots that depend on a specific BaleyBot.
   */
  getDependents: roleProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Use SQL JSONB contains operator to find BBs with this dependency
      const dependents = await ctx.db.query.baleybots.findMany({
        where: and(
          eq(baleybots.workspaceId, ctx.workspace.id),
          sql`${baleybots.dependencies}::jsonb @> ${JSON.stringify([input.id])}::jsonb`,
          notDeleted(baleybots)
        ),
      });

      return dependents;
    }),

  // ===== Approval System Endpoints =====
  // NOTE: listApprovalPatterns, createApprovalPattern, revokeApprovalPattern,
  // and recordPatternUsage are on the policies router.

  /**
   * Handle approval decision for a pending tool call.
   * This is called when a user approves or denies a tool execution.
   */
  handleApprovalDecision: operatorProcedure
    .input(
      z.object({
        executionId: z.string().uuid(),
        toolCallId: z.string(),
        approved: z.boolean(),
        denyReason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the execution belongs to a BB in this workspace
      const execution = await ctx.db.query.baleybotExecutions.findFirst({
        where: eq(baleybotExecutions.id, input.executionId),
        with: { baleybot: true },
      });

      if (!execution) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Execution not found',
        });
      }

      // Verify the BaleyBot exists and belongs to the workspace
      verifyNestedOwnership(execution.baleybot, ctx.workspace.id, 'Execution');

      // In a real implementation, this would:
      // 1. Find the pending approval request in the execution state
      // 2. Resume the execution with the approval decision
      // For now, we just record the decision

      // Append segment atomically using SQL jsonb concatenation to prevent race conditions
      const newSegment = {
        type: 'approval_decision',
        toolCallId: input.toolCallId,
        approved: input.approved,
        denyReason: input.denyReason,
        decidedBy: ctx.userId,
        decidedAt: new Date().toISOString(),
      };

      await ctx.db.execute(sql`
        UPDATE baleybot_executions
        SET segments = COALESCE(segments, '[]'::jsonb) || ${JSON.stringify([newSegment])}::jsonb
        WHERE id = ${input.executionId}
      `);

      return {
        approved: input.approved,
        executionId: input.executionId,
        toolCallId: input.toolCallId,
      };
    }),

  // ========================================================================
  // CREATOR
  // ========================================================================

  /**
   * Send a message to the Creator Bot and get a response.
   * Used for conversational BaleyBot creation.
   */
  sendCreatorMessage: editorProcedure
    .input(
      z.object({
        baleybotId: z.string().uuid().optional(),
        message: z.string().min(1).max(10000),
        conversationHistory: z
          .array(
            z.object({
              id: z.string(),
              role: z.enum(['user', 'assistant']),
              content: z.string(),
              timestamp: z.coerce.date(),
              metadata: z.record(z.string(), z.unknown()).optional(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await checkRateLimit(
        `creatorForeground:${ctx.workspace.id}:${ctx.userId}`,
        RATE_LIMITS.creatorMessage,
      );

      const creatorContext = await buildCreatorRequestContext({
        db: ctx.db,
        workspaceId: ctx.workspace.id,
        message: input.message,
        conversationHistory: input.conversationHistory,
      });

      // Fetch active shared context for creator bot awareness
      const sharedContextEntries = await ctx.db.query.sharedContext.findMany({
        where: and(
          eq(sharedContext.workspaceId, ctx.workspace.id),
          eq(sharedContext.isActive, true)
        ),
      });

      // Build input for creator_bot (non-streaming path)
      const contextParts: string[] = [];

      if (sharedContextEntries.length > 0) {
        const formatted = sharedContextEntries
          .map((e) => `- ${e.key}: ${e.value}`)
          .join('\n');
        contextParts.push(`Workspace Knowledge & Standards:\n${formatted}`);
      }

      if (creatorContext.context.availableTools.length > 0) {
        contextParts.push(`Available tools: ${creatorContext.context.availableTools.map(t => t.name).join(', ')}`);
      }
      if (creatorContext.conversationHistory.length > 0) {
        const history = creatorContext.conversationHistory.slice(-16)
          .map(m => `${m.role}: ${m.content.slice(0, 900)}`)
          .join('\n');
        contextParts.push(`Conversation history:\n${history}`);
      }
      contextParts.push(`User message: ${creatorContext.sanitizedMessage}`);

      // Inject companion tools so creator_bot's BAL passes semantic validation
      const connectionTools = buildConnectionTools({
        workspaceId: ctx.workspace.id,
        userId: ctx.userId!,
      });

      const { output } = await executeInternalBaleybot(
        'creator_bot',
        contextParts.join('\n\n'),
        {
          userWorkspaceId: ctx.workspace.id,
          triggeredBy: 'internal',
          injectedTools: connectionTools,
        }
      );

      // Parse the concierge output through the creator output schema
      const parsed = creatorOutputSchema.safeParse(output);
      if (parsed.success) {
        return parsed.data;
      }

      // Fallback: return a building response with the raw text
      return creatorOutputSchema.parse({
        message: typeof output === 'string' ? output : JSON.stringify(output),
        status: 'building',
      });
    }),

  /**
   * Context-aware creator guidance actions. Canonical source for next-action suggestions.
   */
  getCreatorGuidance: editorProcedure
    .input(
      z.object({
        status: z.enum(['empty', 'building', 'ready', 'running', 'error']),
        messages: z.array(
          z.object({
            role: z.enum(['user', 'assistant']),
            content: z.string().max(4000),
            metadata: z.record(z.string(), z.unknown()).optional(),
          })
        ).max(30),
        readinessContext: z.string().max(500).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (input.status === 'running') {
        return { actions: [] };
      }

      await checkRateLimit(
        `creatorGuidanceBackground:${ctx.workspace.id}:${ctx.userId}`,
        RATE_LIMITS.creatorGuidance,
      );

      const recentTranscript = input.messages
        .slice(-10)
        .map(m => `${m.role}: ${m.content.slice(0, 400)}`)
        .join('\n');
      const advisorInput = [
        `Status: ${input.status}`,
        input.readinessContext ? `Context: ${input.readinessContext}` : null,
        `Recent conversation:\n${recentTranscript}`,
      ].filter(Boolean).join('\n');
      const result = await runCreatorActionAdvisor(advisorInput, {
        userWorkspaceId: ctx.workspace.id,
      });
      return { actions: result?.actions ?? [] };
    }),

  /**
   * Generate context-aware next actions for the creator UI.
   * Compatibility alias for getCreatorGuidance.
   */
  getCreatorSuggestedActions: editorProcedure
    .input(
      z.object({
        status: z.enum(['empty', 'building', 'ready', 'running', 'error']),
        messages: z.array(
          z.object({
            role: z.enum(['user', 'assistant']),
            content: z.string().max(4000),
            metadata: z.record(z.string(), z.unknown()).optional(),
          })
        ).max(30),
      })
    )
    .query(async ({ ctx, input }) => {
      if (input.status === 'running') {
        return { actions: [] };
      }
      await checkRateLimit(
        `creatorActionsBackground:${ctx.workspace.id}:${ctx.userId}`,
        RATE_LIMITS.creatorGuidance,
      );
      const recentTranscript = input.messages
        .slice(-10)
        .map(m => `${m.role}: ${m.content.slice(0, 400)}`)
        .join('\n');
      const advisorInput = `Status: ${input.status}\nRecent conversation:\n${recentTranscript}`;
      const result = await runCreatorActionAdvisor(advisorInput, {
        userWorkspaceId: ctx.workspace.id,
      });
      return { actions: result?.actions ?? [] };
    }),

  /**
   * Save a creation session as a BaleyBot.
   * Creates a new BaleyBot or updates an existing one.
   */
  saveFromSession: editorProcedure
    .input(
      z.object({
        baleybotId: z.string().uuid().optional(),
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        icon: z.string().max(100).optional(),
        balCode: z.string().min(1),
        // Optional structure cache (computed by BAL generator)
        structure: z.record(z.string(), z.unknown()).optional(),
        entityNames: z.array(z.string()).optional(),
        conversationHistory: z
          .array(
            z.object({
              id: z.string(),
              role: z.enum(['user', 'assistant']),
              content: z.string(),
              timestamp: z.coerce.date(),
              metadata: z.record(z.string(), z.unknown()).optional(),
            })
          )
          .optional(),
        // When true, re-fetches current version to bypass optimistic lock conflicts
        forceOverwrite: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate BAL syntax before saving
      const validation = canExecute(input.balCode);
      if (!validation.valid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid BAL code: ${validation.errors.slice(0, 3).join('; ')}`,
        });
      }

      if (input.baleybotId) {
        // Capture the ID for use in closure (TypeScript narrowing)
        const baleybotId = input.baleybotId;

        // Update existing BaleyBot
        const existing = await ctx.db.query.baleybots.findFirst({
          where: and(
            eq(baleybots.id, baleybotId),
            eq(baleybots.workspaceId, ctx.workspace.id),
            notDeleted(baleybots)
          ),
        });

        if (!existing) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'BaleyBot not found',
          });
        }

        // When forceOverwrite, re-fetch current version to avoid lock conflict loop
        const saveVersion = input.forceOverwrite
          ? (await ctx.db.query.baleybots.findFirst({
              where: eq(baleybots.id, baleybotId),
              columns: { version: true },
            }))?.version ?? existing.version
          : existing.version;

        // Normalize whitespace before comparing to ignore cosmetic BAL formatting changes
        const normalizeWs = (s: string) => s.replace(/\s+/g, ' ').trim();
        const balCodeChanged = normalizeWs(input.balCode) !== normalizeWs(existing.balCode);

        const truncatedHistory = sanitizeConversationHistoryForStorage(input.conversationHistory);

        // API-002: Use shared error handling helper
        return await withErrorHandling(
          () => updateWithLock(baleybots, baleybotId, saveVersion, {
            name: input.name,
            description: input.description,
            icon: input.icon,
            balCode: input.balCode,
            structure: input.structure,
            entityNames: input.entityNames,
            conversationHistory: truncatedHistory,
            lifecycleStage: balCodeChanged ? 'draft' : existing.lifecycleStage,
            launchKit: balCodeChanged ? null : existing.launchKit,
            runtimeInterfaceSpec: balCodeChanged ? null : existing.runtimeInterfaceSpec,
            launchPreparedAt: balCodeChanged ? null : existing.launchPreparedAt,
            liveAt: balCodeChanged ? null : existing.liveAt,
          }),
          'BaleyBot'
        );
      } else {
        const truncatedHistory = sanitizeConversationHistoryForStorage(input.conversationHistory);

        // Create new BaleyBot
        const [baleybot] = await ctx.db
          .insert(baleybots)
          .values({
            workspaceId: ctx.workspace.id,
            name: input.name,
            description: input.description,
            icon: input.icon,
            status: 'draft',
            balCode: input.balCode,
            structure: input.structure,
            entityNames: input.entityNames,
            conversationHistory: truncatedHistory,
            executionCount: 0,
            lifecycleStage: 'draft',
            createdBy: ctx.userId,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        return baleybot;
      }
    }),

  // ========================================================================
  // TESTING
  // ========================================================================

  /**
   * Save test cases as JSON on the baleybots row.
   */
  saveTestCases: editorProcedure
    .input(z.object({
      id: z.string().uuid(),
      testCases: z.array(z.object({
        id: z.string(),
        name: z.string(),
        level: z.enum(['unit', 'integration', 'e2e']),
        inputType: z.enum(['text', 'structured', 'fixture']).optional(),
        input: z.union([z.string(), z.record(z.string(), z.unknown())]),
        expectedOutput: z.string().optional(),
        matchStrategy: z.enum(['exact', 'contains', 'semantic', 'schema', 'structured']).optional(),
        description: z.string().optional(),
        fixtures: z.array(z.object({
          key: z.string(),
          value: z.unknown(),
          ttlSeconds: z.number().optional(),
          description: z.string().optional(),
        })).optional(),
        expectedSteps: z.array(z.object({
          entityName: z.string(),
          expectation: z.string(),
        })).optional(),
        status: z.enum(['pending', 'running', 'passed', 'failed']),
        actualOutput: z.string().optional(),
        error: z.string().optional(),
        durationMs: z.number().optional(),
        failureCategory: z.string().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const baleybot = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.id),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots),
        ),
      });

      if (!baleybot) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'BaleyBot not found' });
      }

      await updateWithLock(baleybots, input.id, baleybot.version, {
        testCasesJson: input.testCases,
        updatedAt: new Date(),
      });

      return { success: true };
    }),

  /**
   * Pre-load test fixtures into shared storage before test execution.
   */
  preloadTestFixtures: editorProcedure
    .input(z.object({
      fixtures: z.array(z.object({
        key: z.string(),
        value: z.unknown(),
        ttlSeconds: z.number().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      for (const fixture of input.fixtures) {
        await sharedStorageService.write(
          ctx.workspace.id,
          fixture.key.startsWith('test_fixture:') ? fixture.key : `test_fixture:${fixture.key}`,
          fixture.value,
          { ttlSeconds: fixture.ttlSeconds ?? 300 },
        );
      }
      return { success: true, fixturesLoaded: input.fixtures.length };
    }),

  // ========================================================================
  // TOOLS & VALIDATION
  // ========================================================================

  /**
   * Save trigger configuration to the baleybots row and sync with baleybotTriggers table.
   */
  saveTriggerConfig: editorProcedure
    .input(z.object({
      id: z.string().uuid(),
      triggerConfig: z.object({
        type: z.enum(['manual', 'schedule', 'webhook', 'other_bb', 'db_event', 'mcp_event', 'file_upload']),
        schedule: z.string().optional(),
        webhookPath: z.string().optional(),
        sourceBaleybotId: z.string().uuid().optional(),
        completionType: z.enum(['success', 'failure', 'completion']).optional(),
        dbConnectionId: z.string().uuid().optional(),
        dbTable: z.string().optional(),
        dbEvent: z.enum(['insert', 'update', 'delete', 'change']).optional(),
        mcpServer: z.string().optional(),
        mcpTool: z.string().optional(),
        mcpResource: z.string().optional(),
        acceptedMimeTypes: z.array(z.string()).optional(),
        maxFileSizeMb: z.number().positive().optional(),
        multiple: z.boolean().optional(),
        payloadMode: z.enum(['metadata', 'inline_base64']).optional(),
        enabled: z.boolean().optional(),
      }).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.id),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots),
        ),
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'BaleyBot not found' });

      const triggerValidation = validateAndNormalizeTriggerConfig(input.triggerConfig);
      if (!triggerValidation.valid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: triggerValidation.issues.join(' '),
        });
      }

      // Touch updatedAt to signal a change
      await updateWithLock(baleybots, input.id, existing.version, {
        updatedAt: new Date(),
      });

      // Clean up existing triggers for this target bot
      await ctx.db.delete(baleybotTriggers)
        .where(and(
          eq(baleybotTriggers.targetBaleybotId, input.id),
          eq(baleybotTriggers.workspaceId, ctx.workspace.id),
        ));

      // Create new trigger entry if config provided
      if (triggerValidation.normalized) {
        const normalized = triggerValidation.normalized;
        await ctx.db.insert(baleybotTriggers).values({
          id: crypto.randomUUID(),
          sourceBaleybotId: normalized.type === 'other_bb' && normalized.sourceBaleybotId
            ? normalized.sourceBaleybotId
            : input.id, // Self-reference for non-BB triggers
          targetBaleybotId: input.id,
          triggerType: normalized.type === 'other_bb'
            ? normalized.completionType ?? 'completion'
            : normalized.type,
          workspaceId: ctx.workspace.id,
          enabled: normalized.enabled ?? true,
          staticInput: normalized, // Store normalized config as JSON
        });
      }

      return { success: true };
    }),

  /**
   * Get trigger configuration for a BaleyBot.
   */
  getTriggerConfig: roleProcedure
    .input(z.object({ baleybotId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const triggers = await ctx.db
        .select()
        .from(baleybotTriggers)
        .where(and(
          eq(baleybotTriggers.targetBaleybotId, input.baleybotId),
          eq(baleybotTriggers.workspaceId, ctx.workspace.id),
        ))
        .limit(1);

      if (triggers.length === 0) return null;
      // Return the stored trigger config from staticInput, or reconstruct from fields
      const trigger = triggers[0]!;
      if (trigger.staticInput && typeof trigger.staticInput === 'object') {
        return validateAndNormalizeTriggerConfig(trigger.staticInput).normalized;
      }
      return validateAndNormalizeTriggerConfig({
        type: trigger.triggerType,
        enabled: trigger.enabled,
        sourceBaleybotId: trigger.sourceBaleybotId,
      }).normalized;
    }),

  generateTests: editorProcedure
    .input(z.object({
      baleybotId: z.string().uuid(),
      balCode: z.string(),
      entities: z.array(z.object({
        name: z.string(),
        tools: z.array(z.string()),
        purpose: z.string(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const baleybot = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.baleybotId),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots),
        ),
      });
      if (!baleybot) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'BaleyBot not found' });
      }

      await checkRateLimit(
        `genTests:${ctx.workspace.id}:${ctx.userId}`,
        RATE_LIMITS.generate,
      );

      // Parse BAL code to extract topology info
      const parsed = parseBalCode(input.balCode);
      const hasChain = !!parsed.chain && parsed.chain.length > 1;
      const entityCount = parsed.entities.length;
      const topologyHint = entityCount <= 1 ? 'single' : hasChain ? 'chain' : 'multiple';

      const contextStr = [
        `Bot: ${baleybot.name}`,
        `Topology: ${topologyHint} (${entityCount} entit${entityCount === 1 ? 'y' : 'ies'})`,
        hasChain ? `Chain order: ${parsed.chain!.join(' → ')}` : '',
        '',
        'Entities:',
        ...input.entities.map(e => {
          const parsedEntity = parsed.entities.find(pe => pe.name === e.name);
          const goal = parsedEntity?.config?.goal ?? e.purpose;
          const output = parsedEntity?.config?.output ? `Output schema: ${JSON.stringify(parsedEntity.config.output)}` : '';
          return `- ${e.name}: ${goal} [tools: ${e.tools.join(', ') || 'none'}]${output ? `\n  ${output}` : ''}`;
        }),
        '',
        'BAL Code:',
        input.balCode,
      ].filter(Boolean).join('\n');

      // Try test_orchestrator first (topology-aware), fall back to test_generator
      let generatedTests:
        | Awaited<ReturnType<typeof runTestOrchestrator>>
        | Awaited<ReturnType<typeof runTestGenerator>>;
      let usedOrchestrator = false;
      try {
        generatedTests = await runTestOrchestrator(
          `Design a comprehensive test suite for this BaleyBot:\n${contextStr}`,
          {
            userWorkspaceId: ctx.workspace.id,
            triggeredBy: 'internal',
          }
        );
        usedOrchestrator = true;
      } catch (orchestratorError) {
        log.warn('test_orchestrator failed, falling back to test_generator', {
          error: orchestratorError instanceof Error ? orchestratorError.message : String(orchestratorError),
          baleybotId: input.baleybotId,
        });
        generatedTests = await runTestGenerator(
          `Generate comprehensive tests for this BaleyBot:\n${contextStr}`,
          {
            userWorkspaceId: ctx.workspace.id,
            triggeredBy: 'internal',
            fallbackMode: 'value',
            fallbackValue: {
              tests: [],
              strategy: 'Test generation returned unexpected format. Please try again.',
            },
          }
        );
      }

      // If orchestrator was not used, add deterministic topology hints.
      if (!usedOrchestrator && !generatedTests.topology) {
        return {
          ...generatedTests,
          topology: topologyHint,
          topologyDescription: `${entityCount} entit${entityCount === 1 ? 'y' : 'ies'}${hasChain ? ` in chain` : ''}`,
        };
      }

      return generatedTests;
    }),

  /**
   * Analyze connection requirements using the connection_advisor internal BB.
   * // TODO: Wire to frontend — ConnectionsPanel lazy-check
   */
  analyzeConnections: editorProcedure
    .input(z.object({
      baleybotId: z.string().uuid(),
      balCode: z.string(),
      entities: z.array(z.object({
        name: z.string(),
        tools: z.array(z.string()),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const baleybot = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.baleybotId),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots),
        ),
      });
      if (!baleybot) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'BaleyBot not found' });
      }

      await checkRateLimit(
        `connAnalysis:${ctx.workspace.id}:${ctx.userId}`,
        RATE_LIMITS.generate,
      );

      const contextStr = [
        `Bot: ${baleybot.name}`,
        `Entities: ${input.entities.map(e => `${e.name} (${e.tools.join(', ')})`).join('; ')}`,
        '',
        'BAL Code:',
        input.balCode,
      ].join('\n');

      try {
        return await runConnectionAdvisor(
          `Analyze connection requirements:\n${contextStr}`,
          {
            userWorkspaceId: ctx.workspace.id,
            triggeredBy: 'internal',
          }
        );
      } catch (error) {
        log.error('connection_advisor failed', {
          baleybotId: input.baleybotId,
          error: error instanceof Error ? error.message : String(error),
        });
        return { analysis: undefined, recommendations: ['Connection analysis returned unexpected format. Please try again.'], warnings: [] };
      }
    }),

  /**
   * Lazy validation for a BaleyBot. Runs requested checks on-demand
   * so the user doesn't wait during creation — each tab fires its own check.
   * // TODO: Wire to frontend — tab-level lazy validation
   */
  validateBaleybot: editorProcedure
    .input(z.object({
      id: z.string().uuid(),
      checks: z.array(z.enum(['connections', 'syntax', 'tests'])),
    }))
    .mutation(async ({ ctx, input }) => {
      const baleybot = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.id),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots)
        ),
      });

      if (!baleybot) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'BaleyBot not found' });
      }

      await checkRateLimit(
        `validate:${ctx.workspace.id}:${ctx.userId}`,
        RATE_LIMITS.generate,
      );

      const results: Record<string, unknown> = {};

      for (const check of input.checks) {
        switch (check) {
          case 'syntax': {
            const compiled = compileBALCode(baleybot.balCode);
            results.syntax = {
              valid: !compiled.errors?.length,
              errors: compiled.errors ?? [],
              entities: compiled.entities,
            };
            break;
          }
          case 'connections': {
            try {
              const parsed = parseBalCode(baleybot.balCode);
              const entitySummary = parsed.entities
                .map(e => `${e.name} (${(e.config?.tools as string[] ?? []).join(', ')})`)
                .join('; ');
              const contextStr = [
                `Bot: ${baleybot.name}`,
                `Entities: ${entitySummary}`,
                '',
                'BAL Code:',
                baleybot.balCode,
              ].join('\n');

              results.connections = await runConnectionAdvisor(
                `Analyze connection requirements:\n${contextStr}`,
                { userWorkspaceId: ctx.workspace.id, triggeredBy: 'internal' }
              );
            } catch (error) {
              log.error('validateBaleybot connection check failed', {
                baleybotId: input.id,
                error: error instanceof Error ? error.message : String(error),
              });
              results.connections = { recommendations: ['Connection analysis failed. Please try again.'], warnings: [] };
            }
            break;
          }
          case 'tests': {
            try {
              const parsed = parseBalCode(baleybot.balCode);
              const entityCount = parsed.entities.length;
              const hasChain = !!parsed.chain && parsed.chain.length > 1;
              const topologyHint = entityCount <= 1 ? 'single' : hasChain ? 'chain' : 'multiple';

              const contextStr = [
                `Bot: ${baleybot.name}`,
                `Topology: ${topologyHint} (${entityCount} entit${entityCount === 1 ? 'y' : 'ies'})`,
                '',
                'BAL Code:',
                baleybot.balCode,
              ].join('\n');

              results.tests = await runTestGenerator(
                `Generate comprehensive tests for this BaleyBot:\n${contextStr}`,
                { userWorkspaceId: ctx.workspace.id, triggeredBy: 'internal' }
              );
            } catch (error) {
              log.error('validateBaleybot test generation failed', {
                baleybotId: input.id,
                error: error instanceof Error ? error.message : String(error),
              });
              results.tests = { tests: [], strategy: 'Test generation failed. Please try again.' };
            }
            break;
          }
        }
      }

      return results;
    }),

  /**
   * Verify a specific tool's operational readiness from the Connections panel.
   * Performs connection-level checks and safe runtime probes where applicable.
   * // TODO: Wire to frontend — per-tool verify button
   */
  verifyTool: editorProcedure
    .input(z.object({
      toolName: z.string().min(1),
      mappedConnectionId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const workspaceConnections = await ctx.db.query.connections.findMany({
        where: and(
          eq(connections.workspaceId, ctx.workspace.id),
          notDeleted(connections)
        ),
        columns: {
          id: true,
          type: true,
          name: true,
          status: true,
          config: true,
        },
      });

      const hasAiProvider = workspaceConnections.some(
        (conn) =>
          (conn.type === 'openai' || conn.type === 'anthropic' || conn.type === 'ollama') &&
          conn.status === 'connected'
      );

      const parsed = parseConnectionTool(input.toolName);
      const binding = evaluateToolConnectionBinding(
        input.toolName,
        workspaceConnections.map((conn) => ({
          id: conn.id,
          type: conn.type,
          name: conn.name,
          status: conn.status ?? 'unknown',
        }))
      );

      let mappedConnection: WorkspaceConnectionLite | undefined;
      if (input.mappedConnectionId) {
        mappedConnection = workspaceConnections.find((conn) => conn.id === input.mappedConnectionId);
      } else if (parsed.connectionType && parsed.connectionSlug) {
        mappedConnection = workspaceConnections.find(
          (conn) =>
            conn.type === parsed.connectionType &&
            connectionNameToSlug(conn.name) === parsed.connectionSlug
        );
      }

      if (parsed.connectionType && !mappedConnection) {
        return {
          toolName: input.toolName,
          status: 'needs_setup' as const,
          checkType: 'connection' as const,
          summary: binding.reason,
          details: getToolVerificationNextSteps({
            toolName: input.toolName,
            status: 'needs_setup',
            reason: binding.reason,
            hasAiProvider,
            expectedConnectionType: parsed.connectionType,
            expectedConnectionSlug: parsed.connectionSlug,
          }),
          probe: {
            attempted: false,
          },
        };
      }

      if (mappedConnection && mappedConnection.status !== 'connected') {
        return {
          toolName: input.toolName,
          status: 'needs_setup' as const,
          checkType: 'connection' as const,
          summary: `"${mappedConnection.name}" is ${mappedConnection.status}.`,
          details: [
            `Reconnect or update "${mappedConnection.name}" credentials.`,
            'Re-run connection test and then verify this tool again.',
          ],
          connection: {
            id: mappedConnection.id,
            name: mappedConnection.name,
            type: mappedConnection.type,
            status: mappedConnection.status,
          },
          probe: {
            attempted: false,
          },
        };
      }

      if (mappedConnection?.config && (mappedConnection.type === 'postgres' || mappedConnection.type === 'mysql')) {
        const decryptedConfig = decryptConfigForProvider(mappedConnection.type, mappedConnection.config);
        const connectionCheck = await testConnection(mappedConnection.type, decryptedConfig);
        if (!connectionCheck.success) {
          return {
            toolName: input.toolName,
            status: 'failed' as const,
            checkType: 'connection' as const,
            summary: connectionCheck.message || 'Connection test failed.',
            details: [
              'Update credentials or connection URL and test again.',
              mappedConnection.type === 'postgres'
                ? 'Check host, port, database, username, password, and SSL requirements.'
                : 'Check host, port, database, username, password, and network access.',
            ],
            connection: {
              id: mappedConnection.id,
              name: mappedConnection.name,
              type: mappedConnection.type,
              status: mappedConnection.status,
            },
            probe: {
              attempted: false,
            },
          };
        }
      }

      if (input.toolName === 'web_search' && !hasProcessEnvKey('TAVILY_API_KEY') && !hasAiProvider) {
        return {
          toolName: input.toolName,
          status: 'needs_setup' as const,
          checkType: 'connection' as const,
          summary: 'web_search requires Tavily API key or an AI provider fallback.',
          details: getToolVerificationNextSteps({
            toolName: input.toolName,
            status: 'needs_setup',
            reason: 'No search backend available.',
            hasAiProvider,
            expectedConnectionType: parsed.connectionType,
            expectedConnectionSlug: parsed.connectionSlug,
          }),
          probe: {
            attempted: false,
          },
        };
      }

      const probeArgs = buildToolProbeArgs(input.toolName);
      const sideEffectingTools = new Set([
        'spawn_baleybot',
        'send_notification',
        'schedule_task',
        'create_agent',
        'create_tool',
      ]);

      if (sideEffectingTools.has(input.toolName)) {
        return {
          toolName: input.toolName,
          status: 'manual_review' as const,
          checkType: 'static' as const,
          summary: 'Tool is configured. Runtime probe skipped to avoid side effects.',
          details: [
            'Use the Test stage to run a real scenario and verify behavior.',
          ],
          connection: mappedConnection
            ? {
                id: mappedConnection.id,
                name: mappedConnection.name,
                type: mappedConnection.type,
                status: mappedConnection.status,
              }
            : undefined,
          probe: {
            attempted: false,
          },
        };
      }

      if (!probeArgs) {
        return {
          toolName: input.toolName,
          status: 'verified' as const,
          checkType: 'static' as const,
          summary: 'Tool configuration is valid.',
          details: [],
          connection: mappedConnection
            ? {
                id: mappedConnection.id,
                name: mappedConnection.name,
                type: mappedConnection.type,
                status: mappedConnection.status,
              }
            : undefined,
          probe: {
            attempted: false,
          },
        };
      }

      const tavilyKeyForVerify = await getWorkspaceTavilyKey(ctx.workspace.id);
      if (tavilyKeyForVerify) {
        configureWebSearch(tavilyKeyForVerify);
      }
      initializeBuiltInToolServices();

      const toolCtx: BuiltInToolContext = {
        workspaceId: ctx.workspace.id,
        baleybotId: 'tool-verification',
        executionId: `tool-verification-${Date.now()}`,
        userId: ctx.userId ?? 'tool-verification',
      };

      const { runtimeTools } = await loadExecutionTools({
        workspaceId: ctx.workspace.id,
        toolCtx,
        declaredTools: [input.toolName],
      });

      const runtimeTool = runtimeTools.get(input.toolName);
      if (!runtimeTool) {
        return {
          toolName: input.toolName,
          status: 'failed' as const,
          checkType: 'runtime' as const,
          summary: 'Tool is not currently available at runtime.',
          details: [
            'Check whether the tool exists and is allowed in this workspace.',
          ],
          probe: {
            attempted: true,
            success: false,
            message: 'Runtime tool not found',
          },
        };
      }

      try {
        await runtimeTool.function(probeArgs);
        return {
          toolName: input.toolName,
          status: 'verified' as const,
          checkType: 'runtime' as const,
          summary: 'Runtime probe passed.',
          details: mappedConnection
            ? [`Verified using "${mappedConnection.name}".`]
            : ['No external connection was required for this probe.'],
          connection: mappedConnection
            ? {
                id: mappedConnection.id,
                name: mappedConnection.name,
                type: mappedConnection.type,
                status: mappedConnection.status,
              }
            : undefined,
          probe: {
            attempted: true,
            success: true,
            message: 'Runtime probe passed',
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          toolName: input.toolName,
          status: 'failed' as const,
          checkType: 'runtime' as const,
          summary: `Runtime probe failed: ${errorMessage}`,
          details: getToolVerificationNextSteps({
            toolName: input.toolName,
            status: 'failed',
            reason: errorMessage,
            hasAiProvider,
            expectedConnectionType: parsed.connectionType,
            expectedConnectionSlug: parsed.connectionSlug,
          }),
          connection: mappedConnection
            ? {
                id: mappedConnection.id,
                name: mappedConnection.name,
                type: mappedConnection.type,
                status: mappedConnection.status,
              }
            : undefined,
          probe: {
            attempted: true,
            success: false,
            message: errorMessage,
          },
        };
      }
    }),

  /**
   * Validate a single test output using the test_validator internal BB.
   * Uses a cheap model (gpt-4o-mini) for fast semantic validation.
   */
  validateTestOutput: editorProcedure
    .input(z.object({
      testName: z.string(),
      input: z.union([z.string(), z.record(z.string(), z.unknown())]),
      expectedOutput: z.string(),
      actualOutput: z.string(),
      matchStrategy: z.enum(MATCH_STRATEGIES).optional(),
      botName: z.string(),
      botGoal: z.string().optional(),
      expectedSteps: z.array(z.object({
        entityName: z.string(),
        expectation: z.string(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await checkRateLimit(
        `testValidate:${ctx.workspace.id}:${ctx.userId}`,
        RATE_LIMITS.testValidate,
      );

      const strategy: MatchStrategy = input.matchStrategy ?? 'contains';
      const deterministic = evaluateOutputMatch(
        input.actualOutput,
        input.expectedOutput,
        strategy,
      );

      // Deterministic pass always wins.
      if (deterministic.passed) {
        return {
          passed: true,
          confidence: 0.98,
          reasoning: `${deterministic.reason} (deterministic ${strategy} match)`,
          suggestions: [],
        };
      }

      // For strict strategies, deterministic mismatch is authoritative.
      if (strategy === 'exact' || strategy === 'schema' || strategy === 'structured') {
        return {
          passed: false,
          confidence: 0.98,
          reasoning: `${deterministic.reason} (deterministic ${strategy} mismatch)`,
          suggestions: [
            'Adjust expected output to match actual structure/content.',
            'Use semantic or contains matching if strict structural equality is not required.',
          ],
        };
      }

      const inputStr = typeof input.input === 'object' ? JSON.stringify(input.input) : input.input;
      const contextStr = [
        `Bot: ${input.botName}`,
        input.botGoal ? `Goal: ${input.botGoal}` : '',
        `Test: ${input.testName}`,
        `Match Strategy: ${strategy}`,
        `Deterministic Precheck: failed (${deterministic.reason})`,
        `Input: ${inputStr}`,
        `Expected Output: ${input.expectedOutput}`,
        `Actual Output: ${input.actualOutput}`,
        input.expectedSteps?.length
          ? `Expected Steps:\n${input.expectedSteps.map(s => `  - ${s.entityName}: ${s.expectation}`).join('\n')}`
          : '',
      ].filter(Boolean).join('\n');

      try {
        const parsed = await runTestValidator(
          `Validate this test result:\n${contextStr}`,
          {
            userWorkspaceId: ctx.workspace.id,
            triggeredBy: 'internal',
          }
        );
        const minConfidence = strategy === 'semantic' ? 0.5 : 0.6;
        if (parsed.passed && parsed.confidence < minConfidence) {
          return {
            passed: false,
            confidence: parsed.confidence,
            reasoning: `Validator confidence (${parsed.confidence.toFixed(2)}) was below threshold (${minConfidence.toFixed(2)}). ${parsed.reasoning}`,
            suggestions: parsed.suggestions,
          };
        }
        return parsed;
      } catch (error) {
        log.error('test_validator failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        return { passed: false, confidence: 0, reasoning: 'Validation returned unexpected format.', suggestions: [] };
      }
    }),

  /**
   * Analyze test results using the test_results_analyzer internal BB.
   * Generates a rich summary with patterns and improvement suggestions.
   */
  analyzeTestResults: editorProcedure
    .input(z.object({
      botName: z.string(),
      botGoal: z.string().optional(),
      topology: z.string().optional(),
      topologyDescription: z.string().optional(),
      testResults: z.array(z.object({
        id: z.string(),
        name: z.string(),
        level: z.enum(['unit', 'integration', 'e2e']),
        input: z.union([z.string(), z.record(z.string(), z.unknown())]),
        inputType: z.enum(['text', 'structured', 'fixture']).optional(),
        expectedOutput: z.string().optional(),
        actualOutput: z.string().optional(),
        status: z.enum(['pending', 'running', 'passed', 'failed']),
        error: z.string().optional(),
        failureCategory: z.string().optional(),
        durationMs: z.number().optional(),
        expectedSteps: z.array(z.object({
          entityName: z.string(),
          expectation: z.string(),
        })).optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      await checkRateLimit(
        `testAnalyze:${ctx.workspace.id}:${ctx.userId}`,
        RATE_LIMITS.testAnalyze,
      );

      const contextStr = [
        `Bot: ${input.botName}`,
        input.botGoal ? `Goal: ${input.botGoal}` : '',
        input.topology ? `Topology: ${input.topology}` : '',
        input.topologyDescription ? `Topology Description: ${input.topologyDescription}` : '',
        '',
        'Test Results:',
        ...input.testResults.map(t => [
          `- ${t.name} (${t.level}): ${t.status}`,
          t.inputType && t.inputType !== 'text' ? `  Input Type: ${t.inputType}` : '',
          t.error ? `  Error: ${t.error}` : '',
          t.actualOutput ? `  Output: ${t.actualOutput.slice(0, 200)}` : '',
          t.failureCategory ? `  Category: ${t.failureCategory}` : '',
          t.durationMs ? `  Duration: ${t.durationMs}ms` : '',
          t.expectedSteps?.length ? `  Expected Steps: ${t.expectedSteps.map(s => `${s.entityName}: ${s.expectation}`).join('; ')}` : '',
        ].filter(Boolean).join('\n')),
      ].filter(Boolean).join('\n');

      try {
        return await runTestResultsAnalyzer(
          `Analyze these test results and provide an actionable summary:\n${contextStr}`,
          {
            userWorkspaceId: ctx.workspace.id,
            triggeredBy: 'internal',
          }
        );
      } catch (error) {
        log.error('test_results_analyzer failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        const passed = input.testResults.filter(t => t.status === 'passed').length;
        const total = input.testResults.length;
        return {
          overallStatus: passed === total ? 'passed' as const : passed === 0 ? 'failed' as const : 'mixed' as const,
          summary: `${passed}/${total} tests passed.`,
          passRate: total > 0 ? passed / total : 0,
          patterns: [],
          botImprovements: [],
          nextSteps: ['Review failed tests and adjust expected outputs or bot configuration.'],
        };
      }
    }),

  // ========================================================================
  // LAUNCH & DEPLOY
  // ========================================================================

  /**
   * Evaluate whether a BaleyBot is ready to enter Launch Prep.
   */
  evaluateLaunchReadiness: editorProcedure
    .input(z.object({
      baleybotId: z.string().uuid(),
      requiredPassRate: z.number().min(0).max(1).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const existing = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.baleybotId),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots)
        ),
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'BaleyBot not found' });
      }

      const workspaceConnections = await ctx.db.query.connections.findMany({
        where: and(
          eq(connections.workspaceId, ctx.workspace.id),
          notDeleted(connections),
        ),
      });

      const readiness = evaluateLaunchReadiness({
        balCode: existing.balCode,
        workspaceConnections: workspaceConnections.map((conn) => ({
          id: conn.id,
          type: conn.type,
          name: conn.name,
          status: conn.status ?? 'unknown',
          isDefault: conn.isDefault ?? false,
          availableModels: conn.availableModels,
        })),
        testCasesJson: existing.testCasesJson,
        requiredPassRate: input.requiredPassRate,
      });

      let lifecycleStage = existing.lifecycleStage ?? 'draft';
      if (readiness.readyForLaunchPrep && lifecycleStage === 'draft') {
        await updateWithLock(baleybots, existing.id, existing.version, {
          lifecycleStage: 'verified',
        });
        lifecycleStage = 'verified';
      }

      return {
        lifecycleStage,
        readiness,
      };
    }),

  /**
   * Generate and persist LaunchKit + runtime interface spec.
   */
  generateLaunchKit: editorProcedure
    .input(z.object({
      baleybotId: z.string().uuid(),
      force: z.boolean().optional().default(false),
      requiredPassRate: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.baleybotId),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots)
        ),
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'BaleyBot not found' });
      }

      await checkRateLimit(
        `launchkit:${ctx.workspace.id}:${ctx.userId}`,
        RATE_LIMITS.generate,
      );

      const workspaceConnections = await ctx.db.query.connections.findMany({
        where: and(
          eq(connections.workspaceId, ctx.workspace.id),
          notDeleted(connections),
        ),
      });

      const readiness = evaluateLaunchReadiness({
        balCode: existing.balCode,
        workspaceConnections: workspaceConnections.map((conn) => ({
          id: conn.id,
          type: conn.type,
          name: conn.name,
          status: conn.status ?? 'unknown',
          isDefault: conn.isDefault ?? false,
          availableModels: conn.availableModels,
        })),
        testCasesJson: existing.testCasesJson,
        requiredPassRate: input.requiredPassRate,
      });

      if (!readiness.readyForLaunchPrep && !input.force) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Launch Prep requirements not met: ${readiness.blockingIssues.join(' ')}`,
        });
      }

      const deploymentContext = [
        `Bot: ${existing.name}`,
        `Topology: ${readiness.topology}`,
        `Pass rate: ${Math.round(readiness.testPassRate * 100)}%`,
        `Blocking issues: ${readiness.blockingIssues.join('; ') || 'none'}`,
        '',
        'BAL Code:',
        existing.balCode,
      ].join('\n');

      let triggerRecommendations: Array<{
        type: TriggerType;
        reason: string;
        config?: Record<string, unknown>;
      }> | undefined;
      let monitoringAdvice: {
        alertsToSet?: string[];
        metricsToWatch?: string[];
      } | undefined;

      try {
        const parsedDeployment = await runDeploymentAdvisor(
          `Generate activation and monitoring recommendations:\n${deploymentContext}`,
          {
            userWorkspaceId: ctx.workspace.id,
            triggeredBy: 'internal',
          }
        );

        triggerRecommendations = parsedDeployment.triggerRecommendations;
        monitoringAdvice = parsedDeployment.monitoringAdvice;
      } catch (error) {
        log.warn('Deployment advisor failed during LaunchKit generation; using deterministic fallback', {
          baleybotId: existing.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      const launchKit = buildLaunchKit({
        balCode: existing.balCode,
        readiness,
        triggerRecommendations,
        monitoringAdvice,
      });

      await updateWithLock(baleybots, existing.id, existing.version, {
        launchKit,
        runtimeInterfaceSpec: launchKit.runtimeInterface,
        lifecycleStage: 'launch_prepared',
        launchPreparedAt: new Date(),
      });

      return {
        lifecycleStage: 'launch_prepared' as const,
        readiness,
        launchKit,
      };
    }),

  /**
   * Approve the generated launch plan (remains in launch_prepared stage).
   */
  approveLaunchPlan: editorProcedure
    .input(z.object({
      baleybotId: z.string().uuid(),
      launchKit: z.record(z.string(), z.unknown()).optional(),
      runtimeInterfaceSpec: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.baleybotId),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots)
        ),
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'BaleyBot not found' });
      }

      return updateWithLock(baleybots, existing.id, existing.version, {
        lifecycleStage: 'launch_prepared',
        launchPreparedAt: new Date(),
        launchKit: input.launchKit ?? existing.launchKit,
        runtimeInterfaceSpec: input.runtimeInterfaceSpec ?? existing.runtimeInterfaceSpec,
      });
    }),

  /**
   * Promote a launch-prepared BaleyBot to live mode.
   */
  promoteToLive: editorProcedure
    .input(z.object({ baleybotId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.baleybotId),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots)
        ),
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'BaleyBot not found' });
      }

      if (!existing.launchKit) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'LaunchKit not found. Generate and approve Launch Prep before going live.',
        });
      }

      return updateWithLock(baleybots, existing.id, existing.version, {
        status: 'active',
        lifecycleStage: 'live',
        liveAt: new Date(),
        pausedAt: null,
      });
    }),

  /**
   * Pause a live BaleyBot while preserving runtime interface artifacts.
   */
  pauseLiveBot: editorProcedure
    .input(z.object({ baleybotId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.baleybotId),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots)
        ),
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'BaleyBot not found' });
      }

      return updateWithLock(baleybots, existing.id, existing.version, {
        status: 'paused',
        lifecycleStage: 'paused',
        pausedAt: new Date(),
      });
    }),

  /**
   * Revert a live or paused BaleyBot back to draft mode.
   */
  revertToDraft: editorProcedure
    .input(z.object({ baleybotId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.baleybotId),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots)
        ),
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'BaleyBot not found' });
      }

      return updateWithLock(baleybots, existing.id, existing.version, {
        status: 'draft',
        lifecycleStage: 'draft',
        liveAt: null,
        launchPreparedAt: null,
        pausedAt: null,
      });
    }),

  /**
   * Return the runtime interface spec for Live mode rendering.
   * // TODO: Wire to frontend — Live mode runtime panel
   */
  getRuntimeInterface: roleProcedure
    .input(z.object({ baleybotId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const existing = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.baleybotId),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots)
        ),
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'BaleyBot not found' });
      }

      if (existing.runtimeInterfaceSpec) {
        return existing.runtimeInterfaceSpec;
      }

      return buildDefaultRuntimeInterface({ balCode: existing.balCode });
    }),

  /**
   * Analyze deployment requirements using the deployment_advisor internal BB.
   * // TODO: Wire to frontend — Deploy panel deep analysis
   */
  analyzeDeployment: editorProcedure
    .input(z.object({
      baleybotId: z.string().uuid(),
      balCode: z.string(),
      entityNames: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.baleybots.findFirst({
        where: and(eq(baleybots.id, input.baleybotId), eq(baleybots.workspaceId, ctx.workspace.id), notDeleted(baleybots)),
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'BaleyBot not found' });

      await checkRateLimit(
        `deploy:${ctx.workspace.id}:${ctx.userId}`,
        RATE_LIMITS.generate,
      );

      const contextStr = `Bot: ${existing.name}\nEntities: ${input.entityNames.join(', ')}\n\nBAL Code:\n${input.balCode}`;
      try {
        return await runDeploymentAdvisor(
          `Analyze deployment for this BaleyBot:\n${contextStr}`,
          {
            userWorkspaceId: ctx.workspace.id,
            triggeredBy: 'internal',
          }
        );
      } catch (error) {
        log.error('deployment_advisor failed', {
          baleybotId: input.baleybotId,
          error: error instanceof Error ? error.message : String(error),
        });
        return { triggerRecommendations: [], readinessGaps: ['Deployment analysis returned unexpected format.'], productionChecklist: [] };
      }
    }),

  // ========================================================================
  // EXPORT / IMPORT — one button each in the UI
  // ========================================================================

  /**
   * Export a BaleyBot as a .baleybot.json bundle.
   * Returns the bundle object for the client to download.
   */
  exportBaleybot: roleProcedure
    .input(z.object({ id: uuidSchema }))
    .query(async ({ ctx, input }) => {
      const baleybot = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.id),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots)
        ),
      });

      if (!baleybot) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'BaleyBot not found' });
      }

      // Extract required tools and providers from BAL code
      let entityNames: string[] = baleybot.entityNames || [];
      const requiredTools = new Set<string>();
      const requiredProviders = new Set<string>();

      try {
        const compiled = compileBALCode(baleybot.balCode, {});
        if (compiled.entities) {
          entityNames = compiled.entities; // string[] of entity names
        }
        // Extract tools and providers from structure if available
        const structure = compiled.structure as Record<string, unknown> | null;
        if (structure?.entities && Array.isArray(structure.entities)) {
          for (const entity of structure.entities as Array<Record<string, unknown>>) {
            if (Array.isArray(entity.tools)) {
              for (const t of entity.tools) {
                if (typeof t === 'string') requiredTools.add(t);
              }
            }
            if (typeof entity.model === 'string') {
              const provider = entity.model.split(':')[0];
              if (provider) requiredProviders.add(provider);
            }
          }
        }
      } catch {
        // If parsing fails, use cached entity names
        entityNames = baleybot.entityNames || [];
      }

      return {
        version: 1 as const,
        name: baleybot.name,
        description: baleybot.description || '',
        icon: baleybot.icon || '🤖',
        balCode: baleybot.balCode,
        entityNames,
        requiredTools: [...requiredTools],
        requiredProviders: [...requiredProviders],
        testCases: baleybot.testCasesJson
          ? (baleybot.testCasesJson as Array<{ name: string; input: string; expectedOutput?: string }>).map(tc => ({
              name: tc.name || 'test',
              input: tc.input || '',
              expectedOutput: tc.expectedOutput,
            }))
          : [],
        metadata: {
          exportedAt: new Date().toISOString(),
          sourceVersion: baleybot.version,
        },
      };
    }),

  /**
   * Import a BaleyBot from a .baleybot.json bundle.
   * Creates a new BaleyBot in draft status.
   */
  importBaleybot: editorProcedure
    .input(z.object({
      bundle: z.object({
        version: z.literal(1),
        name: z.string().min(1),
        description: z.string(),
        icon: z.string(),
        balCode: z.string().min(1),
        entityNames: z.array(z.string()),
        requiredTools: z.array(z.string()),
        requiredProviders: z.array(z.string()),
        testCases: z.array(z.object({
          name: z.string(),
          input: z.string(),
          expectedOutput: z.string().optional(),
          matchStrategy: z.enum(['contains', 'exact', 'semantic']).optional(),
        })).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const { bundle } = input;

      // Compile BAL to validate it
      const compiled = compileBALCode(bundle.balCode, {});
      if (compiled.errors && compiled.errors.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid BAL code: ${compiled.errors[0]}`,
        });
      }

      // Create the BaleyBot
      const result = await ctx.db
        .insert(baleybots)
        .values({
          workspaceId: ctx.workspace.id,
          name: bundle.name,
          description: bundle.description,
          icon: bundle.icon,
          balCode: bundle.balCode,
          entityNames: bundle.entityNames,
          status: 'draft',
          lifecycleStage: 'draft',
          testCasesJson: bundle.testCases || [],
          structure: compiled.structure,
          createdBy: ctx.userId,
        })
        .returning({ id: baleybots.id });

      const created = result[0];
      if (!created) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create BaleyBot' });
      }

      return { id: created.id, name: bundle.name };
    }),
});
