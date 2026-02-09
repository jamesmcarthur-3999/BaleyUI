import { describe, it, expect, vi, beforeEach } from 'vitest';
import { quickReview } from '../reviewer';

vi.mock('../internal-bb/runner', () => ({
  runExecutionReviewer: vi.fn().mockResolvedValue({
    overallAssessment: 'good',
    summary: 'Test review completed successfully',
    issues: [],
    suggestions: [],
    metrics: {
      outputQualityScore: 85,
      intentAlignmentScore: 90,
      efficiencyScore: 80,
    },
  }),
}));

describe('reviewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses internal BaleyBot for reviews', async () => {
    const { runExecutionReviewer } = await import('../internal-bb/runner');

    await quickReview({
      baleybotId: 'bb-1',
      baleybotName: 'test_bot',
      originalIntent: 'Test intent',
      balCode: 'test {}',
      input: 'test input',
      output: 'test output',
    });

    expect(runExecutionReviewer).toHaveBeenCalledWith(
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
