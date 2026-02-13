/**
 * Post-Execution Analysis Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB
const mockFindMany = vi.fn();
const mockInsert = vi.fn();

vi.mock('@baleyui/db', () => ({
  db: {
    query: {
      baleybotExecutions: { findMany: (...args: unknown[]) => mockFindMany(...args) },
    },
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'rec-1' }]),
        }),
      };
    },
  },
  recommendations: { workspaceId: 'workspaceId' },
  baleybotExecutions: {
    baleybotId: 'baleybotId',
    status: 'status',
    createdAt: 'createdAt',
  },
  eq: (a: unknown, b: unknown) => [a, b],
  and: (...args: unknown[]) => args,
  desc: (col: unknown) => col,
}));

// Mock runner
const mockRunExecutionReviewer = vi.fn();
const mockRunPatternLearner = vi.fn();

vi.mock('../../internal-bb/runner', () => ({
  runExecutionReviewer: (...args: unknown[]) => mockRunExecutionReviewer(...args),
  runPatternLearner: (...args: unknown[]) => mockRunPatternLearner(...args),
}));

// Mock internal-baleybots
vi.mock('../../internal-baleybots', () => ({
  getInternalBaleybot: vi.fn().mockResolvedValue({ id: 'internal-bb-id', name: 'test', balCode: '' }),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  analyzeSuccessfulExecution,
  successThrottle,
} from '../post-execution-analysis';

describe('Post-Execution Analysis', () => {
  const baseParams = {
    workspaceId: 'ws-1',
    baleybotId: 'bb-analysis-1',
    baleybotName: 'TestBot',
    balCode: 'test { "goal": "test" }',
    executionId: 'exec-1',
    input: 'test input',
    output: 'test output',
    durationMs: 1000,
    segments: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    successThrottle.clear();
    mockRunExecutionReviewer.mockResolvedValue({
      overallAssessment: 'good',
      summary: 'Looks fine',
      issues: [],
      suggestions: [],
    });
    mockRunPatternLearner.mockResolvedValue({
      suggestions: [],
      warnings: [],
      recommendations: [],
    });
  });

  // Test 1: First 3 executions → reviewed
  it('should review first execution for early guidance', async () => {
    // Only 1 execution found = first run
    mockFindMany.mockResolvedValue([{ id: 'exec-1' }]);

    await analyzeSuccessfulExecution(baseParams);

    expect(mockRunExecutionReviewer).toHaveBeenCalled();
  });

  // Test 2: Slow execution → performance review
  it('should trigger performance review for slow executions', async () => {
    // Return > 3 for early guidance check (skips it)
    mockFindMany.mockImplementation((args: Record<string, unknown>) => {
      const limit = args.limit as number | undefined;
      if (limit === 4) return [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];
      // Return durations for median calculation (median = 500ms)
      if (limit === 20) return [
        { durationMs: 400 },
        { durationMs: 500 },
        { durationMs: 600 },
      ];
      return [];
    });

    // params.durationMs = 1000 should NOT trigger (1000 <= 500*2)
    await analyzeSuccessfulExecution(baseParams);

    // Reset throttle for next call
    successThrottle.clear();

    // Now with a much slower execution (5000ms > 500*2)
    mockFindMany.mockImplementation((args: Record<string, unknown>) => {
      const limit = args.limit as number | undefined;
      if (limit === 4) return [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];
      if (limit === 20) return [
        { durationMs: 400 },
        { durationMs: 500 },
        { durationMs: 600 },
      ];
      return [];
    });

    await analyzeSuccessfulExecution({ ...baseParams, baleybotId: 'bb-slow', durationMs: 5000 });

    // Should have called reviewer for performance
    expect(mockRunExecutionReviewer).toHaveBeenCalled();
  });

  // Test 3: Approval tools → pattern learner called
  it('should invoke pattern learner when approval tools are used', async () => {
    mockFindMany.mockResolvedValue([{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }]);

    const params = {
      ...baseParams,
      baleybotId: 'bb-approval-test',
      segments: [
        { type: 'tool_call_stream_complete', toolName: 'schedule_task', id: 't1' },
      ],
    };

    await analyzeSuccessfulExecution(params);

    expect(mockRunPatternLearner).toHaveBeenCalled();
  });

  // Test 4: No approval tools → pattern learner NOT called
  it('should not invoke pattern learner when no approval tools used', async () => {
    mockFindMany.mockResolvedValue([{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }]);

    await analyzeSuccessfulExecution({
      ...baseParams,
      baleybotId: 'bb-no-approval',
      segments: [
        { type: 'tool_call_stream_complete', toolName: 'web_search', id: 't1' },
      ],
    });

    expect(mockRunPatternLearner).not.toHaveBeenCalled();
  });

  // Test 5: Good review → no recommendation persisted
  it('should not persist recommendation for excellent reviews', async () => {
    // Only 1 execution = early guidance trigger
    mockFindMany.mockResolvedValue([{ id: 'exec-1' }]);

    mockRunExecutionReviewer.mockResolvedValue({
      overallAssessment: 'excellent',
      summary: 'Perfect execution',
      issues: [],
      suggestions: [],
    });

    await analyzeSuccessfulExecution({
      ...baseParams,
      baleybotId: 'bb-excellent',
    });

    // Reviewer was called but recommendation should NOT be inserted
    expect(mockRunExecutionReviewer).toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  // Test 6: Throttle
  it('should skip analysis when throttled', async () => {
    mockFindMany.mockResolvedValue([{ id: 'exec-1' }]);

    const throttledParams = { ...baseParams, baleybotId: 'bb-throttle-test' };

    await analyzeSuccessfulExecution(throttledParams);
    await analyzeSuccessfulExecution(throttledParams);

    // Second call should be throttled
    expect(mockRunExecutionReviewer).toHaveBeenCalledTimes(1);
  });
});
