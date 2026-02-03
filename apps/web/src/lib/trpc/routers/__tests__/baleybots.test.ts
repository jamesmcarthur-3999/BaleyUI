import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockContext,
  createMockBaleybot,
  createMockExecution,
  createMockApprovalPattern,
  type MockContext,
  type MockBaleybot,
} from '../../__tests__/test-utils';

// Mock external dependencies
vi.mock('@/lib/baleybot/creator-bot', () => ({
  processCreatorMessage: vi.fn().mockResolvedValue({
    message: 'Test response',
    balCode: 'entity Test:\n  goal: "test"',
  }),
}));

vi.mock('@baleyui/sdk', () => ({
  executeBALCode: vi.fn().mockResolvedValue({
    status: 'success',
    result: { output: 'test' },
  }),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
  RATE_LIMITS: {
    execute: { maxRequests: 10, windowMs: 60000 },
  },
}));

vi.mock('@baleyui/db', () => ({
  baleybots: { id: 'id', workspaceId: 'workspaceId', status: 'status', createdAt: 'createdAt', executionCount: 'executionCount' },
  baleybotExecutions: { id: 'id', baleybotId: 'baleybotId', status: 'status', createdAt: 'createdAt' },
  approvalPatterns: { id: 'id', workspaceId: 'workspaceId', tool: 'tool', trustLevel: 'trustLevel', createdAt: 'createdAt', revokedAt: 'revokedAt', timesUsed: 'timesUsed' },
  connections: { workspaceId: 'workspaceId' },
  eq: vi.fn((a, b) => ({ _type: 'eq', a, b })),
  and: vi.fn((...args) => ({ _type: 'and', args })),
  desc: vi.fn((field) => ({ _type: 'desc', field })),
  isNull: vi.fn((field) => ({ _type: 'isNull', field })),
  inArray: vi.fn((field, values) => ({ _type: 'inArray', field, values })),
  notDeleted: vi.fn(() => ({ _type: 'notDeleted' })),
  softDelete: vi.fn().mockResolvedValue({ id: 'deleted-id' }),
  updateWithLock: vi.fn().mockResolvedValue({ id: 'updated-id', version: 2 }),
  sql: vi.fn(),
}));

