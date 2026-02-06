import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db, blockExecutions, notDeleted } from '@baleyui/db';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import { apiErrors, createErrorResponse } from '@/lib/api/error-response';
import { getAuthenticatedWorkspace } from '@/lib/auth/workspace-lookup';

const logger = createLogger('api/executions/start');

const startExecutionSchema = z.object({
  blockId: z.string().uuid(),
  input: z.unknown(),
});

export async function POST(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? undefined;

  try {
    // Authenticate the request
    const { userId } = await auth();
    if (!userId) {
      return apiErrors.unauthorized();
    }

    // Parse and validate the request body
    const body = await req.json();
    const parseResult = startExecutionSchema.safeParse(body);

    if (!parseResult.success) {
      return apiErrors.badRequest('Invalid request body');
    }

    const { blockId, input } = parseResult.data;

    // Get the user's workspace
    const workspace = await getAuthenticatedWorkspace(userId);

    if (!workspace) {
      return apiErrors.notFound('Workspace');
    }

    // Verify the block exists and belongs to the user's workspace
    const block = await db.query.blocks.findFirst({
      where: (b, { eq, and }) =>
        and(
          eq(b.id, blockId),
          eq(b.workspaceId, workspace.id),
          notDeleted(b)
        ),
    });

    if (!block) {
      return apiErrors.notFound('Block');
    }

    // Create the block execution record
    const [execution] = await db
      .insert(blockExecutions)
      .values({
        blockId: block.id,
        status: 'pending',
        input: input as Record<string, unknown>,
        model: block.model,
      })
      .returning();

    if (!execution) {
      return createErrorResponse(500, null, { message: 'Failed to create execution', requestId });
    }

    return NextResponse.json({
      executionId: execution.id,
    });
  } catch (error) {
    logger.error('Error starting execution', error);
    return apiErrors.internal(error, { requestId });
  }
}
