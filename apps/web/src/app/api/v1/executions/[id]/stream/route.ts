/**
 * REST API v1: Execution Stream (SSE)
 *
 * GET /api/v1/executions/[id]/stream - Server-Sent Events stream for execution updates
 *
 * Provides real-time streaming of execution events using SSE.
 * Supports both flow executions and block executions.
 * Reconnection supported via fromIndex query parameter.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  flowExecutions,
  blockExecutions,
  executionEvents,
  eq,
  and,
  gte,
  gt,
  asc,
  inArray,
} from '@baleyui/db';
import { validateApiKey, hasPermission } from '@/lib/api/validate-api-key';
import { createLogger } from '@/lib/logger';

const log = createLogger('v1-execution-stream');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Validate API key
    const authHeader = request.headers.get('authorization');
    const validation = await validateApiKey(authHeader);

    // Check read permission
    if (!hasPermission(validation, 'read')) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Required: read or admin' },
        { status: 403 }
      );
    }

    // Get execution ID from params
    const { id: executionId } = await params;

    // Try to find as flow execution first
    const flowExec = await db.query.flowExecutions.findFirst({
      where: eq(flowExecutions.id, executionId),
      with: {
        flow: true,
      },
    });

    // Check workspace access for flow execution
    if (flowExec) {
      if (flowExec.flow.workspaceId !== validation.workspaceId) {
        return NextResponse.json(
          { error: 'Execution not found' },
          { status: 404 }
        );
      }
      return createFlowExecutionStream(request, executionId, flowExec.status);
    }

    // Try to find as block execution
    const blockExec = await db.query.blockExecutions.findFirst({
      where: eq(blockExecutions.id, executionId),
      with: {
        block: true,
      },
    });

    if (!blockExec || !blockExec.block) {
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      );
    }

    // Verify workspace access
    if (blockExec.block.workspaceId !== validation.workspaceId) {
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      );
    }

    return createBlockExecutionStream(request, executionId, blockExec.status);
  } catch (error) {
    log.error('Error in stream endpoint', { error });

    if (error instanceof Error && error.message.includes('API key')) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const isDev = process.env.NODE_ENV === 'development';
    return NextResponse.json(
      {
        error: 'Failed to stream execution',
        ...(isDev ? { details: error instanceof Error ? error.message : 'Unknown error' } : {}),
      },
      { status: 500 }
    );
  }
}

/**
 * Create SSE stream for flow execution
 */
function createFlowExecutionStream(
  req: NextRequest,
  executionId: string,
  initialStatus: string
) {
  const fromIndex = parseInt(req.nextUrl.searchParams.get('fromIndex') || '0');
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Get all block executions for this flow execution
        const blockExecs = await db.query.blockExecutions.findMany({
          where: eq(blockExecutions.flowExecutionId, executionId),
        });

        const blockExecIds = blockExecs.map((b) => b.id);

        // Get all events for all block executions in a single query
        const allDbEvents =
          blockExecIds.length > 0
            ? await db.query.executionEvents.findMany({
                where: inArray(executionEvents.executionId, blockExecIds),
                orderBy: [
                  asc(executionEvents.createdAt),
                  asc(executionEvents.index),
                ],
              })
            : [];

        // Map events with their block execution ID
        const allEvents = allDbEvents.map((event) => ({
          index: event.index,
          type: event.eventType,
          data: event.eventData,
          timestamp: event.createdAt,
          nodeId: event.executionId,
        }));

        // Sort by timestamp
        allEvents.sort(
          (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
        );

        // Track last event index per block execution to avoid re-sending
        const lastEventIndexByBlock = new Map<string, number>();

        // Send events starting from fromIndex
        let globalIndex = 0;
        for (const event of allEvents) {
          if (globalIndex >= fromIndex) {
            const eventData = {
              index: globalIndex,
              type: event.type,
              data: event.data,
              nodeId: event.nodeId,
              timestamp: event.timestamp.toISOString(),
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`)
            );
          }
          globalIndex++;
        }

        let lastIndex = globalIndex;

        // Seed last indexes for each block execution
        for (const blockExec of blockExecs) {
          const eventsForBlock = allEvents.filter(
            (event) => event.nodeId === blockExec.id
          );
          if (eventsForBlock.length > 0) {
            const lastEvent = eventsForBlock[eventsForBlock.length - 1];
            if (lastEvent) {
              lastEventIndexByBlock.set(blockExec.id, lastEvent.index);
            }
          }
        }

        // If already complete, close stream
        if (['completed', 'failed', 'cancelled'].includes(initialStatus)) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
          return;
        }

        // Poll for new events with exponential backoff
        let pollIntervalMs = 200;
        const maxPollIntervalMs = 2000;
        let polling = false;

        const pollInterval = setInterval(async () => {
          if (polling) return;
          polling = true;
          try {
            // Check execution status
            const currentExecution = await db.query.flowExecutions.findFirst({
              where: eq(flowExecutions.id, executionId),
            });

            if (!currentExecution) {
              clearInterval(pollInterval);
              controller.close();
              return;
            }

            // Get any new block executions
            const updatedBlockExecs = await db.query.blockExecutions.findMany({
              where: eq(blockExecutions.flowExecutionId, executionId),
            });

            const updatedBlockExecIds = updatedBlockExecs.map((b) => b.id);

            // Get all new events in a single query
            const newEvents =
              updatedBlockExecIds.length > 0
                ? await db.query.executionEvents.findMany({
                    where: inArray(
                      executionEvents.executionId,
                      updatedBlockExecIds
                    ),
                    orderBy: [
                      asc(executionEvents.createdAt),
                      asc(executionEvents.index),
                    ],
                  })
                : [];

            // Filter to only events we haven't sent
            const filteredEvents = newEvents.filter((event) => {
              const lastIdx =
                lastEventIndexByBlock.get(event.executionId) ?? -1;
              return event.index > lastIdx;
            });

            // Send filtered events
            for (const event of filteredEvents) {
              const eventData = {
                index: lastIndex++,
                type: event.eventType,
                data: event.eventData,
                nodeId: event.executionId,
                timestamp: event.createdAt.toISOString(),
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`)
              );
              lastEventIndexByBlock.set(event.executionId, event.index);
            }

            // Exponential backoff when no events
            if (filteredEvents.length === 0) {
              pollIntervalMs = Math.min(pollIntervalMs * 1.5, maxPollIntervalMs);
            } else {
              pollIntervalMs = 200; // Reset to fast polling when events arrive
            }

            // Check if execution is complete
            if (
              ['completed', 'failed', 'cancelled'].includes(
                currentExecution.status
              )
            ) {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              clearInterval(pollInterval);
              controller.close();
            }
          } catch (error) {
            log.error('Error polling for events', { executionId, error });
            clearInterval(pollInterval);
            controller.error(error);
          } finally {
            polling = false;
          }
        }, pollIntervalMs);

        // Clean up on connection close
        req.signal.addEventListener('abort', () => {
          clearInterval(pollInterval);
        });
      } catch (error) {
        log.error('Error in stream start', { executionId, error });
        controller.error(error);
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
}

