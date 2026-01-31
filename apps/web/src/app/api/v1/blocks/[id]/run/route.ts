/**
 * REST API v1: Run Block
 *
 * POST /api/v1/blocks/[id]/run - Execute a single block with input data
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, blocks, blockExecutions, eq, and, notDeleted } from '@baleyui/db';
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

    // Get block ID from params
    const { id: blockId } = await params;

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const input = body.input ?? {};

    // Verify block exists and belongs to workspace
    const block = await db.query.blocks.findFirst({
      where: and(
        eq(blocks.id, blockId),
        eq(blocks.workspaceId, validation.workspaceId),
        notDeleted(blocks)
      ),
    });

    if (!block) {
      return NextResponse.json(
        { error: 'Block not found' },
        { status: 404 }
      );
    }

    // Create a new block execution record
    const [execution] = await db
      .insert(blockExecutions)
      .values({
        blockId,
        flowExecutionId: null, // Standalone block execution
        status: 'pending',
        input: input || null,
        model: block.model,
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

    // TODO: Integrate with BaleyBots execution engine to actually run the block
    // For now, we just create the execution record

    return NextResponse.json({
      workspaceId: validation.workspaceId,
      executionId: execution.id,
      blockId: execution.blockId,
      status: execution.status,
      message: 'Block execution started successfully',
    });
  } catch (error) {
    console.error('Failed to run block:', error);

    if (error instanceof Error && error.message.includes('API key')) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to run block',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
