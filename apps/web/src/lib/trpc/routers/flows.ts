import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import {
  flows,
  flowExecutions,
  baleybots,
  eq,
  and,
  inArray,
  notDeleted,
  softDelete,
  updateWithLock,
} from '@baleyui/db';
import { TRPCError } from '@trpc/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import type { FlowNode, FlowEdge, PartialUpdateData } from '@/lib/types';
import { createLogger } from '@/lib/logger';
import { executeFlow } from '@/lib/flow-executor';
import {
  withErrorHandling,
  throwNotFound,
  throwForbidden,
  nameSchema,
  descriptionSchema,
  uuidSchema,
  versionSchema,
} from '../helpers';

const log = createLogger('flows-router');

/**
 * Zod schema for a single flow node
 * Note: Uses permissive types to accommodate React Flow node structure
 * @internal exported for testing
 */
export const flowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['baleybot', 'trigger', 'condition', 'action', 'output', 'source', 'sink', 'ai-block', 'function-block', 'router', 'parallel', 'loop']).optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.string(), z.unknown()).optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  selected: z.boolean().optional(),
  dragging: z.boolean().optional(),
}).passthrough();

/**
 * Zod schema for flow nodes array
 */
const flowNodesSchema = z.array(flowNodeSchema).optional();

/**
 * Zod schema for a single flow edge
 * Note: Uses permissive types to accommodate React Flow edge structure
 * @internal exported for testing
 */
export const flowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullish(),
  targetHandle: z.string().nullish(),
  type: z.string().optional(),
  animated: z.boolean().optional(),
  selected: z.boolean().optional(),
}).passthrough();

/**
 * Zod schema for flow edges array
 */
const flowEdgesSchema = z.array(flowEdgeSchema).optional();

/**
 * Zod schema for a single flow trigger
 * @internal exported for testing
 */
export const flowTriggerSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['manual', 'webhook', 'schedule', 'api', 'event']),
  nodeId: z.string().min(1),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

/**
 * Zod schema for flow triggers array
 */
const flowTriggersSchema = z.array(flowTriggerSchema).optional();

/**
 * tRPC router for managing flows (visual compositions).
 */
