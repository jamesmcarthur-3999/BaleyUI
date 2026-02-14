/**
 * Unified Baley Stream API Route
 *
 * SSE endpoint that replaces both `/api/companion/stream` (general companion)
 * and `/api/baleybots/creator/stream` (creator mode).
 *
 * Mode detection: when `creatorContext` is present in the request body, the
 * route runs in creator mode. Otherwise, it runs as the general companion.
 *
 * Channel 1 (stream_event): Every raw BaleybotStreamEvent is wrapped as a
 * ServerStreamEvent-shaped object and forwarded to the client. The client
 * feeds these into `streamReducer` via `dispatch({ type: 'PROCESS_EVENT', event })`.
 *
 * Channel 2 (application events): Higher-level events such as `complete`,
 * `error`, `heartbeat`, and creator-specific events like `creator_complete`,
 * `creator_connection_action`, etc.
 */

import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
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
import { buildConnectionTools } from '@/lib/baleybot/tools/companion/connections';
import { buildIntegrationTools } from '@/lib/baleybot/tools/companion/integration';
import {
  buildCreatorRequestContext,
  type CreatorConversationHistoryInput,
} from '@/lib/baleybot/creator-request-context';
import type { CreatorOutput } from '@/lib/baleybot/creator-types';
import { creatorOutputSchema } from '@/lib/baleybot/creator-types';
import type { TriggerConfig } from '@/lib/baleybot/types';
import type { BaleybotStreamEvent } from '@baleybots/core';
import type { RuntimeToolDefinition } from '@/lib/baleybot/executor';
import { normalizeOutputCandidate } from '@/lib/baleybot/internal-bb/runner';
import { MissingCredentialsError } from '@/lib/baleybot/services/ai-credentials-service';
import { reportPlatformError } from '@/lib/platform-bugs/report';
import { getPageInfo } from '@/lib/routes';

const log = createLogger('baley-stream');

// ============================================================================
// REQUEST SCHEMA
// ============================================================================

const baleyStreamBodySchema = z
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
        pendingActions: z
          .object({
            total: z.number(),
            critical: z.number(),
          })
          .optional(),
      })
      .optional(),
    // File attachments (images, PDFs uploaded via /api/uploads)
    attachments: z
      .array(
        z.object({
          fileName: z.string(),
          mimeType: z.string(),
          downloadUrl: z.string().url(),
        })
      )
      .max(5)
      .optional(),
    // Creator mode fields (presence = creator mode)
    creatorContext: z
      .object({
        baleybotId: z.string().uuid().optional(),
        currentState: z
          .object({
            balCode: z.string().max(50000),
            name: z.string().max(200).optional(),
            description: z.string().max(2000).optional(),
            icon: z.string().max(10).optional(),
            entities: z
              .array(
                z.object({
                  name: z.string(),
                  purpose: z.string().optional(),
                  tools: z.array(z.string()).optional(),
                })
              )
              .max(50)
              .optional(),
          })
          .optional(),
        uiState: z
          .object({
            activeTab: z.string(),
            availableTabs: z.array(z.string()),
            lifecycleStage: z.string(),
            readinessSummary: z.string(),
            triggerConfigured: z.boolean(),
            webhookEnabled: z.boolean(),
          })
          .optional(),
      })
      .optional(),
  })
  .strict();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ============================================================================
// HELPERS
// ============================================================================

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

/** Connection tool names for detecting connection-related tool outputs. */
const CONNECTION_TOOL_NAMES = new Set([
  'list_connections',
  'test_connection',
  'set_default_connection',
  'create_connection',
  'delete_connection',
]);

/**
 * Map a raw entity from bal_generator output to match the creatorEntitySchema shape.
 * Maps a raw entity from bal_generator output to the creatorEntitySchema shape.
 */
function mapEntity(raw: Record<string, unknown>): {
  id: string;
  name: string;
  icon: string;
  purpose: string;
  tools: string[];
} {
  return {
    id: String(raw.id ?? raw.name ?? crypto.randomUUID()),
    name: String(raw.name ?? 'Unnamed Entity'),
    icon: String(raw.icon ?? '\u{1F916}'),
    purpose: String(raw.purpose ?? raw.goal ?? raw.description ?? ''),
    tools: Array.isArray(raw.tools) ? raw.tools.map(String) : [],
  };
}

/**
 * Find generator result by name, falling back to shape-based detection.
 */
