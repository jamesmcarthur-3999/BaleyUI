/**
 * useTestExecution Hook
 *
 * Encapsulates all test execution logic for the BaleyBot creation page.
 * Handles pre-flight validation, failure categorization, diagnostic messages,
 * BB-powered semantic validation, and post-run analysis.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { trpc } from '@/lib/trpc/client';
import type { TestCase } from '@/components/creator';
import type { CreatorMessage, VisualEntity, AdaptiveTab } from '@/lib/baleybot/creator-types';
import { getConnectionSummary } from '@/lib/baleybot/tools/requirements-scanner';

// ============================================================================
// TYPES
// ============================================================================

export type FailureCategory =
  | 'connection_missing'
  | 'execution_error'
  | 'output_mismatch'
  | 'timeout'
  | 'rate_limited'
  | 'precondition_failed';

export type MatchStrategy = 'exact' | 'contains' | 'semantic';

interface WorkspaceConnection {
  id: string;
  type: string;
  name: string;
  status: string | null;
  isDefault: boolean | null;
}

export interface RunAllProgress {
  current: number;
  total: number;
  currentTestName: string;
  phase: 'running' | 'validating' | 'analyzing' | 'complete';
}

export interface TestRunSummary {
  overallStatus: 'passed' | 'mixed' | 'failed';
  summary: string;
  passRate: number;
  patterns?: Array<{
    type: string;
    description: string;
    affectedTests: string[];
    suggestedFix: string;
  }>;
  botImprovements?: Array<{
    type: 'prompt' | 'tool' | 'model' | 'structure';
    title: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
  }>;
  nextSteps?: string[];
}

export interface UseTestExecutionParams {
  savedBaleybotId: string | null;
  balCode: string;
  botName?: string;
  entities: VisualEntity[];
  workspaceConnections: WorkspaceConnection[] | undefined;
  onInjectMessage: (message: CreatorMessage) => void;
  onNavigateToTab: (tab: AdaptiveTab) => void;
}

export interface UseTestExecutionReturn {
  testCases: TestCase[];
  setTestCases: Dispatch<SetStateAction<TestCase[]>>;
  isGeneratingTests: boolean;
  isRunningAll: boolean;
  runAllProgress: RunAllProgress | null;
  lastRunSummary: TestRunSummary | null;
  handleGenerateTests: () => Promise<void>;
  handleRunTest: (testId: string) => Promise<void>;
  handleRunAllTests: () => Promise<void>;
  handleAddTest: (test: Omit<TestCase, 'id' | 'status'>) => void;
  handleUpdateTest: (testId: string, updates: Partial<TestCase>) => void;
  handleDeleteTest: (testId: string) => void;
  handleAcceptActual: (testId: string) => void;
}

// ============================================================================
// FAILURE CATEGORIZATION
// ============================================================================

function categorizeTestFailure(
  error: string | undefined,
  executionCompleted: boolean,
  hasOutputMismatch: boolean,
): FailureCategory {
  if (!error && hasOutputMismatch) return 'output_mismatch';

  const lowerErr = (error ?? '').toLowerCase();

  if (lowerErr.includes('timed out') || lowerErr.includes('timeout')) return 'timeout';
  if (lowerErr.includes('rate limit') || lowerErr.includes('rate_limit') || lowerErr.includes('429')) return 'rate_limited';
  if (
    lowerErr.includes('no ') && lowerErr.includes('provider configured') ||
    lowerErr.includes('precondition_failed') ||
    lowerErr.includes('precondition failed') ||
    lowerErr.includes('please add an')
  ) return 'connection_missing';
  if (hasOutputMismatch) return 'output_mismatch';
  if (!executionCompleted) return 'execution_error';

  return 'execution_error';
}

function getFailureDiagnostic(
  category: FailureCategory,
  error: string | undefined,
  testName: string,
): { diagnostic: CreatorMessage['metadata'] extends infer M ? M extends { diagnostic?: infer D } ? D : never : never; options: Array<{ id: string; label: string; description: string; icon?: string }> } {
  switch (category) {
    case 'connection_missing':
      return {
        diagnostic: {
          level: 'warning' as const,
          title: 'Connection Required',
          details: error || 'An AI provider or service connection is missing.',
          suggestions: [
            'Go to the Connections tab and add the required provider.',
            'Make sure the connection status is "connected".',
          ],
        },
        options: [
          { id: 'setup-connections', label: 'Set Up Connections', description: 'Connect AI provider and required services', icon: '🔌' },
        ],
      };
    case 'timeout':
      return {
        diagnostic: {
          level: 'warning' as const,
          title: 'Test Timed Out',
          details: `"${testName}" took too long. The bot may need optimization or a simpler test input.`,
          suggestions: [
            'Try a simpler input that requires less processing.',
            'Check if the bot is stuck in a tool loop.',
          ],
        },
        options: [
          { id: `retry-test-${testName}`, label: 'Retry', description: 'Run the test again', icon: '🔄' },
        ],
      };
    case 'rate_limited':
      return {
        diagnostic: {
          level: 'warning' as const,
          title: 'Rate Limited',
          details: 'The AI provider returned a rate limit error. Wait a moment and try again.',
          suggestions: ['Wait 30 seconds before retrying.'],
        },
        options: [
          { id: 'retry-all-tests', label: 'Retry All', description: 'Re-run all tests after a short wait', icon: '🔄' },
        ],
      };
    case 'output_mismatch':
      return {
        diagnostic: {
          level: 'info' as const,
          title: 'Output Mismatch',
          details: `"${testName}" completed but the output didn't match expectations. This is common with AI — the actual output may still be correct.`,
          suggestions: [
            'Review the actual output below.',
            'Click "Accept Actual" if the output is acceptable.',
            'Edit the expected output to be less strict.',
          ],
        },
        options: [],
      };
    case 'execution_error':
    default:
      return {
        diagnostic: {
          level: 'error' as const,
          title: 'Execution Error',
          details: error || `"${testName}" failed with an unexpected error.`,
          suggestions: [
            'Check the error message for details.',
            'Verify your bot\'s BAL code is correct.',
            'Try running the test again.',
          ],
        },
        options: [
          { id: `retry-test-${testName}`, label: 'Retry', description: 'Run the test again', icon: '🔄' },
        ],
      };
  }
}

// ============================================================================
// OUTPUT COMPARISON
// ============================================================================

export function compareOutput(
  actual: string,
  expected: string,
  strategy: MatchStrategy = 'contains',
): boolean {
  const trimActual = actual.trim();
  const trimExpected = expected.trim();

  if (!trimExpected) return true; // No expected output = pass if execution completed

  switch (strategy) {
    case 'exact': {
      // Try JSON comparison first
      try {
        const expectedJson = JSON.parse(trimExpected);
        const actualJson = JSON.parse(trimActual);
        return JSON.stringify(expectedJson) === JSON.stringify(actualJson);
      } catch {
        // Fall through to string comparison
      }
      return trimActual === trimExpected;
    }

    case 'contains': {
      // Case-insensitive substring match
      if (trimActual.toLowerCase().includes(trimExpected.toLowerCase())) return true;

      // 80%+ keyword match
      const expectedWords = trimExpected.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      if (expectedWords.length > 0) {
        const matchedWords = expectedWords.filter(w => trimActual.toLowerCase().includes(w));
        if (matchedWords.length >= expectedWords.length * 0.8) return true;
      }

      return false;
    }

    case 'semantic': {
      // Extract signal concepts from descriptions
      const lowerActual = trimActual.toLowerCase();
      const lowerExpected = trimExpected.toLowerCase();

      // Direct substring
      if (lowerActual.includes(lowerExpected)) return true;

      // Strip prescriptive language and check concepts
      const stripped = lowerExpected
        .replace(/should (contain|include|mention|have|be|return|output)/g, '')
        .replace(/must (contain|include|mention|have|be|return|output)/g, '')
        .replace(/the (output|response|result) (should|must|will)/g, '')
        .replace(/expected to/g, '')
        .trim();

      const concepts = stripped.split(/[\s,;.]+/).filter(w => w.length > 3);
      if (concepts.length === 0) return true;

      const matched = concepts.filter(c => lowerActual.includes(c));
      // 60% threshold for semantic matching
      return matched.length >= concepts.length * 0.6;
    }

    default:
      return false;
  }
}

// ============================================================================
// PRE-FLIGHT VALIDATION
// ============================================================================

interface PreflightResult {
  ok: boolean;
  error?: string;
  category?: FailureCategory;
}

function runPreflightChecks(
  savedBaleybotId: string | null,
  entities: VisualEntity[],
  workspaceConnections: WorkspaceConnection[] | undefined,
): PreflightResult {
  // Check 1: Bot must be saved
  if (!savedBaleybotId) {
    return {
      ok: false,
      error: 'Bot must be saved before running tests.',
      category: 'precondition_failed',
    };
  }

  const wsConns = workspaceConnections ?? [];

  // Check 2: AI provider must be connected
  const hasAiProvider = wsConns.some(
    c => ['openai', 'anthropic', 'ollama'].includes(c.type) && c.status === 'connected',
  );
  if (!hasAiProvider) {
    return {
      ok: false,
      error: 'No AI provider configured. Please add an OpenAI or Anthropic connection in the Connections tab.',
      category: 'connection_missing',
    };
  }

  // Check 3: Tool-specific connections
  const allTools = entities.flatMap(e => e.tools);
  const summary = getConnectionSummary(allTools);
  for (const req of summary.required) {
    const met = wsConns.some(
      c => c.type === req.connectionType && c.status === 'connected',
    );
    if (!met) {
      return {
        ok: false,
        error: `Missing ${req.connectionType} connection required by tools: ${req.tools.join(', ')}. Set it up in the Connections tab.`,
        category: 'connection_missing',
      };
    }
  }

  return { ok: true };
}

// ============================================================================
// HOOK
// ============================================================================

export function useTestExecution({
  savedBaleybotId,
  balCode,
  botName,
  entities,
  workspaceConnections,
  onInjectMessage,
  onNavigateToTab: _onNavigateToTab,
}: UseTestExecutionParams): UseTestExecutionReturn {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [isGeneratingTests, setIsGeneratingTests] = useState(false);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [runAllProgress, setRunAllProgress] = useState<RunAllProgress | null>(null);
  const [lastRunSummary, setLastRunSummary] = useState<TestRunSummary | null>(null);
  const prevStatusesRef = useRef<Map<string, TestCase['status']>>(new Map());

  const generateTestsMutation = trpc.baleybots.generateTests.useMutation();
  const executeMutation = trpc.baleybots.execute.useMutation();
  const saveTestsMutation = trpc.baleybots.saveTestCases.useMutation();
  const validateMutation = trpc.baleybots.validateTestOutput.useMutation();
  const analyzeMutation = trpc.baleybots.analyzeTestResults.useMutation();

  // Auto-save test cases when they change (debounced)
  useEffect(() => {
    if (!savedBaleybotId || testCases.length === 0) return;
    const timeout = setTimeout(() => {
      saveTestsMutation.mutate({
        id: savedBaleybotId,
        testCases: testCases.map(t => ({
          ...t,
          status: t.status === 'running' ? 'pending' : t.status,
        })),
      });
    }, 2000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testCases, savedBaleybotId]);

  // Track status transitions for auto-expand (used by TestPanel)
  useEffect(() => {
    const newStatuses = new Map(testCases.map(t => [t.id, t.status]));
    prevStatusesRef.current = newStatuses;
  }, [testCases]);

  // ─── BB-Powered Semantic Validation ──────────────────────────────────

  const validateWithBB = async (
    test: TestCase,
    actualOutput: string,
  ): Promise<{ passed: boolean; reasoning?: string }> => {
    if (!test.expectedOutput) return { passed: true };

    try {
      const result = await validateMutation.mutateAsync({
        testName: test.name,
        input: test.input,
        expectedOutput: test.expectedOutput,
        actualOutput,
        botName: botName || 'BaleyBot',
        botGoal: entities[0]?.purpose,
      });

      return {
        passed: result.passed,
        reasoning: result.reasoning,
      };
    } catch {
      // If BB validation fails, fall back to local comparison
      return {
        passed: compareOutput(actualOutput, test.expectedOutput, test.matchStrategy ?? 'contains'),
      };
    }
  };

  // ─── Post-Run Analysis ────────────────────────────────────────────────

  const analyzeResults = async (results: TestCase[]) => {
    if (results.length === 0) return;

    try {
      setRunAllProgress(prev => prev ? { ...prev, phase: 'analyzing' } : null);

      const analysis = await analyzeMutation.mutateAsync({
        botName: botName || 'BaleyBot',
        botGoal: entities[0]?.purpose,
        testResults: results.map(t => ({
          id: t.id,
          name: t.name,
          level: t.level,
          input: t.input,
          expectedOutput: t.expectedOutput,
          actualOutput: t.actualOutput,
          status: t.status,
          error: t.error,
          failureCategory: t.failureCategory,
          durationMs: t.durationMs,
        })),
      });

      setLastRunSummary(analysis);

      // Build rich summary message
      const passed = results.filter(t => t.status === 'passed').length;
      const total = results.length;
      const statusIcon = analysis.overallStatus === 'passed' ? '🎉' : analysis.overallStatus === 'mixed' ? '⚠️' : '❌';

      let content = `${statusIcon} **Test Run Complete** — ${passed}/${total} passed`;
      if (analysis.summary) {
        content += `\n\n${analysis.summary}`;
      }

      if (analysis.botImprovements && analysis.botImprovements.length > 0) {
        content += '\n\n**Suggested Improvements:**';
        for (const imp of analysis.botImprovements.slice(0, 3)) {
          content += `\n- **${imp.title}** — ${imp.description}`;
        }
      }

      const nextStepOptions: Array<{ id: string; label: string; description: string; icon: string }> = [];

      if (analysis.overallStatus !== 'passed') {
        nextStepOptions.push({
          id: 'retry-all-tests',
          label: 'Re-run Tests',
          description: 'Run all tests again',
          icon: '🔄',
        });
      }

      if (analysis.patterns?.some(p => p.type === 'connection_issue')) {
        nextStepOptions.push({
          id: 'setup-connections',
          label: 'Fix Connections',
          description: 'Check and fix connection issues',
          icon: '🔌',
        });
      }

      const hasOutputMismatches = results.some(t => t.failureCategory === 'output_mismatch');
      if (hasOutputMismatches) {
        nextStepOptions.push({
          id: 'review-mismatches',
          label: 'Review Outputs',
          description: 'Review and accept actual outputs',
          icon: '👁️',
        });
      }

      onInjectMessage({
        id: `msg-${Date.now()}-analysis`,
        role: 'assistant',
        content,
        timestamp: new Date(),
        metadata: {
          diagnostic: {
            level: analysis.overallStatus === 'passed' ? 'success' : analysis.overallStatus === 'mixed' ? 'warning' : 'error',
            title: `${passed}/${total} Tests Passed`,
            details: analysis.summary,
            suggestions: analysis.nextSteps ?? [],
          },
          options: nextStepOptions.length > 0 ? nextStepOptions : undefined,
          progress: {
            current: passed,
            total,
            label: `${passed}/${total} passed`,
          },
        },
      });
    } catch {
      // Analysis is a nice-to-have — inject simple summary on failure
      const passed = results.filter(t => t.status === 'passed').length;
      const total = results.length;
      const simpleStatus = passed === total ? 'passed' : passed === 0 ? 'failed' : 'mixed';

      setLastRunSummary({
        overallStatus: simpleStatus as 'passed' | 'mixed' | 'failed',
        summary: `${passed}/${total} tests passed.`,
        passRate: total > 0 ? passed / total : 0,
      });

      onInjectMessage({
        id: `msg-${Date.now()}-summary`,
        role: 'assistant',
        content: `**Test Run Complete** — ${passed}/${total} tests passed.`,
        timestamp: new Date(),
        metadata: {
          progress: { current: passed, total, label: `${passed}/${total} passed` },
        },
      });
    }
  };

  // ─── Generate Tests ─────────────────────────────────────────────────────

  const handleGenerateTests = async () => {
    if (!savedBaleybotId) {
      onInjectMessage({
        id: `msg-${Date.now()}-system`,
        role: 'assistant',
        content: 'Please save your bot first before generating tests.',
        timestamp: new Date(),
        metadata: {
          diagnostic: {
            level: 'warning',
            title: 'Save Required',
            details: 'Your bot needs to be saved before tests can be generated.',
            suggestions: ['Click the Save button in the header to save your bot.'],
          },
        },
      });
      return;
    }

    setIsGeneratingTests(true);

    try {
      const result = await generateTestsMutation.mutateAsync({
        baleybotId: savedBaleybotId,
        balCode,
        entities: entities.map(e => ({
          name: e.name,
          tools: e.tools,
          purpose: e.purpose || e.name,
        })),
      });

      const generated: TestCase[] = result.tests.map((test, i) => ({
        id: `test-${Date.now()}-${i}`,
        name: test.name,
        level: test.level,
        input: test.input,
        expectedOutput: test.expectedOutput,
        matchStrategy: (test as Record<string, unknown>).matchStrategy as MatchStrategy | undefined,
        status: 'pending' as const,
      }));

      setTestCases(prev => [...prev, ...generated]);

      onInjectMessage({
        id: `msg-${Date.now()}-tests`,
        role: 'assistant',
        content: `Generated ${generated.length} tests. Strategy: ${result.strategy}`,
        timestamp: new Date(),
        metadata: {
          testPlan: {
            tests: generated.map(t => ({
              id: t.id,
              name: t.name,
              level: t.level,
              status: t.status,
              input: t.input,
              expectedOutput: t.expectedOutput,
            })),
            summary: result.strategy,
          },
        },
      });
    } catch (error) {
      console.error('Test generation failed:', error);
      onInjectMessage({
        id: `msg-${Date.now()}-testerr`,
        role: 'assistant',
        content: 'Failed to generate tests. Please try again.',
        timestamp: new Date(),
        metadata: {
          isError: true,
          diagnostic: {
            level: 'error',
            title: 'Test Generation Failed',
            details: error instanceof Error ? error.message : 'Unknown error',
            suggestions: ['Make sure your bot has been saved first', 'Check that an AI provider is connected'],
          },
        },
      });
    } finally {
      setIsGeneratingTests(false);
    }
  };

  // ─── Run Single Test ────────────────────────────────────────────────────

  const handleRunTest = async (testId: string) => {
    const test = testCases.find(t => t.id === testId);
    if (!test) return;

    // Pre-flight validation
    const preflight = runPreflightChecks(savedBaleybotId, entities, workspaceConnections);
    if (!preflight.ok) {
      const failCat = preflight.category ?? 'precondition_failed';
      const { diagnostic, options } = getFailureDiagnostic(failCat, preflight.error, test.name);

      setTestCases(prev => prev.map(t =>
        t.id === testId
          ? { ...t, status: 'failed' as const, error: preflight.error, failureCategory: failCat }
          : t
      ));

      onInjectMessage({
        id: `msg-${Date.now()}-preflight-${testId}`,
        role: 'assistant',
        content: preflight.error ?? 'Pre-flight check failed.',
        timestamp: new Date(),
        metadata: {
          diagnostic,
          options: options.length > 0 ? options : undefined,
        },
      });
      return;
    }

    // Mark as running
    setTestCases(prev => prev.map(t =>
      t.id === testId ? { ...t, status: 'running' as const, failureCategory: undefined, error: undefined } : t
    ));

    try {
      // Timeout after 60 seconds
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Test execution timed out after 60 seconds')), 60000)
      );

      const execution = await Promise.race([
        executeMutation.mutateAsync({
          id: savedBaleybotId!,
          input: test.input,
          triggeredBy: 'manual',
        }),
        timeoutPromise,
      ]);

      const actualOutput = execution.output != null
        ? (typeof execution.output === 'string' ? execution.output : JSON.stringify(execution.output, null, 2))
        : undefined;

      // Compare output using match strategy
      const strategy = test.matchStrategy ?? 'contains';
      let testPassed = execution.status === 'completed';
      let hasOutputMismatch = false;

      if (testPassed && test.expectedOutput && actualOutput) {
        // First try local comparison
        const localPassed = compareOutput(actualOutput, test.expectedOutput, strategy);

        if (!localPassed && strategy === 'semantic') {
          // For semantic tests, escalate to BB validation if local comparison fails
          const bbResult = await validateWithBB(test, actualOutput);
          testPassed = bbResult.passed;
          if (!testPassed) hasOutputMismatch = true;
        } else {
          testPassed = localPassed;
          if (!testPassed) hasOutputMismatch = true;
        }
      }

      if (testPassed) {
        setTestCases(prev => prev.map(t =>
          t.id === testId
            ? {
                ...t,
                status: 'passed' as const,
                actualOutput,
                error: undefined,
                failureCategory: undefined,
                durationMs: execution.durationMs ?? undefined,
              }
            : t
        ));
      } else {
        const errorMsg = execution.error || (!testPassed && test.expectedOutput
          ? `Output did not match expected (strategy: ${strategy})`
          : undefined);
        const failCat = categorizeTestFailure(
          errorMsg,
          execution.status === 'completed',
          hasOutputMismatch,
        );

        setTestCases(prev => prev.map(t =>
          t.id === testId
            ? {
                ...t,
                status: 'failed' as const,
                actualOutput,
                error: errorMsg,
                failureCategory: failCat,
                durationMs: execution.durationMs ?? undefined,
              }
            : t
        ));

        // Only inject diagnostic messages when NOT running all tests (to avoid spam)
        if (!isRunningAll) {
          const { diagnostic, options } = getFailureDiagnostic(failCat, errorMsg, test.name);

          // Build test-specific options
          const testOptions = [...options];
          if (failCat === 'output_mismatch' && actualOutput) {
            testOptions.push(
              { id: `accept-actual-${testId}`, label: 'Accept Actual', description: 'Use the actual output as the new expected value', icon: '✅' },
              { id: `edit-test-${testId}`, label: 'Edit Test', description: 'Modify the test input or expected output', icon: '✏️' },
            );
          }
          if (failCat !== 'connection_missing') {
            testOptions.push(
              { id: `retry-test-${testId}`, label: 'Retry', description: 'Run this test again', icon: '🔄' },
            );
          }

          onInjectMessage({
            id: `msg-${Date.now()}-testfail-${testId}`,
            role: 'assistant',
            content: `Test "${test.name}" failed: ${errorMsg ?? 'Unknown error'}`,
            timestamp: new Date(),
            metadata: {
              diagnostic,
              options: testOptions.length > 0 ? testOptions : undefined,
            },
          });
        }
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const failCat = categorizeTestFailure(errorMsg, false, false);

      setTestCases(prev => prev.map(t =>
        t.id === testId
          ? { ...t, status: 'failed' as const, error: errorMsg, failureCategory: failCat }
          : t
      ));

      if (!isRunningAll) {
        const { diagnostic, options } = getFailureDiagnostic(failCat, errorMsg, test.name);

        const testOptions = [...options];
        if (failCat !== 'connection_missing') {
          testOptions.push(
            { id: `retry-test-${testId}`, label: 'Retry', description: 'Run this test again', icon: '🔄' },
          );
        }

        onInjectMessage({
          id: `msg-${Date.now()}-testfail-${testId}`,
          role: 'assistant',
          content: `Test "${test.name}" failed: ${errorMsg}`,
          timestamp: new Date(),
          metadata: {
            diagnostic,
            options: testOptions.length > 0 ? testOptions : undefined,
          },
        });
      }
    }
  };

  // ─── Run All Tests ──────────────────────────────────────────────────────

  const handleRunAllTests = async () => {
    // Pre-flight validation once for all tests
    const preflight = runPreflightChecks(savedBaleybotId, entities, workspaceConnections);
    if (!preflight.ok) {
      const failCat = preflight.category ?? 'precondition_failed';
      const { diagnostic, options } = getFailureDiagnostic(failCat, preflight.error, 'all tests');

      setTestCases(prev => prev.map(t => ({
        ...t,
        status: 'failed' as const,
        error: preflight.error,
        failureCategory: failCat,
      })));

      onInjectMessage({
        id: `msg-${Date.now()}-preflight-all`,
        role: 'assistant',
        content: preflight.error ?? 'Pre-flight check failed for all tests.',
        timestamp: new Date(),
        metadata: {
          diagnostic,
          options: options.length > 0 ? options : undefined,
        },
      });
      return;
    }

    setIsRunningAll(true);
    setLastRunSummary(null);
    const total = testCases.length;

    try {
      // Run tests sequentially to avoid rate limits and provide clear progress
      for (let i = 0; i < testCases.length; i++) {
        const test = testCases[i]!;
        setRunAllProgress({
          current: i + 1,
          total,
          currentTestName: test.name,
          phase: 'running',
        });

        await handleRunTest(test.id);
      }

      // After all tests, get the final state and analyze
      // We need to read testCases from a ref-like approach since setState is async
      // Use a small delay to ensure state is settled
      await new Promise(resolve => setTimeout(resolve, 100));

      setRunAllProgress(prev => prev ? { ...prev, phase: 'analyzing', currentTestName: 'Analyzing results...' } : null);
    } finally {
      // Analyze will set its own progress state
    }

    // Get latest test cases for analysis (need fresh snapshot)
    setTestCases(prev => {
      // Trigger analysis with the latest state
      analyzeResults(prev);
      return prev;
    });

    setRunAllProgress(prev => prev ? { ...prev, phase: 'complete' } : null);
    // Clear progress after a moment
    setTimeout(() => {
      setRunAllProgress(null);
      setIsRunningAll(false);
    }, 1500);
  };

  // ─── Add / Update / Delete / Accept ─────────────────────────────────────

  const handleAddTest = (test: Omit<TestCase, 'id' | 'status'>) => {
    setTestCases(prev => [...prev, { ...test, id: `test-${Date.now()}`, status: 'pending' }]);
  };

  const handleUpdateTest = (testId: string, updates: Partial<TestCase>) => {
    setTestCases(prev => prev.map(t =>
      t.id === testId ? { ...t, ...updates } : t
    ));
  };

  const handleDeleteTest = (testId: string) => {
    setTestCases(prev => prev.filter(t => t.id !== testId));
  };

  const handleAcceptActual = (testId: string) => {
    setTestCases(prev => prev.map(t => {
      if (t.id !== testId || !t.actualOutput) return t;
      return {
        ...t,
        expectedOutput: t.actualOutput,
        status: 'passed' as const,
        error: undefined,
        failureCategory: undefined,
      };
    }));
  };

  return {
    testCases,
    setTestCases,
    isGeneratingTests,
    isRunningAll,
    runAllProgress,
    lastRunSummary,
    handleGenerateTests,
    handleRunTest,
    handleRunAllTests,
    handleAddTest,
    handleUpdateTest,
    handleDeleteTest,
    handleAcceptActual,
  };
}
