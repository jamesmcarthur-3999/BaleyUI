/**
 * REST API v1: Flows List
 *
 * GET /api/v1/flows - List all flows in the workspace
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, flows, eq, and, notDeleted } from '@baleyui/db';
import { validateApiKey, hasPermission } from '@/lib/api/validate-api-key';
import { createLogger } from '@/lib/logger';
import { apiErrors } from '@/lib/api/error-response';

const logger = createLogger('api/v1/flows');

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? undefined;

  try {
    // Validate API key
    const authHeader = request.headers.get('authorization');
    const validation = await validateApiKey(authHeader);

    // Check read permission
    if (!hasPermission(validation, 'read')) {
      return apiErrors.forbidden('Insufficient permissions. Required: read or admin');
    }

    // Fetch all flows for the workspace
    const allFlows = await db.query.flows.findMany({
      where: and(
        eq(flows.workspaceId, validation.workspaceId),
        notDeleted(flows)
      ),
      orderBy: (flows, { desc }) => [desc(flows.createdAt)],
    });

    // Add node/edge counts for preview
    const flowsWithCounts = allFlows.map((flow) => ({
      id: flow.id,
      name: flow.name,
      description: flow.description,
      enabled: flow.enabled,
      nodeCount: Array.isArray(flow.nodes) ? flow.nodes.length : 0,
      edgeCount: Array.isArray(flow.edges) ? flow.edges.length : 0,
      createdAt: flow.createdAt,
      updatedAt: flow.updatedAt,
    }));

    return NextResponse.json({
      workspaceId: validation.workspaceId,
      flows: flowsWithCounts,
      count: flowsWithCounts.length,
    });
  } catch (error) {
    logger.error('Failed to list flows', error);

    if (error instanceof Error && error.message.includes('API key')) {
      return apiErrors.unauthorized(error.message);
    }

    return apiErrors.internal(error, { requestId });
  }
}