function findGeneratorResult(spawnResults: Map<string, unknown>): unknown | null {
  const byName = spawnResults.get('bal_generator');
  if (byName) return byName;

  for (const result of spawnResults.values()) {
    const normalized = normalizeOutputCandidate(result);
    if (normalized && typeof normalized === 'object' && 'balCode' in normalized) {
      return result;
    }
  }
  return null;
}

/**
 * Build a CreatorOutput from the conversational text and any spawn results.
 */
function buildCreatorOutput(
  text: string,
  spawnResults: Map<string, unknown>,
): CreatorOutput {
  const balGenResult = findGeneratorResult(spawnResults);

  if (balGenResult && typeof balGenResult === 'object') {
    const gen = (normalizeOutputCandidate(balGenResult) ?? {}) as Record<string, unknown>;

    const candidate = {
      status: 'ready' as const,
      message: text,
      entities: Array.isArray(gen.entities)
        ? (gen.entities as Array<Record<string, unknown>>).map(mapEntity)
        : [],
      connections: [],
      balCode: String(gen.balCode ?? ''),
      name: String(gen.suggestedName ?? gen.name ?? 'Unnamed BaleyBot'),
      description: String(gen.explanation ?? gen.description ?? ''),
      icon: String(gen.suggestedIcon ?? gen.icon ?? '\u{1F916}'),
    };

    const parsed = creatorOutputSchema.safeParse(candidate);
    if (parsed.success) {
      return parsed.data;
    }

    log.warn('buildCreatorOutput validation failed, falling back to building', {
      issues: parsed.error.issues.slice(0, 3),
    });

    return {
      status: 'building' as const,
      message: text,
      entities: [],
      connections: [],
      balCode: '',
      name: String(gen.suggestedName ?? gen.name ?? 'Unnamed BaleyBot'),
      description: '',
      icon: '\u{1F916}',
    };
  }

  // Conversation-only turn (no spawn)
  return {
    status: 'building',
    message: text,
    entities: [],
    connections: [],
    balCode: '',
    name: 'Unnamed BaleyBot',
    description: '',
    icon: '\u{1F916}',
  };
}

/** Build a compact summary string from a CreatorOutput. */
function compactSummary(output: CreatorOutput): string {
  if (output.status === 'building') {
    return 'Gathering more details before building.';
  }

  const entityCount = output.entities.length;
  const toolCount = output.entities.reduce(
    (sum, entity) => sum + entity.tools.length,
    0
  );
  const parts = [
    `Built ${output.name} with ${entityCount} ${entityCount === 1 ? 'entity' : 'entities'}`,
  ];
  if (toolCount > 0) {
    parts.push(`using ${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}`);
  }
  return `${parts.join(' ')}.`;
}

// ============================================================================
// SPECIALIST FINDINGS
// ============================================================================

interface SpecialistFindings {
  connections: unknown | null;
  tests: unknown | null;
  deployment: unknown | null;
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') ?? undefined;