export const flowsRouter = router({
  /**
   * List all flows in the workspace with node/edge counts for preview.
   * API-003: Add pagination support
   * API-004: Return only necessary fields for list view
   */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).optional().default(50),
        cursor: uuidSchema.optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      // API-004: Select only fields needed for list display
      const allFlows = await ctx.db.query.flows.findMany({
        where: and(
          eq(flows.workspaceId, ctx.workspace.id),
          notDeleted(flows)
        ),
        columns: {
          id: true,
          name: true,
          description: true,
          nodes: true, // Needed for nodeCount
          edges: true, // Needed for edgeCount
          enabled: true,
          createdAt: true,
          updatedAt: true,
          version: true,
          // Exclude heavy fields: triggers
        },
        orderBy: (flows, { desc }) => [desc(flows.createdAt)],
        limit: input?.limit ?? 50,
      });

      // Add node/edge counts for preview
      // Note: nodes/edges are included as they're needed for visual previews
      return allFlows.map((flow) => ({
        ...flow,
        nodeCount: Array.isArray(flow.nodes) ? flow.nodes.length : 0,
        edgeCount: Array.isArray(flow.edges) ? flow.edges.length : 0,
      }));
    }),

  /**
   * Get a single flow by ID with full nodes and edges.
   * API-001: Use standardized UUID schema
   */
  getById: protectedProcedure
    .input(z.object({ id: uuidSchema }))
    .query(async ({ ctx, input }) => {
      const flow = await ctx.db.query.flows.findFirst({
        where: and(
          eq(flows.id, input.id),
          eq(flows.workspaceId, ctx.workspace.id),
          notDeleted(flows)
        ),
      });

      if (!flow) {
        throwNotFound('Flow');
      }

      return flow;
    }),

  /**
   * Create a new flow with empty nodes/edges.
   * API-001: Stricter input validation
   */
  create: protectedProcedure
    .input(
      z.object({
        name: nameSchema,
        description: descriptionSchema,
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

      return flow;
    }),

  /**
   * Update a flow with optimistic locking.
   * API-001: Stricter input validation
   * API-002: Use shared error handling
   */
  update: protectedProcedure
    .input(
      z.object({
        id: uuidSchema,
        version: versionSchema,
        name: nameSchema.optional(),
        description: descriptionSchema,
        nodes: flowNodesSchema.refine(
          (nodes) => !nodes || nodes.length <= 500,
          'Flow cannot have more than 500 nodes'
        ),
        edges: flowEdgesSchema.refine(
          (edges) => !edges || edges.length <= 1000,
          'Flow cannot have more than 1000 edges'
        ),
        triggers: flowTriggersSchema.refine(
          (triggers) => !triggers || triggers.length <= 50,
          'Flow cannot have more than 50 triggers'
        ),
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
        columns: { id: true },
      });

      if (!existing) {
        throwNotFound('Flow');
      }

      // Prepare update data (only include fields that are provided)
      const updateData: PartialUpdateData = {};

      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.nodes !== undefined) updateData.nodes = input.nodes;
      if (input.edges !== undefined) updateData.edges = input.edges;
      if (input.triggers !== undefined) updateData.triggers = input.triggers;
      if (input.enabled !== undefined) updateData.enabled = input.enabled;

      // API-002: Use shared error handling helper
      return await withErrorHandling(
        () => updateWithLock(flows, input.id, input.version, updateData),
        'Flow'
      );
    }),

  /**
   * Delete a flow (soft delete).
   * API-001: Use standardized UUID schema
   */
  delete: protectedProcedure
    .input(z.object({ id: uuidSchema }))
    .mutation(async ({ ctx, input }) => {
      // Verify flow exists and belongs to workspace
      const existing = await ctx.db.query.flows.findFirst({
        where: and(
          eq(flows.id, input.id),
          eq(flows.workspaceId, ctx.workspace.id),
          notDeleted(flows)
        ),
        columns: { id: true },
      });

      if (!existing) {
        throwNotFound('Flow');
      }

      // API key auth has null userId - use fallback for audit trail
      const deleted = await softDelete(flows, input.id, ctx.userId ?? 'system:api-key');

      return deleted;
    }),

  /**
   * Duplicate an existing flow.
   * API-001: Use standardized UUID schema
   */
  duplicate: protectedProcedure
    .input(z.object({ id: uuidSchema }))
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
        throwNotFound('Flow');
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

      return duplicated;
    }),

  /**
   * Execute a flow (start a new execution).
   * API-001: Use standardized UUID schema
   */
  execute: protectedProcedure
    .input(
      z.object({
        flowId: uuidSchema,
        input: z.unknown().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Rate limit: 10 executions per minute per user per workspace
      await checkRateLimit(
        `execute:${ctx.workspace.id}:${ctx.userId}`,
        RATE_LIMITS.execute
      );

      log.info('Executing flow', { flowId: input.flowId });

      // Verify flow exists and belongs to workspace
      const flow = await ctx.db.query.flows.findFirst({
        where: and(
          eq(flows.id, input.flowId),
          eq(flows.workspaceId, ctx.workspace.id),
          notDeleted(flows)
        ),
      });

      if (!flow) {
        throwNotFound('Flow');
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

      if (!execution) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create execution record',
        });
      }

      // Extract BaleyBot IDs from flow nodes
      const nodes = (flow.nodes || []) as FlowNode[];
      const edges = (flow.edges || []) as FlowEdge[];
      const baleybotIds = nodes
        .filter((n) => n.type === 'baleybot' && n.data?.baleybotId)
        .map((n) => n.data?.baleybotId as string)
        .filter((id): id is string => id !== undefined);

      // Fetch all referenced baleybots
      const baleybotMap = new Map<string, { balCode: string }>();
      if (baleybotIds.length > 0) {
        const fetchedBaleybots = await ctx.db.query.baleybots.findMany({
          where: and(
            inArray(baleybots.id, baleybotIds),
            eq(baleybots.workspaceId, ctx.workspace.id),
            notDeleted(baleybots)
          ),
          columns: {
            id: true,
            balCode: true,
          },
        });
        for (const bot of fetchedBaleybots) {
          if (bot.balCode) {
            baleybotMap.set(bot.id, { balCode: bot.balCode });
          }
        }
      }

      // Update execution status to running
      await ctx.db
        .update(flowExecutions)
        .set({ status: 'running' })
        .where(eq(flowExecutions.id, execution.id));

      // Execute the flow
      try {
        // Type assertion needed because flowNodeSchema.type is optional for flexibility,
        // but executeFlow requires type to be defined. Nodes without types are filtered
        // or defaulted during execution.
        const result = await executeFlow({
          flowId: input.flowId,
          executionId: execution.id,
          nodes: nodes as Parameters<typeof executeFlow>[0]['nodes'],
          edges: edges as Parameters<typeof executeFlow>[0]['edges'],
          input: input.input,
          apiKey: process.env.ANTHROPIC_API_KEY || '',
          baleybots: baleybotMap,
        });

        // Update execution with result
        const [completed] = await ctx.db
          .update(flowExecutions)
          .set({
            status: result.status === 'success' ? 'completed' : 'failed',
            output: result.outputs,
            error: result.error || null,
            completedAt: new Date(),
          })
          .where(eq(flowExecutions.id, execution.id))
          .returning();

        return completed;
      } catch (error) {
        // Update execution as failed
        const [failed] = await ctx.db
          .update(flowExecutions)
          .set({
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            completedAt: new Date(),
          })
          .where(eq(flowExecutions.id, execution.id))
          .returning();

        log.error('Flow execution failed', {
          executionId: execution.id,
          flowId: input.flowId,
          error: error instanceof Error ? error.message : String(error),
        });

        return failed;
      }
    }),

  /**
   * Get a flow execution by ID with status and results.
   * API-001: Use standardized UUID schema
   * API-002: Use shared error helpers
   */
  getExecution: protectedProcedure
    .input(z.object({ id: uuidSchema }))
    .query(async ({ ctx, input }) => {
      const execution = await ctx.db.query.flowExecutions.findFirst({
        where: eq(flowExecutions.id, input.id),
        with: {
          flow: {
            columns: {
              id: true,
              name: true,
              workspaceId: true,
            },
          },
          blockExecutions: {
            orderBy: (blockExecutions, { asc }) => [asc(blockExecutions.createdAt)],
          },
        },
      });

      if (!execution) {
        throwNotFound('Flow execution');
      }

      // Verify the flow belongs to the user's workspace
      if (execution.flow.workspaceId !== ctx.workspace.id) {
        throwForbidden('You do not have access to this execution');
      }

      return execution;
    }),

  /**
   * List recent flow executions with optional filtering.
   * API-001: Use standardized UUID schema
   * API-004: Return only necessary fields
   */
  listExecutions: protectedProcedure
    .input(
      z.object({
        flowId: uuidSchema.optional(),
        status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']).optional(),
        limit: z.number().int().min(1).max(100).default(50),
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
          columns: { id: true },
        });

        if (!flow) {
          throwNotFound('Flow');
        }

        conditions.push(eq(flowExecutions.flowId, input.flowId));
      }

      if (input.status) {
        conditions.push(eq(flowExecutions.status, input.status));
      }

      // If no flowId provided, filter by workspace flows at DB level
      if (!input.flowId) {
        const workspaceFlows = await ctx.db.query.flows.findMany({
          where: and(
            eq(flows.workspaceId, ctx.workspace.id),
            notDeleted(flows)
          ),
          columns: { id: true },
        });
        const workspaceFlowIds = workspaceFlows.map((f) => f.id);

        if (workspaceFlowIds.length === 0) {
          return [];
        }

        conditions.push(inArray(flowExecutions.flowId, workspaceFlowIds));
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

      return executions;
    }),

  /**
   * Cancel a running flow execution.
   * API-001: Use standardized UUID schema
   * API-002: Use shared error helpers
   */
  cancelExecution: protectedProcedure
    .input(z.object({ id: uuidSchema }))
    .mutation(async ({ ctx, input }) => {
      // Verify execution exists and belongs to workspace
      const execution = await ctx.db.query.flowExecutions.findFirst({
        where: eq(flowExecutions.id, input.id),
        with: {
          flow: {
            columns: {
              id: true,
              workspaceId: true,
            },
          },
        },
      });

      if (!execution) {
        throwNotFound('Flow execution');
      }

      if (execution.flow.workspaceId !== ctx.workspace.id) {
        throwForbidden('You do not have access to this execution');
      }

      // Only pending or running executions can be cancelled
      if (execution.status !== 'pending' && execution.status !== 'running') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot cancel execution with status: ${execution.status}`,
        });
      }

      log.info('Cancelling flow execution', { executionId: input.id, flowId: execution.flowId });

      // Update execution status to cancelled
      const [cancelled] = await ctx.db
        .update(flowExecutions)
        .set({
          status: 'cancelled',
          completedAt: new Date(),
        })
        .where(eq(flowExecutions.id, input.id))
        .returning();

      // TODO(EXEC-001): Implement flow cancellation by:
      // 1. Get running BaleyBot executions from flowExecution.blockExecutions
      // 2. Signal cancellation to each running executor via AbortController
      // 3. Update individual block execution statuses
      // See: packages/sdk/src/bal-executor.ts for cancellation pattern

      return cancelled;
    }),
});
