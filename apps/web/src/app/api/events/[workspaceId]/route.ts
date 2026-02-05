/**
 * SSE Endpoint for Builder Event Subscription
 *
 * Provides real-time event streaming for the "watch AI build" feature.
 * Clients can subscribe to workspace events and receive updates as they happen.
 */

import { NextRequest } from 'next/server';
import { verifyWorkspaceOwnership } from '@/lib/auth';
import { eventStore } from '@/lib/events/event-store';
import { builderEventEmitter } from '@/lib/events/event-emitter';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;

  // Verify the user owns this workspace - prevents unauthorized access
  const workspace = await verifyWorkspaceOwnership(workspaceId);
  if (!workspace) {
    return new Response('Forbidden', { status: 403 });
  }
  const lastSequence = parseInt(
    request.nextUrl.searchParams.get('lastSequence') ?? '0'
  );

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Send any missed events first
      const missedEvents = await eventStore.getAfterSequence(
        workspaceId,
        lastSequence
      );

      for (const event of missedEvents) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      }

      // Subscribe to new events
      const unsubscribe = builderEventEmitter.subscribeToWorkspace(
        workspaceId,
        (event) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        }
      );

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
