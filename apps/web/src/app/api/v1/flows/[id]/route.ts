/**
 * REST API v1: Get Flow
 *
 * GET /api/v1/flows/[id] - Get a specific flow by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, flows, eq, and, notDeleted } from '@baleyui/db';
import { validateApiKey, hasPermission } from '@/lib/api/validate-api-key';
import { createLogger } from '@/lib/logger';
import { apiErrors } from '@/lib/api/error-response';

const logger = createLogger('api/v1/flows');

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

    // Get flow ID from params
    const { id: flowId } = await params;

    // Fetch the flow
    const flow = await db.query.flows.findFirst({
      where: and(
        eq(flows.id, flowId),
        eq(flows.workspaceId, validation.workspaceId),
        notDeleted(flows)
      ),
    });

    if (!flow) {
      return apiErrors.notFound('Flow');
    }

    return NextResponse.json({
      workspaceId: validation.workspaceId,
      flow: {
        id: flow.id,
        name: flow.name,
        description: flow.description,
        enabled: flow.enabled,
        nodes: flow.nodes,
        edges: flow.edges,
        triggers: flow.triggers,
        version: flow.version,
        createdAt: flow.createdAt,
        updatedAt: flow.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Failed to get flow', error);

    if (error instanceof Error && error.message.includes('API key')) {
      return apiErrors.unauthorized(error.message);
    }

    return apiErrors.internal(error, { requestId });
  }
}
