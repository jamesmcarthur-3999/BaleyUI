/**
 * BaleyBot Execute Stream API Route
 *
 * POST /api/baleybots/[id]/execute-stream
 *
 * Server-Sent Events stream for real-time BaleyBot execution.
 * Uses the SDK's streamBALExecution to execute BAL code and stream events.
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';
import {
  db,
  baleybots,
  baleybotExecutions,
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

const log = createLogger('baleybot-stream');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST handler - executes a BaleyBot and streams events via SSE
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate the request
    const { userId } = await auth();
    if (!userId) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { id: baleybotId } = await params;

    // Get the user's workspace
    const workspace = await db.query.workspaces.findFirst({
      where: (ws, { eq, and, isNull }) =>
        and(eq(ws.ownerId, userId), isNull(ws.deletedAt)),
    });

    if (!workspace) {
      return new Response('No workspace found', { status: 404 });
    }

    // Rate limit: 10 executions per minute per user per workspace
    try {
      checkRateLimit(`execute:${workspace.id}:${userId}`, RATE_LIMITS.execute);
    } catch {
      return new Response('Rate limit exceeded', { status: 429 });
    }

    // Get the BaleyBot
    const baleybot = await db.query.baleybots.findFirst({
      where: and(
        eq(baleybots.id, baleybotId),
        eq(baleybots.workspaceId, workspace.id),
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
      workspaceId: workspace.id,
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

          // Get API key from environment
          const apiKey =
            process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;

          // Stream execution
          const generator = streamBALExecution(baleybot.balCode, {
            model: 'gpt-4o-mini',
            apiKey,
            timeout: 60000,
            signal: req.signal,
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
    // Authenticate the request
    const { userId } = await auth();
    if (!userId) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { id: baleybotId } = await params;
    const executionId = req.nextUrl.searchParams.get('executionId');

    if (!executionId) {
      return new Response('executionId query parameter required', {
        status: 400,
      });
    }

    // Get the user's workspace
    const workspace = await db.query.workspaces.findFirst({
      where: (ws, { eq, and, isNull }) =>
        and(eq(ws.ownerId, userId), isNull(ws.deletedAt)),
    });

    if (!workspace) {
      return new Response('No workspace found', { status: 404 });
    }

    // Get the BaleyBot
    const baleybot = await db.query.baleybots.findFirst({
      where: and(
        eq(baleybots.id, baleybotId),
        eq(baleybots.workspaceId, workspace.id),
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
