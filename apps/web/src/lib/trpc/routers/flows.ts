import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import {
  flows,
  flowExecutions,
  eq,
  and,
  notDeleted,
  softDelete,
  updateWithLock,
} from '@baleyui/db';
import { TRPCError } from '@trpc/server';
import { emitBuilderEvent, actorFromContext } from '@/lib/events/with-events';

/**
 * Zod schema for flow validation
 */
const flowNodeSchema = z.array(z.any()).optional();
const flowEdgeSchema = z.array(z.any()).optional();
const flowTriggersSchema = z.array(z.any()).optional();

/**
 * tRPC router for managing flows (visual compositions).
 */
export const flowsRouter = router({
  /**
   * List all flows in the workspace with node/edge counts for preview.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const allFlows = await ctx.db.query.flows.findMany({
      where: and(
        eq(flows.workspaceId, ctx.workspace.id),
        notDeleted(flows)
      ),
      orderBy: (flows, { desc }) => [desc(flows.createdAt)],
    });

    // Add node/edge counts for preview
    return allFlows.map((flow) => ({
      ...flow,
      nodeCount: Array.isArray(flow.nodes) ? flow.nodes.length : 0,
      edgeCount: Array.isArray(flow.edges) ? flow.edges.length : 0,
    }));
  }),

  /**
   * Get a single flow by ID with full nodes and edges.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const flow = await ctx.db.query.flows.findFirst({
        where: and(
          eq(flows.id, input.id),
          eq(flows.workspaceId, ctx.workspace.id),
          notDeleted(flows)
        ),
      });

      if (!flow) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Flow not found',
        });
      }

      return flow;
    }),

  /**
   * Create a new flow with empty nodes/edges.
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [flow] = await ctx.db
        .insert(flows)
        .values({
          workspaceId: ctx.workspace.id,
          name: input.name,
          description: input.description,
          nodes: [],
          edges: [],
          triggers: [],
          enabled: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Emit FlowCreated event
      if (flow) {
        await emitBuilderEvent(
          { workspaceId: ctx.workspace.id, actor: actorFromContext(ctx) },
          'FlowCreated',
          {
            flowId: flow.id,
            name: flow.name,
          }
        );
      }

      return flow;
    }),

  /**
   * Update a flow with optimistic locking.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        version: z.number().int(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        nodes: flowNodeSchema,
        edges: flowEdgeSchema,
        triggers: flowTriggersSchema,
        enabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify flow exists and belongs to workspace
      const existing = await ctx.db.query.flows.findFirst({
        where: and(
          eq(flows.id, input.id),
          eq(flows.workspaceId, ctx.workspace.id),
          notDeleted(flows)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Flow not found',
        });
      }

      // Prepare update data (only include fields that are provided)
      const updateData: any = {};

      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.nodes !== undefined) updateData.nodes = input.nodes;
      if (input.edges !== undefined) updateData.edges = input.edges;
      if (input.triggers !== undefined) updateData.triggers = input.triggers;
      if (input.enabled !== undefined) updateData.enabled = input.enabled;

      const updated = await updateWithLock(
        flows,
        input.id,
        input.version,
        updateData
      );

      // Emit FlowUpdated event
      if (updated) {
        await emitBuilderEvent(
          { workspaceId: ctx.workspace.id, actor: actorFromContext(ctx) },
          'FlowUpdated',
          {
            flowId: input.id,
            changes: updateData as Record<string, unknown>,
            previousValues: Object.keys(updateData).reduce((acc, key) => {
              acc[key] = existing[key as keyof typeof existing];
              return acc;
            }, {} as Record<string, unknown>),
          }
        );
      }

      return updated;
    }),

  /**
   * Delete a flow (soft delete).
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify flow exists and belongs to workspace
      const existing = await ctx.db.query.flows.findFirst({
        where: and(
          eq(flows.id, input.id),
          eq(flows.workspaceId, ctx.workspace.id),
          notDeleted(flows)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Flow not found',
        });
      }

      const deleted = await softDelete(flows, input.id, ctx.userId);

      // Emit FlowDeleted event
      if (deleted) {
        await emitBuilderEvent(
          { workspaceId: ctx.workspace.id, actor: actorFromContext(ctx) },
          'FlowDeleted',
          {
            flowId: input.id,
          }
        );
      }

      return deleted;
    }),

  /**
   * Duplicate an existing flow.
   */
  duplicate: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Fetch the original flow
      const original = await ctx.db.query.flows.findFirst({
        where: and(
          eq(flows.id, input.id),
          eq(flows.workspaceId, ctx.workspace.id),
          notDeleted(flows)
        ),
      });

      if (!original) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Flow not found',
        });
      }

      // Create a copy with a new name, disabled by default
      const [duplicated] = await ctx.db
        .insert(flows)
        .values({
          workspaceId: original.workspaceId,
          name: `${original.name} (Copy)`,
          description: original.description,
          nodes: original.nodes,
          edges: original.edges,
          triggers: original.triggers,
          enabled: false, // Duplicated flows start disabled
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Emit FlowCreated event for the duplicate
      if (duplicated) {
        await emitBuilderEvent(
          { workspaceId: ctx.workspace.id, actor: actorFromContext(ctx) },
          'FlowCreated',
          {
            flowId: duplicated.id,
            name: duplicated.name,
          }
        );
      }

      return duplicated;
    }),

  /**
   * Execute a flow (start a new execution).
   */
  execute: protectedProcedure
    .input(
      z.object({
        flowId: z.string().uuid(),
        input: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify flow exists and belongs to workspace
      const flow = await ctx.db.query.flows.findFirst({
        where: and(
          eq(flows.id, input.flowId),
          eq(flows.workspaceId, ctx.workspace.id),
          notDeleted(flows)
        ),
      });

      if (!flow) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Flow not found',
        });
      }

      // Create a new flow execution record
      const [execution] = await ctx.db
        .insert(flowExecutions)
        .values({
          flowId: input.flowId,
          flowVersion: flow.version,
          triggeredBy: {
            type: 'manual',
            userId: ctx.userId,
          },
          status: 'pending',
          input: input.input || null,
          startedAt: new Date(),
          createdAt: new Date(),
        })
        .returning();

      // TODO: Integrate with BaleyBots execution engine to actually run the flow
      // For now, we just create the execution record

      return execution;
    }),

  /**
   * Get a flow execution by ID with status and results.
   */
  getExecution: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const execution = await ctx.db.query.flowExecutions.findFirst({
        where: eq(flowExecutions.id, input.id),
        with: {
          flow: true,
          blockExecutions: {
            orderBy: (blockExecutions, { asc }) => [asc(blockExecutions.createdAt)],
          },
        },
      });

      if (!execution) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Flow execution not found',
        });
      }

      // Verify the flow belongs to the user's workspace
      if (execution.flow.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this execution',
        });
      }

      return execution;
    }),

  /**
   * List recent flow executions with optional filtering.
   */
  listExecutions: protectedProcedure
    .input(
      z.object({
        flowId: z.string().uuid().optional(),
        status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']).optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      // Build where conditions
      const conditions = [];

      // If flowId is provided, filter by it and verify it belongs to workspace
      if (input.flowId) {
        const flow = await ctx.db.query.flows.findFirst({
          where: and(
            eq(flows.id, input.flowId),
            eq(flows.workspaceId, ctx.workspace.id),
            notDeleted(flows)
          ),
        });

        if (!flow) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Flow not found',
          });
        }

        conditions.push(eq(flowExecutions.flowId, input.flowId));
      }

      if (input.status) {
        conditions.push(eq(flowExecutions.status, input.status));
      }

      // If no flowId provided, we need to filter by workspace
      // This requires a subquery or join, so we'll fetch all flows first
      let workspaceFlowIds: string[] = [];
      if (!input.flowId) {
        const workspaceFlows = await ctx.db.query.flows.findMany({
          where: and(
            eq(flows.workspaceId, ctx.workspace.id),
            notDeleted(flows)
          ),
          columns: { id: true },
        });
        workspaceFlowIds = workspaceFlows.map((f) => f.id);

        if (workspaceFlowIds.length === 0) {
          // No flows in workspace, return empty array
          return [];
        }
      }

      const executions = await ctx.db.query.flowExecutions.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: {
          flow: {
            columns: {
              id: true,
              name: true,
              workspaceId: true,
            },
          },
        },
        orderBy: (flowExecutions, { desc }) => [desc(flowExecutions.createdAt)],
        limit: input.limit,
      });

      // Filter to only include executions from flows in this workspace
      const filteredExecutions = executions.filter(
        (exec) => exec.flow.workspaceId === ctx.workspace.id
      );

      return filteredExecutions;
    }),

  /**
   * Cancel a running flow execution.
   */
  cancelExecution: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify execution exists and belongs to workspace
      const execution = await ctx.db.query.flowExecutions.findFirst({
        where: eq(flowExecutions.id, input.id),
        with: {
          flow: true,
        },
      });

      if (!execution) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Flow execution not found',
        });
      }

      if (execution.flow.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this execution',
        });
      }

      // Only pending or running executions can be cancelled
      if (execution.status !== 'pending' && execution.status !== 'running') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot cancel execution with status: ${execution.status}`,
        });
      }

      // Update execution status to cancelled
      const [cancelled] = await ctx.db
        .update(flowExecutions)
        .set({
          status: 'cancelled',
          completedAt: new Date(),
        })
        .where(eq(flowExecutions.id, input.id))
        .returning();

      // TODO: Integrate with BaleyBots to actually stop the execution

      return cancelled;
    }),
});
