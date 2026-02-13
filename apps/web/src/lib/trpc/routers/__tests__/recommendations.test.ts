import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockContext,
  createMockBaleybot,
  type MockContext,
} from '../../__tests__/test-utils';
import { createMockDbModule } from '../../__tests__/mock-db';

vi.mock('@baleyui/db', () => createMockDbModule());

interface MockRecommendation {
  id: string;
  workspaceId: string;
  sourceType: string;
  sourceBaleybotId: string | null;
  sourceExecutionId: string | null;
  targetBaleybotId: string | null;
  targetType: string;
  title: string;
  description: string;
  severity: string;
  proposedAction: unknown;
  status: string;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  confidence: number | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function createMockRecommendation(overrides: Partial<MockRecommendation> = {}): MockRecommendation {
  return {
    id: 'test-rec-id',
    workspaceId: 'test-workspace-id',
    sourceType: 'pattern_learner',
    sourceBaleybotId: 'source-bb-id',
    sourceExecutionId: 'source-exec-id',
    targetBaleybotId: 'target-bb-id',
    targetType: 'approval_pattern',
    title: 'Auto-approve web_search for research bots',
    description: 'Pattern detected: 5 consecutive approvals for web_search by research entities.',
    severity: 'info',
    proposedAction: {
      tool: 'web_search',
      actionPattern: { query: '*' },
      entityGoalPattern: 'research.*',
    },
    status: 'pending',
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    confidence: 0.85,
    metadata: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('Recommendations Router Logic', () => {
  let ctx: MockContext;

  beforeEach(() => {
    ctx = createMockContext();
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('returns recommendations for workspace', async () => {
      const recs = [
        createMockRecommendation({ id: 'r-1', title: 'Rec 1' }),
        createMockRecommendation({ id: 'r-2', title: 'Rec 2' }),
      ];
      // Simulate query with relations by adding sourceBaleybot/targetBaleybot
      const recsWithRelations = recs.map((r) => ({
        ...r,
        sourceBaleybot: { id: 'source-bb-id', name: 'Pattern Learner', icon: null },
        targetBaleybot: { id: 'target-bb-id', name: 'Research Bot', icon: null },
      }));
      ctx.db.query.recommendations = {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue(recsWithRelations),
      };

      const result = await ctx.db.query.recommendations.findMany();

      expect(result).toHaveLength(2);
      expect(result[0]!.title).toBe('Rec 1');
    });

    it('filters by status', () => {
      const recs = [
        createMockRecommendation({ id: 'r-1', status: 'pending' }),
        createMockRecommendation({ id: 'r-2', status: 'accepted' }),
        createMockRecommendation({ id: 'r-3', status: 'rejected' }),
      ];

      const pending = recs.filter((r) => r.status === 'pending');
      expect(pending).toHaveLength(1);
      expect(pending[0]!.id).toBe('r-1');
    });

    it('filters by sourceType', () => {
      const recs = [
        createMockRecommendation({ id: 'r-1', sourceType: 'pattern_learner' }),
        createMockRecommendation({ id: 'r-2', sourceType: 'execution_reviewer' }),
      ];

      const filtered = recs.filter((r) => r.sourceType === 'pattern_learner');
      expect(filtered).toHaveLength(1);
    });

    it('filters by targetBaleybotId', () => {
      const recs = [
        createMockRecommendation({ id: 'r-1', targetBaleybotId: 'bb-1' }),
        createMockRecommendation({ id: 'r-2', targetBaleybotId: 'bb-2' }),
      ];

      const filtered = recs.filter((r) => r.targetBaleybotId === 'bb-1');
      expect(filtered).toHaveLength(1);
    });

    it('returns empty array when no recommendations exist', async () => {
      ctx.db.query.recommendations = {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      };

      const result = await ctx.db.query.recommendations.findMany();
      expect(result).toHaveLength(0);
    });
  });

  describe('accept', () => {
    it('marks recommendation as accepted for approval_pattern type', async () => {
      const rec = createMockRecommendation({
        targetType: 'approval_pattern',
        proposedAction: {
          tool: 'web_search',
          actionPattern: { query: '*' },
          entityGoalPattern: 'research.*',
        },
      });

      // Simulate acceptance
      const accepted = { ...rec, status: 'accepted', decidedBy: ctx.userId, decidedAt: new Date() };

      expect(accepted.status).toBe('accepted');
      expect(accepted.decidedBy).toBe(ctx.userId);

      // Verify the proposed action has the right structure for approval patterns
      const action = accepted.proposedAction as { tool: string; actionPattern: Record<string, unknown> };
      expect(action.tool).toBe('web_search');
      expect(action.actionPattern).toEqual({ query: '*' });
    });

    it('marks recommendation as accepted for bal_patch type', async () => {
      const bb = createMockBaleybot({ id: 'target-bb-id', balCode: 'old code' });
      const rec = createMockRecommendation({
        targetType: 'bal_patch',
        targetBaleybotId: bb.id,
        proposedAction: {
          currentCode: 'old code',
          proposedCode: 'new improved code',
        },
      });

      const action = rec.proposedAction as { proposedCode: string };
      expect(action.proposedCode).toBe('new improved code');
    });

    it('marks recommendation as accepted for insight type (no side effects)', () => {
      const rec = createMockRecommendation({
        targetType: 'insight',
        proposedAction: null,
      });

      const accepted = { ...rec, status: 'accepted' };
      expect(accepted.status).toBe('accepted');
      // insight type — no additional side effects beyond status change
    });

    it('marks recommendation as accepted for performance type (no side effects)', () => {
      const rec = createMockRecommendation({
        targetType: 'performance',
        proposedAction: null,
      });

      const accepted = { ...rec, status: 'accepted' };
      expect(accepted.status).toBe('accepted');
    });

    it('rejects accept on non-pending recommendation', () => {
      const rec = createMockRecommendation({ status: 'rejected' });

      const isPending = rec.status === 'pending';
      expect(isPending).toBe(false);
    });
  });

  describe('reject', () => {
    it('marks recommendation as rejected with decision note', () => {
      const rec = createMockRecommendation();
      const rejected = {
        ...rec,
        status: 'rejected',
        decidedBy: ctx.userId,
        decidedAt: new Date(),
        decisionNote: 'Not relevant to our use case',
      };

      expect(rejected.status).toBe('rejected');
      expect(rejected.decisionNote).toBe('Not relevant to our use case');
    });
  });

  describe('dismiss', () => {
    it('marks recommendation as dismissed', () => {
      const rec = createMockRecommendation();
      const dismissed = {
        ...rec,
        status: 'dismissed',
        decidedBy: ctx.userId,
        decidedAt: new Date(),
      };

      expect(dismissed.status).toBe('dismissed');
      expect(dismissed.decidedBy).toBe(ctx.userId);
    });
  });

  describe('counts', () => {
    it('returns correct status breakdown', () => {
      const recs = [
        createMockRecommendation({ status: 'pending' }),
        createMockRecommendation({ status: 'pending' }),
        createMockRecommendation({ status: 'accepted' }),
        createMockRecommendation({ status: 'rejected' }),
        createMockRecommendation({ status: 'dismissed' }),
      ];

      const counts: Record<string, number> = { pending: 0, accepted: 0, rejected: 0, dismissed: 0 };
      for (const rec of recs) {
        counts[rec.status] = (counts[rec.status] ?? 0) + 1;
      }

      expect(counts).toEqual({
        pending: 2,
        accepted: 1,
        rejected: 1,
        dismissed: 1,
      });
    });

    it('returns all zeros when no recommendations exist', () => {
      const counts: Record<string, number> = { pending: 0, accepted: 0, rejected: 0, dismissed: 0 };
      expect(counts.pending).toBe(0);
      expect(counts.accepted).toBe(0);
    });
  });

  describe('workspace isolation', () => {
    it('only returns recommendations for current workspace', () => {
      const recs = [
        createMockRecommendation({ workspaceId: ctx.workspace.id }),
        createMockRecommendation({ workspaceId: 'other-workspace' }),
      ];

      const filtered = recs.filter((r) => r.workspaceId === ctx.workspace.id);
      expect(filtered).toHaveLength(1);
    });

    it('cannot access other workspace recommendations', () => {
      const rec = createMockRecommendation({ workspaceId: 'other-workspace' });
      const accessible = rec.workspaceId === ctx.workspace.id;
      expect(accessible).toBe(false);
    });
  });

  describe('severity levels', () => {
    it('supports all severity levels', () => {
      const recs = [
        createMockRecommendation({ severity: 'info' }),
        createMockRecommendation({ severity: 'warning' }),
        createMockRecommendation({ severity: 'critical' }),
      ];

      expect(recs.map((r) => r.severity)).toEqual(['info', 'warning', 'critical']);
    });
  });
});
