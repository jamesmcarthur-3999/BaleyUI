/**
 * Execution Stream API Route
 *
 * GET /api/executions/[id]/stream
 *
 * Server-Sent Events stream for real-time execution updates.
 * Supports both flow executions and block executions.
 * Reconnection supported via fromIndex query parameter.
 */

import { auth } from '@clerk/nextjs/server';
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
import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { apiErrors } from '@/lib/api/error-response';

const log = createLogger('execution-stream');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = req.headers.get('x-request-id') ?? undefined;

  try {
    // Authenticate the request
    const { userId } = await auth();
    if (!userId) {
      return apiErrors.unauthorized();
    }

    const { id: executionId } = await params;

    // Get the user's workspace
    const workspace = await db.query.workspaces.findFirst({
      where: (ws, { eq, and, isNull }) =>
        and(eq(ws.ownerId, userId), isNull(ws.deletedAt)),
    });

    if (!workspace) {
      return apiErrors.notFound('Workspace');
    }

    // Try to find as flow execution first
    const flowExec = await db.query.flowExecutions.findFirst({
      where: eq(flowExecutions.id, executionId),
      with: {
        flow: true,
      },
    });

    // Check workspace access for flow execution
    if (flowExec) {
      if (flowExec.flow.workspaceId !== workspace.id) {
        return apiErrors.forbidden();
      }
      return createFlowExecutionStream(req, executionId, flowExec.status);
    }

    // Try to find as block execution
    const blockExec = await db.query.blockExecutions.findFirst({
      where: eq(blockExecutions.id, executionId),
      with: {
        block: true,
      },
    });

    if (!blockExec || !blockExec.block) {
      return apiErrors.notFound('Execution');
    }

    // Verify workspace access
    if (blockExec.block.workspaceId !== workspace.id) {
      return apiErrors.forbidden();
    }

    return createBlockExecutionStream(req, executionId, blockExec.status);
  } catch (error) {
    log.error('Error in stream endpoint', { error });
    return apiErrors.internal(error, { requestId });
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

        // Get all events for all block executions in a single query (N+1 fix)
        const allDbEvents = blockExecIds.length > 0
          ? await db.query.executionEvents.findMany({
              where: inArray(executionEvents.executionId, blockExecIds),
              orderBy: [asc(executionEvents.createdAt), asc(executionEvents.index)],
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
        allEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

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
          const eventsForBlock = allEvents.filter((event) => event.nodeId === blockExec.id);
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

        // Max connection time to prevent leaked connections
        const MAX_CONNECTION_MS = 5 * 60 * 1000;
        const connectionTimer = setTimeout(() => {
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'reconnect', reason: 'max_connection_time' })}\n\n`
          ));
          if (pollTimer) clearTimeout(pollTimer);
          controller.close();
        }, MAX_CONNECTION_MS);

        // Poll for new events with exponential backoff using recursive setTimeout
        let pollIntervalMs = 200;
        const maxPollIntervalMs = 2000;
        let pollTimer: ReturnType<typeof setTimeout> | null = null;

        const poll = async () => {
          try {
            // Check execution status
            const currentExecution = await db.query.flowExecutions.findFirst({
              where: eq(flowExecutions.id, executionId),
            });

            if (!currentExecution) {
              clearTimeout(connectionTimer);
              controller.close();
              return;
            }

            // Get any new block executions
            const updatedBlockExecs = await db.query.blockExecutions.findMany({
              where: eq(blockExecutions.flowExecutionId, executionId),
            });

            const blockExecIds = updatedBlockExecs.map((b) => b.id);

            // Get all new events in a single query (N+1 fix)
            const newEvents = blockExecIds.length > 0
              ? await db.query.executionEvents.findMany({
                  where: inArray(executionEvents.executionId, blockExecIds),
                  orderBy: [asc(executionEvents.createdAt), asc(executionEvents.index)],
                })
              : [];

            // Filter to only events we haven't sent
            const filteredEvents = newEvents.filter((event) => {
              const lastIdx = lastEventIndexByBlock.get(event.executionId) ?? -1;
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
            if (['completed', 'failed', 'cancelled'].includes(currentExecution.status)) {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              clearTimeout(connectionTimer);
              controller.close();
              return;
            }

            // Schedule next poll with current interval
            pollTimer = setTimeout(poll, pollIntervalMs);
          } catch (error) {
            log.error('Error polling for events', { executionId, error });
            clearTimeout(connectionTimer);
            controller.error(error);
          }
        };

        pollTimer = setTimeout(poll, pollIntervalMs);

        // Clean up on connection close
        req.signal.addEventListener('abort', () => {
          if (pollTimer) clearTimeout(pollTimer);
          clearTimeout(connectionTimer);
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

        // Max connection time to prevent leaked connections
        const MAX_CONNECTION_MS = 5 * 60 * 1000;
        const connectionTimer = setTimeout(() => {
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'reconnect', reason: 'max_connection_time' })}\n\n`
          ));
          if (pollTimer) clearTimeout(pollTimer);
          controller.close();
        }, MAX_CONNECTION_MS);

        // Poll for new events with exponential backoff using recursive setTimeout
        let pollIntervalMs = 100;
        const maxPollIntervalMs = 1000;
        let pollTimer: ReturnType<typeof setTimeout> | null = null;

        const poll = async () => {
          try {
            // Single query to get both events and execution status via JOIN
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
              ['complete', 'failed', 'cancelled'].includes(currentExecution.status)
            ) {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              clearTimeout(connectionTimer);
              controller.close();
              return;
            }

            // Schedule next poll with current interval
            pollTimer = setTimeout(poll, pollIntervalMs);
          } catch (error) {
            log.error('Error polling for events', { executionId, error });
            clearTimeout(connectionTimer);
            controller.error(error);
          }
        };

        pollTimer = setTimeout(poll, pollIntervalMs);

        // Clean up on connection close
        req.signal.addEventListener('abort', () => {
          if (pollTimer) clearTimeout(pollTimer);
          clearTimeout(connectionTimer);
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
