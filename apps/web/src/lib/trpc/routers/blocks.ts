import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { blocks, connections, tools, eq, and, notDeleted, softDelete, updateWithLock } from '@baleyui/db';
import { TRPCError } from '@trpc/server';
import { emitBuilderEvent, actorFromContext } from '@/lib/events/with-events';

// Type inference from Drizzle schema
type Tool = typeof tools.$inferSelect;
type BlockUpdate = Partial<typeof blocks.$inferInsert>;

/**
 * Zod schema for block input validation
 */
const blockInputSchemaValidator = z.record(z.string(), z.any()).optional();
const blockOutputSchemaValidator = z.record(z.string(), z.any()).optional();
const blockToolIdsValidator = z.array(z.string().uuid()).optional();
const blockRouterConfigValidator = z.record(z.string(), z.any()).optional();
const blockLoopConfigValidator = z.record(z.string(), z.any()).optional();

/**
 * tRPC router for managing blocks (AI and Function blocks).
 */
export const blocksRouter = router({
  /**
   * List all blocks for the workspace.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const allBlocks = await ctx.db.query.blocks.findMany({
      where: and(
        eq(blocks.workspaceId, ctx.workspace.id),
        notDeleted(blocks)
      ),
      orderBy: (blocks, { desc }) => [desc(blocks.createdAt)],
    });

    return allBlocks;
  }),

  /**
   * Get a single block by ID with its tools.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const block = await ctx.db.query.blocks.findFirst({
        where: and(
          eq(blocks.id, input.id),
          eq(blocks.workspaceId, ctx.workspace.id),
          notDeleted(blocks)
        ),
      });

      if (!block) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Block not found',
        });
      }

      // Fetch associated tools if toolIds exist
      let blockTools: Tool[] = [];
      if (block.toolIds && Array.isArray(block.toolIds) && block.toolIds.length > 0) {
        const allTools = await ctx.db.query.tools.findMany({
          where: and(
            eq(tools.workspaceId, ctx.workspace.id),
            notDeleted(tools)
          ),
        });

        // Filter tools to only include those in the block's toolIds
        blockTools = allTools.filter((tool) => (block.toolIds as string[]).includes(tool.id));
      }

      return {
        ...block,
        tools: blockTools,
      };
    }),

  /**
   * Create a new block (AI or Function type).
   */
  create: protectedProcedure
    .input(
      z.object({
        type: z.enum(['ai', 'function', 'router', 'pipeline', 'loop', 'parallel']),
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        inputSchema: blockInputSchemaValidator,
        outputSchema: blockOutputSchemaValidator,
        // AI Block fields
        connectionId: z.string().uuid().optional(),
        model: z.string().max(255).optional(),
        goal: z.string().optional(),
        systemPrompt: z.string().optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().int().positive().optional(),
        maxToolIterations: z.number().int().positive().optional(),
        // Function Block fields
        code: z.string().optional(),
        // Router Block fields
        routerConfig: blockRouterConfigValidator,
        // Loop Block fields
        loopConfig: blockLoopConfigValidator,
        // Tools
        toolIds: blockToolIdsValidator,
      })
    )
    .mutation(async ({ ctx, input }) => {
      // If connectionId is provided, verify it exists and belongs to workspace
      if (input.connectionId) {
        const connection = await ctx.db.query.connections.findFirst({
          where: and(
            eq(connections.id, input.connectionId),
            eq(connections.workspaceId, ctx.workspace.id),
            notDeleted(connections)
          ),
        });

        if (!connection) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Connection not found',
          });
        }
      }

      // If toolIds are provided, verify they exist and belong to workspace
      if (input.toolIds && input.toolIds.length > 0) {
        const existingTools = await ctx.db.query.tools.findMany({
          where: and(
            eq(tools.workspaceId, ctx.workspace.id),
            notDeleted(tools)
          ),
        });

        const existingToolIds = existingTools.map((t) => t.id);
        const invalidToolIds = input.toolIds.filter((id) => !existingToolIds.includes(id));

        if (invalidToolIds.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid tool IDs: ${invalidToolIds.join(', ')}`,
          });
        }
      }

      const [block] = await ctx.db
        .insert(blocks)
        .values({
          workspaceId: ctx.workspace.id,
          type: input.type,
          name: input.name,
          description: input.description,
          inputSchema: input.inputSchema || {},
          outputSchema: input.outputSchema || {},
          connectionId: input.connectionId,
          model: input.model,
          goal: input.goal,
          systemPrompt: input.systemPrompt,
          temperature: input.temperature?.toString(),
          maxTokens: input.maxTokens,
          maxToolIterations: input.maxToolIterations || 25,
          code: input.code,
          routerConfig: input.routerConfig,
          loopConfig: input.loopConfig,
          toolIds: input.toolIds || [],
          executionCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Emit BlockCreated event
      if (block) {
        await emitBuilderEvent(
          { workspaceId: ctx.workspace.id, actor: actorFromContext(ctx) },
          'BlockCreated',
          {
            blockId: block.id,
            name: block.name,
            blockType: block.type as 'ai' | 'function' | 'router' | 'pipeline' | 'loop' | 'parallel',
          }
        );
      }

      return block;
    }),

  /**
   * Update a block with optimistic locking.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        version: z.number().int(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        inputSchema: blockInputSchemaValidator,
        outputSchema: blockOutputSchemaValidator,
        // AI Block fields
        connectionId: z.string().uuid().optional(),
        model: z.string().max(255).optional(),
        goal: z.string().optional(),
        systemPrompt: z.string().optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().int().positive().optional(),
        maxToolIterations: z.number().int().positive().optional(),
        // Function Block fields
        code: z.string().optional(),
        // Router Block fields
        routerConfig: blockRouterConfigValidator,
        // Loop Block fields
        loopConfig: blockLoopConfigValidator,
        // Tools
        toolIds: blockToolIdsValidator,
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify block exists and belongs to workspace
      const existing = await ctx.db.query.blocks.findFirst({
        where: and(
          eq(blocks.id, input.id),
          eq(blocks.workspaceId, ctx.workspace.id),
          notDeleted(blocks)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Block not found',
        });
      }

      // If connectionId is provided, verify it exists and belongs to workspace
      if (input.connectionId) {
        const connection = await ctx.db.query.connections.findFirst({
          where: and(
            eq(connections.id, input.connectionId),
            eq(connections.workspaceId, ctx.workspace.id),
            notDeleted(connections)
          ),
        });

        if (!connection) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Connection not found',
          });
        }
      }

      // If toolIds are provided, verify they exist and belong to workspace
      if (input.toolIds && input.toolIds.length > 0) {
        const existingTools = await ctx.db.query.tools.findMany({
          where: and(
            eq(tools.workspaceId, ctx.workspace.id),
            notDeleted(tools)
          ),
        });

        const existingToolIds = existingTools.map((t) => t.id);
        const invalidToolIds = input.toolIds.filter((id) => !existingToolIds.includes(id));

        if (invalidToolIds.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid tool IDs: ${invalidToolIds.join(', ')}`,
          });
        }
      }

      // Prepare update data (only include fields that are provided)
      const updateData: BlockUpdate = {};

      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.inputSchema !== undefined) updateData.inputSchema = input.inputSchema;
      if (input.outputSchema !== undefined) updateData.outputSchema = input.outputSchema;
      if (input.connectionId !== undefined) updateData.connectionId = input.connectionId;
      if (input.model !== undefined) updateData.model = input.model;
      if (input.goal !== undefined) updateData.goal = input.goal;
      if (input.systemPrompt !== undefined) updateData.systemPrompt = input.systemPrompt;
      if (input.temperature !== undefined) updateData.temperature = input.temperature.toString();
      if (input.maxTokens !== undefined) updateData.maxTokens = input.maxTokens;
      if (input.maxToolIterations !== undefined) updateData.maxToolIterations = input.maxToolIterations;
      if (input.code !== undefined) updateData.code = input.code;
      if (input.routerConfig !== undefined) updateData.routerConfig = input.routerConfig;
      if (input.loopConfig !== undefined) updateData.loopConfig = input.loopConfig;
      if (input.toolIds !== undefined) updateData.toolIds = input.toolIds;

      const updated = await updateWithLock(
        blocks,
        input.id,
        input.version,
        updateData
      );

      // Emit BlockUpdated event
      if (updated) {
        await emitBuilderEvent(
          { workspaceId: ctx.workspace.id, actor: actorFromContext(ctx) },
          'BlockUpdated',
          {
            blockId: input.id,
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
   * Delete a block (soft delete).
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify block exists and belongs to workspace
      const existing = await ctx.db.query.blocks.findFirst({
        where: and(
          eq(blocks.id, input.id),
          eq(blocks.workspaceId, ctx.workspace.id),
          notDeleted(blocks)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Block not found',
        });
      }

      const deleted = await softDelete(blocks, input.id, ctx.userId);

      // Emit BlockDeleted event
      if (deleted) {
        await emitBuilderEvent(
          { workspaceId: ctx.workspace.id, actor: actorFromContext(ctx) },
          'BlockDeleted',
          {
            blockId: input.id,
          }
        );
      }

      return deleted;
    }),

  /**
   * Duplicate an existing block.
   */
  duplicate: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Fetch the original block
      const original = await ctx.db.query.blocks.findFirst({
        where: and(
          eq(blocks.id, input.id),
          eq(blocks.workspaceId, ctx.workspace.id),
          notDeleted(blocks)
        ),
      });

      if (!original) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Block not found',
        });
      }

      // Create a copy with a new name
      const [duplicated] = await ctx.db
        .insert(blocks)
        .values({
          workspaceId: original.workspaceId,
          type: original.type,
          name: `${original.name} (Copy)`,
          description: original.description,
          inputSchema: original.inputSchema,
          outputSchema: original.outputSchema,
          connectionId: original.connectionId,
          model: original.model,
          goal: original.goal,
          systemPrompt: original.systemPrompt,
          temperature: original.temperature,
          maxTokens: original.maxTokens,
          maxToolIterations: original.maxToolIterations,
          code: original.code,
          routerConfig: original.routerConfig,
          loopConfig: original.loopConfig,
          toolIds: original.toolIds,
          executionCount: 0,
          avgLatencyMs: null,
          lastExecutedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Emit BlockCreated event for the duplicate
      if (duplicated) {
        await emitBuilderEvent(
          { workspaceId: ctx.workspace.id, actor: actorFromContext(ctx) },
          'BlockCreated',
          {
            blockId: duplicated.id,
            name: duplicated.name,
            blockType: duplicated.type as 'ai' | 'function' | 'router' | 'pipeline' | 'loop' | 'parallel',
          }
        );
      }

      return duplicated;
    }),

  /**
   * Update execution mode for a block (Phase 4.3: Hybrid Mode).
   */
  updateExecutionMode: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        version: z.number().int(),
        executionMode: z.enum(['ai_only', 'code_only', 'hybrid', 'ab_test']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify block exists and belongs to workspace
      const existing = await ctx.db.query.blocks.findFirst({
        where: and(
          eq(blocks.id, input.id),
          eq(blocks.workspaceId, ctx.workspace.id),
          notDeleted(blocks)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Block not found',
        });
      }

      const updated = await updateWithLock(
        blocks,
        input.id,
        input.version,
        {
          executionMode: input.executionMode,
        }
      );

      // Emit BlockUpdated event
      if (updated) {
        await emitBuilderEvent(
          { workspaceId: ctx.workspace.id, actor: actorFromContext(ctx) },
          'BlockUpdated',
          {
            blockId: input.id,
            changes: { executionMode: input.executionMode },
            previousValues: { executionMode: existing.executionMode },
          }
        );
      }

      return updated;
    }),

  /**
   * Update hybrid mode settings for a block (Phase 4.3: Hybrid Mode).
   */
  updateHybridSettings: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        version: z.number().int(),
        hybridThreshold: z.number().min(50).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify block exists and belongs to workspace
      const existing = await ctx.db.query.blocks.findFirst({
        where: and(
          eq(blocks.id, input.id),
          eq(blocks.workspaceId, ctx.workspace.id),
          notDeleted(blocks)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Block not found',
        });
      }

      const updated = await updateWithLock(
        blocks,
        input.id,
        input.version,
        {
          hybridThreshold: input.hybridThreshold.toString(),
        }
      );

      // Emit BlockUpdated event
      if (updated) {
        await emitBuilderEvent(
          { workspaceId: ctx.workspace.id, actor: actorFromContext(ctx) },
          'BlockUpdated',
          {
            blockId: input.id,
            changes: { hybridThreshold: input.hybridThreshold.toString() },
            previousValues: { hybridThreshold: existing.hybridThreshold },
          }
        );
      }

      return updated;
    }),

  /**
   * Get fallback logs for a block (Phase 4.3: Hybrid Mode).
   */
  getFallbackLogs: protectedProcedure
    .input(
      z.object({
        blockId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).optional().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify block exists and belongs to workspace
      const block = await ctx.db.query.blocks.findFirst({
        where: and(
          eq(blocks.id, input.blockId),
          eq(blocks.workspaceId, ctx.workspace.id),
          notDeleted(blocks)
        ),
      });

      if (!block) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Block not found',
        });
      }

      // Import fallback tracker functions
      const { getRecentFallbacks } = await import('@/lib/execution/fallback-tracker');

      const fallbacks = await getRecentFallbacks(input.blockId, input.limit);

      return fallbacks;
    }),

  /**
   * Get fallback statistics for a block (Phase 4.3: Hybrid Mode).
   */
  getFallbackStats: protectedProcedure
    .input(z.object({ blockId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify block exists and belongs to workspace
      const block = await ctx.db.query.blocks.findFirst({
        where: and(
          eq(blocks.id, input.blockId),
          eq(blocks.workspaceId, ctx.workspace.id),
          notDeleted(blocks)
        ),
      });

      if (!block) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Block not found',
        });
      }

      // Import fallback tracker functions
      const { getFallbackStats } = await import('@/lib/execution/fallback-tracker');

      const stats = await getFallbackStats(input.blockId);

      return stats;
    }),
});
