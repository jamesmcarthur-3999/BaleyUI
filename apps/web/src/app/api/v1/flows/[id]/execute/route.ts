/**
 * REST API v1: Execute Flow
 *
 * POST /api/v1/flows/[id]/execute - Execute a flow with input data
 *
 * This endpoint triggers execution of a complete flow, which may contain
 * multiple nodes (BaleyBots, conditions, actions, etc.) connected together.
 * The execution runs asynchronously - use the stream endpoint to monitor progress.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  flows,
  flowExecutions,
  baleybots,
  eq,
  and,
  inArray,
  notDeleted,
} from '@baleyui/db';
import { validateApiKey, hasPermission } from '@/lib/api/validate-api-key';
import { createLogger } from '@/lib/logger';
import { apiErrors, createErrorResponse } from '@/lib/api/error-response';
import { executeFlow } from '@/lib/flow-executor';
import type { FlowNode, FlowEdge } from '@/lib/types';

const log = createLogger('v1-flows-execute');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let executionId: string | null = null;
  const requestId = request.headers.get('x-request-id') ?? undefined;

  try {
    // Validate API key
    const authHeader = request.headers.get('authorization');
    const validation = await validateApiKey(authHeader);

    // Check execute permission
    if (!hasPermission(validation, 'execute')) {
      return apiErrors.forbidden('Insufficient permissions. Required: execute or admin');
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
      return apiErrors.notFound('Flow');
    }

    // Check if flow is enabled
    if (!flow.enabled) {
      return apiErrors.badRequest('Flow is disabled');
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
      return createErrorResponse(500, null, { message: 'Failed to create execution', requestId });
    }

    executionId = execution.id;

    // Extract BaleyBot IDs from flow nodes
    const nodes = (flow.nodes || []) as FlowNode[];
    const edges = (flow.edges || []) as FlowEdge[];
    const baleybotIds = nodes
      .filter((n) => n.type === 'baleybot' && n.data?.baleybotId)
      .map((n) => n.data?.baleybotId as string)
      .filter((id): id is string => id !== undefined);

    // Fetch all referenced baleybots
    const baleybotMap = new Map<string, { balCode: string }>();
    if (baleybotIds.length > 0) {
      const fetchedBaleybots = await db.query.baleybots.findMany({
        where: and(
          inArray(baleybots.id, baleybotIds),
          eq(baleybots.workspaceId, validation.workspaceId),
          notDeleted(baleybots)
        ),
        columns: {
          id: true,
          balCode: true,
        },
      });
      for (const bot of fetchedBaleybots) {
        if (bot.balCode) {
          baleybotMap.set(bot.id, { balCode: bot.balCode });
        }
      }
    }

    // Update execution status to running
    await db
      .update(flowExecutions)
      .set({ status: 'running' })
      .where(eq(flowExecutions.id, executionId));

    log.info('Starting flow execution', {
      executionId,
      flowId,
      nodeCount: nodes.length,
      baleybotCount: baleybotMap.size,
    });

    // Execute the flow asynchronously
    // We don't await this - the caller can use the stream endpoint to monitor
    executeFlowAsync(
      executionId,
      flowId,
      nodes,
      edges,
      input,
      baleybotMap
    ).catch((error) => {
      log.error('Flow execution error (async)', { executionId, flowId, error });
    });

    return NextResponse.json({
      workspaceId: validation.workspaceId,
      executionId,
      flowId,
      status: 'running',
      message: 'Flow execution started. Use the stream endpoint to monitor progress.',
      streamUrl: `/api/v1/executions/${executionId}/stream`,
    });
  } catch (error) {
    log.error('Failed to execute flow', { error, executionId });

    // Update execution as failed if we have an execution ID
    if (executionId) {
      await db
        .update(flowExecutions)
        .set({
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          completedAt: new Date(),
        })
        .where(eq(flowExecutions.id, executionId));
    }

    if (error instanceof Error && error.message.includes('API key')) {
      return apiErrors.unauthorized(error.message);
    }

    return apiErrors.internal(error, { requestId });
  }
}

/**
 * Execute the flow asynchronously and update the execution record when complete
 */
async function executeFlowAsync(
  executionId: string,
  flowId: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
  input: unknown,
  baleybotMap: Map<string, { balCode: string }>
): Promise<void> {
  const startTime = Date.now();

  try {
    // Execute the flow
    const result = await executeFlow({
      flowId,
      executionId,
      nodes: nodes as Parameters<typeof executeFlow>[0]['nodes'],
      edges: edges as Parameters<typeof executeFlow>[0]['edges'],
      input,
      apiKey: '',  // Workspace connections provide API keys; no platform key fallback
      baleybots: baleybotMap,
    });

    // Update execution with result
    await db
      .update(flowExecutions)
      .set({
        status: result.status === 'success' ? 'completed' : 'failed',
        output: result.outputs,
        error: result.error || null,
        completedAt: new Date(),
      })
      .where(eq(flowExecutions.id, executionId));

    log.info('Flow execution completed', {
      executionId,
      flowId,
      status: result.status,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    // Update execution as failed
    await db
      .update(flowExecutions)
      .set({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      })
      .where(eq(flowExecutions.id, executionId));

    log.error('Flow execution failed', {
      executionId,
      flowId,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    });

    throw error;
  }
}
