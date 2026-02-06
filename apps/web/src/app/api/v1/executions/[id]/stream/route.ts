/**
 * REST API v1: Execution Stream (SSE)
 *
 * GET /api/v1/executions/[id]/stream - Server-Sent Events stream for execution updates
 *
 * Provides real-time streaming of execution events using SSE.
 * Supports both flow executions and block executions.
 * Reconnection supported via fromIndex query parameter.
 */

import { NextRequest } from 'next/server';
import {
  db,
  flowExecutions,
  blockExecutions,
  eq,
} from '@baleyui/db';
import { validateApiKey, hasPermission } from '@/lib/api/validate-api-key';
import { createLogger } from '@/lib/logger';
import { apiErrors } from '@/lib/api/error-response';
import {
  createFlowExecutionStream,
  createBlockExecutionStream,
} from '@/lib/streaming/execution-stream';

const log = createLogger('v1-execution-stream');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = request.headers.get('x-request-id') ?? undefined;

  try {
    // Validate API key
    const authHeader = request.headers.get('authorization');
    const validation = await validateApiKey(authHeader);

    // Check read permission
    if (!hasPermission(validation, 'read')) {
      return apiErrors.forbidden('Insufficient permissions. Required: read or admin');
    }

    // Get execution ID from params
    const { id: executionId } = await params;

    // Try to find as flow execution first
    const flowExec = await db.query.flowExecutions.findFirst({
      where: eq(flowExecutions.id, executionId),
      with: {
        flow: true,
      },
    });

    // Check workspace access for flow execution
    if (flowExec) {
      if (flowExec.flow.workspaceId !== validation.workspaceId) {
        return apiErrors.notFound('Execution');
      }
      return createFlowExecutionStream(request, executionId, flowExec.status);
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
    if (blockExec.block.workspaceId !== validation.workspaceId) {
      return apiErrors.notFound('Execution');
    }

    return createBlockExecutionStream(request, executionId, blockExec.status);
  } catch (error) {
    log.error('Error in stream endpoint', { error });

    if (error instanceof Error && error.message.includes('API key')) {
      return apiErrors.unauthorized(error.message);
    }

    return apiErrors.internal(error, { requestId });
  }
}
