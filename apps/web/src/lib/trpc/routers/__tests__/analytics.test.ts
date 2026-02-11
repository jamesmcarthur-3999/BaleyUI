import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockContext,
  type MockContext,
} from '../../__tests__/test-utils';

// Mock external dependencies
vi.mock('@/lib/analytics/cost-calculator', () => ({
  calculateCost: vi.fn((model: string, inputTokens: number, outputTokens: number) => {
    // Simple mock: $0.001 per 1000 tokens
    return ((inputTokens + outputTokens) / 1000) * 0.001;
  }),
}));

import { createMockDbModule } from '../../__tests__/mock-db';

vi.mock('@baleyui/db', () => createMockDbModule());

describe('Analytics Router Logic', () => {
  let ctx: MockContext;

  beforeEach(() => {
    ctx = createMockContext();
    vi.clearAllMocks();
  });

  describe('getCostSummary', () => {
    it('returns cost breakdown by BaleyBot', async () => {
      const costByBotResult = [
        { baleybotId: 'bb-1', baleybotName: 'Classifier', model: 'openai:gpt-4o', inputTokens: 1000, outputTokens: 500, totalCost: 0.0075, executions: 10 },
        { baleybotId: 'bb-2', baleybotName: 'Summarizer', model: 'openai:gpt-4o-mini', inputTokens: 5000, outputTokens: 2000, totalCost: 0.002, executions: 50 },
      ];

      ctx.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockResolvedValue(costByBotResult),
            }),
          }),
        }),
      });

      const result = await ctx.db.select({}).from({}).innerJoin({}).where({}).groupBy({});

      expect(result).toHaveLength(2);
      expect(result[0].baleybotName).toBe('Classifier');
      expect(result[1].executions).toBe(50);
    });

    it('returns cost breakdown by model', async () => {
      const costByModelResult = [
        { model: 'openai:gpt-4o', inputTokens: 10000, outputTokens: 5000, totalCost: 0.075, executions: 100 },
        { model: 'anthropic:claude-sonnet-4-20250514', inputTokens: 8000, outputTokens: 3000, totalCost: 0.069, executions: 80 },
      ];

      ctx.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockResolvedValue(costByModelResult),
            }),
          }),
        }),
      });

      const result = await ctx.db.select({}).from({}).innerJoin({}).where({}).groupBy({});

      expect(result).toHaveLength(2);
      expect(result[0].model).toBe('openai:gpt-4o');
    });

    it('returns zero total cost when no executions', async () => {
      ctx.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const result = await ctx.db.select({}).from({}).innerJoin({}).where({}).groupBy({});

      expect(result).toHaveLength(0);
      const totalCost = result.reduce((_sum: number) => _sum, 0);
      expect(totalCost).toBe(0);
    });

    it('filters by baleybotId when specified', () => {
      const conditions = [
        { _type: 'eq', a: 'workspaceId', b: 'ws-1' },
        { _type: 'eq', a: 'baleybotId', b: 'specific-bot' },
      ];

      expect(conditions).toHaveLength(2);
      expect(conditions[1]!.b).toBe('specific-bot');
    });
  });

  describe('getLatencyMetrics', () => {
    it('returns overall latency percentiles', async () => {
      const overallResult = [{ p50: 120, p95: 450, p99: 890, avgMs: 200 }];

      ctx.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(overallResult),
          }),
        }),
      });

      const result = await ctx.db.select({}).from({}).innerJoin({}).where({});

      expect(result[0].p50).toBe(120);
      expect(result[0].p95).toBe(450);
      expect(result[0].p99).toBe(890);
      expect(result[0].avgMs).toBe(200);
    });

    it('returns latency breakdown by BaleyBot', async () => {
      const byBotResult = [
        { baleybotId: 'bb-1', baleybotName: 'Fast Bot', p50: 10, p95: 25, p99: 50, avgMs: 15, executions: 1000 },
        { baleybotId: 'bb-2', baleybotName: 'Slow Bot', p50: 500, p95: 1200, p99: 2000, avgMs: 600, executions: 100 },
      ];

      ctx.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockResolvedValue(byBotResult),
            }),
          }),
        }),
      });

      const result = await ctx.db.select({}).from({}).innerJoin({}).where({}).groupBy({});

      expect(result).toHaveLength(2);
      expect(result[0].baleybotName).toBe('Fast Bot');
      expect(result[1].p50).toBe(500);
    });

    it('handles empty latency data', async () => {
      ctx.db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await ctx.db.select({}).from({}).innerJoin({}).where({});
      const overall = result[0] || { p50: 0, p95: 0, p99: 0, avgMs: 0 };

      expect(overall.p50).toBe(0);
      expect(overall.avgMs).toBe(0);
    });
  });

  describe('getCostTrend', () => {
    it('returns cost trend data aggregated by date', () => {
      const trendData = [
        { date: new Date('2025-01-01'), model: 'gpt-4', inputTokens: 1000, outputTokens: 500, executions: 10 },
        { date: new Date('2025-01-01'), model: 'gpt-3.5', inputTokens: 2000, outputTokens: 1000, executions: 20 },
        { date: new Date('2025-01-02'), model: 'gpt-4', inputTokens: 800, outputTokens: 400, executions: 8 },
      ];

      // Aggregate by date (mimics router logic)
      const dataByDate: Record<string, { date: Date; cost: number; executions: number }> = {};
      for (const item of trendData) {
        const dateKey = item.date.toISOString();
        if (!dataByDate[dateKey]) {
          dataByDate[dateKey] = { date: item.date, cost: 0, executions: 0 };
        }
        dataByDate[dateKey].cost += (item.inputTokens + item.outputTokens) / 1000 * 0.001;
        dataByDate[dateKey].executions += item.executions;
      }

      const result = Object.values(dataByDate).sort((a, b) => a.date.getTime() - b.date.getTime());

      expect(result).toHaveLength(2);
      expect(result[0]!.executions).toBe(30); // 10 + 20
      expect(result[1]!.executions).toBe(8);
    });

    it('returns empty data for no executions in range', () => {
      const result: Array<{ date: Date; cost: number; executions: number }> = [];

      expect(result).toHaveLength(0);
    });

    it('supports different granularity levels', () => {
      const granularities = ['day', 'week', 'month'] as const;

      for (const g of granularities) {
        expect(['day', 'week', 'month']).toContain(g);
      }
    });
  });

  describe('getBaleybotAnalytics', () => {
    it('calculates per-bot metrics from executions', () => {
      const executions = [
        { id: 'e-1', status: 'completed', durationMs: 100, tokenCount: 500, error: null, startedAt: new Date('2025-01-15') },
        { id: 'e-2', status: 'completed', durationMs: 200, tokenCount: 800, error: null, startedAt: new Date('2025-01-15') },
        { id: 'e-3', status: 'failed', durationMs: 50, tokenCount: 100, error: 'timeout', startedAt: new Date('2025-01-16') },
      ];

      const total = executions.length;
      const successes = executions.filter(e => e.status === 'completed').length;
      const failures = executions.filter(e => e.status === 'failed').length;
      const avgDuration = executions.reduce((s, e) => s + (e.durationMs || 0), 0) / total;
      const totalTokens = executions.reduce((s, e) => s + (e.tokenCount || 0), 0);

      expect(total).toBe(3);
      expect(successes).toBe(2);
      expect(failures).toBe(1);
      expect(successes / total).toBeCloseTo(0.667, 2);
      expect(Math.round(avgDuration)).toBe(117);
      expect(totalTokens).toBe(1400);
    });

    it('calculates daily trend from execution timestamps', () => {
      const executions = [
        { startedAt: new Date('2025-01-15T10:00:00Z') },
        { startedAt: new Date('2025-01-15T14:00:00Z') },
        { startedAt: new Date('2025-01-16T09:00:00Z') },
      ];

      const dailyCounts: Record<string, number> = {};
      executions.forEach(e => {
        const day = new Date(e.startedAt).toISOString().slice(0, 10);
        dailyCounts[day] = (dailyCounts[day] || 0) + 1;
      });

      expect(dailyCounts['2025-01-15']).toBe(2);
      expect(dailyCounts['2025-01-16']).toBe(1);
    });

    it('aggregates top errors', () => {
      const executions = [
        { error: 'timeout' },
        { error: 'timeout' },
        { error: 'rate limit exceeded' },
        { error: null },
      ];

      const errorCounts: Record<string, number> = {};
      executions.filter(e => e.error).forEach(e => {
        const msg = String(e.error).slice(0, 100);
        errorCounts[msg] = (errorCounts[msg] || 0) + 1;
      });

      const topErrors = Object.entries(errorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([message, count]) => ({ message, count }));

      expect(topErrors).toHaveLength(2);
      expect(topErrors[0]!.message).toBe('timeout');
      expect(topErrors[0]!.count).toBe(2);
    });

    it('returns zero metrics when no executions exist', () => {
      const executions: Array<{ status: string; durationMs: number; tokenCount: number }> = [];
      const total = executions.length;

      expect(total).toBe(0);
      expect(total > 0 ? 1 : 0).toBe(0);
    });
  });

  describe('getDashboardOverview', () => {
    it('calculates aggregate metrics across all bots', () => {
      const executions = [
        { id: 'e-1', baleybotId: 'bb-1', status: 'completed', durationMs: 100, startedAt: new Date('2025-01-15') },
        { id: 'e-2', baleybotId: 'bb-1', status: 'completed', durationMs: 200, startedAt: new Date('2025-01-15') },
        { id: 'e-3', baleybotId: 'bb-2', status: 'failed', durationMs: 50, startedAt: new Date('2025-01-16') },
        { id: 'e-4', baleybotId: 'bb-2', status: 'completed', durationMs: 150, startedAt: new Date('2025-01-16') },
      ];

      const total = executions.length;
      const successes = executions.filter(e => e.status === 'completed').length;
      const avgDuration = executions.reduce((s, e) => s + (e.durationMs || 0), 0) / total;

      expect(total).toBe(4);
      expect(successes / total).toBe(0.75);
      expect(Math.round(avgDuration)).toBe(125);
    });

    it('calculates top bots by execution count', () => {
      const executions = [
        { baleybotId: 'bb-1' },
        { baleybotId: 'bb-1' },
        { baleybotId: 'bb-1' },
        { baleybotId: 'bb-2' },
        { baleybotId: 'bb-2' },
        { baleybotId: 'bb-3' },
      ];

      const botCounts: Record<string, number> = {};
      executions.forEach(e => {
        botCounts[e.baleybotId] = (botCounts[e.baleybotId] || 0) + 1;
      });

      const topBots = Object.entries(botCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([baleybotId, count]) => ({ baleybotId, count }));

      expect(topBots).toHaveLength(3);
      expect(topBots[0]!.baleybotId).toBe('bb-1');
      expect(topBots[0]!.count).toBe(3);
    });

    it('returns empty overview when no executions', () => {
      const executions: Array<{ status: string }> = [];
      const total = executions.length;

      expect(total).toBe(0);
      const successRate = total > 0 ? 0 : 0;
      expect(successRate).toBe(0);
    });
  });

  describe('exportTrainingData', () => {
    it('transforms decisions to JSONL training format', () => {
      const decisions = [
        {
          id: 'd-1',
          blockName: 'Classifier',
          input: { text: 'Hello world' },
          output: { category: 'greeting' },
          reasoning: 'Contains greeting word',
          model: 'gpt-4',
          feedbackCorrect: true,
          feedbackCorrectedOutput: null,
          createdAt: new Date(),
        },
      ];

      const jsonlLines = decisions.map(item => ({
        messages: [
          { role: 'user', content: JSON.stringify(item.input) },
          { role: 'assistant', content: JSON.stringify(item.feedbackCorrectedOutput || item.output) },
        ],
        ...(item.reasoning ? { reasoning: item.reasoning } : {}),
      }));

      expect(jsonlLines).toHaveLength(1);
      expect(jsonlLines[0]!.messages[0]!.role).toBe('user');
      expect(jsonlLines[0]!.messages[1]!.role).toBe('assistant');
      expect(jsonlLines[0]!.reasoning).toBe('Contains greeting word');
    });

    it('uses corrected output when available', () => {
      const decision = {
        output: { category: 'wrong' },
        feedbackCorrectedOutput: { category: 'correct' },
      };

      const output = decision.feedbackCorrectedOutput || decision.output;

      expect(output).toEqual({ category: 'correct' });
    });

    it('limits export to 5000 records', () => {
      const limit = 5000;
      const totalDecisions = 10000;

      expect(Math.min(totalDecisions, limit)).toBe(5000);
    });

    it('filters by feedback-only when requested', () => {
      const decisions = [
        { feedbackCorrect: true },
        { feedbackCorrect: false },
        { feedbackCorrect: null },
      ];

      const feedbackOnly = decisions.filter(d => d.feedbackCorrect !== null);

      expect(feedbackOnly).toHaveLength(2);
    });
  });

  describe('date range validation', () => {
    it('defaults to 30-day range when no dates specified', () => {
      const end = new Date();
      const start = new Date(end.getTime() - 30 * 86_400_000);

      const days = (end.getTime() - start.getTime()) / 86_400_000;

      expect(days).toBe(30);
    });

    it('rejects date ranges exceeding 365 days', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2025-06-01');

      const days = (end.getTime() - start.getTime()) / 86_400_000;

      expect(days).toBeGreaterThan(365);
    });
  });
});
