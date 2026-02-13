/**
 * Test Stream Event Types
 *
 * Defines the SSE event protocol for real-time test execution streaming,
 * AI validation, analysis, and autonomous auto-fix loops.
 */

import type { TestAnalysis } from '@/components/test/TestSuitePanel';

// ============================================================================
// SSE EVENTS
// ============================================================================

export type TestStreamEvent =
  // Lifecycle
  | { type: 'test_stream_started'; totalTests: number; timestamp: number }
  | { type: 'test_stream_done'; timestamp: number }
  | { type: 'test_stream_error'; message: string; timestamp: number }
  // Per-test execution
  | { type: 'test_executing'; testId: string; testName: string; index: number; timestamp: number }
  | { type: 'test_output_delta'; testId: string; content: string; timestamp: number }
  | {
      type: 'test_execution_complete';
      testId: string;
      actualOutput: string;
      durationMs: number;
      executionStatus: 'completed' | 'failed';
      error?: string;
      timestamp: number;
    }
  // Validation
  | { type: 'test_validating'; testId: string; validationMethod: 'deterministic' | 'ai'; timestamp: number }
  | {
      type: 'test_validation_complete';
      testId: string;
      status: 'passed' | 'failed';
      confidence: number;
      reasoning: string;
      suggestions: string[];
      timestamp: number;
    }
  // Analysis
  | { type: 'analysis_started'; timestamp: number }
  | { type: 'analysis_complete'; analysis: TestAnalysis; timestamp: number }
  // Auto-fix (autonomous)
  | {
      type: 'fix_started';
      fixAttempt: number;
      maxAttempts: number;
      failurePatterns: string[];
      timestamp: number;
    }
  | { type: 'fix_generating'; fixAttempt: number; timestamp: number }
  | {
      type: 'fix_applied';
      fixAttempt: number;
      newBalCode: string;
      summary: string;
      timestamp: number;
    }
  | { type: 'fix_rerun_started'; fixAttempt: number; failedTestIds: string[]; timestamp: number }
  | {
      type: 'fix_cycle_complete';
      fixAttempt: number;
      improvedCount: number;
      remainingFailures: number;
      timestamp: number;
    }
  // Heartbeat
  | { type: 'test_heartbeat'; timestamp: number };

// ============================================================================
// CLIENT STATE
// ============================================================================

export type TestPhase = 'queued' | 'executing' | 'validating' | 'passed' | 'failed';
export type StreamPhase = 'idle' | 'executing' | 'analyzing' | 'fixing' | 'done' | 'error';

export interface TestRowState {
  phase: TestPhase;
  streamingOutput: string;
  durationMs?: number;
  error?: string;
  validationResult?: {
    status: 'passed' | 'failed';
    confidence: number;
    reasoning: string;
    suggestions: string[];
  };
}

export interface FixAttemptState {
  attempt: number;
  failurePatterns: string[];
  summary?: string;
  newBalCode?: string;
  status: 'analyzing' | 'generating' | 'applied' | 'rerunning' | 'complete';
  improvedCount?: number;
  remainingFailures?: number;
}
