/**
 * Flow Execution API Route
 *
 * POST /api/flows/[id]/execute
 *
 * Starts a new execution of the specified flow.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, flows, eq, and, notDeleted } from '@baleyui/db';
import { getCurrentAuth } from '@/lib/auth';
import { FlowExecutor } from '@/lib/execution';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate
    const { userId, workspace } = await getCurrentAuth();

    // Get flow ID from params
    const { id: flowId } = await params;

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const input = body.input ?? {};

    // Verify flow exists and belongs to workspace
    const flow = await db.query.flows.findFirst({
      where: and(
        eq(flows.id, flowId),
        eq(flows.workspaceId, workspace.id),
        notDeleted(flows)
      ),
    });

    if (!flow) {
      return NextResponse.json(
        { error: 'Flow not found' },
        { status: 404 }
      );
    }

    // Check if flow is enabled
    if (!flow.enabled) {
      return NextResponse.json(
        { error: 'Flow is disabled' },
        { status: 400 }
      );
    }

    // Start execution
    const executor = await FlowExecutor.start({
      flowId,
      input,
      triggeredBy: {
        type: 'manual',
        userId,
      },
    });

    return NextResponse.json({
      executionId: executor.executionId,
      status: 'started',
      message: 'Flow execution started successfully',
    });
  } catch (error) {
    console.error('Failed to start flow execution:', error);

    if (error instanceof Error && error.message === 'Not authenticated') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message === 'No workspace found') {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to start execution',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
