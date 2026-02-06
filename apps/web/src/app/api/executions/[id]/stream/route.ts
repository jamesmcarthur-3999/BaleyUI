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
  eq,
} from '@baleyui/db';
import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { apiErrors } from '@/lib/api/error-response';
import {
  createFlowExecutionStream,
  createBlockExecutionStream,
} from '@/lib/streaming/execution-stream';
import { getAuthenticatedWorkspace } from '@/lib/auth/workspace-lookup';

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
    const workspace = await getAuthenticatedWorkspace(userId);

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
