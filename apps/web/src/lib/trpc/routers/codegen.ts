import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { patterns, blocks, decisions, eq, and, isNull } from '@baleyui/db';
import { TRPCError } from '@trpc/server';
import { generateCode, validateGeneratedCode, getPatternStats } from '@/lib/codegen/code-generator';
import { testGeneratedCode } from '@/lib/codegen/historical-tester';
import { DetectedPattern } from '@/lib/codegen/types';

/**
 * tRPC router for code generation from patterns.
 */
export const codegenRouter = router({
  /**
   * Generate code from patterns for a specific block.
   */
  generateCode: protectedProcedure
    .input(
      z.object({
        blockId: z.string().uuid(),
        blockName: z.string().min(1).max(255),
        outputSchema: z.record(z.string(), z.any()).optional(),
        minConfidence: z.number().min(0).max(1).optional(),
        includeComments: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify block exists and belongs to workspace
      const block = await ctx.db.query.blocks.findFirst({
        where: and(
          eq(blocks.id, input.blockId),
          eq(blocks.workspaceId, ctx.workspace.id),
          isNull(blocks.deletedAt)
        ),
      });

      if (!block) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Block not found',
        });
      }

      // Fetch patterns for this block
      const blockPatterns = await ctx.db
        .select({
          id: patterns.id,
          rule: patterns.rule,
          condition: patterns.condition,
          outputTemplate: patterns.outputTemplate,
          confidence: patterns.confidence,
          supportCount: patterns.supportCount,
        })
        .from(patterns)
        .where(eq(patterns.blockId, input.blockId))
        .orderBy(patterns.confidence);

      if (blockPatterns.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No patterns found for this block',
        });
      }

      // Convert DB patterns to DetectedPattern format
      const detectedPatterns: DetectedPattern[] = blockPatterns.map(p => ({
        id: p.id,
        type: inferPatternType(p.condition),
        condition: p.rule,
        conditionAst: p.condition || {},
        outputValue: p.outputTemplate,
        confidence: parseFloat(p.confidence || '0'),
        supportCount: p.supportCount || 0,
      }));

      // Generate code
      const result = generateCode(detectedPatterns, {
        blockName: input.blockName,
        outputSchema: input.outputSchema || block.outputSchema || {},
        includeComments: input.includeComments ?? true,
        minConfidence: input.minConfidence ?? 0,
      });

      // Validate generated code
      const validation = validateGeneratedCode(result.code);
      if (!validation.valid) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Generated code validation failed: ${validation.errors.join(', ')}`,
        });
      }

      // Get pattern statistics
      const stats = getPatternStats(detectedPatterns);

      return {
        ...result,
        stats,
      };
    }),

  /**
   * Test generated code against historical decisions.
   */
  testCode: protectedProcedure
    .input(
      z.object({
        blockId: z.string().uuid(),
        code: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify block exists and belongs to workspace
      const block = await ctx.db.query.blocks.findFirst({
        where: and(
          eq(blocks.id, input.blockId),
          eq(blocks.workspaceId, ctx.workspace.id),
          isNull(blocks.deletedAt)
        ),
      });

      if (!block) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Block not found',
        });
      }

      // Test the generated code
      try {
        const testResult = await testGeneratedCode(
          input.blockId,
          input.code,
          ctx.db
        );

        return testResult;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Testing failed: ${(error as Error).message}`,
        });
      }
    }),

  /**
   * Save generated code to a block.
   */
  saveGeneratedCode: protectedProcedure
    .input(
      z.object({
        blockId: z.string().uuid(),
        code: z.string().min(1),
        accuracy: z.number().min(0).max(100).optional(), // Test accuracy percentage
        patternIds: z.array(z.string().uuid()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify block exists and belongs to workspace
      const block = await ctx.db.query.blocks.findFirst({
        where: and(
          eq(blocks.id, input.blockId),
          eq(blocks.workspaceId, ctx.workspace.id),
          isNull(blocks.deletedAt)
        ),
      });

      if (!block) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Block not found',
        });
      }

      // Validate the code before saving
      const validation = validateGeneratedCode(input.code);
      if (!validation.valid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid code: ${validation.errors.join(', ')}`,
        });
      }

      // Update block with generated code (using correct Phase 4 fields)
      const [updated] = await ctx.db
        .update(blocks)
        .set({
          generatedCode: input.code, // Phase 4 field for generated code
          codeGeneratedAt: new Date(),
          codeAccuracy: input.accuracy?.toFixed(2) ?? null, // Store accuracy as decimal string
          updatedAt: new Date(),
        })
        .where(eq(blocks.id, input.blockId))
        .returning();

      // Optionally update patterns with the generated code reference
      if (input.patternIds && input.patternIds.length > 0) {
        await Promise.all(
          input.patternIds.map(patternId =>
            ctx.db
              .update(patterns)
              .set({
                generatedCode: input.code,
                updatedAt: new Date(),
              })
              .where(eq(patterns.id, patternId))
          )
        );
      }

      return updated;
    }),

  /**
   * Get code generation status for a block.
   */
  getGenerationStatus: protectedProcedure
    .input(z.object({ blockId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify block exists and belongs to workspace
      const block = await ctx.db.query.blocks.findFirst({
        where: and(
          eq(blocks.id, input.blockId),
          eq(blocks.workspaceId, ctx.workspace.id),
          isNull(blocks.deletedAt)
        ),
      });

      if (!block) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Block not found',
        });
      }

      // Count patterns for this block
      const blockPatterns = await ctx.db
        .select({ id: patterns.id })
        .from(patterns)
        .where(eq(patterns.blockId, input.blockId));

      // Count historical decisions
      const decisionCount = await ctx.db
        .select({ id: decisions.id })
        .from(decisions)
        .where(eq(decisions.blockId, input.blockId));

      return {
        hasGeneratedCode: !!block.code,
        patternCount: blockPatterns.length,
        decisionCount: decisionCount.length,
        canGenerate: blockPatterns.length > 0,
        lastUpdated: block.updatedAt,
      };
    }),
});

/**
 * Infer pattern type from condition object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inferPatternType(condition: any): 'threshold' | 'set_membership' | 'compound' | 'exact_match' {
  if (!condition || typeof condition !== 'object') {
    return 'exact_match';
  }

  // Check for compound pattern
  if (condition.conditions && Array.isArray(condition.conditions)) {
    return 'compound';
  }

  // Check for set membership
  if (condition.values && Array.isArray(condition.values)) {
    return 'set_membership';
  }

  // Check for threshold
  if (condition.threshold !== undefined || condition.operator === '>' || condition.operator === '<') {
    return 'threshold';
  }

  // Default to exact match
  return 'exact_match';
}
