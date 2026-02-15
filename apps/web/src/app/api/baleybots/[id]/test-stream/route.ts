/**
 * Test Stream API Route
 *
 * POST /api/baleybots/[id]/test-stream
 *
 * SSE endpoint for real-time test execution with AI validation, analysis,
 * and autonomous auto-fix loops. Replaces the batch tRPC mutation.
 */

import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  db,
  baleybots,
  eq,
  and,
  notDeleted,
  updateWithLock,
} from '@baleyui/db';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';
import { apiErrors, createErrorResponse } from '@/lib/api/error-response';
import { getAuthenticatedWorkspace } from '@/lib/auth/workspace-lookup';
import { executeBaleybot, type ExecutorContext } from '@/lib/baleybot/executor';
import { evaluateOutputMatch } from '@/lib/baleybot/testing/output-match';
import {
  runTestValidator,
  runTestResultsAnalyzer,
  runBalGenerator,
} from '@/lib/baleybot/internal-bb/runner';
import { loadExecutionTools } from '@/lib/baleybot/services/execution-tools-loader';
import {
  configureWebSearch,
} from '@/lib/baleybot/tools/built-in/implementations';
import { initializeBuiltInToolServices, getWorkspaceTavilyKey } from '@/lib/baleybot/services';
import type { BuiltInToolContext } from '@/lib/baleybot/tools/built-in';
import type { BaleybotStreamEvent } from '@baleybots/core';
import type { TestStreamEvent } from '@/lib/baleybot/testing/test-stream-types';

const log = createLogger('test-stream-route');

const testStreamBodySchema = z.object({
  testCases: z.array(z.object({
    id: z.string(),
    name: z.string(),
    level: z.enum(['unit', 'integration', 'e2e']),
    input: z.union([z.string(), z.record(z.string(), z.unknown())]),
    expectedOutput: z.string().optional(),
    matchStrategy: z.enum(['exact', 'contains', 'semantic', 'schema', 'structured']).optional(),
    description: z.string().optional(),
  })).min(1).max(50),
  autoFix: z.boolean().default(true),
  maxFixAttempts: z.number().int().min(0).max(3).default(2),
}).strict();

type TestInput = z.infer<typeof testStreamBodySchema>['testCases'][number];

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Strip sensitive data from error messages before forwarding to the client.
 */
