/**
 * REST API v1: Get Execution Status
 *
 * GET /api/v1/executions/[id] - Get the status and results of a flow execution
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, flowExecutions, eq } from '@baleyui/db';
import { validateApiKey, hasPermission } from '@/lib/api/validate-api-key';
import { createLogger } from '@/lib/logger';
import { apiErrors } from '@/lib/api/error-response';

const logger = createLogger('api/v1/executions');

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

    // Fetch the execution with flow details
    const execution = await db.query.flowExecutions.findFirst({
      where: eq(flowExecutions.id, executionId),
      with: {
        flow: true,
      },
    });

    if (!execution) {
      return apiErrors.notFound('Execution');
    }

    // Verify the flow belongs to the correct workspace
    if (execution.flow.workspaceId !== validation.workspaceId) {
      return apiErrors.notFound('Execution');
    }

    return NextResponse.json({
      workspaceId: validation.workspaceId,
      execution: {
        id: execution.id,
        flowId: execution.flowId,
        flowName: execution.flow.name,
        status: execution.status,
        input: execution.input,
        output: execution.output,
        error: execution.error,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        createdAt: execution.createdAt,
      },
    });
  } catch (error) {
    logger.error('Failed to get execution', error);

    if (error instanceof Error && error.message.includes('API key')) {
      return apiErrors.unauthorized(error.message);
    }

    return apiErrors.internal(error, { requestId });
  }
}
