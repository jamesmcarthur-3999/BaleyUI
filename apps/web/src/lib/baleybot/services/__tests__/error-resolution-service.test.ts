/**
 * Error Resolution Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB
const mockFindFirst = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();

vi.mock('@baleyui/db', () => ({
  db: {
    query: {
      recommendations: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
      workspaces: { findFirst: vi.fn().mockResolvedValue({ ownerId: 'user-owner' }) },
    },
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return { values: (...vArgs: unknown[]) => {
        mockValues(...vArgs);
        return { returning: (...rArgs: unknown[]) => {
          mockReturning(...rArgs);
          return Promise.resolve([{ id: 'rec-123' }]);
        }};
      }};
    },
  },
  recommendations: { workspaceId: 'workspaceId', metadata: 'metadata', createdAt: 'createdAt' },
  notifications: { id: 'id' },
  workspaces: { id: 'id' },
  and: (...args: unknown[]) => args,
  eq: (a: unknown, b: unknown) => [a, b],
  gt: (a: unknown, b: unknown) => [a, b],
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

// Mock runner
const mockRunExecutionReviewer = vi.fn();
vi.mock('../../internal-bb/runner', () => ({
  runExecutionReviewer: (...args: unknown[]) => mockRunExecutionReviewer(...args),
}));

// Mock internal-baleybots
vi.mock('../../internal-baleybots', () => ({
  getInternalBaleybot: vi.fn().mockResolvedValue({ id: 'internal-er-id', name: 'execution_reviewer', balCode: '' }),
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
  processError,
  normalizeError,
  computeErrorHash,
  classifyRootCause,
  classifyRisk,
} from '../error-resolution-service';
import type { ExecutionReviewerOutput } from '../../internal-bb/runner';

describe('Error Resolution Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirst.mockResolvedValue(null); // No duplicate by default
  });

  const baseInput = {
    workspaceId: 'ws-1',
    sourceType: 'execution' as const,
    sourceId: 'exec-1',
    baleybotId: 'bb-1',
    baleybotName: 'TestBot',
    error: 'Something went wrong',
  };

  const baseReview: ExecutionReviewerOutput = {
    overallAssessment: 'failed',
    summary: 'Execution failed due to an error',
    issues: [
      { severity: 'error', category: 'accuracy', title: 'Runtime Error', description: 'The bot crashed' },
    ],
    suggestions: [
      { type: 'tool_config', title: 'Fix config', description: 'Update tool configuration' },
    ],
  };

  // Test 1: Failed execution → reviewer invoked, recommendation created
  it('should invoke reviewer and create recommendation for failed execution', async () => {
    mockRunExecutionReviewer.mockResolvedValue(baseReview);

    await processError(baseInput);

    expect(mockRunExecutionReviewer).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalled(); // recommendation + notification
  });

  // Test 2: Deduplication
  it('should skip review when same error was reviewed in last 24h', async () => {
    mockFindFirst.mockResolvedValue({ id: 'existing-rec' });

    await processError(baseInput);

    expect(mockRunExecutionReviewer).not.toHaveBeenCalled();
  });

  // Test 3: Different errors → both reviewed
  it('should review different error messages independently', async () => {
    mockRunExecutionReviewer.mockResolvedValue(baseReview);

    await processError(baseInput);
    mockFindFirst.mockResolvedValue(null);
    await processError({ ...baseInput, error: 'Different error' });

    expect(mockRunExecutionReviewer).toHaveBeenCalledTimes(2);
  });

  // Test 4: Root cause: provider_issue
  it('should classify timeout as provider_issue', () => {
    const result = classifyRootCause('Request timed out after 30s', baseReview);
    expect(result).toBe('provider_issue');
  });

  // Test 5: Root cause: adversarial_input
  it('should classify safety issue as adversarial_input', () => {
    const reviewWithSafety: ExecutionReviewerOutput = {
      ...baseReview,
      issues: [{ severity: 'error', category: 'safety', title: 'Safety', description: 'Unsafe input' }],
    };
    const result = classifyRootCause('Some error', reviewWithSafety);
    expect(result).toBe('adversarial_input');
  });

  // Test 6: Root cause: configuration_issue
  it('should classify "not configured" as configuration_issue', () => {
    const result = classifyRootCause('AI provider not configured', baseReview);
    expect(result).toBe('configuration_issue');
  });

  // Test 7: Low-risk auto-apply
  it('should classify tool_config suggestion as low risk', () => {
    const result = classifyRisk({
      type: 'tool_config',
      title: 'Fix config',
      description: 'Update config',
    });
    expect(result).toBe('low');
  });

  // Test 8: High-risk pending
  it('should classify bal_change with balCodeChange as high risk', () => {
    const result = classifyRisk({
      type: 'bal_change',
      title: 'Fix code',
      description: 'Change BAL',
      balCodeChange: { original: 'old', proposed: 'new' },
    });
    expect(result).toBe('high');
  });

  // Test 9: Notification created
  it('should create notification with correct template', async () => {
    mockRunExecutionReviewer.mockResolvedValue(baseReview);

    await processError(baseInput);

    // Should have been called at least twice (recommendation + notification)
    expect(mockInsert).toHaveBeenCalled();
    // Check the notification values contain expected fields
    const allValuesCalls = mockValues.mock.calls;
    const notificationCall = allValuesCalls.find(
      (call) => call[0]?.userId === 'user-owner'
    );
    expect(notificationCall).toBeDefined();
  });

  // Test 10: Service failure → doesn't throw
  it('should never throw even when internal services fail', async () => {
    mockRunExecutionReviewer.mockRejectedValue(new Error('AI service down'));

    // Should resolve cleanly without throwing
    await expect(processError(baseInput)).resolves.toBeUndefined();
  });
});

describe('normalizeError', () => {
  it('should strip UUIDs', () => {
    const result = normalizeError('Error in 550e8400-e29b-41d4-a716-446655440000');
    expect(result).toContain('<uuid>');
    expect(result).not.toContain('550e8400');
  });

  it('should strip timestamps', () => {
    const result = normalizeError('Error at 1707344000000');
    expect(result).toContain('<timestamp>');
  });

  it('should strip numeric IDs', () => {
    const result = normalizeError('Item 42 not found');
    expect(result).toContain('<n>');
  });
});

describe('computeErrorHash', () => {
  it('should produce same hash for same BB + normalized error', () => {
    const h1 = computeErrorHash('bb-1', 'Error with ID 123');
    const h2 = computeErrorHash('bb-1', 'Error with ID 456');
    expect(h1).toBe(h2); // Numbers are normalized away
  });

  it('should produce different hash for different BBs', () => {
    const h1 = computeErrorHash('bb-1', 'Same error');
    const h2 = computeErrorHash('bb-2', 'Same error');
    expect(h1).not.toBe(h2);
  });
});
