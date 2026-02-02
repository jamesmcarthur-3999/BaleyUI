import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import {
  baleybots,
  baleybotExecutions,
  eq,
  and,
  desc,
  notDeleted,
  softDelete,
  updateWithLock,
} from '@baleyui/db';
import { TRPCError } from '@trpc/server';

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

      const updated = await updateWithLock(baleybots, input.id, input.version, updateData);

      return updated;
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

      // TODO: Phase 2.2 - Actually execute the BAL code using Pipeline.from()
      // For now, just return the execution record
      return execution;
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
});
