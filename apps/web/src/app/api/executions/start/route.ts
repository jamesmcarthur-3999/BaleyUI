import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db, blockExecutions, blocks, eq, isNull, and } from '@baleyui/db';
import { z } from 'zod';

const startExecutionSchema = z.object({
  blockId: z.string().uuid(),
  input: z.unknown(),
});

export async function POST(req: Request) {
  try {
    // Authenticate the request
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse and validate the request body
    const body = await req.json();
    const parseResult = startExecutionSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { blockId, input } = parseResult.data;

    // Get the user's workspace
    const workspace = await db.query.workspaces.findFirst({
      where: (ws, { eq, and, isNull }) =>
        and(eq(ws.ownerId, userId), isNull(ws.deletedAt)),
    });

    if (!workspace) {
      return NextResponse.json(
        { error: 'No workspace found for this user' },
        { status: 404 }
      );
    }

    // Verify the block exists and belongs to the user's workspace
    const block = await db.query.blocks.findFirst({
      where: (b, { eq, and, isNull }) =>
        and(
          eq(b.id, blockId),
          eq(b.workspaceId, workspace.id),
          isNull(b.deletedAt)
        ),
    });

    if (!block) {
      return NextResponse.json(
        { error: 'Block not found or access denied' },
        { status: 404 }
      );
    }

    // Create the block execution record
    const [execution] = await db
      .insert(blockExecutions)
      .values({
        blockId: block.id,
        status: 'pending',
        input: input as any,
        model: block.model,
      })
      .returning();

    if (!execution) {
      return NextResponse.json(
        { error: 'Failed to create execution' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      executionId: execution.id,
    });
  } catch (error) {
    console.error('Error starting execution:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
