/**
 * REST API v1: Get Execution Status
 *
 * GET /api/v1/executions/[id] - Get the status and results of a flow execution
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, flowExecutions, flows, eq } from '@baleyui/db';
import { validateApiKey, hasPermission } from '@/lib/api/validate-api-key';
import { createLogger } from '@/lib/logger';

const logger = createLogger('api/v1/executions');

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

    // Fetch the execution with flow details
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
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    const isDev = process.env.NODE_ENV === 'development';
    return NextResponse.json(
      {
        error: 'Failed to get execution',
        ...(isDev ? { details: error instanceof Error ? error.message : 'Unknown error' } : {}),
      },
      { status: 500 }
    );
  }
}
