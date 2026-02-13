/**
 * useTestStream — Client hook for streaming test execution via SSE.
 *
 * Consumes events from /api/baleybots/[id]/test-stream and manages
 * per-test row state, analysis, and auto-fix attempt state.
 */

'use client';

import { useState, useRef } from 'react';
import { streamPostSSE } from '@/lib/streaming/client-post-sse';
import type {
  TestStreamEvent,
  TestRowState,
  StreamPhase,
  FixAttemptState,
} from '@/lib/baleybot/testing/test-stream-types';
import type { TestAnalysis } from '@/components/test/TestSuitePanel';

interface TestCaseInput {
  id: string;
  name: string;
  level: 'unit' | 'integration' | 'e2e';
  input: string | Record<string, unknown>;
  expectedOutput?: string;
  matchStrategy?: 'exact' | 'contains' | 'semantic' | 'schema' | 'structured';
  description?: string;
}

export interface UseTestStreamReturn {
  startTestRun: (testCases: TestCaseInput[], opts?: { autoFix?: boolean }) => void;
  cancelTestRun: () => void;
  isStreaming: boolean;
  testStates: Map<string, TestRowState>;
  streamPhase: StreamPhase;
  overallProgress: { completed: number; total: number };
  analysis: TestAnalysis | null;
  fixAttempts: FixAttemptState[];
  activeTestId: string | null;
  latestBalCode: string | null;
}

