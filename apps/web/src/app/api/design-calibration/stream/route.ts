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
import {
  buildCompanionTools,
  type CompanionToolContext,
} from '@/lib/baleybot/tools/companion';
import type { DesignPackageData } from '@/lib/design-packages/types';
import { generateTailwindTheme } from '@/lib/design-packages/tailwind-theme';
import { DEFAULT_COMPONENT_SET } from '@/lib/design-packages/component-registry';
import { formatDesignBrief } from '@/lib/design-packages/component-registry';
import { MissingCredentialsError } from '@/lib/baleybot/services/ai-credentials-service';
import {
  runDesignAnalyzer,
  runDesignGenerator,
} from '@/lib/baleybot/internal-bb/runner';
import { normalizeOutputCandidate } from '@/lib/baleybot/internal-bb/contract-gateway';
import { inArray } from 'drizzle-orm';
import {
  designPackageDataInputSchema,
  ensureDesignPackageDataV2,
  type DesignPackageDataV2,
} from '@/lib/design-packages/schema';

const log = createLogger('design-calibration-stream');

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
  existingPackageData: designPackageDataInputSchema.optional(),
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

YOUR DESIGN BOTS (via spawn_baleybot):

design_analyzer — Read-only extraction. Reads source material (URLs, images, text) and outputs structured brand attributes (colors, typography, mood). It observes and reports — it cannot create or modify a design. Useful when you need to understand a brand from source material the user provides. Not useful once you already have a design and the user wants changes.

design_generator — Creates from scratch. Takes brand attributes or a description and synthesizes a complete design package (both light and dark palettes, typography, border radius, mood). Use when no design exists yet and you need to produce one.

design_refiner — Modifies an existing design. Takes the current design package + user feedback and produces an updated version that addresses the feedback while preserving coherence. This is how designs evolve — the user sees the preview, gives feedback, and the refiner applies those changes.

OTHER TOOLS:
- fetch_url, web_search — gather information
- set_design_package(data) — pushes a design to the live preview (call after generating or refining)
- save_design_package — persists the design to the database
- analyze_brand_asset(assetId, focus) — uses design_analyzer to inspect uploaded images/PDFs

COMMUNICATING WITH THE DESIGN BOTS:
- design_analyzer: "Analyze [URL] — fetch with format:'html' to get CSS data"
- design_generator: "Generate from: [attributes or description JSON]"
- design_refiner: "Current: [packageData JSON]\\nFeedback: [user feedback]"
- spawn_baleybot returns the child BB payload in result.output as structured JSON. Use it directly.

ADAPT TO THE USER:
- URL or detailed description -> generate immediately, don't ask clarifying questions
- Vague input ("make something cool") -> ask ONE focused question, then generate
- Preset selected -> acknowledge and ask what to change, don't regenerate from scratch
- Uploaded brand assets -> use analyze_brand_asset to inspect them before generating

FORMAT:
- Color values: HSL without hsl() wrapper (e.g., "262 83% 58%")
- All 21 color keys required in both light and dark palettes: background, foreground, card, cardForeground, primary, primaryForeground, secondary, secondaryForeground, muted, mutedForeground, accent, accentForeground, destructive, destructiveForeground, border, input, ring, success, warning, error, info
- Keep messages SHORT (1-2 sentences). Let the preview do the talking.
- Show enthusiasm when the design comes together.
- Call save_design_package when the user is happy.

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

interface DesignConcept {
  id: 'landing' | 'customerApp' | 'internalApp';
  title: string;
  summary: string;
  packageData: DesignPackageDataV2;
}

