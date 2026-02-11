/**
 * Companion (Baley) Respond API Route
 *
 * Handles user responses to Baley's request_user_input tool calls.
 * Uses the same channel system as the creator respond route.
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiErrors } from '@/lib/api/error-response';
import { getAuthenticatedWorkspace } from '@/lib/auth/workspace-lookup';
import { getChannel } from '@/lib/baleybot/tools/built-in/request-user-input';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';

const log = createLogger('companion-respond');

const respondBodySchema = z
  .object({
    executionId: z.string().uuid(),
    response: z.string().min(1).max(10000),
  })
  .strict();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return apiErrors.unauthorized();
    }

    const workspace = await getAuthenticatedWorkspace(userId);
    if (!workspace) {
      return apiErrors.notFound('Workspace');
    }

    await checkRateLimit(
      `companion:respond:${workspace.id}:${userId}`,
      RATE_LIMITS.creatorMessage
    );

    let input: z.infer<typeof respondBodySchema>;
    try {
      const raw = await req.json();
      input = respondBodySchema.parse(raw);
    } catch {
      return apiErrors.badRequest('Invalid request body');
    }

    const channel = getChannel(input.executionId);
    if (!channel) {
      return NextResponse.json(
        { error: 'No pending input request found. It may have expired.' },
        { status: 404 }
      );
    }

    if (!channel.pending) {
      return NextResponse.json(
        { error: 'No pending question to answer.' },
        { status: 400 }
      );
    }

    channel.resolveInput(input.response);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('companion respond route failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return apiErrors.internal(error);
  }
}
