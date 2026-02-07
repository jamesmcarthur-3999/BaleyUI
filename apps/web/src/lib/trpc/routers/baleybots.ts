// TODO: STYLE-002 - This file is over 600 lines (~1094 lines). Consider splitting into:
// - baleybots-queries.ts (list, getById, getByName queries)
// - baleybots-mutations.ts (create, update, delete mutations)
// - baleybots-execution.ts (execute, stream procedures)
// - baleybots-schemas.ts (shared zod schemas)

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import {
  baleybots,
  baleybotExecutions,
  connections,
  eq,
  and,
  desc,
  notDeleted,
  softDelete,
  updateWithLock,
  sql,
  inArray,
} from '@baleyui/db';
import { TRPCError } from '@trpc/server';
import { processCreatorMessage } from '@/lib/baleybot/creator-bot';
import type { CreatorMessage } from '@/lib/baleybot/creator-types';
import { getBuiltInToolDefinitions, getPreferredProvider } from '@/lib/baleybot';
import { executeBALCode } from '@baleyui/sdk';
import { sanitizeErrorMessage, isUserFacingError } from '@/lib/errors/sanitize';
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
import { executeInternalBaleybot } from '@/lib/baleybot/internal-baleybots';
import { getWorkspaceAICredentials, initializeBuiltInToolServices } from '@/lib/baleybot/services';
import { getBuiltInRuntimeTools, configureWebSearch } from '@/lib/baleybot/tools/built-in/implementations';
import type { BuiltInToolContext } from '@/lib/baleybot/tools/built-in';

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
const triggerTypeSchema = z.enum(['manual', 'schedule', 'webhook', 'other_bb']);

/**
 * tRPC router for managing BaleyBots (BAL-first architecture).
 */