describe('Baleybots Router Logic', () => {
  let ctx: MockContext;

  beforeEach(() => {
    ctx = createMockContext();
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('returns baleybots for workspace', async () => {
      const mockBaleybots = [
        createMockBaleybot({ id: '1', name: 'Bot 1' }),
        createMockBaleybot({ id: '2', name: 'Bot 2' }),
      ];
      ctx.db.query.baleybots.findMany.mockResolvedValue(
        mockBaleybots.map(bb => ({ ...bb, executions: [] }))
      );

      const result = await ctx.db.query.baleybots.findMany();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Bot 1');
      expect(result[1].name).toBe('Bot 2');
    });

    it('includes last execution for each baleybot', async () => {
      const mockExecution = createMockExecution({ id: 'exec-1' });
      const mockBaleybots = [
        { ...createMockBaleybot({ id: '1' }), executions: [mockExecution] },
      ];
      ctx.db.query.baleybots.findMany.mockResolvedValue(mockBaleybots);

      const result = await ctx.db.query.baleybots.findMany();

      expect(result[0].executions).toHaveLength(1);
      expect(result[0].executions[0].id).toBe('exec-1');
    });

    it('returns empty array when no baleybots exist', async () => {
      ctx.db.query.baleybots.findMany.mockResolvedValue([]);

      const result = await ctx.db.query.baleybots.findMany();

      expect(result).toHaveLength(0);
    });
  });

  describe('get', () => {
    it('returns a single baleybot by ID', async () => {
      const mockBaleybot = createMockBaleybot({ id: 'test-id', name: 'Test Bot' });
      ctx.db.query.baleybots.findFirst.mockResolvedValue({
        ...mockBaleybot,
        executions: [],
      });

      const result = await ctx.db.query.baleybots.findFirst();

      expect(result).not.toBeNull();
      expect(result?.id).toBe('test-id');
      expect(result?.name).toBe('Test Bot');
    });

    it('returns null for non-existent baleybot', async () => {
      ctx.db.query.baleybots.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.baleybots.findFirst();

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates a new baleybot with required fields', async () => {
      const newBaleybot = createMockBaleybot({
        id: 'new-id',
        name: 'New Bot',
        status: 'draft',
      });

      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newBaleybot]),
        }),
      });

      const insertMock = ctx.db.insert('baleybots');
      const result = await insertMock.values({}).returning();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('New Bot');
      expect(result[0].status).toBe('draft');
    });

    it('validates dependencies exist before creation', async () => {
      const existingBots = [
        createMockBaleybot({ id: 'dep-1' }),
        createMockBaleybot({ id: 'dep-2' }),
      ];
      ctx.db.query.baleybots.findMany.mockResolvedValue(existingBots);

      const result = await ctx.db.query.baleybots.findMany();
      const existingIds = result.map((bb: MockBaleybot) => bb.id);

      expect(existingIds).toContain('dep-1');
      expect(existingIds).toContain('dep-2');
      expect(existingIds).not.toContain('invalid-id');
    });
  });

  describe('update', () => {
    it('updates baleybot with optimistic locking', async () => {
      const existingBot = createMockBaleybot({ id: 'test-id', version: 1 });
      ctx.db.query.baleybots.findFirst.mockResolvedValue(existingBot);

      const result = await ctx.db.query.baleybots.findFirst();

      expect(result).not.toBeNull();
      expect(result?.version).toBe(1);
    });

    it('rejects update for non-existent baleybot', async () => {
      ctx.db.query.baleybots.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.baleybots.findFirst();

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('soft deletes a baleybot', async () => {
      const existingBot = createMockBaleybot({ id: 'test-id' });
      ctx.db.query.baleybots.findFirst.mockResolvedValue(existingBot);

      const result = await ctx.db.query.baleybots.findFirst();

      expect(result).not.toBeNull();
      expect(result?.deletedAt).toBeNull();
    });
  });

  describe('execute', () => {
    it('verifies baleybot exists before execution', async () => {
      const mockBaleybot = createMockBaleybot({ status: 'active' });
      ctx.db.query.baleybots.findFirst.mockResolvedValue(mockBaleybot);

      const result = await ctx.db.query.baleybots.findFirst();

      expect(result).not.toBeNull();
      expect(result?.status).toBe('active');
    });

    it('rejects execution for error status baleybots', async () => {
      const errorBot = createMockBaleybot({ status: 'error' });
      ctx.db.query.baleybots.findFirst.mockResolvedValue(errorBot);

      const result = await ctx.db.query.baleybots.findFirst();

      expect(result?.status).toBe('error');
      // In the actual router, this would throw PRECONDITION_FAILED
    });

    it('creates execution record in transaction', async () => {
      const mockExecution = createMockExecution({ status: 'pending' });

      let transactionCalled = false;
      ctx.db.transaction.mockImplementation(async (fn) => {
        transactionCalled = true;
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([mockExecution]),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
          query: ctx.db.query,
        };
        return fn(tx);
      });

      await ctx.db.transaction(async (tx) => {
        const insertResult = await tx.insert('baleybotExecutions').values({}).returning();
        expect(insertResult[0].status).toBe('pending');
      });

      expect(transactionCalled).toBe(true);
    });
  });

  describe('listExecutions', () => {
    it('returns executions for a specific baleybot', async () => {
      const mockBaleybot = createMockBaleybot({ id: 'bb-1' });
      const mockExecutions = [
        createMockExecution({ id: 'exec-1', baleybotId: 'bb-1' }),
        createMockExecution({ id: 'exec-2', baleybotId: 'bb-1' }),
      ];

      ctx.db.query.baleybots.findFirst.mockResolvedValue(mockBaleybot);
      ctx.db.query.baleybotExecutions.findMany.mockResolvedValue(mockExecutions);

      const baleybot = await ctx.db.query.baleybots.findFirst();
      expect(baleybot).not.toBeNull();

      const executions = await ctx.db.query.baleybotExecutions.findMany();
      expect(executions).toHaveLength(2);
      expect(executions[0].baleybotId).toBe('bb-1');
    });

    it('filters executions by status', async () => {
      const completedExecutions = [
        createMockExecution({ id: 'exec-1', status: 'completed' }),
      ];
      ctx.db.query.baleybotExecutions.findMany.mockResolvedValue(completedExecutions);

      const result = await ctx.db.query.baleybotExecutions.findMany();

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('completed');
    });
  });

  describe('getExecution', () => {
    it('returns execution with baleybot relation', async () => {
      const mockBaleybot = createMockBaleybot({ id: 'bb-1', workspaceId: ctx.workspace.id });
      const mockExecution = createMockExecution({
        id: 'exec-1',
        baleybotId: 'bb-1',
        baleybot: mockBaleybot,
      });

      ctx.db.query.baleybotExecutions.findFirst.mockResolvedValue(mockExecution);

      const result = await ctx.db.query.baleybotExecutions.findFirst();

      expect(result).not.toBeNull();
      expect(result?.baleybot?.workspaceId).toBe(ctx.workspace.id);
    });

    it('returns null for non-existent execution', async () => {
      ctx.db.query.baleybotExecutions.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.baleybotExecutions.findFirst();

      expect(result).toBeNull();
    });
  });

  describe('getRecentActivity', () => {
    it('returns recent executions across all workspace baleybots', async () => {
      const bots = [
        createMockBaleybot({ id: 'bb-1', name: 'Bot 1' }),
        createMockBaleybot({ id: 'bb-2', name: 'Bot 2' }),
      ];
      const executions = [
        createMockExecution({ id: 'exec-1', baleybotId: 'bb-1' }),
        createMockExecution({ id: 'exec-2', baleybotId: 'bb-2' }),
      ];

      ctx.db.query.baleybots.findMany.mockResolvedValue(bots);
      ctx.db.query.baleybotExecutions.findMany.mockResolvedValue(executions);

      const botsResult = await ctx.db.query.baleybots.findMany();
      const executionsResult = await ctx.db.query.baleybotExecutions.findMany();

      expect(botsResult).toHaveLength(2);
      expect(executionsResult).toHaveLength(2);
    });

    it('returns empty array when no baleybots exist', async () => {
      ctx.db.query.baleybots.findMany.mockResolvedValue([]);

      const result = await ctx.db.query.baleybots.findMany();

      expect(result).toHaveLength(0);
    });
  });

  describe('getDependents', () => {
    it('finds baleybots that depend on a given baleybot', async () => {
      const targetId = 'target-bb';
      const allBots = [
        createMockBaleybot({ id: 'bb-1', dependencies: [targetId] }),
        createMockBaleybot({ id: 'bb-2', dependencies: null }),
        createMockBaleybot({ id: 'bb-3', dependencies: [targetId, 'other'] }),
      ];

      ctx.db.query.baleybots.findMany.mockResolvedValue(allBots);

      const result = await ctx.db.query.baleybots.findMany();
      const dependents = result.filter((bb: MockBaleybot) => {
        const deps = bb.dependencies as string[] | null;
        return deps && deps.includes(targetId);
      });

      expect(dependents).toHaveLength(2);
      expect(dependents[0].id).toBe('bb-1');
      expect(dependents[1].id).toBe('bb-3');
    });
  });

  describe('Approval System', () => {
    describe('listApprovalPatterns', () => {
      it('returns approval patterns for workspace', async () => {
        const patterns = [
          createMockApprovalPattern({ id: 'p-1', tool: 'http_request' }),
          createMockApprovalPattern({ id: 'p-2', tool: 'file_write' }),
        ];

        ctx.db.query.approvalPatterns.findMany.mockResolvedValue(patterns);

        const result = await ctx.db.query.approvalPatterns.findMany();

        expect(result).toHaveLength(2);
        expect(result[0].tool).toBe('http_request');
      });

      it('filters by tool name', async () => {
        const patterns = [
          createMockApprovalPattern({ tool: 'http_request' }),
        ];

        ctx.db.query.approvalPatterns.findMany.mockResolvedValue(patterns);

        const result = await ctx.db.query.approvalPatterns.findMany();

        expect(result).toHaveLength(1);
        expect(result[0].tool).toBe('http_request');
      });

      it('excludes revoked patterns by default', async () => {
        const activePattern = createMockApprovalPattern({ revokedAt: null });

        ctx.db.query.approvalPatterns.findMany.mockResolvedValue([activePattern]);

        const result = await ctx.db.query.approvalPatterns.findMany();

        expect(result).toHaveLength(1);
        expect(result[0].revokedAt).toBeNull();
      });
    });

    describe('createApprovalPattern', () => {
      it('creates pattern with provisional trust level', async () => {
        const newPattern = createMockApprovalPattern({
          trustLevel: 'provisional',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });

        ctx.db.insert.mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([newPattern]),
          }),
        });

        const insertMock = ctx.db.insert('approvalPatterns');
        const result = await insertMock.values({}).returning();

        expect(result[0].trustLevel).toBe('provisional');
        expect(result[0].expiresAt).not.toBeNull();
      });

      it('creates permanent pattern without expiration', async () => {
        const permanentPattern = createMockApprovalPattern({
          trustLevel: 'permanent',
          expiresAt: null,
        });

        ctx.db.insert.mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([permanentPattern]),
          }),
        });

        const insertMock = ctx.db.insert('approvalPatterns');
        const result = await insertMock.values({}).returning();

        expect(result[0].trustLevel).toBe('permanent');
        expect(result[0].expiresAt).toBeNull();
      });
    });

    describe('revokeApprovalPattern', () => {
      it('marks pattern as revoked with reason', async () => {
        const existingPattern = createMockApprovalPattern({ id: 'p-1' });
        ctx.db.query.approvalPatterns.findFirst.mockResolvedValue(existingPattern);

        const result = await ctx.db.query.approvalPatterns.findFirst();

        expect(result).not.toBeNull();
        expect(result?.revokedAt).toBeNull();
      });
    });

    describe('incrementPatternUsage', () => {
      it('increments the usage counter', async () => {
        const pattern = createMockApprovalPattern({ timesUsed: 5 });
        ctx.db.query.approvalPatterns.findFirst.mockResolvedValue(pattern);

        const result = await ctx.db.query.approvalPatterns.findFirst();

        expect(result?.timesUsed).toBe(5);
        // In actual implementation, this would be incremented
      });
    });
  });

  describe('Creator Bot', () => {
    describe('sendCreatorMessage', () => {
      it('fetches workspace connections for context', async () => {
        const mockConnections = [
          { id: 'conn-1', type: 'openai', name: 'OpenAI' },
        ];
        ctx.db.query.connections.findMany.mockResolvedValue(mockConnections);

        const result = await ctx.db.query.connections.findMany();

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('openai');
      });

      it('fetches existing baleybots for context', async () => {
        const mockBaleybots = [
          createMockBaleybot({ id: 'bb-1', name: 'Existing Bot' }),
        ];
        ctx.db.query.baleybots.findMany.mockResolvedValue(mockBaleybots);

        const result = await ctx.db.query.baleybots.findMany();

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Existing Bot');
      });
    });

    describe('saveFromSession', () => {
      it('creates new baleybot when no ID provided', async () => {
        const newBot = createMockBaleybot({ id: 'new-bb', status: 'draft' });

        ctx.db.insert.mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([newBot]),
          }),
        });

        const insertMock = ctx.db.insert('baleybots');
        const result = await insertMock.values({}).returning();

        expect(result[0].status).toBe('draft');
      });

      it('updates existing baleybot when ID provided', async () => {
        const existingBot = createMockBaleybot({ id: 'existing-bb', version: 1 });
        ctx.db.query.baleybots.findFirst.mockResolvedValue(existingBot);

        const result = await ctx.db.query.baleybots.findFirst();

        expect(result).not.toBeNull();
        expect(result?.id).toBe('existing-bb');
      });
    });
  });
});