/**
 * Create SSE stream for block execution
 */
function createBlockExecutionStream(
  req: NextRequest,
  executionId: string,
  initialStatus: string
) {
  const fromIndex = parseInt(req.nextUrl.searchParams.get('fromIndex') || '0');
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send missed events from the database
        const missedEvents = await db.query.executionEvents.findMany({
          where: and(
            eq(executionEvents.executionId, executionId),
            gte(executionEvents.index, fromIndex)
          ),
          orderBy: [asc(executionEvents.index)],
        });

        // Send missed events
        for (const event of missedEvents) {
          const eventData = {
            index: event.index,
            type: event.eventType,
            data: event.eventData,
            timestamp: event.createdAt.toISOString(),
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`)
          );
        }

        // Track last index
        let lastIndex =
          missedEvents.length > 0
            ? missedEvents[missedEvents.length - 1]!.index
            : fromIndex - 1;

        // If already complete, close stream
        if (['complete', 'failed', 'cancelled'].includes(initialStatus)) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
          return;
        }

        // Poll for new events with exponential backoff
        let pollIntervalMs = 100;
        const maxPollIntervalMs = 1000;

        const pollInterval = setInterval(async () => {
          try {
            // Get new events
            const newEvents = await db.query.executionEvents.findMany({
              where: and(
                eq(executionEvents.executionId, executionId),
                gt(executionEvents.index, lastIndex)
              ),
              orderBy: [asc(executionEvents.index)],
            });

            // Send new events
            for (const event of newEvents) {
              const eventData = {
                index: event.index,
                type: event.eventType,
                data: event.eventData,
                timestamp: event.createdAt.toISOString(),
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`)
              );
              lastIndex = event.index;
            }

            // Exponential backoff when no events
            if (newEvents.length === 0) {
              pollIntervalMs = Math.min(pollIntervalMs * 1.5, maxPollIntervalMs);
            } else {
              pollIntervalMs = 100; // Reset to fast polling when events arrive
            }

            // Check if execution is complete
            const currentExecution = await db.query.blockExecutions.findFirst({
              where: eq(blockExecutions.id, executionId),
            });

            if (
              currentExecution &&
              ['complete', 'failed', 'cancelled'].includes(
                currentExecution.status
              )
            ) {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              clearInterval(pollInterval);
              controller.close();
            }
          } catch (error) {
            log.error('Error polling for events', { executionId, error });
            clearInterval(pollInterval);
            controller.error(error);
          }
        }, pollIntervalMs);

        // Clean up on connection close
        req.signal.addEventListener('abort', () => {
          clearInterval(pollInterval);
        });
      } catch (error) {
        log.error('Error in stream start', { executionId, error });
        controller.error(error);
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
}
