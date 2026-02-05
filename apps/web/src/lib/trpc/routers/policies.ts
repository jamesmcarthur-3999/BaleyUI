import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import {
  workspacePolicies,
  approvalPatterns,
  eq,
  and,
  desc,
  isNull,
  sql,
  updateWithLock,
} from '@baleyui/db';
import { TRPCError } from '@trpc/server';

/**
 * Trust levels for approval patterns
 */
const trustLevelSchema = z.enum(['provisional', 'trusted', 'permanent']);

/**
 * tRPC router for managing workspace policies and approval patterns.
 */
export const policiesRouter = router({
  // ============================================================================
  // WORKSPACE POLICIES
  // ============================================================================

  /**
   * Get policies for the current workspace.
   * Creates default policies if none exist.
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    let policies = await ctx.db.query.workspacePolicies.findFirst({
      where: eq(workspacePolicies.workspaceId, ctx.workspace.id),
    });

    // Create default policies if none exist (handle race with ON CONFLICT)
    if (!policies) {
      const [created] = await ctx.db
        .insert(workspacePolicies)
        .values({
          workspaceId: ctx.workspace.id,
          allowedTools: null,
          forbiddenTools: null,
          requiresApprovalTools: null,
          maxAutoApproveAmount: null,
          reapprovalIntervalDays: 90,
          maxAutoFiresBeforeReview: 100,
          learningManual: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();

      // If another request already created it, fetch the existing one
      policies = created ?? await ctx.db.query.workspacePolicies.findFirst({
        where: eq(workspacePolicies.workspaceId, ctx.workspace.id),
      });
    }

    return policies;
  }),

  /**
   * Update workspace policies.
   */
  update: protectedProcedure
    .input(
      z.object({
        version: z.number().int().min(0),
        allowedTools: z.array(z.string()).nullable().optional(),
        forbiddenTools: z.array(z.string()).nullable().optional(),
        requiresApprovalTools: z.array(z.string()).nullable().optional(),
        maxAutoApproveAmount: z.number().int().positive().nullable().optional(),
        reapprovalIntervalDays: z.number().int().min(1).max(365).optional(),
        maxAutoFiresBeforeReview: z.number().int().min(1).max(10000).optional(),
        learningManual: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if policies exist
      const existing = await ctx.db.query.workspacePolicies.findFirst({
        where: eq(workspacePolicies.workspaceId, ctx.workspace.id),
      });

      if (existing) {
        // Update existing policies with optimistic locking
        const updateData: Record<string, unknown> = {};

        if (input.allowedTools !== undefined) updateData.allowedTools = input.allowedTools;
        if (input.forbiddenTools !== undefined) updateData.forbiddenTools = input.forbiddenTools;
        if (input.requiresApprovalTools !== undefined)
          updateData.requiresApprovalTools = input.requiresApprovalTools;
        if (input.maxAutoApproveAmount !== undefined)
          updateData.maxAutoApproveAmount = input.maxAutoApproveAmount;
        if (input.reapprovalIntervalDays !== undefined)
          updateData.reapprovalIntervalDays = input.reapprovalIntervalDays;
        if (input.maxAutoFiresBeforeReview !== undefined)
          updateData.maxAutoFiresBeforeReview = input.maxAutoFiresBeforeReview;
        if (input.learningManual !== undefined) updateData.learningManual = input.learningManual;

        const updated = await updateWithLock(workspacePolicies, existing.id, input.version, updateData);

        return updated;
      } else {
        // Create new policies
        const [created] = await ctx.db
          .insert(workspacePolicies)
          .values({
            workspaceId: ctx.workspace.id,
            allowedTools: input.allowedTools ?? null,
            forbiddenTools: input.forbiddenTools ?? null,
            requiresApprovalTools: input.requiresApprovalTools ?? null,
            maxAutoApproveAmount: input.maxAutoApproveAmount ?? null,
            reapprovalIntervalDays: input.reapprovalIntervalDays ?? 90,
            maxAutoFiresBeforeReview: input.maxAutoFiresBeforeReview ?? 100,
            learningManual: input.learningManual ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        return created;
      }
    }),

  // ============================================================================
  // APPROVAL PATTERNS
  // ============================================================================

  /**
   * List all approval patterns for the workspace.
   */
  listApprovalPatterns: protectedProcedure
    .input(
      z.object({
        tool: z.string().optional(),
        trustLevel: trustLevelSchema.optional(),
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
   * Get a single approval pattern by ID.
   */
  getApprovalPattern: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const pattern = await ctx.db.query.approvalPatterns.findFirst({
        where: and(
          eq(approvalPatterns.id, input.id),
          eq(approvalPatterns.workspaceId, ctx.workspace.id)
        ),
      });

      if (!pattern) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Approval pattern not found',
        });
      }

      return pattern;
    }),

  /**
   * Create a new approval pattern (typically from "Approve & Remember").
   */
  createApprovalPattern: protectedProcedure
    .input(
      z.object({
        tool: z.string().min(1).max(255),
        actionPattern: z.record(z.string(), z.unknown()),
        entityGoalPattern: z.string().optional(),
        trustLevel: trustLevelSchema.optional().default('provisional'),
        expiresAt: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [pattern] = await ctx.db
        .insert(approvalPatterns)
        .values({
          workspaceId: ctx.workspace.id,
          tool: input.tool,
          actionPattern: input.actionPattern,
          entityGoalPattern: input.entityGoalPattern,
          trustLevel: input.trustLevel,
          timesUsed: 0,
          approvedBy: ctx.userId,
          approvedAt: new Date(),
          expiresAt: input.expiresAt,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      return pattern;
    }),

  /**
   * Update an approval pattern.
   */
  updateApprovalPattern: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        actionPattern: z.record(z.string(), z.unknown()).optional(),
        entityGoalPattern: z.string().nullable().optional(),
        trustLevel: trustLevelSchema.optional(),
        expiresAt: z.date().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify pattern exists and belongs to workspace
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

      if (existing.revokedAt) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Cannot update a revoked pattern',
        });
      }

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (input.actionPattern !== undefined) updateData.actionPattern = input.actionPattern;
      if (input.entityGoalPattern !== undefined)
        updateData.entityGoalPattern = input.entityGoalPattern;
      if (input.trustLevel !== undefined) updateData.trustLevel = input.trustLevel;
      if (input.expiresAt !== undefined) updateData.expiresAt = input.expiresAt;

      const [updated] = await ctx.db
        .update(approvalPatterns)
        .set(updateData)
        .where(eq(approvalPatterns.id, input.id))
        .returning();

      return updated;
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
      // Verify pattern exists and belongs to workspace
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

      if (existing.revokedAt) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Pattern is already revoked',
        });
      }

      const [revoked] = await ctx.db
        .update(approvalPatterns)
        .set({
          revokedAt: new Date(),
          revokedBy: ctx.userId,
          revokeReason: input.reason,
          updatedAt: new Date(),
        })
        .where(eq(approvalPatterns.id, input.id))
        .returning();

      return revoked;
    }),

  /**
   * Record usage of an approval pattern.
   * Called by the executor when a pattern auto-approves a tool call.
   */
  recordPatternUsage: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify pattern exists and belongs to workspace
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

      // Use atomic SQL increment and conditional trust level upgrade
      // This prevents race conditions when multiple executions happen concurrently
      const [updated] = await ctx.db
        .update(approvalPatterns)
        .set({
          // Atomic increment of timesUsed
          timesUsed: sql`COALESCE(${approvalPatterns.timesUsed}, 0) + 1`,
          // Auto-upgrade to trusted after 10 uses (when provisional)
          // CASE: if provisional AND new count >= 10, upgrade to 'trusted'
          trustLevel: sql`CASE
            WHEN ${approvalPatterns.trustLevel} = 'provisional'
              AND COALESCE(${approvalPatterns.timesUsed}, 0) + 1 >= 10
            THEN 'trusted'
            ELSE ${approvalPatterns.trustLevel}
          END`,
          updatedAt: new Date(),
        })
        .where(eq(approvalPatterns.id, input.id))
        .returning();

      return updated;
    }),

  /**
   * Get approval patterns that match a tool call.
   * Used by the executor to check if a tool call can be auto-approved.
   */
  findMatchingPatterns: protectedProcedure
    .input(
      z.object({
        tool: z.string(),
        entityGoal: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Get active patterns for this tool
      const patterns = await ctx.db.query.approvalPatterns.findMany({
        where: and(
          eq(approvalPatterns.workspaceId, ctx.workspace.id),
          eq(approvalPatterns.tool, input.tool),
          isNull(approvalPatterns.revokedAt)
        ),
        orderBy: [desc(approvalPatterns.timesUsed)],
      });

      // Filter by expiration
      const now = new Date();
      const activePatterns = patterns.filter((p) => {
        if (p.expiresAt && p.expiresAt < now) return false;
        return true;
      });

      // If entityGoal is provided, filter by pattern match
      if (input.entityGoal) {
        return activePatterns.filter((p) => {
          if (!p.entityGoalPattern) return true; // Pattern applies to all goals
          try {
            const regex = new RegExp(p.entityGoalPattern, 'i');
            return regex.test(input.entityGoal!);
          } catch {
            return false; // Invalid regex, skip pattern
          }
        });
      }

      return activePatterns;
    }),

  /**
   * Get statistics about approval patterns.
   */
  getPatternStats: protectedProcedure.query(async ({ ctx }) => {
    const patterns = await ctx.db.query.approvalPatterns.findMany({
      where: eq(approvalPatterns.workspaceId, ctx.workspace.id),
    });

    const total = patterns.length;
    const active = patterns.filter((p) => !p.revokedAt).length;
    const revoked = patterns.filter((p) => p.revokedAt).length;

    const byTrustLevel = patterns.reduce(
      (acc, p) => {
        if (!p.revokedAt) {
          acc[p.trustLevel] = (acc[p.trustLevel] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>
    );

    const byTool = patterns.reduce(
      (acc, p) => {
        if (!p.revokedAt) {
          acc[p.tool] = (acc[p.tool] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>
    );

    const totalUsage = patterns.reduce((sum, p) => sum + (p.timesUsed ?? 0), 0);

    return {
      total,
      active,
      revoked,
      byTrustLevel,
      byTool,
      totalUsage,
    };
  }),
});
