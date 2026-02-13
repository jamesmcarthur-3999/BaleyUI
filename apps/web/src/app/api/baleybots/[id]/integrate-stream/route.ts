/**
 * Integration Stream API Route
 *
 * SSE endpoint for the integration_builder conversation.
 * Streams natural conversation text while the AI guides the user
 * through integration setup. Injects save_trigger_config and
 * enable_webhook tools so the AI can persist trigger configs and
 * generate webhook secrets as side effects.
 */

import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db, baleybots, baleybotTriggers, eq, and, notDeleted, updateWithLock } from '@baleyui/db';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';
import { apiErrors } from '@/lib/api/error-response';
import { getAuthenticatedWorkspace } from '@/lib/auth/workspace-lookup';
import { executeInternalBaleybot } from '@/lib/baleybot/internal-baleybots';
import { validateAndNormalizeTriggerConfig } from '@/lib/baleybot/types';
import type { RuntimeToolDefinition } from '@/lib/baleybot/executor';

const log = createLogger('integrate-stream-route');

const integrateStreamBodySchema = z
  .object({
    message: z.string().min(1).max(10000),
    conversationHistory: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string().max(50000),
        })
      )
      .max(50)
      .optional(),
  })
  .strict();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = req.headers.get('x-request-id') ?? undefined;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id ?? null;
    if (!userId) {
      return apiErrors.unauthorized();
    }

    const workspace = await getAuthenticatedWorkspace(userId);
    if (!workspace) {
      return apiErrors.notFound('Workspace');
    }

    const { id: baleybotId } = await params;

    await checkRateLimit(
      `integrate:stream:${workspace.id}:${userId}`,
      RATE_LIMITS.creatorMessage
    );

    let input: z.infer<typeof integrateStreamBodySchema>;
    try {
      const raw = await req.json();
      input = integrateStreamBodySchema.parse(raw);
    } catch {
      return apiErrors.badRequest('Invalid request body');
    }

    // Verify the baleybot exists and belongs to this workspace
    const baleybot = await db.query.baleybots.findFirst({
      where: and(
        eq(baleybots.id, baleybotId),
        eq(baleybots.workspaceId, workspace.id),
        notDeleted(baleybots),
      ),
    });
    if (!baleybot) {
      return apiErrors.notFound('BaleyBot');
    }

    // Build context for the integration_builder
    const contextParts = [
      `BaleyBot: ${baleybot.name}`,
      `BaleyBot ID: ${baleybotId}`,
      `BAL Code:\n${baleybot.balCode}`,
      baleybot.entityNames
        ? `Entities: ${(baleybot.entityNames as string[]).join(', ')}`
        : '',
      '',
      'Available tools: save_trigger_config (to persist the integration trigger), enable_webhook (to enable webhook endpoint and generate a secret).',
      'After deciding the integration method with the user, call save_trigger_config to persist it. For webhooks, also call enable_webhook to activate the endpoint.',
      '',
      'Conversation so far:',
      ...(input.conversationHistory ?? []).map(
        (m) => `${m.role}: ${m.content}`
      ),
      '',
      `User: ${input.message}`,
    ]
      .filter(Boolean)
      .join('\n');

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
          type: 'integration_stream_started',
          timestamp: Date.now(),
        });

        const heartbeat = setInterval(() => {
          if (Date.now() - lastEmitAt < 4000) return;
          sendEvent({
            type: 'integration_heartbeat',
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

        // Build injected tools for integration_builder
        const injectedTools = new Map<string, RuntimeToolDefinition>();

        // save_trigger_config — persists trigger config to baleybotTriggers table
        injectedTools.set('save_trigger_config', {
          name: 'save_trigger_config',
          description: 'Persist the trigger configuration for this BaleyBot. Call this after determining the integration method.',
          inputSchema: {
            type: 'object',
            properties: {
              triggerType: {
                type: 'string',
                enum: ['manual', 'schedule', 'webhook', 'other_bb', 'db_event', 'mcp_event', 'file_upload'],
                description: 'The type of trigger to configure',
              },
              schedule: { type: 'string', description: 'Cron expression for schedule triggers' },
              webhookPath: { type: 'string', description: 'Custom webhook path' },
              sourceBaleybotId: { type: 'string', description: 'Source BB ID for chain triggers' },
              completionType: { type: 'string', enum: ['success', 'failure', 'completion'] },
              dbConnectionId: { type: 'string', description: 'Database connection ID for db_event triggers' },
              dbTable: { type: 'string', description: 'Table to watch for db_event triggers' },
              dbEvent: { type: 'string', enum: ['insert', 'update', 'delete', 'change'] },
              enabled: { type: 'boolean', description: 'Whether the trigger is active' },
            },
            required: ['triggerType'],
          },
          category: 'integration',
          dangerLevel: 'moderate',
          function: async (args: Record<string, unknown>) => {
            const triggerType = args.triggerType as string;
            const config = {
              type: triggerType,
              schedule: args.schedule,
              webhookPath: args.webhookPath,
              sourceBaleybotId: args.sourceBaleybotId,
              completionType: args.completionType,
              dbConnectionId: args.dbConnectionId,
              dbTable: args.dbTable,
              dbEvent: args.dbEvent,
              enabled: args.enabled ?? true,
            };

            const validation = validateAndNormalizeTriggerConfig(config);
            if (!validation.valid) {
              return { success: false, error: validation.issues.join(' ') };
            }

            // Fetch latest version for optimistic locking
            const current = await db.query.baleybots.findFirst({
              where: eq(baleybots.id, baleybotId),
            });
            if (!current) return { success: false, error: 'BaleyBot not found' };

            await updateWithLock(baleybots, baleybotId, current.version, {
              updatedAt: new Date(),
            });

            // Clean up existing triggers
            await db.delete(baleybotTriggers)
              .where(and(
                eq(baleybotTriggers.targetBaleybotId, baleybotId),
                eq(baleybotTriggers.workspaceId, workspace.id),
              ));

            // Create new trigger
            if (validation.normalized) {
              const normalized = validation.normalized;
              await db.insert(baleybotTriggers).values({
                id: crypto.randomUUID(),
                sourceBaleybotId: normalized.type === 'other_bb' && normalized.sourceBaleybotId
                  ? normalized.sourceBaleybotId
                  : baleybotId,
                targetBaleybotId: baleybotId,
                triggerType: normalized.type === 'other_bb'
                  ? normalized.completionType ?? 'completion'
                  : normalized.type,
                workspaceId: workspace.id,
                enabled: normalized.enabled ?? true,
                staticInput: normalized,
              });
            }

            // Emit SSE event so client can update its state
            sendEvent({
              type: 'integration_trigger_saved',
              triggerConfig: validation.normalized ?? config,
              timestamp: Date.now(),
            });

            return {
              success: true,
              triggerType,
              message: `Trigger configuration saved: ${triggerType}`,
            };
          },
        });

        // enable_webhook — sets webhookEnabled=true and generates a webhookSecret
        injectedTools.set('enable_webhook', {
          name: 'enable_webhook',
          description: 'Enable the webhook endpoint for this BaleyBot and generate a webhook secret. Call this when setting up webhook integration.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
          category: 'integration',
          dangerLevel: 'moderate',
          function: async () => {
            const secret = crypto.randomUUID();

            const current = await db.query.baleybots.findFirst({
              where: eq(baleybots.id, baleybotId),
            });
            if (!current) return { success: false, error: 'BaleyBot not found' };

            await updateWithLock(baleybots, baleybotId, current.version, {
              webhookEnabled: true,
              webhookSecret: secret,
              updatedAt: new Date(),
            });

            // Build the webhook URL
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
              ? `https://${process.env.VERCEL_URL}`
              : 'http://localhost:3000';
            const webhookUrl = `${baseUrl}/api/webhooks/baleybots/${workspace.id}/${baleybotId}`;

            // Emit SSE event so client can display the secret
            sendEvent({
              type: 'integration_webhook_enabled',
              webhookUrl,
              webhookSecret: secret,
              timestamp: Date.now(),
            });

            return {
              success: true,
              webhookUrl,
              webhookSecret: secret,
              message: `Webhook enabled. URL: ${webhookUrl}. Secret: ${secret}`,
            };
          },
        });

        try {
          const { output } = await executeInternalBaleybot(
            'integration_builder',
            contextParts,
            {
              userWorkspaceId: workspace.id,
              triggeredBy: 'internal',
              injectedTools,
              onSegment: (segment) => {
                // Forward text deltas to the client
                const s = segment as Record<string, unknown>;
                if (s.type === 'text_delta' && typeof s.content === 'string') {
                  sendEvent({
                    type: 'integration_text_delta',
                    content: s.content,
                    timestamp: Date.now(),
                  });
                }
                // Forward tool execution events (spawn_baleybot results, save_trigger_config, enable_webhook)
                if (s.type === 'tool_execution_output') {
                  sendEvent({
                    type: 'integration_agent_event',
                    toolName: s.toolName,
                    result: s.result,
                    timestamp: Date.now(),
                  });
                }
              },
            }
          );

          sendEvent({
            type: 'integration_complete',
            output: typeof output === 'string' ? output : JSON.stringify(output),
            timestamp: Date.now(),
          });

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          const rawMessage =
            error instanceof Error ? error.message : 'Integration stream failed';
          log.error('integrate stream processing failed', {
            baleybotId,
            error: rawMessage,
          });
          sendEvent({
            type: 'integration_error',
            message: rawMessage.slice(0, 500),
            timestamp: Date.now(),
          });
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } finally {
          clearInterval(heartbeat);
        }
      },
      cancel() {
        // no-op
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
    log.error('integrate stream route failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return apiErrors.internal(error, { requestId });
  }
}
