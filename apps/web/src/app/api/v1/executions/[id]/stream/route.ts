/**
 * REST API v1: Execution Stream (SSE)
 *
 * GET /api/v1/executions/[id]/stream - Server-Sent Events stream for execution updates
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, flowExecutions, flows, eq } from '@baleyui/db';
import { validateApiKey, hasPermission } from '@/lib/api/validate-api-key';

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

    // Verify execution exists and belongs to workspace
    const execution = await db.query.flowExecutions.findFirst({
      where: eq(flowExecutions.id, executionId),
      with: {
        flow: true,
      },
    });

    if (!execution) {
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      );
    }

    // Verify the flow belongs to the correct workspace
    if (execution.flow.workspaceId !== validation.workspaceId) {
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      );
    }

    // Create a ReadableStream for SSE
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        // Helper to send SSE message
        const sendEvent = (event: string, data: any) => {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        // Send initial status
        sendEvent('status', {
          executionId: execution.id,
          status: execution.status,
          startedAt: execution.startedAt,
          completedAt: execution.completedAt,
        });

        // TODO: Integrate with BaleyBots execution engine to stream real-time updates
        // For now, we just send the current status and close the stream

        // If execution is already complete, send final event and close
        if (execution.status === 'completed' || execution.status === 'failed' || execution.status === 'cancelled') {
          sendEvent('complete', {
            executionId: execution.id,
            status: execution.status,
            output: execution.output,
            error: execution.error,
            completedAt: execution.completedAt,
          });
          controller.close();
        } else {
          // Send a message indicating streaming is not yet implemented
          sendEvent('info', {
            message: 'Real-time streaming will be available once BaleyBots execution engine is integrated',
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Failed to stream execution:', error);

    if (error instanceof Error && error.message.includes('API key')) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to stream execution',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
