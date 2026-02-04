import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { patterns, blocks, decisions, eq, and, desc, notDeleted } from '@baleyui/db';
import { TRPCError } from '@trpc/server';
import { analyzeDecisions } from '@/lib/patterns/pattern-analyzer';
import type { PatternCondition, PatternOutputTemplate, PartialUpdateData } from '@/lib/types';

/**
 * tRPC router for managing patterns (extracted rules from decisions).
 */
export const patternsRouter = router({
  /**
   * List patterns with filtering.
   */
  list: protectedProcedure
    .input(
      z.object({
        blockId: z.string().uuid().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      // Build where conditions
      const conditions = [
        eq(blocks.workspaceId, ctx.workspace.id),
        notDeleted(blocks),
      ];

      if (input.blockId) {
        conditions.push(eq(patterns.blockId, input.blockId));
      }

      // Fetch patterns with block info
      const items = await ctx.db
        .select({
          id: patterns.id,
          blockId: patterns.blockId,
          blockName: blocks.name,
          rule: patterns.rule,
          condition: patterns.condition,
          outputTemplate: patterns.outputTemplate,
          confidence: patterns.confidence,
          supportCount: patterns.supportCount,
          generatedCode: patterns.generatedCode,
          createdAt: patterns.createdAt,
          updatedAt: patterns.updatedAt,
        })
        .from(patterns)
        .innerJoin(blocks, eq(patterns.blockId, blocks.id))
        .where(and(...conditions))
        .orderBy(desc(patterns.confidence), desc(patterns.supportCount))
        .limit(input.limit);

      return { items };
    }),

  /**
   * Get a single pattern by ID.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const pattern = await ctx.db
        .select({
          id: patterns.id,
          blockId: patterns.blockId,
          blockName: blocks.name,
          rule: patterns.rule,
          condition: patterns.condition,
          outputTemplate: patterns.outputTemplate,
          confidence: patterns.confidence,
          supportCount: patterns.supportCount,
          generatedCode: patterns.generatedCode,
          createdAt: patterns.createdAt,
          updatedAt: patterns.updatedAt,
        })
        .from(patterns)
        .innerJoin(blocks, eq(patterns.blockId, blocks.id))
        .where(and(eq(patterns.id, input.id), eq(blocks.workspaceId, ctx.workspace.id), notDeleted(blocks)))
        .limit(1);

      if (!pattern || pattern.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pattern not found',
        });
      }

      return pattern[0];
    }),

  /**
   * Create a new pattern.
   */
  create: protectedProcedure
    .input(
      z.object({
        blockId: z.string().uuid(),
        rule: z.string().min(1),
        condition: z.unknown(),
        outputTemplate: z.unknown().optional(),
        confidence: z.number().min(0).max(1).optional(),
        supportCount: z.number().int().min(0).optional(),
        generatedCode: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify block exists and belongs to workspace
      const block = await ctx.db
        .select({ id: blocks.id })
        .from(blocks)
        .where(and(eq(blocks.id, input.blockId), eq(blocks.workspaceId, ctx.workspace.id), notDeleted(blocks)))
        .limit(1);

      if (!block || block.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Block not found',
        });
      }

      // Create pattern
      const [newPattern] = await ctx.db
        .insert(patterns)
        .values({
          blockId: input.blockId,
          rule: input.rule,
          condition: input.condition,
          outputTemplate: input.outputTemplate || null,
          confidence: input.confidence?.toString() || null,
          supportCount: input.supportCount || null,
          generatedCode: input.generatedCode || null,
        })
        .returning();

      return newPattern;
    }),

  /**
   * Update an existing pattern.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        rule: z.string().min(1).optional(),
        condition: z.unknown().optional(),
        outputTemplate: z.unknown().optional(),
        confidence: z.number().min(0).max(1).optional(),
        supportCount: z.number().int().min(0).optional(),
        generatedCode: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify pattern exists and belongs to workspace
      const existing = await ctx.db
        .select({ id: patterns.id })
        .from(patterns)
        .innerJoin(blocks, eq(patterns.blockId, blocks.id))
        .where(and(eq(patterns.id, input.id), eq(blocks.workspaceId, ctx.workspace.id), notDeleted(blocks)))
        .limit(1);

      if (!existing || existing.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pattern not found',
        });
      }

      // Build update object
      const updateData: PartialUpdateData = {
        updatedAt: new Date(),
      };

      if (input.rule !== undefined) updateData.rule = input.rule;
      if (input.condition !== undefined) updateData.condition = input.condition;
      if (input.outputTemplate !== undefined) updateData.outputTemplate = input.outputTemplate;
      if (input.confidence !== undefined) updateData.confidence = input.confidence.toString();
      if (input.supportCount !== undefined) updateData.supportCount = input.supportCount;
      if (input.generatedCode !== undefined) updateData.generatedCode = input.generatedCode;

      // Update pattern
      const [updated] = await ctx.db
        .update(patterns)
        .set(updateData)
        .where(eq(patterns.id, input.id))
        .returning();

      return updated;
    }),

  /**
   * Delete a pattern (soft delete).
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify pattern exists and belongs to workspace
      const existing = await ctx.db
        .select({ id: patterns.id })
        .from(patterns)
        .innerJoin(blocks, eq(patterns.blockId, blocks.id))
        .where(and(eq(patterns.id, input.id), eq(blocks.workspaceId, ctx.workspace.id), notDeleted(blocks)))
        .limit(1);

      if (!existing || existing.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pattern not found',
        });
      }

      // Hard delete pattern (no soft delete column in patterns table)
      await ctx.db.delete(patterns).where(eq(patterns.id, input.id));

      return { success: true };
    }),

  /**
   * Associate a pattern with a block.
   * This is a placeholder for future functionality where patterns can be linked
   * to multiple blocks or have more complex relationships.
   */
  associateWithBlock: protectedProcedure
    .input(
      z.object({
        patternId: z.string().uuid(),
        blockId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify pattern exists
      const pattern = await ctx.db
        .select({ id: patterns.id })
        .from(patterns)
        .innerJoin(blocks, eq(patterns.blockId, blocks.id))
        .where(and(eq(patterns.id, input.patternId), eq(blocks.workspaceId, ctx.workspace.id), notDeleted(blocks)))
        .limit(1);

      if (!pattern || pattern.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pattern not found',
        });
      }

      // Verify target block exists
      const targetBlock = await ctx.db
        .select({ id: blocks.id })
        .from(blocks)
        .where(and(eq(blocks.id, input.blockId), eq(blocks.workspaceId, ctx.workspace.id), notDeleted(blocks)))
        .limit(1);

      if (!targetBlock || targetBlock.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Target block not found',
        });
      }

      // Update pattern's blockId
      const [updated] = await ctx.db
        .update(patterns)
        .set({
          blockId: input.blockId,
          updatedAt: new Date(),
        })
        .where(eq(patterns.id, input.patternId))
        .returning();

      return updated;
    }),

  /**
   * Analyze a block's decisions to detect patterns.
   */
  analyzeBlock: protectedProcedure
    .input(z.object({ blockId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify block exists and belongs to workspace
      const block = await ctx.db
        .select({ id: blocks.id, name: blocks.name })
        .from(blocks)
        .where(
          and(
            eq(blocks.id, input.blockId),
            eq(blocks.workspaceId, ctx.workspace.id),
            notDeleted(blocks)
          )
        )
        .limit(1);

      if (!block || block.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Block not found',
        });
      }

      // Fetch all decisions for this block
      const blockDecisions = await ctx.db
        .select({
          id: decisions.id,
          input: decisions.input,
          output: decisions.output,
        })
        .from(decisions)
        .where(eq(decisions.blockId, input.blockId))
        .orderBy(desc(decisions.createdAt));

      // Analyze decisions to detect patterns
      const analysisResult = await analyzeDecisions(
        blockDecisions.map((d) => ({
          id: d.id,
          input: d.input,
          output: d.output,
        }))
      );

      // Delete old patterns before saving new ones (prevent duplication)
      await ctx.db.delete(patterns).where(eq(patterns.blockId, input.blockId));

      // Store detected patterns in the database
      const savedPatterns = [];
      for (const pattern of analysisResult.patterns) {
        const [saved] = await ctx.db
          .insert(patterns)
          .values({
            blockId: input.blockId,
            rule: pattern.condition,
            condition: pattern.conditionAst,
            outputTemplate: { value: pattern.outputValue },
            confidence: (pattern.confidence / 100).toFixed(4), // Store as decimal string 0.0000-1.0000
            supportCount: pattern.supportCount,
            samples: pattern.samples || [], // Store sample decisions for validation
            patternType: pattern.type || 'exact_match',
            generatedCode: null,
          })
          .returning();

        savedPatterns.push(saved);
      }

      return {
        ...analysisResult,
        blockId: input.blockId,
        savedPatterns,
      };
    }),

  /**
   * Get cached analysis results for a block.
   */
  getAnalysisResult: protectedProcedure
    .input(z.object({ blockId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify block exists and belongs to workspace
      const block = await ctx.db
        .select({ id: blocks.id })
        .from(blocks)
        .where(
          and(
            eq(blocks.id, input.blockId),
            eq(blocks.workspaceId, ctx.workspace.id),
            notDeleted(blocks)
          )
        )
        .limit(1);

      if (!block || block.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Block not found',
        });
      }

      // Fetch decisions for this block
      const blockDecisions = await ctx.db
        .select({
          id: decisions.id,
          input: decisions.input,
          output: decisions.output,
        })
        .from(decisions)
        .where(eq(decisions.blockId, input.blockId))
        .orderBy(desc(decisions.createdAt));

      // Calculate output distribution
      const outputDistribution: Record<string, number> = {};
      for (const decision of blockDecisions) {
        const key = JSON.stringify(decision.output);
        outputDistribution[key] = (outputDistribution[key] || 0) + 1;
      }

      // Fetch stored patterns with samples
      const storedPatterns = await ctx.db
        .select({
          id: patterns.id,
          rule: patterns.rule,
          condition: patterns.condition,
          outputTemplate: patterns.outputTemplate,
          confidence: patterns.confidence,
          supportCount: patterns.supportCount,
          samples: patterns.samples,
          patternType: patterns.patternType,
          createdAt: patterns.createdAt,
        })
        .from(patterns)
        .where(eq(patterns.blockId, input.blockId))
        .orderBy(desc(patterns.confidence), desc(patterns.supportCount));

      return {
        blockId: input.blockId,
        totalDecisions: blockDecisions.length,
        outputDistribution,
        patterns: storedPatterns,
        analyzedAt: storedPatterns[0]?.createdAt || null,
      };
    }),
});
