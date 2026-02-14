/**
 * Design Calibration Stream API Route
 *
 * SSE endpoint that runs Baley with design-specific context and injected tools
 * (set_design_package, save_design_package, analyze_brand_asset). Baley orchestrates
 * the design BBs (analyzer, generator, refiner) conversationally via spawn_baleybot.
 */

import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db, designPackages, designPackageAssets, eq, and, isNull } from '@baleyui/db';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';
import { apiErrors } from '@/lib/api/error-response';
import { getAuthenticatedWorkspace } from '@/lib/auth/workspace-lookup';
import { executeInternalBaleybot, type InternalExecutionOptions } from '@/lib/baleybot/internal-baleybots';
import type { RuntimeToolDefinition } from '@/lib/baleybot/executor';
import type { DesignPackageData } from '@/lib/design-packages/types';
import { generateTailwindTheme } from '@/lib/design-packages/tailwind-theme';
import { DEFAULT_COMPONENT_SET } from '@/lib/design-packages/component-registry';
import { formatDesignBrief } from '@/lib/design-packages/component-registry';
import { MissingCredentialsError } from '@/lib/baleybot/services/ai-credentials-service';
import { inArray } from 'drizzle-orm';

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
  attachmentIds: z.array(z.string().uuid()).max(20).optional(),
  sessionId: z.string().max(255).optional(),
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const DESIGN_CALIBRATION_CONTEXT = `You are a design system creator. Turn the user's brand into a complete design package.

You have design_analyzer, design_generator, and design_refiner bots (via spawn_baleybot).
You also have fetch_url, web_search, set_design_package (live preview), save_design_package (persist), and analyze_brand_asset (vision analysis of uploaded files).

ADAPT TO THE USER:
- URL or detailed description -> generate immediately, don't ask clarifying questions
- Vague input ("make something cool") -> ask ONE focused question, then generate
- Preset selected -> acknowledge and ask what to change, don't regenerate from scratch
- Refinements -> use design_refiner, not design_generator
- Uploaded brand assets -> use analyze_brand_asset to inspect them before generating

If the user has uploaded brand assets, they are listed with IDs in the message.
Use analyze_brand_asset(assetId, focus) to have the design_analyzer BaleyBot inspect images/PDFs.
Always analyze uploaded assets before generating a design package from them.

WORKFLOW:
- spawn_baleybot("design_analyzer", "Analyze [URL] — fetch with format:'html' to get CSS data") to extract brand attributes
- spawn_baleybot("design_generator", "Generate from: [analyzer output JSON]") to create a full package
- spawn_baleybot("design_refiner", "Current: [packageData JSON]\\nFeedback: [user feedback]") for refinements
- Call set_design_package(data) after generating or refining to update the live preview
- Call save_design_package when the user is happy

RULES:
- Always call set_design_package() after generating or refining
- Color values: HSL without hsl() wrapper (e.g., "262 83% 58%")
- All 21 color keys required in both light and dark palettes: background, foreground, card, cardForeground, primary, primaryForeground, secondary, secondaryForeground, muted, mutedForeground, accent, accentForeground, destructive, destructiveForeground, border, input, ring, success, warning, error, info
- Keep messages SHORT (1-2 sentences). Let the preview do the talking
- Show enthusiasm when the design comes together

set_design_package data shape:
{
  "data": {
    "colors": { "light": { ...21 HSL keys... }, "dark": { ...21 HSL keys... } },
    "typography": { "fontFamily": "string", "fontFamilyHeading": "string (optional)", "googleFontsUrl": "string (optional)" },
    "borderRadius": "string (e.g., 0.75rem)",
    "mood": "playful|professional|minimal|elegant|bold",
    "animationStyle": "playful|professional|minimal"
  }
}`;

