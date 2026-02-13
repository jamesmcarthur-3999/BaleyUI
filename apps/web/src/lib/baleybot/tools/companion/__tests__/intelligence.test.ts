/**
 * Intelligence Companion Tools Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockInsert = vi.fn();

vi.mock('@baleyui/db', () => ({
  db: {
    query: {
      baleybotExecutions: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
        findMany: (...args: unknown[]) => mockFindMany(...args),
      },
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
  baleybotExecutions: {
    id: 'id',
    baleybotId: 'baleybotId',
    status: 'status',
    createdAt: 'createdAt',
  },
  recommendations: { workspaceId: 'workspaceId' },
  eq: (a: unknown, b: unknown) => [a, b],
  and: (...args: unknown[]) => args,
  desc: (col: unknown) => col,
}));

// Mock runner
const mockRunExecutionReviewer = vi.fn();
const mockRunPatternLearner = vi.fn();

vi.mock('../../../internal-bb/runner', () => ({
  runExecutionReviewer: (...args: unknown[]) => mockRunExecutionReviewer(...args),
  runPatternLearner: (...args: unknown[]) => mockRunPatternLearner(...args),
}));

// Mock internal-baleybots
vi.mock('../../../internal-baleybots', () => ({
  getInternalBaleybot: vi.fn().mockResolvedValue({ id: 'internal-bb-id', name: 'test', balCode: '' }),
}));

// Mock error-resolution-service
vi.mock('../../../services/error-resolution-service', () => ({
  classifyRootCause: vi.fn().mockReturnValue('unknown'),
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

import { buildIntelligenceTools } from '../intelligence';
import type { RuntimeToolDefinition } from '../../../executor';

const ctx = { workspaceId: 'ws-1', userId: 'user-1' };

function getTool(name: string): RuntimeToolDefinition {
  const tools = buildIntelligenceTools(ctx);
  const tool = tools.get(name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

describe('Intelligence Companion Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========================================================================
  // review_execution
  // ========================================================================

  describe('review_execution', () => {
    const baseExecution = {
      id: 'exec-1',
      status: 'completed',
      error: null,
      input: 'test input',
      output: 'test output',
      durationMs: 1200,
      segments: [],
      baleybot: {
        id: 'bb-1',
        name: 'TestBot',
        workspaceId: 'ws-1',
        balCode: 'test { "goal": "test" }',
      },
    };

    it('should return assessment, issues, and suggestions for a valid execution', async () => {
      mockFindFirst.mockResolvedValue(baseExecution);
      mockRunExecutionReviewer.mockResolvedValue({
        overallAssessment: 'good',
        summary: 'Good execution',
        issues: [{ severity: 'warning', category: 'performance', title: 'Slow', description: 'A bit slow' }],
        suggestions: [{ type: 'tool_config', title: 'Optimize', description: 'Optimize tools' }],
      });

      const tool = getTool('review_execution');
      const result = await tool.function({ executionId: 'exec-1' });

      expect(mockRunExecutionReviewer).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        assessment: 'good',
        summary: 'Good execution',
        issues: expect.arrayContaining([
          expect.objectContaining({ title: 'Slow' }),
        ]),
        suggestions: expect.arrayContaining([
          expect.objectContaining({ title: 'Optimize' }),
        ]),
      });
      // Non-failed execution should NOT have rootCause
      expect(result).not.toHaveProperty('rootCause');
    });

    it('should return error when execution belongs to a different workspace', async () => {
      mockFindFirst.mockResolvedValue({
        ...baseExecution,
        baleybot: { ...baseExecution.baleybot, workspaceId: 'ws-other' },
      });

      const tool = getTool('review_execution');
      const result = await tool.function({ executionId: 'exec-1' });

      expect(result).toEqual({ error: 'Execution not found in this workspace' });
      expect(mockRunExecutionReviewer).not.toHaveBeenCalled();
    });

    it('should include rootCause for failed executions', async () => {
      mockFindFirst.mockResolvedValue({
        ...baseExecution,
        status: 'failed',
        error: 'Connection timed out',
      });
      mockRunExecutionReviewer.mockResolvedValue({
        overallAssessment: 'failed',
        summary: 'Timeout failure',
        issues: [],
        suggestions: [],
      });

      const { classifyRootCause } = await import('../../../services/error-resolution-service');
      (classifyRootCause as ReturnType<typeof vi.fn>).mockReturnValue('provider_issue');

      const tool = getTool('review_execution');
      const result = await tool.function({ executionId: 'exec-1' });

      expect(result).toHaveProperty('rootCause', 'provider_issue');
    });
  });

  // ========================================================================
  // diagnose_failure
  // ========================================================================

  describe('diagnose_failure', () => {
    const failedExecution = {
      id: 'exec-fail-1',
      status: 'failed',
      error: 'Tool "web_search" returned an error: connection refused',
      input: 'search query',
      output: null,
      durationMs: 3000,
      segments: [],
      baleybot: {
        id: 'bb-1',
        name: 'SearchBot',
        workspaceId: 'ws-1',
        balCode: 'search { "goal": "search the web" }',
      },
    };

    it('should return root cause and hardening steps for a failed execution', async () => {
      mockFindFirst.mockResolvedValue(failedExecution);
      mockRunExecutionReviewer.mockResolvedValue({
        overallAssessment: 'failed',
        summary: 'Tool connection failure',
        issues: [
          { severity: 'error', category: 'accuracy', title: 'Tool Error', description: 'Web search tool failed' },
        ],
        suggestions: [
          {
            type: 'bal_change',
            title: 'Add fallback',
            description: 'Add a fallback for when web search fails',
            balCodeChange: { original: 'old code', proposed: 'new code' },
          },
          {
            type: 'prompt_improvement',
            title: 'Clarify goal',
            description: 'Make the goal more specific',
          },
        ],
      });

      const { classifyRootCause } = await import('../../../services/error-resolution-service');
      (classifyRootCause as ReturnType<typeof vi.fn>).mockReturnValue('tool_failure');

      const tool = getTool('diagnose_failure');
      const result = await tool.function({ executionId: 'exec-fail-1' });

      const r = result as Record<string, unknown>;
      expect(r).toMatchObject({
        rootCause: 'tool_failure',
        assessment: 'failed',
        summary: 'Tool connection failure',
      });
      // hardeningSteps includes bal_change and prompt_improvement
      expect(r.hardeningSteps).toHaveLength(2);
      // suggestedFixes only includes those with balCodeChange
      expect(r.suggestedFixes).toHaveLength(1);
      expect((r.suggestedFixes as Array<Record<string, unknown>>)[0]).toMatchObject({
        original: 'old code',
        proposed: 'new code',
      });
      // Should persist as recommendation
      expect(mockInsert).toHaveBeenCalled();
    });

    it('should return error for non-failed executions', async () => {
      mockFindFirst.mockResolvedValue({
        ...failedExecution,
        status: 'completed',
        error: null,
      });

      const tool = getTool('diagnose_failure');
      const result = await tool.function({ executionId: 'exec-fail-1' });

      expect(result).toEqual({
        error: 'Execution status is "completed", not "failed". Use review_execution for non-failed executions.',
      });
      expect(mockRunExecutionReviewer).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // suggest_approval_patterns
  // ========================================================================

  describe('suggest_approval_patterns', () => {
    it('should return suggestions when approval tools are found', async () => {
      mockFindMany.mockResolvedValue([
        {
          id: 'exec-1',
          segments: [
            { type: 'tool_call_stream_complete', toolName: 'schedule_task', id: 't1' },
            { type: 'tool_call_stream_complete', toolName: 'create_agent', id: 't2' },
          ],
          baleybot: {
            id: 'bb-1',
            name: 'SchedulerBot',
            workspaceId: 'ws-1',
            balCode: 'scheduler { "goal": "schedule tasks" }',
          },
        },
        {
          id: 'exec-2',
          segments: [
            { type: 'tool_call_stream_complete', toolName: 'schedule_task', id: 't3' },
          ],
          baleybot: {
            id: 'bb-1',
            name: 'SchedulerBot',
            workspaceId: 'ws-1',
            balCode: 'scheduler { "goal": "schedule tasks" }',
          },
        },
      ]);

      mockRunPatternLearner.mockResolvedValue({
        suggestions: [
          {
            tool: 'schedule_task',
            actionPattern: { type: 'schedule' },
            entityGoalPattern: null,
            trustLevel: 'provisional',
            explanation: 'Frequently used schedule_task',
            riskAssessment: 'low',
            suggestedExpirationDays: 30,
          },
        ],
        warnings: [],
        recommendations: ['Consider auto-approving schedule_task'],
      });

      const tool = getTool('suggest_approval_patterns');
      const result = await tool.function({ baleybotId: 'bb-1' });

      expect(mockRunPatternLearner).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        suggestions: expect.arrayContaining([
          expect.objectContaining({ tool: 'schedule_task' }),
        ]),
        approvalEventCount: 3,
      });
      // Should persist recommendation
      expect(mockInsert).toHaveBeenCalled();
    });

    it('should return empty when no approval tools used', async () => {
      mockFindMany.mockResolvedValue([
        {
          id: 'exec-1',
          segments: [
            { type: 'tool_call_stream_complete', toolName: 'web_search', id: 't1' },
            { type: 'text_delta', content: 'hello' },
          ],
          baleybot: {
            id: 'bb-1',
            name: 'SearchBot',
            workspaceId: 'ws-1',
            balCode: 'search { "goal": "search" }',
          },
        },
      ]);

      const tool = getTool('suggest_approval_patterns');
      const result = await tool.function({ baleybotId: 'bb-1' });

      expect(result).toMatchObject({
        suggestions: [],
        message: 'No approval-requiring tools were used in recent executions',
      });
      expect(mockRunPatternLearner).not.toHaveBeenCalled();
    });
  });
});