export function useTestStream(baleybotId: string): UseTestStreamReturn {
  const [testStates, setTestStates] = useState<Map<string, TestRowState>>(new Map());
  const [streamPhase, setStreamPhase] = useState<StreamPhase>('idle');
  const [overallProgress, setOverallProgress] = useState({ completed: 0, total: 0 });
  const [analysis, setAnalysis] = useState<TestAnalysis | null>(null);
  const [fixAttempts, setFixAttempts] = useState<FixAttemptState[]>([]);
  const [activeTestId, setActiveTestId] = useState<string | null>(null);
  const [latestBalCode, setLatestBalCode] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);
  const outputAccRef = useRef<Map<string, string>>(new Map());

  const updateTestState = (testId: string, patch: Partial<TestRowState>) => {
    setTestStates(prev => {
      const next = new Map(prev);
      const current = next.get(testId) ?? { phase: 'queued' as const, streamingOutput: '' };
      next.set(testId, { ...current, ...patch });
      return next;
    });
  };

  const handleEvent = (event: TestStreamEvent) => {
    switch (event.type) {
      case 'test_stream_started':
        setOverallProgress({ completed: 0, total: event.totalTests });
        setStreamPhase('executing');
        break;

      case 'test_executing':
        setActiveTestId(event.testId);
        outputAccRef.current.set(event.testId, '');
        updateTestState(event.testId, { phase: 'executing', streamingOutput: '' });
        break;

      case 'test_output_delta': {
        const acc = (outputAccRef.current.get(event.testId) ?? '') + event.content;
        outputAccRef.current.set(event.testId, acc);
        updateTestState(event.testId, { streamingOutput: acc });
        break;
      }

      case 'test_execution_complete':
        updateTestState(event.testId, {
          durationMs: event.durationMs,
          error: event.error,
          streamingOutput: event.actualOutput || outputAccRef.current.get(event.testId) || '',
        });
        break;

      case 'test_validating':
        updateTestState(event.testId, { phase: 'validating' });
        break;

      case 'test_validation_complete':
        updateTestState(event.testId, {
          phase: event.status === 'passed' ? 'passed' : 'failed',
          validationResult: {
            status: event.status,
            confidence: event.confidence,
            reasoning: event.reasoning,
            suggestions: event.suggestions,
          },
        });
        setOverallProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
        break;

      case 'analysis_started':
        setStreamPhase('analyzing');
        setActiveTestId(null);
        break;

      case 'analysis_complete':
        setAnalysis(event.analysis);
        break;

      case 'fix_started':
        setStreamPhase('fixing');
        setFixAttempts(prev => [
          ...prev,
          {
            attempt: event.fixAttempt,
            failurePatterns: event.failurePatterns,
            status: 'analyzing',
          },
        ]);
        break;

      case 'fix_generating':
        setFixAttempts(prev =>
          prev.map(fa =>
            fa.attempt === event.fixAttempt ? { ...fa, status: 'generating' as const } : fa
          )
        );
        break;

      case 'fix_applied':
        setLatestBalCode(event.newBalCode);
        setFixAttempts(prev =>
          prev.map(fa =>
            fa.attempt === event.fixAttempt
              ? { ...fa, status: 'applied' as const, newBalCode: event.newBalCode, summary: event.summary }
              : fa
          )
        );
        break;

      case 'fix_rerun_started':
        setFixAttempts(prev =>
          prev.map(fa =>
            fa.attempt === event.fixAttempt ? { ...fa, status: 'rerunning' as const } : fa
          )
        );
        // Reset test states for re-running tests
        for (const testId of event.failedTestIds) {
          outputAccRef.current.set(testId, '');
          updateTestState(testId, { phase: 'queued', streamingOutput: '', error: undefined, validationResult: undefined });
        }
        break;

      case 'fix_cycle_complete':
        setFixAttempts(prev =>
          prev.map(fa =>
            fa.attempt === event.fixAttempt
              ? {
                  ...fa,
                  status: 'complete' as const,
                  improvedCount: event.improvedCount,
                  remainingFailures: event.remainingFailures,
                }
              : fa
          )
        );
        break;

      case 'test_stream_done':
        setStreamPhase('done');
        setActiveTestId(null);
        isStreamingRef.current = false;
        break;

      case 'test_stream_error':
        setStreamPhase('error');
        setActiveTestId(null);
        isStreamingRef.current = false;
        break;

      case 'test_heartbeat':
        // No-op — just keeps connection alive
        break;
    }
  };

  const startTestRun = (testCases: TestCaseInput[], opts?: { autoFix?: boolean }) => {
    // Cancel any in-flight stream
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;
    isStreamingRef.current = true;

    // Reset state
    const initialStates = new Map<string, TestRowState>();
    for (const tc of testCases) {
      initialStates.set(tc.id, { phase: 'queued', streamingOutput: '' });
    }
    setTestStates(initialStates);
    setStreamPhase('executing');
    setOverallProgress({ completed: 0, total: testCases.length });
    setAnalysis(null);
    setFixAttempts([]);
    setActiveTestId(null);
    setLatestBalCode(null);
    outputAccRef.current.clear();

    streamPostSSE<TestStreamEvent>({
      url: `/api/baleybots/${baleybotId}/test-stream`,
      body: {
        testCases: testCases.map(tc => ({
          id: tc.id,
          name: tc.name,
          level: tc.level,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          matchStrategy: tc.matchStrategy,
          description: tc.description,
        })),
        autoFix: opts?.autoFix ?? true,
        maxFixAttempts: 2,
      },
      signal: controller.signal,
      onEvent: handleEvent,
      onDone: () => {
        isStreamingRef.current = false;
        if (streamPhase !== 'error') {
          setStreamPhase('done');
        }
      },
    }).catch((err) => {
      if (controller.signal.aborted) return;
      console.error('Test stream failed:', err);
      setStreamPhase('error');
      isStreamingRef.current = false;
    });
  };

  const cancelTestRun = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    isStreamingRef.current = false;
    setActiveTestId(null);
    // Keep current state but mark as done
    setStreamPhase('done');
  };

  return {
    startTestRun,
    cancelTestRun,
    isStreaming: streamPhase === 'executing' || streamPhase === 'analyzing' || streamPhase === 'fixing',
    testStates,
    streamPhase,
    overallProgress,
    analysis,
    fixAttempts,
    activeTestId,
    latestBalCode,
  };
}