function sanitizeStreamError(message: string): string {
  return message
    .replace(/postgres(ql)?:\/\/[^\s]+/gi, '[database-url]')
    .replace(/mysql:\/\/[^\s]+/gi, '[database-url]')
    .replace(/\/(?:Users|home|var|tmp|app|src)\/[^\s:]+/g, '[path]')
    .replace(/(?:sk|pk|key|token|secret|password)[-_]?[a-zA-Z0-9]{20,}/gi, '[redacted]')
    .replace(/ep-[a-z0-9-]+\.[\w.-]+neon\.tech/gi, '[database-host]')
    .trim();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = req.headers.get('x-request-id') ?? undefined;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id ?? null;
    if (!userId) {
      return apiErrors.unauthorized();
    }

    const workspace = await getAuthenticatedWorkspace(userId);
    if (!workspace) {
      return apiErrors.notFound('Workspace');
    }

    const { id: baleybotId } = await params;

    try {
      await checkRateLimit(
        `testStream:${workspace.id}:${userId}`,
        RATE_LIMITS.executeTest
      );
    } catch {
      return createErrorResponse(429, null, { message: 'Rate limit exceeded', requestId });
    }

    let input: z.infer<typeof testStreamBodySchema>;
    try {
      const raw = await req.json();
      input = testStreamBodySchema.parse(raw);
    } catch {
      return apiErrors.badRequest('Invalid request body for test stream');
    }

    // Fetch the BaleyBot
    const baleybot = await db.query.baleybots.findFirst({
      where: and(
        eq(baleybots.id, baleybotId),
        eq(baleybots.workspaceId, workspace.id),
        notDeleted(baleybots)
      ),
    });

    if (!baleybot) {
      return apiErrors.notFound('BaleyBot');
    }

    if (!baleybot.balCode) {
      return apiErrors.badRequest('BaleyBot has no BAL code');
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let lastEmitAt = Date.now();

        const sendEvent = (event: TestStreamEvent) => {
          lastEmitAt = Date.now();
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );
          } catch {
            // Stream already closed
          }
        };

        const heartbeat = setInterval(() => {
          if (Date.now() - lastEmitAt < 4000) return;
          sendEvent({ type: 'test_heartbeat', timestamp: Date.now() });
        }, 2000);

        req.signal.addEventListener(
          'abort',
          () => {
            clearInterval(heartbeat);
            try { controller.close(); } catch { /* already closed */ }
          },
          { once: true }
        );

        try {
          // ================================================================
          // SETUP: Load tools and configure services
          // ================================================================

          const tavilyKey = await getWorkspaceTavilyKey(workspace.id);
          if (tavilyKey) configureWebSearch(tavilyKey);
          initializeBuiltInToolServices();

          const toolCtx: BuiltInToolContext = {
            workspaceId: workspace.id,
            baleybotId,
            executionId: crypto.randomUUID(),
            userId,
          };

          const { runtimeTools } = await loadExecutionTools({
            workspaceId: workspace.id,
            toolCtx,
          });

          // ================================================================
          // EXECUTE TESTS
          // ================================================================

          sendEvent({
            type: 'test_stream_started',
            totalTests: input.testCases.length,
            timestamp: Date.now(),
          });

          let currentBalCode = baleybot.balCode;

          // Run a batch of tests against a given BAL code
          const runTests = async (
            tests: TestInput[],
            balCode: string
          ): Promise<Map<string, { status: 'passed' | 'failed'; actualOutput: string; durationMs: number; error?: string; confidence: number; reasoning: string; suggestions: string[] }>> => {
            const results = new Map<string, { status: 'passed' | 'failed'; actualOutput: string; durationMs: number; error?: string; confidence: number; reasoning: string; suggestions: string[] }>();

            for (let i = 0; i < tests.length; i++) {
              if (req.signal.aborted) break;

              const tc = tests[i]!;

              // Emit executing
              sendEvent({
                type: 'test_executing',
                testId: tc.id,
                testName: tc.name,
                index: i,
                timestamp: Date.now(),
              });

              // Execute the BaleyBot
              const inputStr = typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input);
              let actualOutput = '';
              let durationMs = 0;
              let executionError: string | undefined;

              try {
                const execCtx: ExecutorContext = {
                  workspaceId: workspace.id,
                  baleybotId,
                  baleybotName: baleybot.name,
                  availableTools: runtimeTools,
                  workspacePolicies: null,
                  triggeredBy: 'internal',
                };

                const result = await executeBaleybot(balCode, inputStr, execCtx, {
                  onSegment: (segment: BaleybotStreamEvent) => {
                    const seg = segment as Record<string, unknown>;
                    if (seg.type === 'text_delta' && typeof seg.content === 'string') {
                      sendEvent({
                        type: 'test_output_delta',
                        testId: tc.id,
                        content: seg.content,
                        timestamp: Date.now(),
                      });
                    }
                  },
                  signal: req.signal,
                });

                actualOutput = typeof result.output === 'string'
                  ? result.output
                  : result.output != null
                    ? JSON.stringify(result.output)
                    : '';
                durationMs = result.durationMs;

                if (result.status === 'failed') {
                  executionError = result.error ?? 'Execution failed';
                }
              } catch (err) {
                executionError = err instanceof Error ? err.message : 'Unknown execution error';
              }

              sendEvent({
                type: 'test_execution_complete',
                testId: tc.id,
                actualOutput,
                durationMs,
                executionStatus: executionError ? 'failed' : 'completed',
                error: executionError,
                timestamp: Date.now(),
              });

              // If execution itself failed, mark as failed and skip validation
              if (executionError) {
                results.set(tc.id, {
                  status: 'failed',
                  actualOutput,
                  durationMs,
                  error: executionError,
                  confidence: 0,
                  reasoning: `Execution error: ${executionError}`,
                  suggestions: [],
                });
                continue;
              }

              // ============================================================
              // VALIDATION: deterministic pre-check → AI validation
              // ============================================================

              const strategy = tc.matchStrategy ?? 'semantic';
              let deterministicPassed = false;

              if (tc.expectedOutput) {
                sendEvent({
                  type: 'test_validating',
                  testId: tc.id,
                  validationMethod: 'deterministic',
                  timestamp: Date.now(),
                });

                const deterministicResult = evaluateOutputMatch(
                  actualOutput,
                  tc.expectedOutput,
                  strategy
                );
                deterministicPassed = deterministicResult.passed;

                // If deterministic check passes definitively, skip AI validation
                if (deterministicPassed && strategy !== 'semantic') {
                  sendEvent({
                    type: 'test_validation_complete',
                    testId: tc.id,
                    status: 'passed',
                    confidence: 1.0,
                    reasoning: deterministicResult.reason,
                    suggestions: [],
                    timestamp: Date.now(),
                  });
                  results.set(tc.id, {
                    status: 'passed',
                    actualOutput,
                    durationMs,
                    confidence: 1.0,
                    reasoning: deterministicResult.reason,
                    suggestions: [],
                  });
                  continue;
                }
              }

              // AI validation via test_validator
              sendEvent({
                type: 'test_validating',
                testId: tc.id,
                validationMethod: 'ai',
                timestamp: Date.now(),
              });

              try {
                const validatorInput = [
                  `Test: ${tc.name}`,
                  tc.description ? `Description: ${tc.description}` : null,
                  `Input: ${inputStr}`,
                  tc.expectedOutput ? `Expected: ${tc.expectedOutput}` : null,
                  `Actual Output: ${actualOutput.slice(0, 2000)}`,
                  `Match Strategy: ${strategy}`,
                  deterministicPassed ? `Deterministic pre-check: PASSED` : null,
                ].filter(Boolean).join('\n');

                const validation = await runTestValidator(validatorInput, {
                  userWorkspaceId: workspace.id,
                  fallbackMode: 'value',
                  fallbackValue: {
                    passed: deterministicPassed,
                    confidence: deterministicPassed ? 0.7 : 0.3,
                    reasoning: 'AI validation unavailable, using deterministic result',
                    suggestions: [],
                  },
                });

                const testStatus = validation.passed ? 'passed' : 'failed';

                sendEvent({
                  type: 'test_validation_complete',
                  testId: tc.id,
                  status: testStatus,
                  confidence: validation.confidence,
                  reasoning: validation.reasoning,
                  suggestions: validation.suggestions ?? [],
                  timestamp: Date.now(),
                });

                results.set(tc.id, {
                  status: testStatus,
                  actualOutput,
                  durationMs,
                  confidence: validation.confidence,
                  reasoning: validation.reasoning,
                  suggestions: validation.suggestions ?? [],
                });
              } catch (validationErr) {
                log.warn('Test validation failed', {
                  testId: tc.id,
                  error: validationErr instanceof Error ? validationErr.message : String(validationErr),
                });

                sendEvent({
                  type: 'test_validation_complete',
                  testId: tc.id,
                  status: deterministicPassed ? 'passed' : 'failed',
                  confidence: 0.5,
                  reasoning: 'AI validation failed, using deterministic result',
                  suggestions: [],
                  timestamp: Date.now(),
                });

                results.set(tc.id, {
                  status: deterministicPassed ? 'passed' : 'failed',
                  actualOutput,
                  durationMs,
                  confidence: 0.5,
                  reasoning: 'AI validation failed, using deterministic result',
                  suggestions: [],
                });
              }
            }

            return results;
          };

          // Initial test run
          const allResults = await runTests(input.testCases, currentBalCode);

          if (req.signal.aborted) {
            clearInterval(heartbeat);
            return;
          }

          // ================================================================
          // ANALYSIS
          // ================================================================

          sendEvent({ type: 'analysis_started', timestamp: Date.now() });

          const testSummaryLines = input.testCases.map(tc => {
            const result = allResults.get(tc.id);
            return `- ${tc.name}: ${result?.status ?? 'unknown'} (confidence: ${result?.confidence ?? 0})${result?.reasoning ? ` — ${result.reasoning}` : ''}`;
          });

          let analysis;
          try {
            analysis = await runTestResultsAnalyzer(
              [
                `BaleyBot: ${baleybot.name}`,
                `BAL Code:\n${currentBalCode.slice(0, 3000)}`,
                `\nTest Results:`,
                ...testSummaryLines,
              ].join('\n'),
              {
                userWorkspaceId: workspace.id,
                fallbackMode: 'value',
                fallbackValue: {
                  overallStatus: 'mixed' as const,
                  summary: 'Analysis could not be completed',
                  passRate: Array.from(allResults.values()).filter(r => r.status === 'passed').length / input.testCases.length,
                },
              }
            );
          } catch {
            const passedCount = Array.from(allResults.values()).filter(r => r.status === 'passed').length;
            const passRate = passedCount / input.testCases.length;
            analysis = {
              overallStatus: (passRate === 1 ? 'passed' : passRate === 0 ? 'failed' : 'mixed') as 'passed' | 'failed' | 'mixed',
              summary: `${passedCount}/${input.testCases.length} tests passed`,
              passRate,
            };
          }

          sendEvent({
            type: 'analysis_complete',
            analysis: {
              overallStatus: analysis.overallStatus,
              summary: analysis.summary,
              passRate: analysis.passRate,
              patterns: analysis.patterns,
              botImprovements: analysis.botImprovements,
              nextSteps: analysis.nextSteps,
            },
            timestamp: Date.now(),
          });

          // ================================================================
          // AUTO-FIX LOOP (autonomous — no user approval)
          // ================================================================

          if (
            input.autoFix &&
            input.maxFixAttempts > 0 &&
            analysis.overallStatus !== 'passed' &&
            !req.signal.aborted
          ) {
            const failedTests = input.testCases.filter(tc => allResults.get(tc.id)?.status === 'failed');

            for (let attempt = 1; attempt <= input.maxFixAttempts; attempt++) {
              if (req.signal.aborted || failedTests.length === 0) break;

              const failurePatterns = (analysis.patterns ?? []).map(p => `${p.type}: ${p.description}`);
              if (failurePatterns.length === 0) {
                failurePatterns.push(
                  ...failedTests.map(tc => {
                    const r = allResults.get(tc.id);
                    return `${tc.name}: ${r?.reasoning ?? r?.error ?? 'failed'}`;
                  })
                );
              }

              sendEvent({
                type: 'fix_started',
                fixAttempt: attempt,
                maxAttempts: input.maxFixAttempts,
                failurePatterns,
                timestamp: Date.now(),
              });

              // Generate fix via bal_generator
              sendEvent({
                type: 'fix_generating',
                fixAttempt: attempt,
                timestamp: Date.now(),
              });

              try {
                const fixInput = [
                  `Fix the following BAL code to pass its failing tests.`,
                  `\nCurrent BAL code:\n${currentBalCode}`,
                  `\nFailure analysis:`,
                  ...failurePatterns.map(p => `- ${p}`),
                  `\nFailing test details:`,
                  ...failedTests.map(tc => {
                    const r = allResults.get(tc.id);
                    return `- Test "${tc.name}": input="${typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input)}" expected="${tc.expectedOutput ?? '(semantic)'}" actual="${r?.actualOutput?.slice(0, 500) ?? ''}" reason="${r?.reasoning ?? ''}"`;
                  }),
                  ...(analysis.patterns ?? []).filter(p => p.suggestedFix).map(p => `Suggested fix: ${p.suggestedFix}`),
                ].join('\n');

                const fixResult = await runBalGenerator(fixInput, {
                  userWorkspaceId: workspace.id,
                });

                if (!fixResult.balCode || fixResult.balCode.trim() === currentBalCode.trim()) {
                  sendEvent({
                    type: 'fix_cycle_complete',
                    fixAttempt: attempt,
                    improvedCount: 0,
                    remainingFailures: failedTests.length,
                    timestamp: Date.now(),
                  });
                  break;
                }

                currentBalCode = fixResult.balCode;

                sendEvent({
                  type: 'fix_applied',
                  fixAttempt: attempt,
                  newBalCode: fixResult.balCode,
                  summary: fixResult.explanation || 'Auto-fix applied',
                  timestamp: Date.now(),
                });

                // Re-run only previously-failed tests
                sendEvent({
                  type: 'fix_rerun_started',
                  fixAttempt: attempt,
                  failedTestIds: failedTests.map(tc => tc.id),
                  timestamp: Date.now(),
                });

                const rerunResults = await runTests(failedTests, currentBalCode);

                // Update the main results map
                for (const [testId, result] of rerunResults) {
                  allResults.set(testId, result);
                }

                const improvedCount = failedTests.filter(tc => rerunResults.get(tc.id)?.status === 'passed').length;
                const stillFailing = failedTests.filter(tc => rerunResults.get(tc.id)?.status !== 'passed');

                sendEvent({
                  type: 'fix_cycle_complete',
                  fixAttempt: attempt,
                  improvedCount,
                  remainingFailures: stillFailing.length,
                  timestamp: Date.now(),
                });

                // Update the failed tests list for next iteration
                failedTests.length = 0;
                failedTests.push(...stillFailing);

                // Re-analyze if there are still failures
                if (stillFailing.length > 0 && attempt < input.maxFixAttempts) {
                  const reanalysisLines = input.testCases.map(tc => {
                    const result = allResults.get(tc.id);
                    return `- ${tc.name}: ${result?.status ?? 'unknown'}`;
                  });
                  try {
                    analysis = await runTestResultsAnalyzer(
                      [
                        `BaleyBot: ${baleybot.name} (after fix attempt ${attempt})`,
                        `Updated BAL Code:\n${currentBalCode.slice(0, 3000)}`,
                        `\nTest Results:`,
                        ...reanalysisLines,
                      ].join('\n'),
                      { userWorkspaceId: workspace.id }
                    );
                  } catch {
                    // Keep previous analysis
                  }
                }

                if (stillFailing.length === 0) break;
              } catch (fixErr) {
                log.warn('Auto-fix generation failed', {
                  attempt,
                  error: fixErr instanceof Error ? fixErr.message : String(fixErr),
                });
                sendEvent({
                  type: 'fix_cycle_complete',
                  fixAttempt: attempt,
                  improvedCount: 0,
                  remainingFailures: failedTests.length,
                  timestamp: Date.now(),
                });
                break;
              }
            }
          }

          // ================================================================
          // PERSIST RESULTS
          // ================================================================

          if (!req.signal.aborted) {
            try {
              const updatedTestCases = input.testCases.map(tc => {
                const result = allResults.get(tc.id);
                return {
                  ...tc,
                  status: result?.status ?? 'failed',
                  actualOutput: result?.actualOutput,
                  durationMs: result?.durationMs,
                  error: result?.error,
                  validationConfidence: result?.confidence,
                  validationReasoning: result?.reasoning,
                  validationSuggestions: result?.suggestions,
                };
              });

              // If BAL code was changed by auto-fix, persist the best version
              const balCodeChanged = currentBalCode !== baleybot.balCode;

              await updateWithLock(baleybots, baleybotId, baleybot.version, {
                testCasesJson: updatedTestCases,
                ...(balCodeChanged ? { balCode: currentBalCode } : {}),
              });
            } catch (persistErr) {
              log.warn('Failed to persist test results', {
                baleybotId,
                error: persistErr instanceof Error ? persistErr.message : String(persistErr),
              });
            }
          }

          // ================================================================
          // DONE
          // ================================================================

          sendEvent({ type: 'test_stream_done', timestamp: Date.now() });
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          clearInterval(heartbeat);
          controller.close();
        } catch (error) {
          const rawMessage = error instanceof Error ? error.message : 'Test stream failed';
          log.error('test stream processing failed', {
            baleybotId,
            workspaceId: workspace.id,
            error: rawMessage,
          });

          sendEvent({
            type: 'test_stream_error',
            message: sanitizeStreamError(rawMessage),
            timestamp: Date.now(),
          });
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          clearInterval(heartbeat);
          controller.close();
        }
      },
      cancel() {
        // no-op
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    log.error('test stream route failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return apiErrors.internal(error, { requestId });
  }
}
