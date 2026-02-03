import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import {
  baleybots,
  baleybotExecutions,
  approvalPatterns,
  connections,
  eq,
  and,
  desc,
  isNull,
  notDeleted,
  softDelete,
  updateWithLock,
} from '@baleyui/db';
import { TRPCError } from '@trpc/server';
import { processCreatorMessage } from '@/lib/baleybot/creator-bot';
import type { CreatorMessage } from '@/lib/baleybot/creator-types';
import { executeBALCode } from '@baleyui/sdk';
import { sanitizeErrorMessage, isUserFacingError } from '@/lib/errors/sanitize';

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
   */
  list: protectedProcedure
    .input(
      z.object({
        status: baleybotStatusSchema.optional(),
        limit: z.number().int().min(1).max(100).optional().default(50),
        cursor: z.string().uuid().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(baleybots.workspaceId, ctx.workspace.id),
        notDeleted(baleybots),
      ];

      if (input?.status) {
        conditions.push(eq(baleybots.status, input.status));
      }

      const allBaleybots = await ctx.db.query.baleybots.findMany({
        where: and(...conditions),
        orderBy: [desc(baleybots.createdAt)],
        limit: input?.limit ?? 50,
        with: {
          executions: {
            limit: 1,
            orderBy: [desc(baleybotExecutions.createdAt)],
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
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        icon: z.string().max(100).optional(),
        balCode: z.string().min(1),
        // Optional structure cache (computed by BAL generator)
        structure: z.record(z.string(), z.unknown()).optional(),
        entityNames: z.array(z.string()).optional(),
        dependencies: z.array(z.string().uuid()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify any BB dependencies exist and belong to workspace
      if (input.dependencies && input.dependencies.length > 0) {
        const existingBBs = await ctx.db.query.baleybots.findMany({
          where: and(
            eq(baleybots.workspaceId, ctx.workspace.id),
            notDeleted(baleybots)
          ),
        });

        const existingIds = existingBBs.map((bb) => bb.id);
        const invalidIds = input.dependencies.filter((id) => !existingIds.includes(id));

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
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        version: z.number().int(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        icon: z.string().max(100).optional(),
        balCode: z.string().min(1).optional(),
        status: baleybotStatusSchema.optional(),
        structure: z.record(z.string(), z.unknown()).optional(),
        entityNames: z.array(z.string()).optional(),
        dependencies: z.array(z.string().uuid()).optional(),
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
        const existingBBs = await ctx.db.query.baleybots.findMany({
          where: and(
            eq(baleybots.workspaceId, ctx.workspace.id),
            notDeleted(baleybots)
          ),
        });

        const existingIds = existingBBs.map((bb) => bb.id);
        const invalidIds = input.dependencies.filter(
          (id) => !existingIds.includes(id) && id !== input.id
        );

        if (invalidIds.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid BaleyBot dependencies: ${invalidIds.join(', ')}`,
          });
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

      try {
        const updated = await updateWithLock(baleybots, input.id, input.version, updateData);
        return updated;
      } catch (error) {
        // Handle optimistic lock error (version mismatch)
        if (error instanceof Error && error.message.includes('version')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'BaleyBot was modified by another user. Please refresh and try again.',
          });
        }
        throw error;
      }
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

      const deleted = await softDelete(baleybots, input.id, ctx.userId);

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
   * Note: Actual execution logic will be implemented in Phase 2.2 (executor service).
   * This procedure creates the execution record and placeholder for streaming.
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
      // Verify BaleyBot exists and belongs to workspace
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

      // Create execution record
      const [execution] = await ctx.db
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

      // Update execution count
      await ctx.db
        .update(baleybots)
        .set({
          executionCount: (baleybot.executionCount ?? 0) + 1,
          lastExecutedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(baleybots.id, input.id));

      // Phase 2.1: Execute the BAL code using @baleyui/sdk
      const startTime = Date.now();
      try {
        // Update status to running
        await ctx.db
          .update(baleybotExecutions)
          .set({ status: 'running', startedAt: new Date() })
          .where(eq(baleybotExecutions.id, execution.id));

        // Get API key from environment (Phase 2.1)
        const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;

        // Execute the BAL code
        const result = await executeBALCode(baleybot.balCode, {
          model: 'gpt-4o-mini',
          apiKey,
          timeout: 60000, // 60 second timeout
        });

        const duration = Date.now() - startTime;

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

        // Update execution with error (store full error internally)
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
   */
  listExecutions: protectedProcedure
    .input(
      z.object({
        baleybotId: z.string().uuid(),
        status: executionStatusSchema.optional(),
        limit: z.number().int().min(1).max(100).optional().default(20),
        cursor: z.string().uuid().optional(),
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
      });

      if (!baleybot) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'BaleyBot not found',
        });
      }

      const conditions = [eq(baleybotExecutions.baleybotId, input.baleybotId)];

      if (input.status) {
        conditions.push(eq(baleybotExecutions.status, input.status));
      }

      const executions = await ctx.db.query.baleybotExecutions.findMany({
        where: and(...conditions),
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

      // Check if baleybot relation exists (could be null for orphaned executions)
      if (!execution.baleybot) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Execution not found',
        });
      }

      // Verify the BaleyBot belongs to the workspace
      if (execution.baleybot.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Execution not found',
        });
      }

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
      // Get all BB IDs for this workspace
      const workspaceBBs = await ctx.db.query.baleybots.findMany({
        where: and(
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots)
        ),
        columns: { id: true, name: true, icon: true },
      });

      if (workspaceBBs.length === 0) {
        return [];
      }

      const bbIds = workspaceBBs.map((bb) => bb.id);
      const bbMap = new Map(workspaceBBs.map((bb) => [bb.id, bb]));

      // Get recent executions across all BBs
      const { inArray } = await import('@baleyui/db');
      const executions = await ctx.db.query.baleybotExecutions.findMany({
        where: inArray(baleybotExecutions.baleybotId, bbIds),
        orderBy: [desc(baleybotExecutions.createdAt)],
        limit: input?.limit ?? 20,
      });

      return executions.map((exec) => ({
        ...exec,
        baleybot: bbMap.get(exec.baleybotId),
      }));
    }),

  /**
   * Get BaleyBots that depend on a specific BaleyBot.
   */
  getDependents: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Find all BBs that have this BB in their dependencies
      const allBBs = await ctx.db.query.baleybots.findMany({
        where: and(
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots)
        ),
      });

      const dependents = allBBs.filter((bb) => {
        const deps = bb.dependencies as string[] | null;
        return deps && deps.includes(input.id);
      });

      return dependents;
    }),

  // ===== Approval System Endpoints =====

  /**
   * List approval patterns for the workspace.
   */
  listApprovalPatterns: protectedProcedure
    .input(
      z.object({
        tool: z.string().optional(),
        trustLevel: z.enum(['provisional', 'trusted', 'permanent']).optional(),
        includeRevoked: z.boolean().optional().default(false),
        limit: z.number().int().min(1).max(100).optional().default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(approvalPatterns.workspaceId, ctx.workspace.id)];

      if (input?.tool) {
        conditions.push(eq(approvalPatterns.tool, input.tool));
      }

      if (input?.trustLevel) {
        conditions.push(eq(approvalPatterns.trustLevel, input.trustLevel));
      }

      if (!input?.includeRevoked) {
        conditions.push(isNull(approvalPatterns.revokedAt));
      }

      const patterns = await ctx.db.query.approvalPatterns.findMany({
        where: and(...conditions),
        orderBy: [desc(approvalPatterns.createdAt)],
        limit: input?.limit ?? 50,
      });

      return patterns;
    }),

  /**
   * Create a new approval pattern.
   */
  createApprovalPattern: protectedProcedure
    .input(
      z.object({
        tool: z.string().min(1),
        actionPattern: z.record(z.string(), z.unknown()),
        entityGoalPattern: z.string().optional(),
        trustLevel: z.enum(['provisional', 'trusted', 'permanent']).default('provisional'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Calculate expiration for provisional patterns (24 hours)
      const expiresAt =
        input.trustLevel === 'provisional'
          ? new Date(Date.now() + 24 * 60 * 60 * 1000)
          : null;

      const [pattern] = await ctx.db
        .insert(approvalPatterns)
        .values({
          workspaceId: ctx.workspace.id,
          tool: input.tool,
          actionPattern: input.actionPattern,
          entityGoalPattern: input.entityGoalPattern,
          trustLevel: input.trustLevel,
          approvedBy: ctx.userId,
          approvedAt: new Date(),
          expiresAt,
        })
        .returning();

      return pattern;
    }),

  /**
   * Revoke an approval pattern.
   */
  revokeApprovalPattern: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the pattern belongs to this workspace
      const existing = await ctx.db.query.approvalPatterns.findFirst({
        where: and(
          eq(approvalPatterns.id, input.id),
          eq(approvalPatterns.workspaceId, ctx.workspace.id)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Approval pattern not found',
        });
      }

      const [updated] = await ctx.db
        .update(approvalPatterns)
        .set({
          revokedAt: new Date(),
          revokedBy: ctx.userId,
          revokeReason: input.reason,
        })
        .where(eq(approvalPatterns.id, input.id))
        .returning();

      return updated;
    }),

  /**
   * Increment usage count for an approval pattern.
   */
  incrementPatternUsage: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.approvalPatterns.findFirst({
        where: and(
          eq(approvalPatterns.id, input.id),
          eq(approvalPatterns.workspaceId, ctx.workspace.id)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Approval pattern not found',
        });
      }

      const [updated] = await ctx.db
        .update(approvalPatterns)
        .set({
          timesUsed: (existing.timesUsed ?? 0) + 1,
        })
        .where(eq(approvalPatterns.id, input.id))
        .returning();

      return updated;
    }),

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

      if (!execution || !execution.baleybot || execution.baleybot.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Execution not found',
        });
      }

      // In a real implementation, this would:
      // 1. Find the pending approval request in the execution state
      // 2. Resume the execution with the approval decision
      // For now, we just record the decision

      // Safely parse existing segments
      let currentSegments: unknown[] = [];
      if (execution.segments !== null && execution.segments !== undefined) {
        if (Array.isArray(execution.segments)) {
          currentSegments = execution.segments;
        } else {
          console.warn(`Invalid segments format for execution ${input.executionId}`);
        }
      }

      const updatedSegments = [
        ...currentSegments,
        {
          type: 'approval_decision',
          toolCallId: input.toolCallId,
          approved: input.approved,
          denyReason: input.denyReason,
          decidedBy: ctx.userId,
          decidedAt: new Date().toISOString(),
        },
      ];

      await ctx.db
        .update(baleybotExecutions)
        .set({ segments: updatedSegments })
        .where(eq(baleybotExecutions.id, input.executionId));

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

      // 3. Format connections for the generator context
      const formattedConnections = workspaceConnections.map((conn) => ({
        id: conn.id,
        type: conn.type,
        name: conn.name,
        status: conn.status ?? 'unknown',
        isDefault: conn.isDefault ?? false,
      }));

      // 4. Format existing BaleyBots for the generator context
      const formattedBaleybots = existingBaleybots.map((bb) => ({
        id: bb.id,
        name: bb.name,
        description: bb.description,
        icon: bb.icon,
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

      // 6. Call processCreatorMessage
      const result = await processCreatorMessage(
        {
          context: {
            workspaceId: ctx.workspace.id,
            availableTools: [], // Will be populated from tool catalog in the future
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
        // Update existing BaleyBot
        const existing = await ctx.db.query.baleybots.findFirst({
          where: and(
            eq(baleybots.id, input.baleybotId),
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

        try {
          const updated = await updateWithLock(baleybots, input.baleybotId, existing.version, {
            name: input.name,
            description: input.description,
            icon: input.icon,
            balCode: input.balCode,
            structure: input.structure,
            entityNames: input.entityNames,
            conversationHistory: truncatedHistory,
          });

          return updated;
        } catch (error) {
          // Handle optimistic lock error (version mismatch)
          if (error instanceof Error && error.message.includes('version')) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'BaleyBot was modified by another user. Please refresh and try again.',
            });
          }
          throw error;
        }
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
});
