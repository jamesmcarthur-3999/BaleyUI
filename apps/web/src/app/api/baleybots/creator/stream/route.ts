/**
 * Creator Stream API Route
 *
 * SSE endpoint for the BAL-native creator pipeline.
 * The concierge BB streams natural conversation text directly to the user.
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@baleyui/db';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';
import { apiErrors } from '@/lib/api/error-response';
import { getAuthenticatedWorkspace } from '@/lib/auth/workspace-lookup';
import {
  buildCreatorRequestContext,
  type CreatorConversationHistoryInput,
} from '@/lib/baleybot/creator-request-context';
import {
  executeCreatorPipeline,
  type CreatorSSEEvent,
} from '@/lib/baleybot/creator-pipeline-adapter';

const log = createLogger('creator-stream-route');

const creatorStreamBodySchema = z
  .object({
    baleybotId: z.string().uuid().optional(),
    message: z.string().min(1).max(10000),
    conversationHistory: z
      .array(
        z.object({
          id: z.string(),
          role: z.enum(['user', 'assistant']),
          content: z.string(),
          timestamp: z.coerce.date(),
          metadata: z.record(z.string(), z.unknown()).optional(),
        })
      )
      .optional(),
  })
  .strict();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') ?? undefined;

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
      `creator:stream:${workspace.id}:${userId}`,
      RATE_LIMITS.creatorMessage
    );

    let input: z.infer<typeof creatorStreamBodySchema>;
    try {
      const raw = await req.json();
      input = creatorStreamBodySchema.parse(raw);
    } catch {
      return apiErrors.badRequest('Invalid request body for creator stream');
    }

    const creatorContext = await buildCreatorRequestContext({
      db,
      workspaceId: workspace.id,
      message: input.message,
      conversationHistory:
        input.conversationHistory as CreatorConversationHistoryInput[] | undefined,
    });

    const executionId = crypto.randomUUID();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let lastEmitAt = Date.now();

        const sendEvent = (event: Record<string, unknown>) => {
          lastEmitAt = Date.now();
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        };

        sendEvent({
          type: 'creator_stream_started',
          executionId,
          timestamp: Date.now(),
        });

        const heartbeat = setInterval(() => {
          if (Date.now() - lastEmitAt < 4000) return;
          sendEvent({
            type: 'creator_progress',
            phase: 'thinking',
            message: 'Still working...',
            heartbeat: true,
            timestamp: Date.now(),
          });
        }, 2000);

        req.signal.addEventListener(
          'abort',
          () => {
            clearInterval(heartbeat);
            try {
              controller.close();
            } catch {
              // stream already closed
            }
          },
          { once: true }
        );

        try {
          await executeCreatorPipeline({
            workspaceId: workspace.id,
            baleybotId: input.baleybotId,
            message: creatorContext.sanitizedMessage,
            context: creatorContext.context,
            conversationHistory: creatorContext.conversationHistory,
            signal: req.signal,
            executionId,
            onEvent: (event: CreatorSSEEvent) => {
              sendEvent(event as unknown as Record<string, unknown>);
            },
          });

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          clearInterval(heartbeat);
          controller.close();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Creator stream failed';
          log.error('creator stream processing failed', {
            workspaceId: workspace.id,
            error: message,
          });
          sendEvent({
            type: 'creator_error',
            message,
            timestamp: Date.now(),
          });
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          clearInterval(heartbeat);
          controller.close();
        }
      },
      cancel() {
        // no-op: route work is naturally cancelled via request lifecycle
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    log.error('creator stream route failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return apiErrors.internal(error, { requestId });
  }
}
