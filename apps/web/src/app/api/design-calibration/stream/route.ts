/**
 * Design Calibration Stream API Route
 *
 * SSE endpoint that runs Baley with design-specific context and injected tools
 * (set_design_package, save_design_package). Baley orchestrates the design BBs
 * (analyzer, generator, refiner) conversationally via spawn_baleybot.
 */

import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db, designPackages } from '@baleyui/db';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';
import { apiErrors } from '@/lib/api/error-response';
import { getAuthenticatedWorkspace } from '@/lib/auth/workspace-lookup';
import { executeInternalBaleybot, type InternalExecutionOptions } from '@/lib/baleybot/internal-baleybots';
import type { RuntimeToolDefinition } from '@/lib/baleybot/executor';
import type { DesignPackageData } from '@/lib/design-packages/types';
import { MissingCredentialsError } from '@/lib/baleybot/services/ai-credentials-service';

const log = createLogger('design-calibration-stream');

const packageDataSchema = z.object({
  colors: z.object({
    light: z.record(z.string(), z.string()),
    dark: z.record(z.string(), z.string()),
  }),
  typography: z.object({
    fontFamily: z.string(),
    fontFamilyHeading: z.string().optional(),
    googleFontsUrl: z.string().optional(),
  }),
  borderRadius: z.string(),
  mood: z.string(),
  animationStyle: z.string(),
});

const requestBodySchema = z.object({
  message: z.string().min(1).max(10000),
  conversationHistory: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(['user', 'assistant']),
        content: z.string().max(50000),
        timestamp: z.number(),
      })
    )
    .max(100)
    .optional(),
  existingPackageData: packageDataSchema.optional(),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sanitizeStreamError(message: string): string {
  return message
    .replace(/postgres(ql)?:\/\/[^\s]+/gi, '[database-url]')
    .replace(/mysql:\/\/[^\s]+/gi, '[database-url]')
    .replace(/\/(?:Users|home|var|tmp|app|src)\/[^\s:]+/g, '[path]')
    .replace(/(?:sk|pk|key|token|secret|password)[-_]?[a-zA-Z0-9]{20,}/gi, '[redacted]')
    .replace(/ep-[a-z0-9-]+\.[\w.-]+neon\.tech/gi, '[database-host]')
    .replace(/(?<=[\s:=])[A-Za-z0-9+/]{40,}={0,2}(?=[\s\n]|$)/g, '[redacted]')
    .trim();
}

const DESIGN_CALIBRATION_CONTEXT = `You are in Design Calibration mode. Help the user create a design system for their brand.

Your workflow:
1. Ask what brand to design for (URL, description, or uploaded assets)
2. When the user provides a URL, spawn the design_analyzer to extract brand attributes:
   spawn_baleybot("design_analyzer", "Analyze [URL] — fetch with format:'html' to get CSS data")
3. Take the analyzer output and spawn design_generator to create a full design package:
   spawn_baleybot("design_generator", "Generate from: [analyzer output JSON]")
4. Call set_design_package(generatedData) to update the live preview
5. Ask what the user wants to change
6. For refinements, spawn design_refiner:
   spawn_baleybot("design_refiner", "Current: [packageData JSON]\\nFeedback: [user request]")
7. Call set_design_package(refinedData) to update the preview
8. When the user is happy, call save_design_package to persist it

You can also use web_search to find brand guidelines and fetch_url to examine websites.
Keep responses concise and conversational. Show enthusiasm when the design comes together.

IMPORTANT: When calling set_design_package, the data MUST be a complete DesignPackageData object with this exact shape:
{
  "colors": { "light": { "background": "HSL", "foreground": "HSL", ... }, "dark": { ... } },
  "typography": { "fontFamily": "string", "fontFamilyHeading": "string (optional)", "googleFontsUrl": "string (optional)" },
  "borderRadius": "string (e.g., 0.75rem)",
  "mood": "playful|professional|minimal|elegant|bold",
  "animationStyle": "playful|professional|minimal"
}
Color values must be HSL strings without the hsl() wrapper, e.g. "262 83% 58%".
Required color keys: background, foreground, card, cardForeground, primary, primaryForeground, secondary, secondaryForeground, muted, mutedForeground, accent, accentForeground, destructive, destructiveForeground, border, input, ring, success, warning, error, info.`;

