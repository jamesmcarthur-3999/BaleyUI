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
          content: z.string().max(50000),
          timestamp: z.coerce.date(),
          metadata: z.record(z.string(), z.unknown()).optional(),
        })
      )
      .max(100)
      .optional(),
    currentState: z.object({
      balCode: z.string().max(50000),
      name: z.string().max(200).optional(),
      description: z.string().max(2000).optional(),
      icon: z.string().max(10).optional(),
      entities: z.array(z.object({
        name: z.string(),
        purpose: z.string().optional(),
        tools: z.array(z.string()).optional(),
      })).max(50).optional(),
    }).optional(),
  })
  .strict();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Strip sensitive data from error messages before forwarding to the client.
 * Removes DB connection strings, file paths, API keys, and internal details.
 */
function sanitizeStreamError(message: string): string {
  return message
    // DB connection strings
    .replace(/postgres(ql)?:\/\/[^\s]+/gi, '[database-url]')
    .replace(/mysql:\/\/[^\s]+/gi, '[database-url]')
    // File paths
    .replace(/\/(?:Users|home|var|tmp|app|src)\/[^\s:]+/g, '[path]')
    // API keys and tokens
    .replace(/(?:sk|pk|key|token|secret|password)[-_]?[a-zA-Z0-9]{20,}/gi, '[redacted]')
    // Neon/Vercel-style connection strings
    .replace(/ep-[a-z0-9-]+\.[\w.-]+neon\.tech/gi, '[database-host]')
    // Generic long alphanumeric tokens (likely secrets)
    .replace(/(?<=[\s:=])[A-Za-z0-9+/]{40,}={0,2}(?=[\s\n]|$)/g, '[redacted]')
    .trim();
}

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
            userId,
            baleybotId: input.baleybotId,
            message: creatorContext.sanitizedMessage,
            context: creatorContext.context,
            conversationHistory: creatorContext.conversationHistory,
            currentState: input.currentState,
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
          const rawMessage =
            error instanceof Error ? error.message : 'Creator stream failed';
          log.error('creator stream processing failed', {
            workspaceId: workspace.id,
            error: rawMessage,
          });
          sendEvent({
            type: 'creator_error',
            message: sanitizeStreamError(rawMessage),
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
