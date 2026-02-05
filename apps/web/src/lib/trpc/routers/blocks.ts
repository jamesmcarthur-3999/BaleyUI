import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { blocks, connections, tools, eq, and, notDeleted, softDelete, updateWithLock, inArray } from '@baleyui/db';
import { TRPCError } from '@trpc/server';
import type { PartialUpdateData, ToolReference } from '@/lib/types';
import {
  withErrorHandling,
  throwNotFound,
  nameSchema,
  descriptionSchema,
  uuidSchema,
  versionSchema,
} from '../helpers';

/**
 * Zod schema for block input validation
 * API-001: Stricter validation with size limits
 */
const blockInputSchemaValidator = z.record(z.string(), z.unknown()).optional();
const blockOutputSchemaValidator = z.record(z.string(), z.unknown()).optional();
const blockToolIdsValidator = z.array(uuidSchema).max(50, 'Cannot attach more than 50 tools').optional();
const blockRouterConfigValidator = z.record(z.string(), z.unknown()).optional();
const blockLoopConfigValidator = z.record(z.string(), z.unknown()).optional();
const modelSchema = z.string().min(1).max(255).regex(/^[\w:.-]+$/, 'Invalid model format').optional();
const codeSchema = z.string().max(500000, 'Code exceeds maximum size').optional();

/**
 * tRPC router for managing blocks (AI and Function blocks).
 */
