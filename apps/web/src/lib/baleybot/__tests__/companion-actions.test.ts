import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @baleyui/db before importing the module under test
// ---------------------------------------------------------------------------
const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@baleyui/db', () => {
  const eq = vi.fn((a: unknown, b: unknown) => ({ type: 'eq', a, b }));
  const and = vi.fn((...args: unknown[]) => ({ type: 'and', args }));
  const desc = vi.fn((col: unknown) => ({ type: 'desc', col }));
  const sql = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      type: 'sql',
      strings: [...strings],
      values,
    }),
    {
      raw: (s: string) => ({ type: 'sql.raw', s }),
    }
  );

  const recommendations = {
    id: 'recommendations.id',
    workspaceId: 'recommendations.workspaceId',
    status: 'recommendations.status',
    severity: 'recommendations.severity',
    createdAt: 'recommendations.createdAt',
  };

  const approvalPatterns = {
    id: 'approvalPatterns.id',
  };

  return {
    db: {
      query: {
        recommendations: {
          findMany: mockFindMany,
          findFirst: mockFindFirst,
        },
      },
      select: mockSelect,
      transaction: mockTransaction,
    },
    recommendations,
    approvalPatterns,
    eq,
    and,
    desc,
    sql,
  };
});

// Import after mocks
const { buildActionTools } = await import('../tools/companion/actions');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ctx = { workspaceId: 'ws-1', userId: 'user-1' };

function makeDbRec(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rec-1',
    workspaceId: 'ws-1',
    title: 'Test rec',
    description: 'Test desc',
    severity: 'info',
    targetType: 'insight',
    proposedAction: null,
    status: 'pending',
    createdAt: new Date('2026-01-15'),
    targetBaleybot: { id: 'bb-1', name: 'test_bot', icon: null },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildActionTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns two tools: list_pending_actions and apply_action', () => {
    const tools = buildActionTools(ctx);
    expect(tools.size).toBe(2);
    expect(tools.has('list_pending_actions')).toBe(true);
    expect(tools.has('apply_action')).toBe(true);
  });

  describe('list_pending_actions', () => {
    it('returns formatted actions with total count', async () => {
      const items = [makeDbRec(), makeDbRec({ id: 'rec-2', title: 'Second rec' })];
      mockFindMany.mockResolvedValue(items);
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 5 }]),
        }),
      });

      const tools = buildActionTools(ctx);
      const listTool = tools.get('list_pending_actions')!;
      const result = await listTool.function({});

      expect(result).toEqual({
        actions: [
          expect.objectContaining({ id: 'rec-1', title: 'Test rec', targetBotName: 'test_bot' }),
          expect.objectContaining({ id: 'rec-2', title: 'Second rec' }),
        ],
        total: 5,
      });
    });

    it('respects limit parameter (clamped to 50)', async () => {
      mockFindMany.mockResolvedValue([]);
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      });

      const tools = buildActionTools(ctx);
      const listTool = tools.get('list_pending_actions')!;
      await listTool.function({ limit: 100 });

      // The limit should be clamped to 50
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 })
      );
    });

    it('handles zero count gracefully', async () => {
      mockFindMany.mockResolvedValue([]);
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      });

      const tools = buildActionTools(ctx);
      const listTool = tools.get('list_pending_actions')!;
      const result = await listTool.function({});

      expect(result).toEqual({ actions: [], total: 0 });
    });
  });

  describe('apply_action', () => {
    it('returns error when recommendation not found', async () => {
      mockFindFirst.mockResolvedValue(null);

      const tools = buildActionTools(ctx);
      const applyTool = tools.get('apply_action')!;
      const result = await applyTool.function({ recommendationId: 'not-exist' });

      expect(result).toEqual({ error: 'Recommendation not found' });
    });

    it('returns alreadyHandled when rec is not pending', async () => {
      mockFindFirst.mockResolvedValue(makeDbRec({ status: 'accepted' }));

      const tools = buildActionTools(ctx);
      const applyTool = tools.get('apply_action')!;
      const result = await applyTool.function({ recommendationId: 'rec-1' });

      expect(result).toEqual({ alreadyHandled: true, currentStatus: 'accepted' });
    });

    it('redirects to actions page for bal_patch type', async () => {
      mockFindFirst.mockResolvedValue(makeDbRec({ targetType: 'bal_patch' }));

      const tools = buildActionTools(ctx);
      const applyTool = tools.get('apply_action')!;
      const result = await applyTool.function({ recommendationId: 'rec-1' });

      expect(result).toEqual(
        expect.objectContaining({
          action: 'navigate_request',
          path: '/dashboard/actions?highlight=rec-1',
        })
      );
    });

    it('redirects to actions page for error_review with hardeningSteps', async () => {
      mockFindFirst.mockResolvedValue(
        makeDbRec({
          targetType: 'error_review',
          proposedAction: { hardeningSteps: [{ title: 'Fix', description: 'Do this' }] },
        })
      );

      const tools = buildActionTools(ctx);
      const applyTool = tools.get('apply_action')!;
      const result = await applyTool.function({ recommendationId: 'rec-1' });

      expect(result).toEqual(
        expect.objectContaining({ action: 'navigate_request' })
      );
    });

    it('applies insight type directly with success', async () => {
      mockFindFirst.mockResolvedValue(makeDbRec({ targetType: 'insight' }));
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: 'rec-1' }]),
              }),
            }),
          }),
        };
        return fn(txMock);
      });

      const tools = buildActionTools(ctx);
      const applyTool = tools.get('apply_action')!;
      const result = await applyTool.function({ recommendationId: 'rec-1' });

      expect(result).toEqual({
        success: true,
        message: 'Insight acknowledged',
      });
    });

    it('returns alreadyHandled when race condition detected (0 rows updated)', async () => {
      mockFindFirst.mockResolvedValue(makeDbRec({ targetType: 'insight' }));
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([]), // 0 rows = race condition
              }),
            }),
          }),
        };
        return fn(txMock);
      });

      const tools = buildActionTools(ctx);
      const applyTool = tools.get('apply_action')!;
      const result = await applyTool.function({ recommendationId: 'rec-1' });

      expect(result).toEqual({ alreadyHandled: true, currentStatus: 'unknown' });
    });

    it('applies approval_pattern type and inserts pattern', async () => {
      mockFindFirst.mockResolvedValue(
        makeDbRec({
          targetType: 'approval_pattern',
          proposedAction: {
            tool: 'web_search',
            actionPattern: { action: 'search' },
            entityGoalPattern: 'research',
          },
        })
      );

      const insertValues = vi.fn().mockResolvedValue([]);
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: 'rec-1' }]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: insertValues,
          }),
        };
        return fn(txMock);
      });

      const tools = buildActionTools(ctx);
      const applyTool = tools.get('apply_action')!;
      const result = await applyTool.function({ recommendationId: 'rec-1' });

      expect(result).toEqual({
        success: true,
        message: 'Auto-approval rule applied',
      });
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          tool: 'web_search',
          trustLevel: 'provisional',
        })
      );
    });
  });
});
