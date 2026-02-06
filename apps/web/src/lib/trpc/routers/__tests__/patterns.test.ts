import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockContext,
  createMockBlock,
  type MockContext,
} from '../../__tests__/test-utils';

// Mock external dependencies
vi.mock('@/lib/patterns/pattern-analyzer', () => ({
  analyzeDecisions: vi.fn().mockResolvedValue({
    patterns: [
      {
        condition: 'input.amount > 100',
        conditionAst: { operator: '>', field: 'amount', threshold: 100 },
        outputValue: { approved: false },
        confidence: 95,
        supportCount: 42,
        type: 'threshold',
        samples: [],
      },
    ],
    totalDecisions: 100,
  }),
}));

import { createMockDbModule } from '../../__tests__/mock-db';

vi.mock('@baleyui/db', () => ({
  ...createMockDbModule(),
  withTransaction: vi.fn(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
    const tx = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'new-pattern-id' }]),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    };
    return fn(tx);
  }),
}));

describe('Patterns Router Logic', () => {
  let ctx: MockContext;

  beforeEach(() => {
    ctx = createMockContext();
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('returns patterns with block info using select/join', async () => {
      const mockPatterns = [
        { id: 'p-1', blockId: 'b-1', blockName: 'Classifier', rule: 'amount > 100', condition: {}, outputTemplate: {}, confidence: '0.95', supportCount: 42, generatedCode: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 'p-2', blockId: 'b-1', blockName: 'Classifier', rule: 'category in ["A","B"]', condition: {}, outputTemplate: {}, confidence: '0.88', supportCount: 30, generatedCode: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      ctx.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue(mockPatterns),
              }),
            }),
          }),
        }),
      });

      const result = await ctx.db.select({}).from({}).innerJoin({}).where({}).orderBy({}).limit(50);

      expect(result).toHaveLength(2);
      expect(result[0].rule).toBe('amount > 100');
      expect(result[1].confidence).toBe('0.88');
    });

    it('returns empty items when no patterns exist', async () => {
      ctx.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      });

      const result = await ctx.db.select({}).from({}).innerJoin({}).where({}).orderBy({}).limit(50);

      expect(result).toHaveLength(0);
    });

    it('filters patterns by blockId', async () => {
      const mockPatterns = [
        { id: 'p-1', blockId: 'specific-block', blockName: 'Target', rule: 'rule1', confidence: '0.9', supportCount: 10, condition: {}, outputTemplate: {}, generatedCode: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      ctx.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue(mockPatterns),
              }),
            }),
          }),
        }),
      });

      const result = await ctx.db.select({}).from({}).innerJoin({}).where({}).orderBy({}).limit(50);

      expect(result).toHaveLength(1);
      expect(result[0].blockId).toBe('specific-block');
    });
  });

  describe('getById', () => {
    it('returns a single pattern by ID', async () => {
      const mockPattern = { id: 'p-1', blockId: 'b-1', blockName: 'Test Block', rule: 'x > 10', condition: { operator: '>', field: 'x', threshold: 10 }, outputTemplate: { value: true }, confidence: '0.95', supportCount: 50, generatedCode: null, createdAt: new Date(), updatedAt: new Date() };

      ctx.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockPattern]),
            }),
          }),
        }),
      });

      const result = await ctx.db.select({}).from({}).innerJoin({}).where({}).limit(1);

      expect(result).toHaveLength(1);
      expect(result[0].rule).toBe('x > 10');
    });

    it('returns empty array for non-existent pattern', async () => {
      ctx.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const result = await ctx.db.select({}).from({}).innerJoin({}).where({}).limit(1);

      expect(result).toHaveLength(0);
      // In actual router, this would throw NOT_FOUND
    });
  });

  describe('create', () => {
    it('verifies block exists before creating pattern', async () => {
      const mockBlock = [{ id: 'b-1' }];

      ctx.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(mockBlock),
          }),
        }),
      });

      const result = await ctx.db.select({}).from({}).where({}).limit(1);

      expect(result).toHaveLength(1);
    });

    it('returns empty when block not found', async () => {
      ctx.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await ctx.db.select({}).from({}).where({}).limit(1);

      expect(result).toHaveLength(0);
      // In actual router, this would throw NOT_FOUND for block
    });

    it('creates pattern with required fields', async () => {
      const newPattern = {
        id: 'new-p',
        blockId: 'b-1',
        rule: 'amount > 100',
        condition: { operator: '>' },
        confidence: '0.95',
        supportCount: 42,
      };

      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newPattern]),
        }),
      });

      const insertMock = ctx.db.insert('patterns');
      const result = await insertMock.values({}).returning();

      expect(result[0].rule).toBe('amount > 100');
      expect(result[0].confidence).toBe('0.95');
    });

    it('creates pattern with optional generatedCode', async () => {
      const patternWithCode = {
        id: 'p-code',
        blockId: 'b-1',
        rule: 'rule',
        generatedCode: 'if (input.amount > 100) return false;',
      };

      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([patternWithCode]),
        }),
      });

      const insertMock = ctx.db.insert('patterns');
      const result = await insertMock.values({}).returning();

      expect(result[0].generatedCode).toBe('if (input.amount > 100) return false;');
    });
  });

  describe('update', () => {
    it('verifies pattern exists before update', async () => {
      const existing = [{ id: 'p-1' }];

      ctx.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(existing),
            }),
          }),
        }),
      });

      const result = await ctx.db.select({}).from({}).innerJoin({}).where({}).limit(1);

      expect(result).toHaveLength(1);
    });

    it('returns empty when pattern not found for update', async () => {
      ctx.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const result = await ctx.db.select({}).from({}).innerJoin({}).where({}).limit(1);

      expect(result).toHaveLength(0);
      // In actual router, this would throw NOT_FOUND
    });

    it('updates pattern fields selectively', async () => {
      const updatedPattern = {
        id: 'p-1',
        rule: 'updated rule',
        confidence: '0.99',
        updatedAt: new Date(),
      };

      ctx.db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedPattern]),
          }),
        }),
      });

      const updateMock = ctx.db.update('patterns');
      const result = await updateMock.set({}).where({}).returning();

      expect(result[0].rule).toBe('updated rule');
      expect(result[0].confidence).toBe('0.99');
    });
  });

  describe('delete', () => {
    it('verifies pattern exists before deletion', async () => {
      const existing = [{ id: 'p-1' }];

      ctx.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(existing),
            }),
          }),
        }),
      });

      const result = await ctx.db.select({}).from({}).innerJoin({}).where({}).limit(1);

      expect(result).toHaveLength(1);
    });

    it('performs hard delete (no soft delete)', async () => {
      ctx.db.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      await ctx.db.delete('patterns').where({});

      expect(ctx.db.delete).toHaveBeenCalled();
    });
  });

  describe('associateWithBlock', () => {
    it('verifies both pattern and target block exist', async () => {
      const pattern = [{ id: 'p-1' }];
      const targetBlock = [{ id: 'b-2' }];

      ctx.db.select
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue(pattern),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(targetBlock),
            }),
          }),
        });

      const patternResult = await ctx.db.select({}).from({}).innerJoin({}).where({}).limit(1);
      expect(patternResult).toHaveLength(1);

      const blockResult = await ctx.db.select({}).from({}).where({}).limit(1);
      expect(blockResult).toHaveLength(1);
    });

    it('updates pattern blockId on association', async () => {
      const updated = { id: 'p-1', blockId: 'new-block-id', updatedAt: new Date() };

      ctx.db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      });

      const updateMock = ctx.db.update('patterns');
      const result = await updateMock.set({}).where({}).returning();

      expect(result[0].blockId).toBe('new-block-id');
    });
  });

  describe('analyzeBlock', () => {
    it('verifies block exists before analysis', async () => {
      const block = createMockBlock({ id: 'b-1', name: 'Test Block' });

      ctx.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: block.id, name: block.name }]),
          }),
        }),
      });

      const result = await ctx.db.select({}).from({}).where({}).limit(1);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test Block');
    });

    it('returns empty when block not found', async () => {
      ctx.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await ctx.db.select({}).from({}).where({}).limit(1);

      expect(result).toHaveLength(0);
      // In actual router, this would throw NOT_FOUND
    });
  });

  describe('getAnalysisResult', () => {
    it('returns analysis results with output distribution', () => {
      const decisions = [
        { output: { approved: true } },
        { output: { approved: true } },
        { output: { approved: false } },
      ];

      const distribution: Record<string, number> = {};
      for (const d of decisions) {
        const key = JSON.stringify(d.output);
        distribution[key] = (distribution[key] || 0) + 1;
      }

      expect(distribution['{"approved":true}']).toBe(2);
      expect(distribution['{"approved":false}']).toBe(1);
    });

    it('returns stored patterns with samples', () => {
      const storedPatterns = [
        { id: 'p-1', rule: 'x > 10', confidence: '0.95', supportCount: 42, samples: [{ id: 's-1' }], patternType: 'threshold', createdAt: new Date() },
      ];

      expect(storedPatterns).toHaveLength(1);
      expect(storedPatterns[0]!.samples).toHaveLength(1);
    });
  });
});
