/**
 * Cancel Execution API Route
 *
 * POST /api/executions/[id]/cancel
 *
 * Cancels a running execution (flow or block).
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db, flowExecutions, blockExecutions, eq } from '@baleyui/db';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate the request
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: executionId } = await params;

    // Get the user's workspace
    const workspace = await db.query.workspaces.findFirst({
      where: (ws, { eq, and, isNull }) =>
        and(eq(ws.ownerId, userId), isNull(ws.deletedAt)),
    });

    if (!workspace) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 });
    }

    // Try to find as flow execution first
    const flowExec = await db.query.flowExecutions.findFirst({
      where: eq(flowExecutions.id, executionId),
      with: {
        flow: true,
      },
    });

    if (flowExec) {
      // Verify workspace access
      if (flowExec.flow.workspaceId !== workspace.id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      // Check if execution can be cancelled
      if (['completed', 'failed', 'cancelled'].includes(flowExec.status)) {
        return NextResponse.json(
          { error: 'Execution cannot be cancelled in its current state' },
          { status: 400 }
        );
      }

      // Update flow execution status to cancelled
      await db
        .update(flowExecutions)
        .set({
          status: 'cancelled',
          completedAt: new Date(),
        })
        .where(eq(flowExecutions.id, executionId));

      // Also cancel all running block executions
      await db
        .update(blockExecutions)
        .set({
          status: 'cancelled',
          completedAt: new Date(),
        })
        .where(eq(blockExecutions.flowExecutionId, executionId));

      return NextResponse.json({
        success: true,
        type: 'flow',
        message: 'Flow execution cancelled',
      });
    }

    // Try to find as block execution
    const blockExec = await db.query.blockExecutions.findFirst({
      where: eq(blockExecutions.id, executionId),
      with: {
        block: true,
      },
    });

    if (!blockExec || !blockExec.block) {
      return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
    }

    // Verify workspace access
    if (blockExec.block.workspaceId !== workspace.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if execution can be cancelled
    if (['complete', 'failed', 'cancelled'].includes(blockExec.status)) {
      return NextResponse.json(
        { error: 'Execution cannot be cancelled in its current state' },
        { status: 400 }
      );
    }

    // Update block execution status to cancelled
    await db
      .update(blockExecutions)
      .set({
        status: 'cancelled',
        completedAt: new Date(),
        durationMs: blockExec.startedAt
          ? Date.now() - blockExec.startedAt.getTime()
          : 0,
      })
      .where(eq(blockExecutions.id, executionId));

    return NextResponse.json({
      success: true,
      type: 'block',
      message: 'Block execution cancelled',
    });
  } catch (error) {
    console.error('Error cancelling execution:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