interface FetchedAsset {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  base64: string;
}

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
          // Fetch uploaded asset content if attachmentIds provided
          const uploadedAssets: FetchedAsset[] = [];
          if (input.attachmentIds && input.attachmentIds.length > 0) {
            const assetRows = await db.query.designPackageAssets.findMany({
              where: and(
                eq(designPackageAssets.workspaceId, workspace.id),
                inArray(designPackageAssets.id, input.attachmentIds),
              ),
            });

            for (const row of assetRows) {
              try {
                const response = await fetch(row.blobDownloadUrl);
                const buffer = await response.arrayBuffer();
                const base64 = Buffer.from(buffer).toString('base64');
                uploadedAssets.push({
                  id: row.id,
                  fileName: row.fileName,
                  mimeType: row.mimeType,
                  fileSize: row.fileSize,
                  base64,
                });
              } catch (err) {
                log.warn('Failed to fetch asset content', {
                  assetId: row.id,
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            }
          }

          // Build conversation context for Baley
          const historyText = input.conversationHistory
            ?.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
            .join('\n\n') ?? '';

          const existingPackageContext = input.existingPackageData
            ? `\n\nCurrent design package data:\n${JSON.stringify(input.existingPackageData, null, 2)}`
            : '';

          // Append uploaded asset context to the input
          const assetContext = uploadedAssets.length > 0
            ? '\n\nUploaded brand assets:\n' +
              uploadedAssets.map(a =>
                `- Asset ${a.id}: "${a.fileName}" (${a.mimeType}, ${formatFileSize(a.fileSize)})`
              ).join('\n') +
              '\nUse analyze_brand_asset to examine these files before generating.'
            : '';

          const fullInput = [
            historyText ? `Previous conversation:\n${historyText}\n\n` : '',
            `User: ${input.message}`,
            existingPackageContext,
            assetContext,
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

          // Inject analyze_brand_asset tool — delegates to design_analyzer BB with multimodal input
          if (uploadedAssets.length > 0) {
            injectedTools.set('analyze_brand_asset', {
              name: 'analyze_brand_asset',
              description: 'Analyze an uploaded brand asset (image or PDF) for design attributes using the design_analyzer BaleyBot. Returns colors, typography, mood, and brand identity.',
              inputSchema: {
                type: 'object',
                properties: {
                  assetId: { type: 'string', description: 'Asset ID from the uploaded files list' },
                  focus: {
                    type: 'string',
                    enum: ['colors', 'typography', 'mood', 'layout', 'full'],
                    description: 'What aspect to focus analysis on (default: full)',
                  },
                },
                required: ['assetId'],
              },
              function: async (args: Record<string, unknown>) => {
                const asset = uploadedAssets.find(a => a.id === String(args.assetId));
                if (!asset) return { error: 'Asset not found' };

                try {
                  const { output } = await executeInternalBaleybot(
                    'design_analyzer',
                    `Analyze this uploaded brand asset "${asset.fileName}" for design attributes. Focus: ${args.focus ?? 'full'}. Extract colors (HSL), typography, mood, and brand identity.`,
                    {
                      userWorkspaceId: workspace.id,
                      attachments: [{ data: asset.base64, mimeType: asset.mimeType }],
                      signal: AbortSignal.timeout(60_000),
                    }
                  );
                  return output;
                } catch (err) {
                  log.error('analyze_brand_asset failed', {
                    assetId: asset.id,
                    error: err instanceof Error ? err.message : String(err),
                  });
                  return { error: `Failed to analyze asset: ${err instanceof Error ? err.message : 'Unknown error'}` };
                }
              },
            });
          }

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

                // Generate Tailwind theme tokens deterministically
                const tailwindTheme = generateTailwindTheme(packageData as unknown as DesignPackageData);
                const enrichedData = {
                  ...packageData,
                  tailwindTheme,
                } as unknown as DesignPackageData;

                const [pkg] = await db
                  .insert(designPackages)
                  .values({
                    workspaceId: workspace.id,
                    name: String(args.name),
                    description: args.description ? String(args.description) : null,
                    packageData: enrichedData,
                    sourceType: 'ai_generated',
                    isDefault: true,
                    createdBy: userId,
                    updatedBy: userId,
                  })
                  .returning();

                if (!pkg) {
                  return { success: false, error: 'Failed to save design package' };
                }

                // Link uploaded assets to the saved package
                if (input.sessionId) {
                  await db.update(designPackageAssets)
                    .set({ designPackageId: pkg.id })
                    .where(and(
                      eq(designPackageAssets.workspaceId, workspace.id),
                      eq(designPackageAssets.sessionId, input.sessionId),
                      isNull(designPackageAssets.designPackageId),
                    ));
                }

                sendEvent({
                  type: 'design_saved',
                  packageId: pkg.id,
                  timestamp: Date.now(),
                });

                // Trigger component library generation in the background
                sendEvent({
                  type: 'component_generation_started',
                  timestamp: Date.now(),
                });

                // Build a design brief for the component generators
                const designBrief = formatDesignBrief(
                  String(args.name),
                  packageData as unknown as DesignPackageData,
                  tailwindTheme,
                );
                const componentList = DEFAULT_COMPONENT_SET
                  .map((cat) => `${cat.category}: ${cat.components.join(', ')}`)
                  .join('\n');

                const directorInput = [
                  'Generate a component library for this design system.',
                  '',
                  designBrief,
                  '',
                  '## Components to Generate',
                  componentList,
                ].join('\n');

                // Fire and forget — component generation runs in parallel
                executeInternalBaleybot('component_library_director', directorInput, {
                  userWorkspaceId: workspace.id,
                  onSegment: (event) => {
                    const evt = event as unknown as Record<string, unknown>;
                    // Forward relevant events to the client
                    if (evt.type === 'tool_execution_output') {
                      const result = evt.result as Record<string, unknown> | undefined;
                      if (result?.componentName) {
                        sendEvent({
                          type: 'component_registered',
                          component: result,
                          timestamp: Date.now(),
                        });
                      }
                    }
                  },
                  signal: AbortSignal.timeout(120_000),
                }).then(() => {
                  sendEvent({
                    type: 'component_generation_complete',
                    timestamp: Date.now(),
                  });
                }).catch((err) => {
                  log.error('Component generation failed', {
                    error: err instanceof Error ? err.message : String(err),
                  });
                  sendEvent({
                    type: 'component_generation_error',
                    message: 'Component generation failed — you can regenerate later',
                    timestamp: Date.now(),
                  });
                });

                return { success: true, packageId: pkg.id, message: 'Design package saved. Component library generation started.' };
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
