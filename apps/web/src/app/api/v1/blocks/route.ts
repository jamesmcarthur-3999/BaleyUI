/**
 * REST API v1: Blocks List
 *
 * GET /api/v1/blocks - List all blocks in the workspace
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, blocks, eq, and, notDeleted } from '@baleyui/db';
import { validateApiKey, hasPermission } from '@/lib/api/validate-api-key';

export async function GET(request: NextRequest) {
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

    // Fetch all blocks for the workspace
    const allBlocks = await db.query.blocks.findMany({
      where: and(
        eq(blocks.workspaceId, validation.workspaceId),
        notDeleted(blocks)
      ),
      orderBy: (blocks, { desc }) => [desc(blocks.createdAt)],
    });

    // Return simplified block info
    const blocksInfo = allBlocks.map((block) => ({
      id: block.id,
      type: block.type,
      name: block.name,
      description: block.description,
      inputSchema: block.inputSchema,
      outputSchema: block.outputSchema,
      executionMode: block.executionMode,
      executionCount: block.executionCount,
      avgLatencyMs: block.avgLatencyMs,
      lastExecutedAt: block.lastExecutedAt,
      createdAt: block.createdAt,
      updatedAt: block.updatedAt,
    }));

    return NextResponse.json({
      workspaceId: validation.workspaceId,
      blocks: blocksInfo,
      count: blocksInfo.length,
    });
  } catch (error) {
    console.error('Failed to list blocks:', error);

    if (error instanceof Error && error.message.includes('API key')) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to list blocks',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
