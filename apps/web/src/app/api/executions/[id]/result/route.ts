import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db, eq } from '@baleyui/db';
import { createLogger } from '@/lib/logger';
import { apiErrors } from '@/lib/api/error-response';
import { getAuthenticatedWorkspace } from '@/lib/auth/workspace-lookup';

const logger = createLogger('api/executions/result');

export async function GET(
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
    const workspace = await getAuthenticatedWorkspace(userId);

    if (!workspace) {
      return apiErrors.notFound('Workspace');
    }

    // Get the execution with block info
    const execution = await db.query.blockExecutions.findFirst({
      where: (ex) => eq(ex.id, executionId),
      with: {
        block: true,
      },
    });

    if (!execution || !execution.block) {
      return apiErrors.notFound('Execution');
    }

    // Verify workspace access
    if (execution.block.workspaceId !== workspace.id) {
      return apiErrors.forbidden();
    }

    // Check if execution is complete
    if (execution.status !== 'completed' && execution.status !== 'complete' && execution.status !== 'failed') {
      return apiErrors.notFound('Execution result');
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
    return apiErrors.internal(error, { requestId });
  }
}
