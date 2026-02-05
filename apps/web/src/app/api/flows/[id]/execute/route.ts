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
import { createLogger } from '@/lib/logger';
import { apiErrors } from '@/lib/api/error-response';

const logger = createLogger('api/flows/execute');

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = request.headers.get('x-request-id') ?? undefined;

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
      return apiErrors.notFound('Flow');
    }

    // Check if flow is enabled
    if (!flow.enabled) {
      return apiErrors.badRequest('Flow is disabled');
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
    logger.error('Failed to start flow execution', error);

    if (error instanceof Error && error.message === 'Not authenticated') {
      return apiErrors.unauthorized();
    }

    if (error instanceof Error && error.message === 'No workspace found') {
      return apiErrors.notFound('Workspace');
    }

    return apiErrors.internal(error, { requestId });
  }
}
