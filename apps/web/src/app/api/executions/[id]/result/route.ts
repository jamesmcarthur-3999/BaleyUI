import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db, eq, isNull, and } from '@baleyui/db';
import { createLogger } from '@/lib/logger';

const logger = createLogger('api/executions/result');

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate the request
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: executionId } = await params;

    // Get the user's workspace
    const workspace = await db.query.workspaces.findFirst({
      where: (ws, { eq, and, isNull }) =>
        and(eq(ws.ownerId, userId), isNull(ws.deletedAt)),
    });

    if (!workspace) {
      return NextResponse.json(
        { error: 'No workspace found' },
        { status: 404 }
      );
    }

    // Get the execution with block info
    const execution = await db.query.blockExecutions.findFirst({
      where: (ex) => eq(ex.id, executionId),
      with: {
        block: true,
      },
    });

    if (!execution || !execution.block) {
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      );
    }

    // Verify workspace access
    if (execution.block.workspaceId !== workspace.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Check if execution is complete
    if (execution.status !== 'complete' && execution.status !== 'failed') {
      return NextResponse.json(
        { error: 'Execution not yet complete' },
        { status: 404 }
      );
    }

    // Return the result
    return NextResponse.json({
      status: execution.status,
      output: execution.output,
      error: execution.error,
      startedAt: execution.startedAt?.toISOString() || null,
      completedAt: execution.completedAt?.toISOString() || null,
      durationMs: execution.durationMs,
      tokensInput: execution.tokensInput,
      tokensOutput: execution.tokensOutput,
      reasoning: execution.reasoning,
    });
  } catch (error) {
    logger.error('Error getting execution result', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
