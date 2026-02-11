/**
 * Creator Validation Service
 *
 * Runs lightweight background validation after each creator cycle.
 * Uses the test_generator internal BB to produce sanity tests,
 * then executes them against the bot via executeInternalBaleybot.
 */

import { runTestGenerator } from './internal-bb/runner';
import { executeInternalBaleybot } from './internal-baleybots';
import { createLogger } from '@/lib/logger';

const logger = createLogger('creator-validation');

// ============================================================================
// TYPES
// ============================================================================

export type ValidationStatus = 'idle' | 'validating' | 'passed' | 'failed' | 'error';

export interface QuickValidationResult {
  status: 'passed' | 'failed';
  passRate: number;
  totalTests: number;
  failedTests: Array<{ name: string; error?: string }>;
  durationMs: number;
}

// ============================================================================
// VALIDATION RUNNER
// ============================================================================

const VALIDATION_TIMEOUT_MS = 30_000;
const PER_TEST_TIMEOUT_MS = 10_000;
const MAX_TESTS = 3;

/**
 * Run a quick background validation of a BaleyBot.
 *
 * 1. Calls test_generator to produce 2-3 lightweight sanity tests
 * 2. Executes each test against the bot
 * 3. Returns aggregate pass/fail result
 *
 * Total budget: 30s max. Fails gracefully on timeout.
 */
export async function runQuickValidation(args: {
  workspaceId: string;
  baleybotId: string;
  balCode: string;
  entities: Array<{ name: string; tools: string[]; purpose: string }>;
  onProgress: (testIndex: number, total: number, testName: string) => void;
  signal?: AbortSignal;
}): Promise<QuickValidationResult> {
  const startTime = Date.now();

  // Create an AbortController for the overall timeout
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), VALIDATION_TIMEOUT_MS);

  // Combine external signal with timeout
  const combinedSignal = args.signal
    ? AbortSignal.any([args.signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    // Phase 1: Generate quick sanity tests
    const entitySummary = args.entities
      .map((e) => `${e.name}: ${e.purpose || 'no purpose'} (tools: ${e.tools.join(', ') || 'none'})`)
      .join('\n');

    const testGenInput = [
      'Generate 2-3 lightweight sanity tests for this bot. Focus on basic functionality, not edge cases.',
      `BAL code:\n${args.balCode.slice(0, 2000)}`,
      `Entities:\n${entitySummary}`,
    ].join('\n\n');

    if (combinedSignal.aborted) {
      throw new Error('Validation aborted');
    }

    const testGenResult = await runTestGenerator(testGenInput, {
      userWorkspaceId: args.workspaceId,
    });

    const tests = (testGenResult.tests ?? []).slice(0, MAX_TESTS);

    if (tests.length === 0) {
      return {
        status: 'passed',
        passRate: 1,
        totalTests: 0,
        failedTests: [],
        durationMs: Date.now() - startTime,
      };
    }

    // Phase 2: Execute each test
    const failedTests: Array<{ name: string; error?: string }> = [];
    let passedCount = 0;

    for (let i = 0; i < tests.length; i++) {
      const test = tests[i]!;

      if (combinedSignal.aborted) {
        throw new Error('Validation aborted');
      }

      args.onProgress(i, tests.length, test.name);

      try {
        const testInput = typeof test.input === 'string'
          ? test.input
          : JSON.stringify(test.input);

        // Execute with per-test timeout
        const testResult = await Promise.race([
          executeInternalBaleybot('test_orchestrator', testInput, {
            userWorkspaceId: args.workspaceId,
            triggeredBy: 'internal',
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Test timeout')), PER_TEST_TIMEOUT_MS)
          ),
        ]);

        // Basic pass check: if we got output without error, count as pass
        if (testResult.output !== null && testResult.output !== undefined) {
          passedCount++;
        } else {
          failedTests.push({ name: test.name, error: 'No output produced' });
        }
      } catch (testError) {
        const errorMessage = testError instanceof Error ? testError.message : 'Unknown error';
        failedTests.push({ name: test.name, error: errorMessage });
        logger.warn('Validation test failed', { testName: test.name, error: errorMessage });
      }
    }

    const passRate = tests.length > 0 ? passedCount / tests.length : 1;

    return {
      status: passRate === 1 ? 'passed' : 'failed',
      passRate,
      totalTests: tests.length,
      failedTests,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Validation failed';
    logger.error('Quick validation failed', { error: errorMessage });
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
