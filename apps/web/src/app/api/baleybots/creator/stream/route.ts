import { auth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@baleyui/db';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';
import { apiErrors } from '@/lib/api/error-response';
import { getAuthenticatedWorkspace } from '@/lib/auth/workspace-lookup';
import {
  processCreatorMessage,
  type CreatorProgressEvent,
} from '@/lib/baleybot/creator-bot';
import {
  buildCreatorRequestContext,
  type CreatorConversationHistoryInput,
} from '@/lib/baleybot/creator-request-context';
import type { CreatorOutput } from '@/lib/baleybot/creator-types';

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

function compactCreatorSummary(output: CreatorOutput): string {
  if (output.status === 'building') {
    return 'Captured discovery progress and waiting for the next detail.';
  }

  const entityCount = output.entities.length;
  const toolCount = output.entities.reduce(
    (sum, entity) => sum + entity.tools.length,
    0
  );
  const parts = [
    `Generated ${entityCount} ${entityCount === 1 ? 'entity' : 'entities'}`,
  ];
  if (toolCount > 0) {
    parts.push(`mapped ${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}`);
  }
  return `${parts.join(', ')} and produced runnable BAL code.`;
}

function truncate(value: string, max = 220): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1).trimEnd()}...`;
}

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

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let lastEmitAt = Date.now();
        const seenHighlights = new Set<string>();

        const sendEvent = (event: Record<string, unknown>) => {
          lastEmitAt = Date.now();
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        };

        sendEvent({
          type: 'creator_stream_started',
          timestamp: Date.now(),
        });

        const heartbeat = setInterval(() => {
          if (Date.now() - lastEmitAt < 4000) return;
          sendEvent({
            type: 'creator_progress',
            phase: 'orchestration',
            message: 'Still working through your request...',
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

        const handleProgress = (event: CreatorProgressEvent) => {
          sendEvent({
            type: 'creator_progress',
            phase: event.phase,
            message: truncate(event.message, 140),
            highlightType: event.highlightType ?? 'status',
            toolName: event.toolName,
            cycle: event.cycle,
            timestamp: Date.now(),
          });

          if (!event.highlight) return;
          const normalized = truncate(event.highlight).toLowerCase();
          if (!normalized) return;
          if (seenHighlights.has(normalized)) return;
          seenHighlights.add(normalized);

          if (seenHighlights.size > 40) {
            const first = seenHighlights.values().next().value;
            if (typeof first === 'string') {
              seenHighlights.delete(first);
            }
          }

          sendEvent({
            type: 'creator_highlight',
            phase: event.phase,
            highlight: truncate(event.highlight),
            highlightType: event.highlightType ?? 'status',
            toolName: event.toolName,
            cycle: event.cycle,
            timestamp: Date.now(),
          });
        };

        try {
          const result = await processCreatorMessage(
            {
              context: creatorContext.context,
              conversationHistory: creatorContext.conversationHistory,
              onProgress: handleProgress,
            },
            creatorContext.sanitizedMessage
          );

          sendEvent({
            type: 'creator_complete',
            result,
            summary: compactCreatorSummary(result),
            timestamp: Date.now(),
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
