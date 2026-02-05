import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { patterns, blocks, decisions, eq, and, desc, notDeleted, withTransaction } from '@baleyui/db';
import { TRPCError } from '@trpc/server';
import { analyzeDecisions } from '@/lib/patterns/pattern-analyzer';
import type { PatternCondition, PatternOutputTemplate, PartialUpdateData } from '@/lib/types';
import {
  throwNotFound,
  uuidSchema,
} from '../helpers';

/**
 * tRPC router for managing patterns (extracted rules from decisions).
 */
export const patternsRouter = router({
  /**
   * List patterns with filtering.
   * API-001: Use standardized UUID schema and pagination validation
   * API-004: Already uses select() to return only necessary fields
   */
  list: protectedProcedure
    .input(
      z.object({
        blockId: uuidSchema.optional(),
        limit: z.number().int().min(1).max(100).default(50),
        cursor: uuidSchema.optional(),
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
   * API-001: Use standardized UUID schema
   */
  getById: protectedProcedure
    .input(z.object({ id: uuidSchema }))
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
        throwNotFound('Pattern');
      }

      return pattern[0];
    }),

  /**
   * Create a new pattern.
   * API-001: Stricter input validation
   */
  create: protectedProcedure
    .input(
      z.object({
        blockId: uuidSchema,
        rule: z.string().min(1, 'Rule is required').max(10000, 'Rule exceeds maximum length'),
        condition: z.unknown(),
        outputTemplate: z.unknown().optional(),
        confidence: z.number().min(0).max(1).optional(),
        supportCount: z.number().int().min(0).max(1000000).optional(),
        generatedCode: z.string().max(500000, 'Generated code exceeds maximum size').optional(),
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
        throwNotFound('Block');
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
   * API-001: Stricter input validation
   */
  update: protectedProcedure
    .input(
      z.object({
        id: uuidSchema,
        rule: z.string().min(1, 'Rule is required').max(10000, 'Rule exceeds maximum length').optional(),
        condition: z.unknown().optional(),
        outputTemplate: z.unknown().optional(),
        confidence: z.number().min(0).max(1).optional(),
        supportCount: z.number().int().min(0).max(1000000).optional(),
        generatedCode: z.string().max(500000, 'Generated code exceeds maximum size').optional(),
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
        throwNotFound('Pattern');
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
   * Delete a pattern (hard delete - patterns table has no soft delete).
   * API-001: Use standardized UUID schema
   */
  delete: protectedProcedure
    .input(z.object({ id: uuidSchema }))
    .mutation(async ({ ctx, input }) => {
      // Verify pattern exists and belongs to workspace
      const existing = await ctx.db
        .select({ id: patterns.id })
        .from(patterns)
        .innerJoin(blocks, eq(patterns.blockId, blocks.id))
        .where(and(eq(patterns.id, input.id), eq(blocks.workspaceId, ctx.workspace.id), notDeleted(blocks)))
        .limit(1);

      if (!existing || existing.length === 0) {
        throwNotFound('Pattern');
      }

      // Hard delete pattern (no soft delete column in patterns table)
      await ctx.db.delete(patterns).where(eq(patterns.id, input.id));

      return { success: true };
    }),

  /**
   * Associate a pattern with a block.
   * This is a placeholder for future functionality where patterns can be linked
   * to multiple blocks or have more complex relationships.
   * API-001: Use standardized UUID schema
   */
  associateWithBlock: protectedProcedure
    .input(
      z.object({
        patternId: uuidSchema,
        blockId: uuidSchema,
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
        throwNotFound('Pattern');
      }

      // Verify target block exists
      const targetBlock = await ctx.db
        .select({ id: blocks.id })
        .from(blocks)
        .where(and(eq(blocks.id, input.blockId), eq(blocks.workspaceId, ctx.workspace.id), notDeleted(blocks)))
        .limit(1);

      if (!targetBlock || targetBlock.length === 0) {
        throwNotFound('Target block');
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
   * API-001: Use standardized UUID schema
   */
  analyzeBlock: protectedProcedure
    .input(z.object({ blockId: uuidSchema }))
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
        throwNotFound('Block');
      }

      // Fetch decisions for this block (limited to prevent memory exhaustion)
      const blockDecisions = await ctx.db
        .select({
          id: decisions.id,
          input: decisions.input,
          output: decisions.output,
        })
        .from(decisions)
        .where(eq(decisions.blockId, input.blockId))
        .orderBy(desc(decisions.createdAt))
        .limit(1000);

      // Analyze decisions to detect patterns
      const analysisResult = await analyzeDecisions(
        blockDecisions.map((d) => ({
          id: d.id,
          input: d.input,
          output: d.output,
        }))
      );

      // Wrap delete+insert in transaction for atomicity
      const savedPatterns = await withTransaction(async (tx) => {
        // Delete old patterns before saving new ones (prevent duplication)
        await tx.delete(patterns).where(eq(patterns.blockId, input.blockId));

        // Store detected patterns in the database
        const saved = [];
        for (const pattern of analysisResult.patterns) {
          const [result] = await tx
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

          saved.push(result);
        }
        return saved;
      });

      return {
        ...analysisResult,
        blockId: input.blockId,
        savedPatterns,
      };
    }),

  /**
   * Get cached analysis results for a block.
   * API-001: Use standardized UUID schema
   */
  getAnalysisResult: protectedProcedure
    .input(z.object({ blockId: uuidSchema }))
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
        throwNotFound('Block');
      }

      // Fetch decisions for this block (limited to prevent memory exhaustion)
      const blockDecisions = await ctx.db
        .select({
          id: decisions.id,
          input: decisions.input,
          output: decisions.output,
        })
        .from(decisions)
        .where(eq(decisions.blockId, input.blockId))
        .orderBy(desc(decisions.createdAt))
        .limit(1000);

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
