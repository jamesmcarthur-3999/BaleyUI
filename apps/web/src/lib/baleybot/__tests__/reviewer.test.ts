import { describe, it, expect, vi, beforeEach } from 'vitest';
import { quickReview } from '../reviewer';

vi.mock('../internal-baleybots', () => ({
  executeInternalBaleybot: vi.fn().mockResolvedValue({
    output: {
      overallAssessment: 'good',
      summary: 'Test review completed successfully',
      issues: [],
      suggestions: [],
      metrics: {
        outputQualityScore: 85,
        intentAlignmentScore: 90,
        efficiencyScore: 80,
      },
    },
    executionId: 'exec-123',
  }),
}));

describe('reviewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses internal BaleyBot for reviews', async () => {
    const { executeInternalBaleybot } = await import('../internal-baleybots');

    await quickReview({
      baleybotId: 'bb-1',
      baleybotName: 'test_bot',
      originalIntent: 'Test intent',
      balCode: 'test {}',
      input: 'test input',
      output: 'test output',
    });

    expect(executeInternalBaleybot).toHaveBeenCalledWith(
      'execution_reviewer',
      expect.any(String),
      expect.objectContaining({
        triggeredBy: 'internal',
      })
    );
  });

  it('returns review result', async () => {
    const result = await quickReview({
      baleybotId: 'bb-1',
      baleybotName: 'test_bot',
      originalIntent: 'Test intent',
      balCode: 'test {}',
      input: 'test input',
      output: 'test output',
    });

    expect(result).toHaveProperty('overallAssessment');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('issues');
    expect(result).toHaveProperty('suggestions');
  });
});
