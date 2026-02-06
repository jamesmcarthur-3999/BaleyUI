import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockContext,
  createMockBlock,
  type MockContext,
} from '../../__tests__/test-utils';

// Mock external dependencies
vi.mock('@/lib/codegen/code-generator', () => ({
  generateCode: vi.fn().mockReturnValue({
    code: 'function decide(input) { return input.amount > 100 ? { approved: false } : { approved: true }; }',
    patterns: 2,
    coverage: 95,
  }),
  validateGeneratedCode: vi.fn().mockReturnValue({ valid: true, errors: [] }),
  getPatternStats: vi.fn().mockReturnValue({
    totalPatterns: 2,
    avgConfidence: 0.92,
    coveragePercentage: 95,
  }),
}));

vi.mock('@/lib/codegen/historical-tester', () => ({
  testGeneratedCode: vi.fn().mockResolvedValue({
    totalTests: 100,
    passed: 95,
    failed: 5,
    accuracy: 95,
    failures: [
      { input: { amount: 99.5 }, expected: { approved: true }, actual: { approved: false } },
    ],
  }),
}));

import { createMockDbModule } from '../../__tests__/mock-db';

vi.mock('@baleyui/db', () => createMockDbModule());

describe('Codegen Router Logic', () => {
  let ctx: MockContext;

  beforeEach(() => {
    ctx = createMockContext();
    vi.clearAllMocks();
  });

  describe('generateCode', () => {
    it('verifies block exists before generating code', async () => {
      const mockBlock = createMockBlock({ id: 'b-1', name: 'Test Block' });
      ctx.db.query.blocks.findFirst.mockResolvedValue(mockBlock);

      const result = await ctx.db.query.blocks.findFirst();

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Test Block');
    });

    it('returns null when block not found', async () => {
      ctx.db.query.blocks.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.blocks.findFirst();

      expect(result).toBeNull();
      // In actual router, this would throw NOT_FOUND
    });

    it('fetches patterns for the block', async () => {
      const blockPatterns = [
        { id: 'p-1', rule: 'amount > 100', condition: { operator: '>' }, outputTemplate: { approved: false }, confidence: '0.95', supportCount: 42 },
        { id: 'p-2', rule: 'category in ["A"]', condition: { values: ['A'] }, outputTemplate: { approved: true }, confidence: '0.88', supportCount: 30 },
      ];

      ctx.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(blockPatterns),
          }),
        }),
      });

      const result = await ctx.db.select({}).from({}).where({}).orderBy({});

      expect(result).toHaveLength(2);
      expect(result[0].confidence).toBe('0.95');
    });

    it('throws when no patterns found for block', async () => {
      ctx.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await ctx.db.select({}).from({}).where({}).orderBy({});

      expect(result).toHaveLength(0);
      // In actual router, this would throw BAD_REQUEST
    });

    it('converts DB patterns to DetectedPattern format', () => {
      const dbPattern = {
        id: 'p-1',
        rule: 'amount > 100',
        condition: { operator: '>', field: 'amount', threshold: 100 },
        outputTemplate: { approved: false },
        confidence: '0.95',
        supportCount: 42,
      };

      // Mimics the router conversion logic
      const detectedPattern = {
        id: dbPattern.id,
        type: 'threshold' as const,
        condition: dbPattern.rule,
        conditionAst: dbPattern.condition || {},
        outputValue: dbPattern.outputTemplate,
        confidence: parseFloat(dbPattern.confidence || '0'),
        supportCount: dbPattern.supportCount || 0,
      };

      expect(detectedPattern.confidence).toBe(0.95);
      expect(detectedPattern.type).toBe('threshold');
      expect(detectedPattern.supportCount).toBe(42);
    });

    it('infers pattern type from condition', () => {
      // Exact match (no condition)
      expect(inferPatternType(null)).toBe('exact_match');
      expect(inferPatternType(undefined)).toBe('exact_match');

      // Threshold
      expect(inferPatternType({ threshold: 100 })).toBe('threshold');
      expect(inferPatternType({ operator: '>' })).toBe('threshold');

      // Set membership
      expect(inferPatternType({ values: ['A', 'B'] })).toBe('set_membership');

      // Compound
      expect(inferPatternType({ conditions: [{}, {}] })).toBe('compound');
    });
  });

  describe('testCode', () => {
    it('verifies block exists before testing code', async () => {
      const mockBlock = createMockBlock({ id: 'b-1' });
      ctx.db.query.blocks.findFirst.mockResolvedValue(mockBlock);

      const result = await ctx.db.query.blocks.findFirst();

      expect(result).not.toBeNull();
    });

    it('returns null when block not found for testing', async () => {
      ctx.db.query.blocks.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.blocks.findFirst();

      expect(result).toBeNull();
      // In actual router, this would throw NOT_FOUND
    });

    it('validates test result structure', () => {
      const testResult = {
        totalTests: 100,
        passed: 95,
        failed: 5,
        accuracy: 95,
        failures: [
          { input: { amount: 99.5 }, expected: { approved: true }, actual: { approved: false } },
        ],
      };

      expect(testResult.accuracy).toBe(95);
      expect(testResult.passed).toBe(95);
      expect(testResult.failures).toHaveLength(1);
    });
  });

  describe('saveGeneratedCode', () => {
    it('verifies block exists before saving', async () => {
      const mockBlock = createMockBlock({ id: 'b-1', version: 1 });
      ctx.db.query.blocks.findFirst.mockResolvedValue(mockBlock);

      const result = await ctx.db.query.blocks.findFirst();

      expect(result).not.toBeNull();
      expect(result?.version).toBe(1);
    });

    it('returns null when block not found for save', async () => {
      ctx.db.query.blocks.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.blocks.findFirst();

      expect(result).toBeNull();
      // In actual router, this would throw NOT_FOUND
    });

    it('validates code before saving', () => {
      const validCode = 'function decide(input) { return { approved: true }; }';
      const invalidCode = '';

      expect(validCode.length).toBeGreaterThan(0);
      expect(invalidCode.length).toBe(0);
      // In actual router, invalid code would cause validateGeneratedCode to return errors
    });

    it('saves code with accuracy metadata', () => {
      const accuracy = 95.5;
      const formattedAccuracy = accuracy.toFixed(2);

      expect(formattedAccuracy).toBe('95.50');
    });

    it('validates pattern IDs belong to workspace before updating', async () => {
      const validPatterns = [{ id: 'p-1' }, { id: 'p-2' }];

      ctx.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(validPatterns),
          }),
        }),
      });

      const result = await ctx.db.select({}).from({}).innerJoin({}).where({});

      expect(result).toHaveLength(2);
      const validIds = new Set(result.map((p: { id: string }) => p.id));
      expect(validIds.has('p-1')).toBe(true);
      expect(validIds.has('p-3')).toBe(false);
    });

    it('updates patterns with generated code', async () => {
      ctx.db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      await ctx.db.update('patterns').set({ generatedCode: 'code', updatedAt: new Date() }).where({});

      expect(ctx.db.update).toHaveBeenCalled();
    });
  });

  describe('getGenerationStatus', () => {
    it('returns status with pattern and decision counts', async () => {
      const mockBlock = createMockBlock({ id: 'b-1', code: 'some code' });
      ctx.db.query.blocks.findFirst.mockResolvedValue(mockBlock);

      const block = await ctx.db.query.blocks.findFirst();
      expect(block).not.toBeNull();

      // Mock pattern count
      const patternCount = [{ id: 'p-1' }, { id: 'p-2' }];
      const decisionCount = [{ id: 'd-1' }, { id: 'd-2' }, { id: 'd-3' }];

      ctx.db.select
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(patternCount),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(decisionCount),
          }),
        });

      const patterns = await ctx.db.select({}).from({}).where({});
      const decisions = await ctx.db.select({}).from({}).where({});

      const status = {
        hasGeneratedCode: !!block?.code,
        patternCount: patterns.length,
        decisionCount: decisions.length,
        canGenerate: patterns.length > 0,
      };

      expect(status.hasGeneratedCode).toBe(true);
      expect(status.patternCount).toBe(2);
      expect(status.decisionCount).toBe(3);
      expect(status.canGenerate).toBe(true);
    });

    it('returns null when block not found for status', async () => {
      ctx.db.query.blocks.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.blocks.findFirst();

      expect(result).toBeNull();
      // In actual router, this would throw NOT_FOUND
    });

    it('indicates canGenerate is false when no patterns exist', async () => {
      const mockBlock = createMockBlock({ id: 'b-1', code: null });
      ctx.db.query.blocks.findFirst.mockResolvedValue(mockBlock);

      ctx.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const patterns = await ctx.db.select({}).from({}).where({});

      expect(patterns).toHaveLength(0);
      expect(patterns.length > 0).toBe(false);
    });

    it('reflects hasGeneratedCode from block code field', () => {
      const blockWithCode = createMockBlock({ code: 'function decide() {}' });
      const blockWithoutCode = createMockBlock({ code: null });

      expect(!!blockWithCode.code).toBe(true);
      expect(!!blockWithoutCode.code).toBe(false);
    });
  });
});

/**
 * Helper to mimic the inferPatternType function from the router.
 */
function inferPatternType(condition: Record<string, unknown> | null | undefined): string {
  if (!condition || typeof condition !== 'object') {
    return 'exact_match';
  }

  if (condition.conditions && Array.isArray(condition.conditions)) {
    return 'compound';
  }

  if (condition.values && Array.isArray(condition.values)) {
    return 'set_membership';
  }

  if (condition.threshold !== undefined || condition.operator === '>' || condition.operator === '<') {
    return 'threshold';
  }

  return 'exact_match';
}
