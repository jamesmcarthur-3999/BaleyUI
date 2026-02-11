/**
 * Companion (Baley) Stream API Route
 *
 * SSE endpoint for the Baley AI assistant.
 * Baley is an internal BaleyBot executed via executeInternalBaleybot() — fully BAL-compliant.
 * Companion-specific tools are injected at runtime.
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db, companionConversations } from '@baleyui/db';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';
import { apiErrors } from '@/lib/api/error-response';
import { getAuthenticatedWorkspace } from '@/lib/auth/workspace-lookup';
import { executeInternalBaleybot } from '@/lib/baleybot/internal-baleybots';
import {
  buildCompanionTools,
  type CompanionToolContext,
} from '@/lib/baleybot/tools/companion';
import type { BaleybotStreamEvent } from '@baleybots/core';

const log = createLogger('companion-stream');

const companionStreamBodySchema = z
  .object({
    message: z.string().min(1).max(10000),
    conversationHistory: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string(),
          timestamp: z.string(),
        })
      )
      .optional(),
    context: z
      .object({
        currentPage: z.string().optional(),
        healthSummary: z.string().optional(),
      })
      .optional(),
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
      `companion:stream:${workspace.id}:${userId}`,
      RATE_LIMITS.creatorMessage
    );

    let input: z.infer<typeof companionStreamBodySchema>;
    try {
      const raw = await req.json();
      input = companionStreamBodySchema.parse(raw);
    } catch {
      return apiErrors.badRequest('Invalid request body');
    }

    // Build companion-specific injected tools
    const toolCtx: CompanionToolContext = {
      workspaceId: workspace.id,
      userId,
    };
    const companionTools = buildCompanionTools(toolCtx);

    // Build context string for the BAL execution
    const contextParts: string[] = [];
    if (input.context?.currentPage) {
      contextParts.push(`User is currently on page: ${input.context.currentPage}`);
    }
    if (input.context?.healthSummary) {
      contextParts.push(`Workspace health: ${input.context.healthSummary}`);
    }
    if (input.conversationHistory && input.conversationHistory.length > 0) {
      const historyStr = input.conversationHistory
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');
      contextParts.push(`Conversation so far:\n${historyStr}`);
    }

    const fullContext = contextParts.length > 0 ? contextParts.join('\n\n') : undefined;

    const encoder = new TextEncoder();
    const actionsTaken: Array<{
      tool: string;
      args: Record<string, unknown>;
      result: string;
      timestamp: string;
    }> = [];

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
          type: 'companion_stream_started',
          timestamp: Date.now(),
        });

        const heartbeat = setInterval(() => {
          if (Date.now() - lastEmitAt < 4000) return;
          sendEvent({
            type: 'companion_heartbeat',
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
          const { output, executionId } = await executeInternalBaleybot(
            'baley',
            input.message,
            {
              userWorkspaceId: workspace.id,
              context: fullContext,
              injectedTools: companionTools,
              triggeredBy: 'internal',
              onSegment: (segment: BaleybotStreamEvent) => {
                // Forward text deltas to the client
                if (segment.type === 'text_delta') {
                  sendEvent({
                    type: 'companion_text_delta',
                    content: (segment as Record<string, unknown>).content,
                    timestamp: Date.now(),
                  });
                }

                // Forward tool start events for UI progress
                if (segment.type === 'tool_execution_start') {
                  const seg = segment as Record<string, unknown>;
                  sendEvent({
                    type: 'companion_tool_start',
                    toolName: seg.toolName,
                    toolCallId: seg.id,
                    timestamp: Date.now(),
                  });
                }

                // Track tool calls for logging
                if (segment.type === 'tool_execution_output') {
                  const seg = segment as Record<string, unknown>;
                  actionsTaken.push({
                    tool: seg.toolName as string,
                    args: (seg.arguments ?? {}) as Record<string, unknown>,
                    result: JSON.stringify(seg.result ?? seg.error ?? '').substring(0, 500),
                    timestamp: new Date().toISOString(),
                  });

                  // Forward tool outputs that contain navigation actions
                  sendEvent({
                    type: 'companion_tool_result',
                    toolName: seg.toolName,
                    result: seg.result,
                    error: seg.error,
                    timestamp: Date.now(),
                  });
                }

                // Forward request_user_input events
                if (segment.type === 'tool_call_stream_complete') {
                  const seg = segment as Record<string, unknown>;
                  if (seg.toolName === 'request_user_input') {
                    sendEvent({
                      type: 'companion_input_requested',
                      toolCallId: seg.id,
                      question: seg.arguments,
                      timestamp: Date.now(),
                    });
                  }
                }
              },
            }
          );

          // Send completion with the full output
          sendEvent({
            type: 'companion_complete',
            output: typeof output === 'string' ? output : JSON.stringify(output),
            executionId,
            timestamp: Date.now(),
          });

          // Log conversation
          try {
            const messages = [
              ...(input.conversationHistory ?? []),
              {
                role: 'user' as const,
                content: input.message,
                timestamp: new Date().toISOString(),
              },
              {
                role: 'assistant' as const,
                content: typeof output === 'string' ? output : JSON.stringify(output),
                timestamp: new Date().toISOString(),
              },
            ];

            await db.insert(companionConversations).values({
              workspaceId: workspace.id,
              userId,
              messages,
              actionsTaken,
              pageContext: input.context?.currentPage,
              executionId,
            });
          } catch (logErr) {
            log.error('Failed to log companion conversation', {
              error: logErr instanceof Error ? logErr.message : String(logErr),
            });
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          clearInterval(heartbeat);
          controller.close();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Companion stream failed';
          log.error('companion stream processing failed', {
            workspaceId: workspace.id,
            error: message,
          });
          sendEvent({
            type: 'companion_error',
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
    log.error('companion stream route failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return apiErrors.internal(error);
  }
}
