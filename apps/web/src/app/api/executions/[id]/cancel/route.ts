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
import { createLogger } from '@/lib/logger';
import { apiErrors } from '@/lib/api/error-response';

const logger = createLogger('api/executions/cancel');

export async function POST(
  req: Request,
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

    if (flowExec) {
      // Verify workspace access
      if (flowExec.flow.workspaceId !== workspace.id) {
        return apiErrors.forbidden();
      }

      // Check if execution can be cancelled
      if (['completed', 'failed', 'cancelled'].includes(flowExec.status)) {
        return apiErrors.badRequest('Execution cannot be cancelled in its current state');
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
      return apiErrors.notFound('Execution');
    }

    // Verify workspace access
    if (blockExec.block.workspaceId !== workspace.id) {
      return apiErrors.forbidden();
    }

    // Check if execution can be cancelled
    if (['complete', 'failed', 'cancelled'].includes(blockExec.status)) {
      return apiErrors.badRequest('Execution cannot be cancelled in its current state');
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
    logger.error('Error cancelling execution', error);
    return apiErrors.internal(error, { requestId });
  }
}