  try {
    // 1. Auth + workspace
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id ?? null;
    if (!userId) {
      return apiErrors.unauthorized();
    }

    const workspace = await getAuthenticatedWorkspace(userId);
    if (!workspace) {
      return apiErrors.notFound('Workspace');
    }

    // 2. Parse request body + detect mode
    let input: z.infer<typeof baleyStreamBodySchema>;
    try {
      const raw = await req.json();
      input = baleyStreamBodySchema.parse(raw);
    } catch {
      return apiErrors.badRequest('Invalid request body');
    }

    const isCreatorMode = !!input.creatorContext;

    // Rate limit
    const rateLimitKey = isCreatorMode
      ? `creator:stream:${workspace.id}:${userId}`
      : `companion:stream:${workspace.id}:${userId}`;
    await checkRateLimit(rateLimitKey, RATE_LIMITS.creatorMessage);

    // 3. Build tools
    const toolCtx: CompanionToolContext = {
      workspaceId: workspace.id,
      userId,
    };
    const companionTools = buildCompanionTools(toolCtx);

    // allTools starts with companion tools; creator tools are merged on top
    const allTools = new Map<string, RuntimeToolDefinition>(companionTools);

    // SSE event send helper (created inside ReadableStream.start but we
    // declare the callback reference here for use in tool builders)
    let sendEvent: (event: Record<string, unknown>) => void = () => {};

    // For creator mode, build and merge creator-specific tools
    if (isCreatorMode) {
      const connectionTools = buildConnectionTools(toolCtx);
      for (const [k, v] of connectionTools) allTools.set(k, v);

      // Integration tools are only available when the bot has been saved
      if (input.creatorContext!.baleybotId) {
        const integrationTools = buildIntegrationTools({
          workspaceId: workspace.id,
          baleybotId: input.creatorContext!.baleybotId,
          onTriggerSaved: (config: TriggerConfig) =>
            sendEvent({
              type: 'creator_trigger_saved',
              triggerConfig: config,
              timestamp: Date.now(),
            }),
          onWebhookEnabled: (url: string, secret: string) =>
            sendEvent({
              type: 'creator_webhook_enabled',
              webhookUrl: url,
              webhookSecret: secret,
              timestamp: Date.now(),
            }),
        });
        for (const [k, v] of integrationTools) allTools.set(k, v);
      }
    }

    // 4. Build context string
    const contextParts: string[] = [];

    // Always include page context + health summary
    if (input.context?.currentPage) {
      const pageInfo = getPageInfo(input.context.currentPage);
      if (pageInfo) {
        contextParts.push([
          `Current page: ${pageInfo.label} (${input.context.currentPage})`,
          `What's here: ${pageInfo.description}`,
          `You can help with: ${pageInfo.baleyHints.join('; ')}`,
        ].join('\n'));
      } else {
        contextParts.push(`User is currently on page: ${input.context.currentPage}`);
      }
    }
    if (input.context?.healthSummary) {
      contextParts.push(`Workspace health: ${input.context.healthSummary}`);
    }
    if (input.context?.pendingActions) {
      contextParts.push(
        `Pending actions: ${input.context.pendingActions.total} total, ${input.context.pendingActions.critical} critical`
      );
    }

    // Conversation history
    if (input.conversationHistory && input.conversationHistory.length > 0) {
      const historyStr = input.conversationHistory
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');
      contextParts.push(`Conversation so far:\n${historyStr}`);
    }

    // Creator mode: enrich context with creator-specific data
    let creatorRequestContext: Awaited<ReturnType<typeof buildCreatorRequestContext>> | null = null;
    if (isCreatorMode) {
      // Build creator request context (DB queries for workspace connections, bots, tools)
      creatorRequestContext = await buildCreatorRequestContext({
        db,
        workspaceId: workspace.id,
        message: input.message,
        // Map the simple conversation history to CreatorConversationHistoryInput format
        conversationHistory: input.conversationHistory?.map((m, i) => ({
          id: `msg-${i}`,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        })) as CreatorConversationHistoryInput[] | undefined,
      });

      // Add creator workspace context
      const ctx = creatorRequestContext.context;
      if (ctx.availableTools.length > 0) {
        const toolNames = ctx.availableTools.map((t) => t.name).join(', ');
        contextParts.push(`Available tools: ${toolNames}`);
      }
      if (ctx.connections.length > 0) {
        const connSummary = ctx.connections
          .map((c) => `${c.name} [id:${c.id}] (${c.type}: ${c.status})`)
          .join(', ');
        contextParts.push(`Connections: ${connSummary}`);
      }
      if (ctx.existingBaleybots.length > 0) {
        const bbSummary = ctx.existingBaleybots
          .slice(0, 12)
          .map((b) => `${b.name}: ${b.description ?? 'no description'}`)
          .join('; ');
        contextParts.push(`Existing bots: ${bbSummary}`);
      }

      // Current builder state
      if (input.creatorContext!.currentState?.balCode) {
        const s = input.creatorContext!.currentState!;
        const stateLines = [`Current BaleyBot: ${s.name ?? 'Unnamed'}`];
        if (s.entities?.length) {
          stateLines.push(`Entities: ${s.entities.map((e) => e.name).join(', ')}`);
        }
        stateLines.push(`Current BAL code:\n\`\`\`\n${s.balCode}\n\`\`\``);
        contextParts.push(stateLines.join('\n'));
      }

      // UI state awareness
      if (input.creatorContext!.uiState) {
        const ui = input.creatorContext!.uiState!;
        const uiLines = [
          'UI State:',
          `- User is currently viewing: [${ui.activeTab} tab]`,
          `- Available tabs: ${ui.availableTabs.join(', ')}`,
          `- Lifecycle stage: ${ui.lifecycleStage}`,
          `- Readiness: ${ui.readinessSummary}`,
          `- Trigger: ${ui.triggerConfigured ? 'configured' : 'not configured'}`,
          `- Webhook: ${ui.webhookEnabled ? 'enabled' : 'not enabled'}`,
          '- You can use navigate_tab, show_surface, or present_plan to guide the user to relevant content or present a bot plan.',
        ];
        contextParts.push(uiLines.join('\n'));
      }
    }

    const fullContext = contextParts.length > 0 ? contextParts.join('\n\n') : undefined;

    // Determine the message to send to the BB
    // In creator mode, use the sanitized message from the creator request context
    const messageForBB = creatorRequestContext
      ? creatorRequestContext.sanitizedMessage
      : input.message;

    // Track tool actions for conversation logging
    const actionsTaken: Array<{
      tool: string;
      args: Record<string, unknown>;
      result: string;
      timestamp: string;
    }> = [];

    const encoder = new TextEncoder();

    // 5. Build the SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        let lastEmitAt = Date.now();

        // Wire up the sendEvent reference that creator tool builders captured
        sendEvent = (event: Record<string, unknown>) => {
          lastEmitAt = Date.now();
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        };

        // Heartbeat
        const heartbeat = setInterval(() => {
          if (Date.now() - lastEmitAt < 4000) return;
          sendEvent({
            type: 'heartbeat',
            timestamp: Date.now(),
          });
        }, 2000);

        // Abort handling
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

        // Creator mode spawn tracking
        let accumulatedText = '';
        const spawnResults = new Map<string, unknown>();
        const pendingSpawnNames = new Map<string, string>();
        // Side channel: spawn_baleybot stores full output here before summarizing
        const spawnOutputs = new Map<string, unknown>();

        try {
          // Fetch uploaded attachments and convert to base64 for multimodal input
          const fetchedAttachments: Array<{ data: string; mimeType: string }> = [];
          if (input.attachments && input.attachments.length > 0) {
            const MAX_ATTACHMENT_FETCH_SIZE = 10 * 1024 * 1024; // 10MB
            for (const att of input.attachments) {
              try {
                // Validate URL points to Vercel Blob storage to prevent SSRF
                const parsedUrl = new URL(att.downloadUrl);
                if (
                  !parsedUrl.hostname.endsWith('.public.blob.vercel-storage.com') &&
                  !parsedUrl.hostname.endsWith('.vercel-storage.com')
                ) {
                  log.warn('Rejected non-blob download URL', { url: att.downloadUrl, fileName: att.fileName });
                  continue;
                }

                const response = await fetch(att.downloadUrl, {
                  signal: AbortSignal.timeout(30_000), // 30s timeout
                });
                const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);
                if (contentLength > MAX_ATTACHMENT_FETCH_SIZE) {
                  log.warn('Attachment too large for processing', { fileName: att.fileName, size: contentLength });
                  continue;
                }
                const buffer = await response.arrayBuffer();
                if (buffer.byteLength > MAX_ATTACHMENT_FETCH_SIZE) {
                  log.warn('Attachment exceeded size limit', { fileName: att.fileName, size: buffer.byteLength });
                  continue;
                }
                const base64 = Buffer.from(buffer).toString('base64');
                fetchedAttachments.push({
                  data: base64,
                  mimeType: att.mimeType,
                });
              } catch (err) {
                log.warn('Failed to fetch attachment', {
                  fileName: att.fileName,
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            }
          }

          const { output, executionId } = await executeInternalBaleybot(
            'baley',
            messageForBB,
            {
              userWorkspaceId: workspace.id,
              context: fullContext,
              injectedTools: allTools,
              triggeredBy: 'internal',
              signal: req.signal,
              attachments: fetchedAttachments.length > 0 ? fetchedAttachments : undefined,
              _spawnOutputs: spawnOutputs,
              onSegment: (segment: BaleybotStreamEvent) => {
                // --------------------------------------------------------
                // Channel 1: Wrap every event as stream_event
                // --------------------------------------------------------
                sendEvent({
                  type: 'stream_event',
                  botId: 'baley',
                  botName: 'Baley',
                  event: segment,
                  timestamp: Date.now(),
                });

                // --------------------------------------------------------
                // Creator mode: additional tracking
                // --------------------------------------------------------
                if (isCreatorMode) {
                  // Accumulate text for CreatorOutput
                  if (segment.type === 'text_delta') {
                    accumulatedText += String(
                      (segment as Record<string, unknown>).content ?? ''
                    );
                  }

                  // Track spawn names by tool call ID
                  if (segment.type === 'tool_call_stream_complete') {
                    const e = segment as Record<string, unknown>;
                    if (e.toolName === 'spawn_baleybot') {
                      const toolCallId = String(e.id ?? '');
                      let rawArgs = e.arguments as
                        | Record<string, unknown>
                        | string
                        | undefined;
                      if (typeof rawArgs === 'string') {
                        try {
                          rawArgs = JSON.parse(rawArgs) as Record<string, unknown>;
                        } catch {
                          rawArgs = undefined;
                        }
                      }
                      if (rawArgs && typeof rawArgs === 'object' && toolCallId) {
                        const botName = String(
                          rawArgs.baleybot ??
                            rawArgs.baleybotIdOrName ??
                            rawArgs.name ??
                            ''
                        );
                        if (botName) {
                          pendingSpawnNames.set(toolCallId, botName);
                        }
                      }
                    }
                  }

                  // Capture spawn results and connection tool events
                  if (segment.type === 'tool_execution_output') {
                    const e = segment as Record<string, unknown>;
                    const toolName = String(e.toolName ?? '');

                    if (toolName === 'spawn_baleybot' && e.result) {
                      const toolCallId = String(e.id ?? '');
                      const botName = pendingSpawnNames.get(toolCallId);
                      if (botName) {
                        const result = e.result as { output?: unknown };
                        if (result.output) {
                          spawnResults.set(botName, result.output);
                        }
                        pendingSpawnNames.delete(toolCallId);
                      }
                    }

                    // Connection tool events -> emit as visual action cards
                    if (CONNECTION_TOOL_NAMES.has(toolName)) {
                      sendEvent({
                        type: 'creator_connection_action',
                        action: toolName,
                        result: (e.result ?? {}) as Record<string, unknown>,
                        timestamp: Date.now(),
                      });
                    }
                  }
                }

                // Track tool actions for conversation logging (both modes)
                if (segment.type === 'tool_execution_output') {
                  const seg = segment as Record<string, unknown>;
                  actionsTaken.push({
                    tool: seg.toolName as string,
                    args: (seg.arguments ?? {}) as Record<string, unknown>,
                    result: JSON.stringify(seg.result ?? seg.error ?? '').substring(
                      0,
                      500
                    ),
                    timestamp: new Date().toISOString(),
                  });
                }
              },
            }
          );

          // --------------------------------------------------------
          // 6. On completion
          // --------------------------------------------------------

          const outputStr =
            typeof output === 'string' ? output : JSON.stringify(output);

          // Channel 2: complete event
          sendEvent({
            type: 'complete',
            executionId,
            output: outputStr,
            timestamp: Date.now(),
          });

          // Creator mode: build CreatorOutput and emit creator_complete
          if (isCreatorMode) {
            // Merge side-channel data (full structured output) into spawnResults
            // Side channel always wins — it has the original structured output before summarization
            for (const [k, v] of spawnOutputs) {
              spawnResults.set(k, v);
            }

            const creatorOutput = buildCreatorOutput(accumulatedText, spawnResults);

            const specialistFindings: SpecialistFindings = {
              connections:
                normalizeOutputCandidate(spawnResults.get('connection_advisor')) ??
                null,
              tests:
                normalizeOutputCandidate(spawnResults.get('test_orchestrator')) ??
                null,
              deployment:
                normalizeOutputCandidate(spawnResults.get('deployment_advisor')) ??
                null,
            };

            sendEvent({
              type: 'creator_complete',
              result: creatorOutput,
              summary: compactSummary(creatorOutput),
              specialist: specialistFindings,
              timestamp: Date.now(),
            });
          }

          // Log conversation to companionConversations table
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
                content: outputStr,
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
            log.error('Failed to log conversation', {
              error: logErr instanceof Error ? logErr.message : String(logErr),
            });
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          clearInterval(heartbeat);
          controller.close();
        } catch (error) {
          const rawMessage =
            error instanceof Error ? error.message : 'Stream failed';
          log.error('baley stream processing failed', {
            workspaceId: workspace.id,
            isCreatorMode,
            error: rawMessage,
          });

          if (error instanceof MissingCredentialsError) {
            sendEvent({
              type: 'error',
              message:
                'No AI provider connected. Go to Integrations \u2192 Connections to add your OpenAI or Anthropic API key.',
              actionUrl: '/dashboard/capabilities/connections',
              actionLabel: 'Set Up AI Provider',
              timestamp: Date.now(),
            });
          } else {
            sendEvent({
              type: 'error',
              message: sanitizeStreamError(rawMessage),
              timestamp: Date.now(),
            });

            // Report platform bugs (not user errors)
            reportPlatformError({
              errorMessage: rawMessage,
              stackTrace: error instanceof Error ? error.stack : undefined,
              source: 'streaming',
              category: 'streaming_error',
              route: '/api/baley/stream',
              workspaceId: workspace.id,
              environment: process.env.NODE_ENV ?? 'production',
            }).catch(() => {});
          }

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
    log.error('baley stream route failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return apiErrors.internal(error, { requestId });
  }
}