function evaluateDesignQuality(data: DesignPackageDataV2): {
  wcagPasses: number;
  wcagChecks: number;
  hasMotionSystem: boolean;
  hasLayoutSystem: boolean;
  hasBlueprints: boolean;
} {
  const checks: Array<[string, string]> = [
    [data.colors.light.foreground, data.colors.light.background],
    [data.colors.light.primaryForeground, data.colors.light.primary],
    [data.colors.dark.foreground, data.colors.dark.background],
    [data.colors.dark.primaryForeground, data.colors.dark.primary],
  ];

  let wcagPasses = 0;
  for (const [fg, bg] of checks) {
    const ratio = (() => {
      try {
        const [h1, s1, l1] = fg.split(' ');
        const [h2, s2, l2] = bg.split(' ');
        const toNum = (value: string | undefined, suffix = '') =>
          Number((value ?? '').replace(suffix, ''));
        const lighten = (h: number, s: number, l: number) => {
          const sNorm = s / 100;
          const lNorm = l / 100;
          const a = sNorm * Math.min(lNorm, 1 - lNorm);
          const f = (n: number) => {
            const k = (n + h / 30) % 12;
            return lNorm - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
          };
          const [r, g, b] = [f(0), f(8), f(4)];
          const linear = (c: number) =>
            c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
        };
        const lum1 = lighten(toNum(h1), toNum(s1, '%'), toNum(l1, '%'));
        const lum2 = lighten(toNum(h2), toNum(s2, '%'), toNum(l2, '%'));
        const lighter = Math.max(lum1, lum2);
        const darker = Math.min(lum1, lum2);
        return (lighter + 0.05) / (darker + 0.05);
      } catch {
        return 0;
      }
    })();

    if (ratio >= 4.5) {
      wcagPasses += 1;
    }
  }

  return {
    wcagPasses,
    wcagChecks: checks.length,
    hasMotionSystem: !!data.motionSystem,
    hasLayoutSystem: !!data.layoutSystem,
    hasBlueprints: !!data.surfaceBlueprints,
  };
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
        const spawnOutputs = new Map<string, unknown>();
        let previewUpdated = false;

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

          const generatedConcepts: DesignConcept[] = [];
          let conceptContext = '';
          if (!input.existingPackageData) {
            sendEvent({
              type: 'design_concepts_started',
              timestamp: Date.now(),
            });

            const conceptProfiles: Array<{
              id: DesignConcept['id'];
              title: string;
              guidance: string;
            }> = [
              {
                id: 'landing',
                title: 'Landing Concept',
                guidance: 'Bias for conversion-focused storytelling and clear CTA hierarchy.',
              },
              {
                id: 'customerApp',
                title: 'Customer App Concept',
                guidance: 'Bias for customer clarity, task completion, and low cognitive load.',
              },
              {
                id: 'internalApp',
                title: 'Internal App Concept',
                guidance: 'Bias for dense data operations and fast internal workflows.',
              },
            ];

            const conceptResults = await Promise.allSettled(
              conceptProfiles.map(async (profile) => {
                const generated = await runDesignGenerator(
                  [
                    'Generate a DesignPackageData V2 payload.',
                    `Surface focus: ${profile.id}`,
                    profile.guidance,
                    `User request: ${input.message}`,
                    uploadedAssets.length > 0
                      ? `Uploaded assets: ${uploadedAssets
                          .map((asset) => `${asset.fileName} (${asset.mimeType})`)
                          .join(', ')}`
                      : '',
                    historyText ? `Conversation context:\n${historyText}` : '',
                  ]
                    .filter(Boolean)
                    .join('\n\n'),
                  {
                    userWorkspaceId: workspace.id,
                    signal: AbortSignal.timeout(60_000),
                  }
                );

                const packageData = ensureDesignPackageDataV2(generated);
                const quality = evaluateDesignQuality(packageData);

                return {
                  id: profile.id,
                  title: profile.title,
                  summary:
                    `${profile.title} with ${quality.wcagPasses}/${quality.wcagChecks} WCAG checks passing`,
                  packageData,
                } satisfies DesignConcept;
              })
            );

            for (const result of conceptResults) {
              if (result.status === 'fulfilled') {
                generatedConcepts.push(result.value);
              }
            }

            if (generatedConcepts.length > 0) {
              sendEvent({
                type: 'design_concepts_update',
                concepts: generatedConcepts,
                timestamp: Date.now(),
              });

              conceptContext = [
                'Generated concept candidates (already validated):',
                ...generatedConcepts.map((concept) =>
                  `- ${concept.id}: ${concept.summary}`
                ),
                '',
                ...generatedConcepts.map((concept) =>
                  `${concept.title} (${concept.id}) package:\n${JSON.stringify(concept.packageData, null, 2)}`
                ),
                '',
                'Use these concepts as the baseline set. Compare them, synthesize the strongest parts, and refine according to user feedback.',
              ].join('\n');
            }
          }

          const fullInput = [
            historyText ? `Previous conversation:\n${historyText}\n\n` : '',
            `User: ${input.message}`,
            existingPackageContext,
            assetContext,
            conceptContext ? `\n\n${conceptContext}` : '',
          ]
            .filter(Boolean)
            .join('');

          // Build companion tools so Baley's BAL resolves all tool references
          const toolCtx: CompanionToolContext = {
            workspaceId: workspace.id,
            userId,
          };
          const injectedTools = new Map<string, RuntimeToolDefinition>(buildCompanionTools(toolCtx));

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
                const parsed = ensureDesignPackageDataV2(args.data);
                previewUpdated = true;
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
                  const output = await runDesignAnalyzer(
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
                const packageData = ensureDesignPackageDataV2(args.packageData);

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
            _spawnOutputs: spawnOutputs,
          };

          await executeInternalBaleybot('baley', fullInput, executionOptions);

          // Robust fallback: if delegation succeeded but Baley didn't call
          // set_design_package, apply the latest specialist output directly.
          if (!previewUpdated) {
            const fallbackRaw =
              spawnOutputs.get('design_refiner') ??
              spawnOutputs.get('design_generator') ??
              generatedConcepts[0]?.packageData;
            const normalizedFallback = normalizeOutputCandidate(fallbackRaw);

            if (normalizedFallback && typeof normalizedFallback === 'object') {
              const parsedFallback = (() => {
                try {
                  return ensureDesignPackageDataV2(normalizedFallback);
                } catch {
                  return null;
                }
              })();
              if (parsedFallback) {
                sendEvent({
                  type: 'design_preview_update',
                  data: parsedFallback,
                  timestamp: Date.now(),
                });
                log.info('Applied fallback design preview from specialist output', {
                  workspaceId: workspace.id,
                  source: spawnOutputs.has('design_refiner')
                    ? 'design_refiner'
                    : 'design_generator',
                });
              } else {
                log.warn('Specialist output could not be parsed as design package', {
                  workspaceId: workspace.id,
                  normalizedType: typeof normalizedFallback,
                });
              }
            }
          }

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
