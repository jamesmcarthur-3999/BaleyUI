/**
 * REST API v1: Execute Flow
 *
 * POST /api/v1/flows/[id]/execute - Execute a flow with input data
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, flows, flowExecutions, eq, and, notDeleted } from '@baleyui/db';
import { validateApiKey, hasPermission } from '@/lib/api/validate-api-key';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Validate API key
    const authHeader = request.headers.get('authorization');
    const validation = await validateApiKey(authHeader);

    // Check execute permission
    if (!hasPermission(validation, 'execute')) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Required: execute or admin' },
        { status: 403 }
      );
    }

    // Get flow ID from params
    const { id: flowId } = await params;

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const input = body.input ?? {};

    // Verify flow exists and belongs to workspace
    const flow = await db.query.flows.findFirst({
      where: and(
        eq(flows.id, flowId),
        eq(flows.workspaceId, validation.workspaceId),
        notDeleted(flows)
      ),
    });

    if (!flow) {
      return NextResponse.json(
        { error: 'Flow not found' },
        { status: 404 }
      );
    }

    // Check if flow is enabled
    if (!flow.enabled) {
      return NextResponse.json(
        { error: 'Flow is disabled' },
        { status: 400 }
      );
    }

    // Create a new flow execution record
    const [execution] = await db
      .insert(flowExecutions)
      .values({
        flowId,
        flowVersion: flow.version,
        triggeredBy: {
          type: 'api',
          apiKeyId: validation.keyId,
        },
        status: 'pending',
        input: input || null,
        startedAt: new Date(),
        createdAt: new Date(),
      })
      .returning();

    if (!execution) {
      return NextResponse.json(
        { error: 'Failed to create execution' },
        { status: 500 }
      );
    }

    // TODO: Integrate with BaleyBots execution engine to actually run the flow
    // For now, we just create the execution record

    return NextResponse.json({
      workspaceId: validation.workspaceId,
      executionId: execution.id,
      flowId: execution.flowId,
      status: execution.status,
      message: 'Flow execution started successfully',
    });
  } catch (error) {
    console.error('Failed to execute flow:', error);

    if (error instanceof Error && error.message.includes('API key')) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to execute flow',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