export async function POST(req: NextRequest) {
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

    await checkRateLimit(
      `design:stream:${workspace.id}:${userId}`,
      RATE_LIMITS.creatorMessage
    );

    let input: z.infer<typeof requestBodySchema>;
    try {
      const raw = await req.json();
      input = requestBodySchema.parse(raw);
    } catch {
      return apiErrors.badRequest('Invalid request body for design calibration stream');
    }

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
          type: 'design_started',
          timestamp: Date.now(),
        });

        const heartbeat = setInterval(() => {
          if (Date.now() - lastEmitAt < 4000) return;
          sendEvent({
            type: 'text_delta',
            content: '',
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
          // Build conversation context for Baley
          const historyText = input.conversationHistory
            ?.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
            .join('\n\n') ?? '';

          const existingPackageContext = input.existingPackageData
            ? `\n\nCurrent design package data:\n${JSON.stringify(input.existingPackageData, null, 2)}`
            : '';

          const fullInput = [
            historyText ? `Previous conversation:\n${historyText}\n\n` : '',
            `User: ${input.message}`,
            existingPackageContext,
          ].filter(Boolean).join('');

          // Injected tools
          const injectedTools = new Map<string, RuntimeToolDefinition>();

          injectedTools.set('set_design_package', {
            name: 'set_design_package',
            description: 'Update the live design preview with a complete design package. Must include all required fields: colors (light + dark with all 21 color keys), typography, borderRadius, mood, animationStyle.',
            inputSchema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  description: 'Complete DesignPackageData object',
                },
              },
              required: ['data'],
            },
            function: async (args: Record<string, unknown>) => {
              try {
                const parsed = packageDataSchema.parse(args.data);
                sendEvent({
                  type: 'design_preview_update',
                  data: parsed,
                  timestamp: Date.now(),
                });
                return { success: true, message: 'Design preview updated' };
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Invalid package data';
                return { success: false, error: msg };
              }
            },
          });

          injectedTools.set('save_design_package', {
            name: 'save_design_package',
            description: 'Save the current design package to the workspace database',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Package name' },
                description: { type: 'string', description: 'Package description' },
                packageData: { type: 'object', description: 'Complete DesignPackageData' },
                isDefault: { type: 'boolean', description: 'Set as workspace default' },
              },
              required: ['name', 'packageData'],
            },
            function: async (args: Record<string, unknown>) => {
              try {
                const packageData = packageDataSchema.parse(args.packageData);

                const [pkg] = await db
                  .insert(designPackages)
                  .values({
                    workspaceId: workspace.id,
                    name: String(args.name),
                    description: args.description ? String(args.description) : null,
                    packageData: packageData as unknown as DesignPackageData,
                    sourceType: 'ai_generated',
                    isDefault: Boolean(args.isDefault),
                    createdBy: userId,
                    updatedBy: userId,
                  })
                  .returning();

                if (!pkg) {
                  return { success: false, error: 'Failed to save design package' };
                }

                sendEvent({
                  type: 'design_saved',
                  packageId: pkg.id,
                  timestamp: Date.now(),
                });

                return { success: true, packageId: pkg.id, message: 'Design package saved' };
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Failed to save';
                return { success: false, error: msg };
              }
            },
          });

          const executionOptions: InternalExecutionOptions = {
            injectedTools,
            onSegment: (event) => {
              sendEvent(event as unknown as Record<string, unknown>);
            },
            signal: AbortSignal.timeout(300_000),
            userWorkspaceId: workspace.id,
            context: DESIGN_CALIBRATION_CONTEXT,
          };

          await executeInternalBaleybot('baley', fullInput, executionOptions);

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          clearInterval(heartbeat);
          controller.close();
        } catch (error) {
          const rawMessage =
            error instanceof Error ? error.message : 'Design calibration stream failed';
          log.error('design calibration stream failed', {
            workspaceId: workspace.id,
            error: rawMessage,
          });

          if (error instanceof MissingCredentialsError) {
            sendEvent({
              type: 'design_error',
              message: 'No AI provider connected. Go to Integrations to add your API key.',
              timestamp: Date.now(),
            });
          } else {
            sendEvent({
              type: 'design_error',
              message: sanitizeStreamError(rawMessage),
              timestamp: Date.now(),
            });
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          clearInterval(heartbeat);
          controller.close();
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
    log.error('design calibration stream route failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return apiErrors.internal(error, { requestId });
  }
}