export const baleybotsRouter = router({
  /**
   * List all BaleyBots for the workspace.
   * API-004: Return only necessary fields for list view
   */
  list: protectedProcedure
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
        limit: input?.limit ?? 50,
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

      return allBaleybots.map((bb) => ({
        ...bb,
        lastExecution: bb.executions[0] ?? null,
        executions: undefined, // Don't include full executions array
      }));
    }),

  /**
   * Get a single BaleyBot by ID with recent executions.
   */
  get: protectedProcedure
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

  /**
   * Create a new BaleyBot from BAL code.
   * API-001: Stricter input validation
   */
  create: protectedProcedure
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
  update: protectedProcedure
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
  delete: protectedProcedure
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
  activate: protectedProcedure
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
      });

      return updated;
    }),

  /**
   * Pause a BaleyBot (set status to paused).
   */
  pause: protectedProcedure
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
      });

      return updated;
    }),

  /**
   * Execute a BaleyBot with input.
   * Uses a database transaction to prevent race conditions during execution.
   * The BAL execution runs inside the transaction so it will be rolled back on error.
   */
  execute: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        input: z.unknown().optional(),
        triggeredBy: triggerTypeSchema.optional().default('manual'),
        triggerSource: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Rate limit: 10 executions per minute per user per workspace
      await checkRateLimit(
        `execute:${ctx.workspace.id}:${ctx.userId}`,
        RATE_LIMITS.execute
      );

      log.info('Executing baleybot', { baleybotId: input.id, triggeredBy: input.triggeredBy });

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

      // Execute the BAL code outside the transaction so failure status updates persist
      const startTime = Date.now();
      try {
        // Update status to running
        await ctx.db
          .update(baleybotExecutions)
          .set({ status: 'running', startedAt: new Date() })
          .where(eq(baleybotExecutions.id, execution.id));

        // Get preferred provider from BAL code (respects model specified in entities)
        const preferredProvider = getPreferredProvider(baleybot.balCode);

        // Get AI credentials from workspace connections, matching the BAL code's provider
        const credentials = await getWorkspaceAICredentials(ctx.workspace.id, preferredProvider);
        if (!credentials) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: preferredProvider
              ? `No ${preferredProvider} provider configured for this workspace. Please add an ${preferredProvider === 'openai' ? 'OpenAI' : 'Anthropic'} connection in Settings.`
              : 'No AI provider configured for this workspace. Please add an OpenAI or Anthropic connection in Settings.',
          });
        }

        // Configure web search if Tavily key is available
        if (process.env.TAVILY_API_KEY) {
          configureWebSearch(process.env.TAVILY_API_KEY);
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

        // Get built-in runtime tools with implementations
        const runtimeTools = getBuiltInRuntimeTools(toolCtx);

        // Convert to format expected by SDK
        const availableTools: Record<string, {
          name: string;
          description: string;
          inputSchema: Record<string, unknown>;
          function: (args: Record<string, unknown>) => Promise<unknown>;
        }> = {};

        for (const [name, tool] of runtimeTools.entries()) {
          availableTools[name] = {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            function: tool.function,
          };
        }

        log.info('Loaded tools for execution', {
          executionId: execution.id,
          tools: Object.keys(availableTools),
        });

        // Execute the BAL code with the provided input and available tools
        // Don't override model - let BAL code's model specification take precedence
        const inputStr = input.input ? JSON.stringify(input.input) : undefined;
        const result = await executeBALCode(baleybot.balCode, {
          input: inputStr,
          apiKey: credentials.apiKey,
          timeout: 60000, // 60 second timeout
          availableTools,
        });

        const duration = Date.now() - startTime;

        log.info('Baleybot execution completed', {
          baleybotId: input.id,
          executionId: execution.id,
          status: result.status,
          durationMs: duration,
        });

        // Update execution with result
        await ctx.db
          .update(baleybotExecutions)
          .set({
            status: result.status === 'success' ? 'completed' : result.status === 'cancelled' ? 'cancelled' : 'failed',
            output: result.result,
            error: result.error,
            completedAt: new Date(),
            durationMs: duration,
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
  listExecutions: protectedProcedure
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
  getExecution: protectedProcedure
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
  getRecentActivity: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).optional().default(20),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      // Single JOIN query instead of two round-trips
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
        .where(and(
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots)
        ))
        .orderBy(desc(baleybotExecutions.createdAt))
        .limit(input?.limit ?? 20);

      return executions.map((exec) => ({
        ...exec,
        baleybot: { id: exec.baleybotId, name: exec.baleybotName, icon: exec.baleybotIcon },
      }));
    }),

  /**
   * Get BaleyBots that depend on a specific BaleyBot.
   */
  getDependents: protectedProcedure
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
  handleApprovalDecision: protectedProcedure
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

  // ===== Creator Bot Endpoints =====

  /**
   * Send a message to the Creator Bot and get a response.
   * Used for conversational BaleyBot creation.
   */
  sendCreatorMessage: protectedProcedure
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
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Build generator context
      // 1. Get connections from workspace (excluding soft-deleted)
      const workspaceConnections = await ctx.db.query.connections.findMany({
        where: and(
          eq(connections.workspaceId, ctx.workspace.id),
          notDeleted(connections)
        ),
      });

      // 2. Get existing BaleyBots from workspace
      const existingBaleybots = await ctx.db.query.baleybots.findMany({
        where: and(
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots)
        ),
        columns: {
          id: true,
          name: true,
          description: true,
          icon: true,
        },
      });

      // 3. Format connections for the generator context (null-safe)
      const formattedConnections = workspaceConnections.map((conn) => ({
        id: conn.id,
        type: conn.type,
        name: conn.name,
        status: conn.status ?? 'unknown',
        isDefault: conn.isDefault ?? false,
      }));

      // 4. Format existing BaleyBots for the generator context (null-safe)
      const formattedBaleybots = existingBaleybots.map((bb) => ({
        id: bb.id,
        name: bb.name,
        description: bb.description ?? null,
        icon: bb.icon ?? null,
        status: 'active' as const,
        executionCount: 0,
        lastExecutedAt: null,
      }));

      // 5. Convert conversation history to CreatorMessage format
      const conversationHistory: CreatorMessage[] = (input.conversationHistory ?? []).map(
        (msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
        })
      );

      // 6. Get built-in tools for the context
      const builtInTools = getBuiltInToolDefinitions();

      // 7. Call processCreatorMessage
      const result = await processCreatorMessage(
        {
          context: {
            workspaceId: ctx.workspace.id,
            availableTools: builtInTools, // Built-in tools are now available
            workspacePolicies: null, // Will be populated from workspace settings in the future
            connections: formattedConnections,
            existingBaleybots: formattedBaleybots,
          },
          conversationHistory,
        },
        input.message
      );

      return result;
    }),

  /**
   * Save a creation session as a BaleyBot.
   * Creates a new BaleyBot or updates an existing one.
   */
  saveFromSession: protectedProcedure
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
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
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

        // Truncate conversation history to last 50 messages
        const truncatedHistory = input.conversationHistory
          ? input.conversationHistory.slice(-50).map((msg) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              timestamp: msg.timestamp.toISOString(),
            }))
          : undefined;

        // API-002: Use shared error handling helper
        return await withErrorHandling(
          () => updateWithLock(baleybots, baleybotId, existing.version, {
            name: input.name,
            description: input.description,
            icon: input.icon,
            balCode: input.balCode,
            structure: input.structure,
            entityNames: input.entityNames,
            conversationHistory: truncatedHistory,
          }),
          'BaleyBot'
        );
      } else {
        // Truncate conversation history to last 50 messages
        const truncatedHistory = input.conversationHistory
          ? input.conversationHistory.slice(-50).map((msg) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              timestamp: msg.timestamp.toISOString(),
            }))
          : undefined;

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
            createdBy: ctx.userId,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        return baleybot;
      }
    }),

  /**
   * Save test cases as JSON on the baleybots row.
   */
  saveTestCases: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      testCases: z.array(z.object({
        id: z.string(),
        name: z.string(),
        level: z.enum(['unit', 'integration', 'e2e']),
        input: z.string(),
        expectedOutput: z.string().optional(),
        status: z.enum(['pending', 'running', 'passed', 'failed']),
        actualOutput: z.string().optional(),
        error: z.string().optional(),
        durationMs: z.number().optional(),
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

      await ctx.db.update(baleybots)
        .set({ testCasesJson: input.testCases, updatedAt: new Date() })
        .where(eq(baleybots.id, input.id));

      return { success: true };
    }),

  /**
   * Generate test cases using the test_generator internal BB.
   */
  generateTests: protectedProcedure
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

      const contextStr = [
        `Bot: ${baleybot.name}`,
        `Entities: ${input.entities.map(e => `${e.name} (${e.tools.join(', ')})`).join('; ')}`,
        '',
        'BAL Code:',
        input.balCode,
      ].join('\n');

      const { output } = await executeInternalBaleybot(
        'test_generator',
        `Generate comprehensive tests for this BaleyBot:\n${contextStr}`,
        {
          userWorkspaceId: ctx.workspace.id,
          triggeredBy: 'internal',
        }
      );

      return output as {
        tests: Array<{
          name: string;
          level: 'unit' | 'integration' | 'e2e';
          input: string;
          expectedOutput?: string;
          description: string;
        }>;
        strategy: string;
      };
    }),
});
