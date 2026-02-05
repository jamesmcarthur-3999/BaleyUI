/**
 * Execution Status API Route
 *
 * GET /api/executions/[id]/status
 *
 * Returns the current status of an execution (flow or block).
 * Useful for polling as an alternative to SSE streaming.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db, flowExecutions, blockExecutions, eq } from '@baleyui/db';
import { createLogger } from '@/lib/logger';

const logger = createLogger('api/executions/status');

export async function GET(
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
        blockExecutions: true,
      },
    });

    if (flowExec) {
      // Verify workspace access
      if (flowExec.flow.workspaceId !== workspace.id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      // Calculate progress based on block executions
      const totalBlocks = flowExec.blockExecutions.length;
      const completedBlocks = flowExec.blockExecutions.filter(
        (b) => ['complete', 'completed', 'failed'].includes(b.status)
      ).length;

      let progress = 0;
      if (flowExec.status === 'pending') {
        progress = 0;
      } else if (flowExec.status === 'running') {
        progress = totalBlocks > 0 ? Math.round((completedBlocks / totalBlocks) * 100) : 50;
      } else {
        progress = 100;
      }

      return NextResponse.json({
        type: 'flow',
        status: flowExec.status,
        progress,
        flowId: flowExec.flowId,
        flowName: flowExec.flow.name,
        startedAt: flowExec.startedAt?.toISOString() || null,
        completedAt: flowExec.completedAt?.toISOString() || null,
        input: flowExec.input,
        output: flowExec.output,
        error: flowExec.error,
        blockExecutions: flowExec.blockExecutions.map((b) => ({
          id: b.id,
          blockId: b.blockId,
          status: b.status,
          startedAt: b.startedAt?.toISOString() || null,
          completedAt: b.completedAt?.toISOString() || null,
          durationMs: b.durationMs,
        })),
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

    // Calculate progress
    let progress = 0;
    if (blockExec.status === 'pending') {
      progress = 0;
    } else if (blockExec.status === 'running') {
      progress = 50;
    } else {
      progress = 100;
    }

    return NextResponse.json({
      type: 'block',
      status: blockExec.status,
      progress,
      blockId: blockExec.blockId,
      blockName: blockExec.block.name,
      startedAt: blockExec.startedAt?.toISOString() || null,
      completedAt: blockExec.completedAt?.toISOString() || null,
      durationMs: blockExec.durationMs,
      input: blockExec.input,
      output: blockExec.output,
      error: blockExec.error,
      eventCount: blockExec.eventCount,
      tokensInput: blockExec.tokensInput,
      tokensOutput: blockExec.tokensOutput,
    });
  } catch (error) {
    logger.error('Error getting execution status', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
