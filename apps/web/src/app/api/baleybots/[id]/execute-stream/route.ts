/**
 * BaleyBot Execute Stream API Route
 *
 * POST /api/baleybots/[id]/execute-stream
 *
 * Server-Sent Events stream for real-time BaleyBot execution.
 * Uses the SDK's streamBALExecution to execute BAL code and stream events.
 *
 * Authentication: Supports both Clerk session auth and API key auth.
 * - Session auth: Automatically from cookies
 * - API key auth: Authorization: Bearer bui_live_xxx or bui_test_xxx
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';
import {
  db,
  baleybots,
  baleybotExecutions,
  workspacePolicies,
  workspaces,
  eq,
  and,
  notDeleted,
  sql,
} from '@baleyui/db';
import {
  streamBALExecution,
  type BALExecutionEvent,
  type BALExecutionResult,
} from '@baleyui/sdk';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';
import {
  getBuiltInRuntimeTools,
  configureWebSearch,
} from '@/lib/baleybot/tools/built-in/implementations';
import { initializeBuiltInToolServices } from '@/lib/baleybot/services';
import { getPreferredModel } from '@/lib/baleybot/executor';
import type { BuiltInToolContext } from '@/lib/baleybot/tools/built-in';
import { validateApiKey } from '@/lib/api/validate-api-key';
import { processBBCompletion } from '@/lib/baleybot/services/bb-completion-trigger-service';

const log = createLogger('baleybot-stream');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Authenticate request via session or API key
 * Returns workspace info on success
 */
async function authenticateRequest(req: NextRequest): Promise<{
  workspaceId: string;
  userId: string | null;
  authMethod: 'session' | 'api_key';
} | null> {
  // Try session auth first
  const { userId } = await auth();
  if (userId) {
    const workspace = await db.query.workspaces.findFirst({
      where: (ws, { eq, and, isNull }) =>
        and(eq(ws.ownerId, userId), isNull(ws.deletedAt)),
    });
    if (workspace) {
      return { workspaceId: workspace.id, userId, authMethod: 'session' };
    }
  }

  // Try API key auth
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    try {
      const validation = await validateApiKey(authHeader);
      return {
        workspaceId: validation.workspaceId,
        userId: null,
        authMethod: 'api_key',
      };
    } catch {
      // Invalid API key, fall through to unauthorized
    }
  }

  return null;
}