export const blocksRouter = router({
  /**
   * List all blocks for the workspace.
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
      const allBlocks = await ctx.db.query.blocks.findMany({
        where: and(
          eq(blocks.workspaceId, ctx.workspace.id),
          notDeleted(blocks)
        ),
        columns: {
          id: true,
          type: true,
          name: true,
          description: true,
          model: true,
          executionCount: true,
          avgLatencyMs: true,
          lastExecutedAt: true,
          executionMode: true,
          createdAt: true,
          updatedAt: true,
          version: true,
          // Exclude heavy fields: inputSchema, outputSchema, code, systemPrompt, routerConfig, loopConfig, toolIds
        },
        orderBy: (blocks, { desc }) => [desc(blocks.createdAt)],
        limit: input?.limit ?? 50,
      });

      return allBlocks;
    }),

  /**
   * Get a single block by ID with its tools.
   * API-001: Use standardized UUID schema
   */
  getById: protectedProcedure
    .input(z.object({ id: uuidSchema }))
    .query(async ({ ctx, input }) => {
      const block = await ctx.db.query.blocks.findFirst({
        where: and(
          eq(blocks.id, input.id),
          eq(blocks.workspaceId, ctx.workspace.id),
          notDeleted(blocks)
        ),
      });

      if (!block) {
        throwNotFound('Block');
      }

      // Fetch associated tools if toolIds exist
      // PERF-003: Use inArray() filter at database level instead of loading all and filtering in JS
      let blockTools: ToolReference[] = [];
      if (block.toolIds && Array.isArray(block.toolIds) && block.toolIds.length > 0) {
        blockTools = await ctx.db.query.tools.findMany({
          where: and(
            eq(tools.workspaceId, ctx.workspace.id),
            notDeleted(tools),
            inArray(tools.id, block.toolIds as string[])
          ),
        });
      }

      return {
        ...block,
        tools: blockTools,
      };
    }),

  /**
   * Create a new block (AI or Function type).
   * API-001: Stricter input validation with size limits
   */
  create: protectedProcedure
    .input(
      z.object({
        type: z.enum(['ai', 'function', 'router', 'pipeline', 'loop', 'parallel']),
        name: nameSchema,
        description: descriptionSchema,
        inputSchema: blockInputSchemaValidator,
        outputSchema: blockOutputSchemaValidator,
        // AI Block fields
        connectionId: uuidSchema.optional(),
        model: modelSchema,
        goal: z.string().max(10000, 'Goal exceeds maximum length').optional(),
        systemPrompt: z.string().max(50000, 'System prompt exceeds maximum length').optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().int().min(1).max(1000000).optional(),
        maxToolIterations: z.number().int().min(1).max(100).optional(),
        // Function Block fields
        code: codeSchema,
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
          throwNotFound('Connection');
        }
      }

      // If toolIds are provided, verify they exist and belong to workspace
      if (input.toolIds && input.toolIds.length > 0) {
        // PERF-003: Use inArray() filter at database level instead of loading all and filtering in JS
        const existingTools = await ctx.db.query.tools.findMany({
          where: and(
            eq(tools.workspaceId, ctx.workspace.id),
            notDeleted(tools),
            inArray(tools.id, input.toolIds)
          ),
          columns: { id: true },
        });

        // PERF-004: Use Set.has() for O(1) lookup instead of Array.includes()
        const existingToolIdSet = new Set(existingTools.map((t) => t.id));
        const invalidToolIds = input.toolIds.filter((id) => !existingToolIdSet.has(id));

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

      return block;
    }),

  /**
   * Update a block with optimistic locking.
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
        inputSchema: blockInputSchemaValidator,
        outputSchema: blockOutputSchemaValidator,
        // AI Block fields
        connectionId: uuidSchema.optional(),
        model: modelSchema,
        goal: z.string().max(10000, 'Goal exceeds maximum length').optional(),
        systemPrompt: z.string().max(50000, 'System prompt exceeds maximum length').optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().int().min(1).max(1000000).optional(),
        maxToolIterations: z.number().int().min(1).max(100).optional(),
        // Function Block fields
        code: codeSchema,
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
        columns: { id: true }, // Only need to verify existence
      });

      if (!existing) {
        throwNotFound('Block');
      }

      // If connectionId is provided, verify it exists and belongs to workspace
      if (input.connectionId) {
        const connection = await ctx.db.query.connections.findFirst({
          where: and(
            eq(connections.id, input.connectionId),
            eq(connections.workspaceId, ctx.workspace.id),
            notDeleted(connections)
          ),
          columns: { id: true },
        });

        if (!connection) {
          throwNotFound('Connection');
        }
      }

      // If toolIds are provided, verify they exist and belong to workspace
      if (input.toolIds && input.toolIds.length > 0) {
        // PERF-003: Use inArray() filter at database level instead of loading all and filtering in JS
        const existingTools = await ctx.db.query.tools.findMany({
          where: and(
            eq(tools.workspaceId, ctx.workspace.id),
            notDeleted(tools),
            inArray(tools.id, input.toolIds)
          ),
          columns: { id: true },
        });

        // PERF-004: Use Set.has() for O(1) lookup instead of Array.includes()
        const existingToolIdSet = new Set(existingTools.map((t) => t.id));
        const invalidToolIds = input.toolIds.filter((id) => !existingToolIdSet.has(id));

        if (invalidToolIds.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid tool IDs: ${invalidToolIds.join(', ')}`,
          });
        }
      }

      // Prepare update data (only include fields that are provided)
      const updateData: PartialUpdateData = {};

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

      // API-002: Use shared error handling helper
      return await withErrorHandling(
        () => updateWithLock(blocks, input.id, input.version, updateData),
        'Block'
      );
    }),

  /**
   * Delete a block (soft delete).
   * API-001: Use standardized UUID schema
   */
  delete: protectedProcedure
    .input(z.object({ id: uuidSchema }))
    .mutation(async ({ ctx, input }) => {
      // Verify block exists and belongs to workspace
      const existing = await ctx.db.query.blocks.findFirst({
        where: and(
          eq(blocks.id, input.id),
          eq(blocks.workspaceId, ctx.workspace.id),
          notDeleted(blocks)
        ),
        columns: { id: true },
      });

      if (!existing) {
        throwNotFound('Block');
      }

      // API key auth has null userId - use fallback for audit trail
      const deleted = await softDelete(blocks, input.id, ctx.userId ?? 'system:api-key');

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
