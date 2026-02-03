import { z } from 'zod';
import { router, protectedProcedure, authenticatedProcedure } from '../trpc';
import { workspaces, workspacePolicies, eq, and, sql } from '@baleyui/db';
import { TRPCError } from '@trpc/server';

/**
 * Generate a URL-friendly slug from a name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) + '-' + Math.random().toString(36).slice(2, 8);
}

export const workspacesRouter = router({
  /**
   * Check if the current user has a workspace.
   * This procedure doesn't require an existing workspace.
   */
  checkWorkspace: authenticatedProcedure.query(async ({ ctx }) => {
    const workspace = await ctx.db.query.workspaces.findFirst({
      where: (ws, { eq, and, isNull }) =>
        and(eq(ws.ownerId, ctx.userId!), isNull(ws.deletedAt)),
    });

    return {
      hasWorkspace: !!workspace,
      workspace: workspace || null,
    };
  }),

  /**
   * Create a new workspace for the current user.
   * This procedure doesn't require an existing workspace.
   */
  create: authenticatedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user already has a workspace
      const existing = await ctx.db.query.workspaces.findFirst({
        where: (ws, { eq, and, isNull }) =>
          and(eq(ws.ownerId, ctx.userId!), isNull(ws.deletedAt)),
      });

      if (existing) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You already have a workspace',
        });
      }

      // Create the workspace
      const [workspace] = await ctx.db
        .insert(workspaces)
        .values({
          name: input.name,
          slug: generateSlug(input.name),
          ownerId: ctx.userId!,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      return workspace;
    }),

  /**
   * Get the current user's workspace
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    return ctx.workspace;
  }),

  /**
   * Update workspace settings with optimistic locking
   */
  update: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, 'Workspace name is required').max(100, 'Name must be 100 characters or less'),
        version: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(workspaces)
        .set({
          name: input.name,
          version: sql`${workspaces.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workspaces.id, ctx.workspace.id),
            eq(workspaces.version, input.version)
          )
        )
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Workspace was modified by another user. Please refresh and try again.',
        });
      }

      return updated;
    }),

  /**
   * Get workspace policy
   */
  getPolicy: protectedProcedure.query(async ({ ctx }) => {
    const policy = await ctx.db.query.workspacePolicies.findFirst({
      where: (p, { eq }) => eq(p.workspaceId, ctx.workspace.id),
    });

    return policy || null;
  }),

  /**
   * Update workspace policy with optimistic locking
   */
  updatePolicy: protectedProcedure
    .input(
      z.object({
        policy: z.object({
          allowedTools: z.array(z.string()).optional(),
          forbiddenTools: z.array(z.string()).optional(),
          requiresApprovalTools: z.array(z.string()).optional(),
          maxAutoApproveAmount: z.number().int().nullable().optional(),
          reapprovalIntervalDays: z.number().int().min(1).optional(),
          maxAutoFiresBeforeReview: z.number().int().min(1).optional(),
          learningManual: z.string().nullable().optional(),
        }),
        version: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if policy exists
      const existingPolicy = await ctx.db.query.workspacePolicies.findFirst({
        where: (p, { eq }) => eq(p.workspaceId, ctx.workspace.id),
      });

      if (!existingPolicy) {
        // Create new policy if it doesn't exist
        const [created] = await ctx.db
          .insert(workspacePolicies)
          .values({
            workspaceId: ctx.workspace.id,
            ...input.policy,
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        return created;
      }

      // Update existing policy with optimistic locking
      const [updated] = await ctx.db
        .update(workspacePolicies)
        .set({
          ...input.policy,
          version: sql`${workspacePolicies.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workspacePolicies.workspaceId, ctx.workspace.id),
            eq(workspacePolicies.version, input.version)
          )
        )
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Policy was modified by another user. Please refresh and try again.',
        });
      }

      return updated;
    }),
});