/**
 * POST handler - executes a BaleyBot and streams events via SSE
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate the request (session or API key)
    const authResult = await authenticateRequest(req);
    if (!authResult) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { workspaceId, userId, authMethod } = authResult;
    const { id: baleybotId } = await params;

    // Rate limit: 10 executions per minute per workspace
    const rateLimitKey = userId
      ? `execute:${workspaceId}:${userId}`
      : `execute:${workspaceId}:api`;
    try {
      checkRateLimit(rateLimitKey, RATE_LIMITS.execute);
    } catch {
      return new Response('Rate limit exceeded', { status: 429 });
    }

    // Get the BaleyBot
    const baleybot = await db.query.baleybots.findFirst({
      where: and(
        eq(baleybots.id, baleybotId),
        eq(baleybots.workspaceId, workspaceId),
        notDeleted(baleybots)
      ),
    });

    if (!baleybot) {
      return new Response('BaleyBot not found', { status: 404 });
    }

    // Check if BaleyBot is in error state
    if (baleybot.status === 'error') {
      return new Response('Cannot execute BaleyBot in error state', {
        status: 400,
      });
    }

    // Parse request body for input
    let input: unknown;
    let triggeredBy: 'manual' | 'schedule' | 'webhook' | 'other_bb' = 'manual';
    let triggerSource: string | undefined;

    try {
      const body = await req.json();
      input = body.input;
      triggeredBy = body.triggeredBy || 'manual';
      triggerSource = body.triggerSource;
    } catch {
      // Empty body is OK, input is optional
    }

    log.info('Starting streaming execution', {
      baleybotId,
      triggeredBy,
      workspaceId,
      authMethod,
    });

    // Create execution record
    const [execution] = await db
      .insert(baleybotExecutions)
      .values({
        baleybotId,
        status: 'pending',
        input,
        triggeredBy,
        triggerSource,
        createdAt: new Date(),
      })
      .returning();

    if (!execution) {
      return new Response('Failed to create execution record', { status: 500 });
    }

    // Update execution count atomically
    await db
      .update(baleybots)
      .set({
        executionCount: sql`${baleybots.executionCount} + 1`,
        lastExecutedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(baleybots.id, baleybotId));

    // Create SSE stream
    const encoder = new TextEncoder();
    const segments: BALExecutionEvent[] = [];
    const startTime = Date.now();

    const stream = new ReadableStream({
      async start(controller) {
        // Helper to send SSE event
        const sendEvent = (event: BALExecutionEvent) => {
          segments.push(event);
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        };

        // Send execution started event with execution ID
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'execution_started', executionId: execution.id })}\n\n`
          )
        );

        try {
          // Update status to running
          await db
            .update(baleybotExecutions)
            .set({ status: 'running', startedAt: new Date() })
            .where(eq(baleybotExecutions.id, execution.id));

          // Get the model from the BAL code first to select the correct API key
          const model = getPreferredModel(baleybot.balCode);

          // Get API key based on model provider
          let apiKey: string | undefined;
          if (model.startsWith('anthropic:')) {
            apiKey = process.env.ANTHROPIC_API_KEY;
          } else if (model.startsWith('openai:') || model.startsWith('gpt-')) {
            apiKey = process.env.OPENAI_API_KEY;
          } else {
            // Default to OpenAI for backwards compatibility
            apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
          }

          // Configure web search if Tavily key is available
          if (process.env.TAVILY_API_KEY) {
            configureWebSearch(process.env.TAVILY_API_KEY);
          }

          // Initialize built-in tool services (spawn, notify, schedule, memory)
          initializeBuiltInToolServices();

          // Build tool context for this execution
          const toolCtx: BuiltInToolContext = {
            workspaceId,
            baleybotId,
            executionId: execution.id,
            userId: userId ?? 'api_key_user',
          };

          // Get built-in runtime tools with implementations
          const runtimeTools = getBuiltInRuntimeTools(toolCtx);

          // Convert to format expected by SDK
          const availableTools: Record<string, {
            name: string;
            description: string;
            inputSchema: Record<string, unknown>;
            function: (args: Record<string, unknown>) => Promise<unknown>;
          }> = {};

          for (const [name, tool] of runtimeTools.entries()) {
            availableTools[name] = {
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
              function: tool.function,
            };
          }

          log.info('Loaded tools for execution', {
            executionId: execution.id,
            tools: Object.keys(availableTools),
            model,
          });

          // Stream execution with tools
          const generator = streamBALExecution(baleybot.balCode, {
            model,
            apiKey,
            timeout: 60000,
            signal: req.signal,
            input: typeof input === 'string' ? input : input ? JSON.stringify(input) : undefined,
            availableTools,
          });

          // Iterate through the generator, collecting events
          let iterResult = await generator.next();
          let finalResult: BALExecutionResult | undefined;

          while (!iterResult.done) {
            sendEvent(iterResult.value);

            // Check if client disconnected
            if (req.signal.aborted) {
              log.info('Client disconnected, cancelling execution', {
                executionId: execution.id,
              });
              break;
            }

            iterResult = await generator.next();
          }

          // When done: true, the value is the BALExecutionResult
          if (iterResult.done) {
            finalResult = iterResult.value;
          }

          const duration = Date.now() - startTime;

          // Determine final status
          let finalStatus: 'completed' | 'failed' | 'cancelled' = 'completed';
          let error: string | undefined;
          let output: unknown;

          if (req.signal.aborted) {
            finalStatus = 'cancelled';
          } else if (finalResult) {
            if (
              finalResult.status === 'error' ||
              finalResult.status === 'timeout'
            ) {
              finalStatus = 'failed';
              error = finalResult.error;
            } else if (finalResult.status === 'cancelled') {
              finalStatus = 'cancelled';
            } else {
              output = finalResult.result;
            }
          }

          // Update execution record with final state
          await db
            .update(baleybotExecutions)
            .set({
              status: finalStatus,
              output,
              error,
              segments,
              completedAt: new Date(),
              durationMs: duration,
            })
            .where(eq(baleybotExecutions.id, execution.id));

          log.info('Streaming execution completed', {
            executionId: execution.id,
            status: finalStatus,
            durationMs: duration,
          });

          // Process downstream BB triggers (async, don't block stream completion)
          if (finalStatus === 'completed' || finalStatus === 'failed') {
            processBBCompletion({
              sourceBaleybotId: baleybotId,
              executionId: execution.id,
              status: finalStatus === 'completed' ? 'completed' : 'failed',
              output,
            }).catch((triggerErr) => {
              log.error('Failed to process BB completion triggers', {
                executionId: execution.id,
                error: triggerErr instanceof Error ? triggerErr.message : String(triggerErr),
              });
            });
          }

          // Send done event
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          const duration = Date.now() - startTime;
          const errorMessage = err instanceof Error ? err.message : String(err);

          log.error('Streaming execution failed', {
            error: err instanceof Error ? err.message : String(err),
            executionId: execution.id,
            durationMs: duration,
          });

          // Update execution record with error
          await db
            .update(baleybotExecutions)
            .set({
              status: 'failed',
              error: errorMessage,
              segments,
              completedAt: new Date(),
              durationMs: duration,
            })
            .where(eq(baleybotExecutions.id, execution.id));

          // Process downstream BB triggers for failure (async, don't block)
          processBBCompletion({
            sourceBaleybotId: baleybotId,
            executionId: execution.id,
            status: 'failed',
            output: undefined,
          }).catch((triggerErr) => {
            log.error('Failed to process BB completion triggers', {
              executionId: execution.id,
              error: triggerErr instanceof Error ? triggerErr.message : String(triggerErr),
            });
          });

          // Send error event
          sendEvent({ type: 'error', error: errorMessage });
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
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
  } catch (err) {
    log.error(
      'Error in execute-stream endpoint',
      err instanceof Error ? err : undefined
    );
    return new Response('Internal server error', { status: 500 });
  }
}

/**
 * GET handler - streams events from an existing execution (replay)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate the request (session or API key)
    const authResult = await authenticateRequest(req);
    if (!authResult) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { workspaceId } = authResult;
    const { id: baleybotId } = await params;
    const executionId = req.nextUrl.searchParams.get('executionId');

    if (!executionId) {
      return new Response('executionId query parameter required', {
        status: 400,
      });
    }

    // Get the BaleyBot
    const baleybot = await db.query.baleybots.findFirst({
      where: and(
        eq(baleybots.id, baleybotId),
        eq(baleybots.workspaceId, workspaceId),
        notDeleted(baleybots)
      ),
    });

    if (!baleybot) {
      return new Response('BaleyBot not found', { status: 404 });
    }

    // Get the execution
    const execution = await db.query.baleybotExecutions.findFirst({
      where: and(
        eq(baleybotExecutions.id, executionId),
        eq(baleybotExecutions.baleybotId, baleybotId)
      ),
    });

    if (!execution) {
      return new Response('Execution not found', { status: 404 });
    }

    // Create replay stream
    const encoder = new TextEncoder();
    const segments = (execution.segments as BALExecutionEvent[] | null) || [];

    const stream = new ReadableStream({
      start(controller) {
        // Send execution info
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'execution_started',
              executionId: execution.id,
              replay: true,
            })}\n\n`
          )
        );

        // Replay all segments
        for (const segment of segments) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(segment)}\n\n`)
          );
        }

        // Send execution result
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'execution_result',
              status: execution.status,
              output: execution.output,
              error: execution.error,
              durationMs: execution.durationMs,
            })}\n\n`
          )
        );

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
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
  } catch (err) {
    log.error(
      'Error in execute-stream GET endpoint',
      err instanceof Error ? err : undefined
    );
    return new Response('Internal server error', { status: 500 });
  }
}
