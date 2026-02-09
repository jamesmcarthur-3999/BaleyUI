import { describe, it, expect, vi, beforeEach } from 'vitest';
import { proposePattern } from '../pattern-learner';

vi.mock('../internal-bb/runner', () => ({
  runPatternLearner: vi.fn().mockResolvedValue({
    suggestions: [
      {
        tool: 'test_tool',
        actionPattern: { action: 'read' },
        entityGoalPattern: null,
        trustLevel: 'provisional',
        explanation: 'Test suggestion',
        riskAssessment: 'low',
        suggestedExpirationDays: 30,
      },
    ],
    warnings: [],
    recommendations: [],
  }),
}));

describe('pattern-learner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses internal BaleyBot for pattern proposals', async () => {
    const { runPatternLearner } = await import('../internal-bb/runner');

    await proposePattern(
      {
        tool: 'test_tool',
        arguments: { action: 'read' },
        entityName: 'test_entity',
        entityGoal: 'Test goal',
        reason: 'Test reason',
      },
      {
        workspaceId: 'ws-1',
        existingPatterns: [],
        policies: null,
      }
    );

    expect(runPatternLearner).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        userWorkspaceId: 'ws-1',
        triggeredBy: 'internal',
      })
    );
  });

  it('returns pattern suggestions', async () => {
    const result = await proposePattern(
      {
        tool: 'test_tool',
        arguments: { action: 'read' },
        entityName: 'test_entity',
        entityGoal: 'Test goal',
        reason: 'Test reason',
      },
      {
        workspaceId: 'ws-1',
        existingPatterns: [],
        policies: null,
      }
    );

    expect(result).toHaveProperty('suggestions');
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toHaveProperty('tool', 'test_tool');
  });
});
