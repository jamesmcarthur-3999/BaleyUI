/**
 * Tools Router - Workspace tool management
 *
 * Handles CRUD operations for custom tools that can be attached to BaleyBots.
 */
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { tools, eq, and, notDeleted, softDelete, updateWithLock } from '@baleyui/db';

/**
 * Zod schema validators for tool operations
 */
const inputSchemaValidator = z.record(z.string(), z.unknown());

export const toolsRouter = router({
  /**
   * List all tools for the workspace.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.tools.findMany({
      where: and(
        eq(tools.workspaceId, ctx.workspace.id),
        notDeleted(tools)
      ),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
  }),

  /**
   * Get a single tool by ID.
   */
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tool = await ctx.db.query.tools.findFirst({
        where: and(
          eq(tools.id, input.id),
          eq(tools.workspaceId, ctx.workspace.id),
          notDeleted(tools)
        ),
      });

      if (!tool) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tool not found',
        });
      }

      return tool;
    }),

  /**
   * Create a new tool.
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().min(1),
        inputSchema: inputSchemaValidator,
        code: z.string().min(1),
        connectionId: z.string().uuid().optional(),
        isGenerated: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Guard against built-in tool name collisions
      const { isBuiltInTool } = await import('@/lib/baleybot/tools/built-in');
      if (isBuiltInTool(input.name)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `"${input.name}" is a reserved built-in tool name`,
        });
      }

      try {
        const [tool] = await ctx.db
          .insert(tools)
          .values({
            workspaceId: ctx.workspace.id,
            name: input.name,
            description: input.description,
            inputSchema: input.inputSchema,
            code: input.code,
            connectionId: input.connectionId,
            isGenerated: input.isGenerated ?? false,
          })
          .returning();

        return tool;
      } catch (error: unknown) {
        // Handle unique constraint violation
        if (error instanceof Error && (error.message.includes('UNIQUE') || error.message.includes('unique') || error.message.includes('duplicate'))) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `A tool named "${input.name}" already exists in this workspace`,
          });
        }
        throw error;
      }
    }),

  /**
   * Update an existing tool.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        version: z.number().int().positive(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional(),
        inputSchema: inputSchemaValidator.optional(),
        code: z.string().optional(),
        connectionId: z.string().uuid().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, version, ...updates } = input;

      // Verify tool exists and belongs to workspace
      const existing = await ctx.db.query.tools.findFirst({
        where: and(
          eq(tools.id, id),
          eq(tools.workspaceId, ctx.workspace.id),
          notDeleted(tools)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tool not found',
        });
      }

      // Guard against built-in tool name collisions
      if (updates.name) {
        const { isBuiltInTool } = await import('@/lib/baleybot/tools/built-in');
        if (isBuiltInTool(updates.name)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `"${updates.name}" is a reserved built-in tool name`,
          });
        }
      }

      // If updating name, check for conflicts
      if (updates.name && updates.name !== existing.name) {
        const conflict = await ctx.db.query.tools.findFirst({
          where: and(
            eq(tools.workspaceId, ctx.workspace.id),
            eq(tools.name, updates.name),
            notDeleted(tools)
          ),
        });

        if (conflict) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `A tool named "${updates.name}" already exists in this workspace`,
          });
        }
      }

      const tool = await updateWithLock(tools, id, version, updates);

      return tool;
    }),

  /**
   * Delete a tool (soft delete).
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify tool exists and belongs to workspace
      const existing = await ctx.db.query.tools.findFirst({
        where: and(
          eq(tools.id, input.id),
          eq(tools.workspaceId, ctx.workspace.id),
          notDeleted(tools)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tool not found',
        });
      }

      // API key auth has null userId - use fallback for audit trail
      await softDelete(tools, input.id, ctx.userId ?? 'system:api-key');

      return { success: true };
    }),

  /**
   * Duplicate a tool with a new name.
   */
  duplicate: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        newName: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get the source tool
      const source = await ctx.db.query.tools.findFirst({
        where: and(
          eq(tools.id, input.id),
          eq(tools.workspaceId, ctx.workspace.id),
          notDeleted(tools)
        ),
      });

      if (!source) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tool not found',
        });
      }

      // Check for duplicate name
      const existing = await ctx.db.query.tools.findFirst({
        where: and(
          eq(tools.workspaceId, ctx.workspace.id),
          eq(tools.name, input.newName),
          notDeleted(tools)
        ),
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `A tool named "${input.newName}" already exists in this workspace`,
        });
      }

      const [tool] = await ctx.db
        .insert(tools)
        .values({
          workspaceId: ctx.workspace.id,
          name: input.newName,
          description: source.description,
          inputSchema: source.inputSchema,
          code: source.code,
          connectionId: source.connectionId,
          isGenerated: false, // Duplicated tools are not marked as generated
        })
        .returning();

      return tool;
    }),
});
