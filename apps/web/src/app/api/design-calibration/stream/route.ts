/**
 * Design Calibration Stream API Route
 *
 * SSE endpoint for AI-led design calibration with:
 * - Comprehensive brand dossier ingestion
 * - Three-direction concept generation
 * - Deterministic quality audit + repair loop
 * - Baley orchestration with design tools for iterative refinement
 */

import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db, designPackages, designPackageAssets, eq, and, isNull } from '@baleyui/db';
import { inArray } from 'drizzle-orm';
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
  runDesignRefiner,
  runDesignDossierSynthesizer,
  type DesignAnalyzerOutput,
} from '@/lib/baleybot/internal-bb/runner';
import { normalizeOutputCandidate } from '@/lib/baleybot/internal-bb/contract-gateway';
import {
  designPackageDataInputSchema,
  ensureDesignPackageDataV2,
  type DesignPackageDataV2,
} from '@/lib/design-packages/schema';
import {
  buildBrandDossier,
  type BrandDossierSignalInput,
  type BrandDossierSourceInput,
} from '@/lib/design-packages/brand-dossier';
import {
  auditDesignPackageQuality,
  buildGenerationReport,
  passesQualityGate,
  type QualityAuditResult,
} from '@/lib/design-packages/quality-audit';

const log = createLogger('design-calibration-stream');

const controlsSchema = z.object({
  brandAlignment: z.number().min(40).max(100),
  contrastTarget: z.enum(['aa', 'aaa']),
  layoutDensity: z.enum(['compact', 'comfortable', 'spacious']),
  motionIntensity: z.enum(['subtle', 'moderate', 'expressive']),
  voiceTone: z.string().min(1).max(120),
});

type DesignCalibrationControls = z.infer<typeof controlsSchema>;

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
  controls: controlsSchema.optional(),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface FetchedAsset {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  base64: string;
}

type DesignDirectionId = 'directionA' | 'directionB' | 'directionC';

interface DirectionConcept {
  id: DesignDirectionId;
  title: string;
  summary: string;
  score: number;
  rationale: string;
  packageData: DesignPackageDataV2;
  qualityAudit: QualityAuditResult;
}

const DESIGN_DIRECTIONS: Array<{
  id: DesignDirectionId;
  title: string;
  emphasis: string;
  summaryHint: string;
}> = [
  {
    id: 'directionA',
    title: 'Direction A - Brand Faithful',
    emphasis: 'Prioritize strict alignment with source evidence and recognizable brand signatures.',
    summaryHint: 'Best for brand consistency and trust continuity.',
  },
  {
    id: 'directionB',
    title: 'Direction B - Conversion Forward',
    emphasis: 'Prioritize conversion clarity, CTA hierarchy, and persuasive layout cadence.',
    summaryHint: 'Best for growth and acquisition surfaces.',
  },
  {
    id: 'directionC',
    title: 'Direction C - Product Ops Forward',
    emphasis: 'Prioritize operational usability, dense workflows, and internal product speed.',
    summaryHint: 'Best for customer task throughput and internal operations.',
  },
];

const DEFAULT_CONTROLS: DesignCalibrationControls = {
  brandAlignment: 85,
  contrastTarget: 'aa',
  layoutDensity: 'comfortable',
  motionIntensity: 'moderate',
  voiceTone: 'clear and confident',
};

const DESIGN_CALIBRATION_CONTEXT = `You are Baley running the Design Calibration V2.5 workflow.

System behavior already performed before you respond:
- Brand dossier synthesis has run across provided inputs.
- Three direction concepts have been generated and quality-audited.
- A selected concept has already been previewed to the user.

Your role now:
- Continue iterative refinement conversationally.
- Use design_refiner for targeted edits, not full regeneration unless requested.
- Use set_design_package after each meaningful update.
- Use save_design_package when the user confirms they are happy.

Design tools available:
- spawn_baleybot
- fetch_url, web_search
- analyze_brand_asset
- set_design_package
- save_design_package`;

function sanitizeStreamError(message: string): string {
  return message
    .replace(/postgres(ql)?:\/\/[\S]+/gi, '[database-url]')
    .replace(/mysql:\/\/[\S]+/gi, '[database-url]')
    .replace(/\/(?:Users|home|var|tmp|app|src)\/[\S:]+/g, '[path]')
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

function extractUrls(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/https?:\/\/[^\s)\]}"']+/gi) ?? [];
  return Array.from(new Set(matches.map((url) => url.replace(/[.,;!?]+$/, ''))));
}

function summarizeAnalyzerSignals(result: DesignAnalyzerOutput): BrandDossierSignalInput {
  const colorRoles = result.colors
    .slice(0, 8)
    .map((entry) => `${entry.role}:${entry.hsl}`);

  const typographySignals = [
    `primary-font:${result.typography.primaryFont}`,
    ...(result.typography.scale ? [`type-scale:${result.typography.scale}`] : []),
    ...(result.typography.weights?.length
      ? [`weights:${result.typography.weights.join(',')}`]
      : []),
  ];

  const motionSignals = [
    `mood:${result.mood}`,
    `confidence:${result.confidence.toFixed(2)}`,
  ];

  const layoutSignals = [
    `radius:${result.spacing.borderRadius}`,
    ...(result.spacing.density ? [`density:${result.spacing.density}`] : []),
  ];

  const voiceSignals = [
    `${result.mood} brand tone`,
    ...result.recommendations.slice(0, 2),
  ];

  return {
    extractedTokens: colorRoles,
    typographySignals,
    motionSignals,
    layoutSignals,
    voiceSignals,
  };
}

function buildDirectionPrompt(args: {
  direction: (typeof DESIGN_DIRECTIONS)[number];
  message: string;
  historyText: string;
  dossier: DesignPackageDataV2['brandDossier'];
  controls: DesignCalibrationControls;
  uploadedAssets: FetchedAsset[];
}): string {
  const controlsJson = JSON.stringify(args.controls, null, 2);
  const dossierJson = JSON.stringify(args.dossier, null, 2);

  return [
    'Generate one complete DesignPackageData V2.5 package.',
    `Direction: ${args.direction.title}`,
    args.direction.emphasis,
    '',
    'User request:',
    args.message,
    '',
    'Advanced controls (structured):',
    controlsJson,
    '',
    'Canonical brand dossier:',
    dossierJson,
    '',
    args.uploadedAssets.length > 0
      ? `Uploaded assets: ${args.uploadedAssets
          .map((asset) => `${asset.fileName} (${asset.mimeType}, ${formatFileSize(asset.fileSize)})`)
          .join(', ')}`
      : 'Uploaded assets: none',
    args.historyText ? `Conversation context:\n${args.historyText}` : '',
    '',
    'Requirements:',
    '- Return full V2.5 package with foundation, motionSystem, layoutSystem, all three surfaceBlueprints, artifactManifest, brandDossier, generationReport.',
    '- Keep all color values as HSL strings without hsl() wrapper.',
    '- Keep lighting/dark palettes complete with semantic roles.',
    '- Make all surfaces usable and coherent under this direction emphasis.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildRepairPrompt(args: {
  concept: DirectionConcept;
  controls: DesignCalibrationControls;
  message: string;
}): string {
  const failing = args.concept.qualityAudit.checks
    .filter((check) => !check.passed)
    .map((check) => `${check.id}: ${check.detail}`)
    .join('\n- ');

  return [
    'Refine this design package to pass quality gating while preserving direction intent.',
    `Direction: ${args.concept.title}`,
    `Original user intent: ${args.message}`,
    '',
    'Controls:',
    JSON.stringify(args.controls, null, 2),
    '',
    'Failed quality checks:',
    failing ? `- ${failing}` : '- None listed, improve overall score conservatively.',
    '',
    'Current package JSON:',
    JSON.stringify(args.concept.packageData, null, 2),
    '',
    'Constraints:',
    '- Return complete V2.5 package JSON only.',
    '- Preserve brand identity and direction positioning.',
    '- Improve accessibility and completeness issues first.',
  ].join('\n');
}

function conceptSummary(concept: DirectionConcept): string {
  const failed = concept.qualityAudit.failedChecks.length;
  if (failed === 0) {
    return `${concept.title} passed structural quality checks with score ${concept.score}/100.`;
  }
  return `${concept.title} scored ${concept.score}/100 with ${failed} quality checks to improve.`;
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

    const controls: DesignCalibrationControls = {
      ...DEFAULT_CONTROLS,
      ...(input.controls ?? {}),
    };

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let lastEmitAt = Date.now();
        const spawnOutputs = new Map<string, unknown>();
        let previewUpdated = false;
        let selectedConceptPackage: DesignPackageDataV2 | null = null;

        const sendEvent = (event: Record<string, unknown>) => {
          lastEmitAt = Date.now();
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        };

        sendEvent({ type: 'design_started', timestamp: Date.now() });

        const heartbeat = setInterval(() => {
          if (Date.now() - lastEmitAt < 4000) return;
          sendEvent({ type: 'text_delta', content: '', timestamp: Date.now() });
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

          const historyText = input.conversationHistory
            ?.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
            .join('\n\n') ?? '';

          const existingPackageContext = input.existingPackageData
            ? `\n\nCurrent design package data:\n${JSON.stringify(input.existingPackageData, null, 2)}`
            : '';

          const assetContext = uploadedAssets.length > 0
            ? '\n\nUploaded brand assets:\n' +
              uploadedAssets
                .map((a) =>
                  `- Asset ${a.id}: "${a.fileName}" (${a.mimeType}, ${formatFileSize(a.fileSize)})`
                )
                .join('\n') +
              '\nUse analyze_brand_asset to examine these files before generating.'
            : '';

          let brandDossier: DesignPackageDataV2['brandDossier'] | null = null;
          const generatedConcepts: DirectionConcept[] = [];
          let conceptContext = '';

          if (!input.existingPackageData) {
            sendEvent({ type: 'brand_dossier_started', timestamp: Date.now() });

            const sourceInputs: BrandDossierSourceInput[] = [
              {
                id: 'user-brief',
                kind: 'text',
                label: 'User brief',
                confidence: 0.75,
                notes: [input.message.slice(0, 220)],
              },
            ];
            const signalInputs: BrandDossierSignalInput[] = [];

            const urls = extractUrls(`${input.message}\n${historyText}`);
            if (urls.length > 0) {
              const urlAnalysis = await Promise.allSettled(
                urls.map(async (url, index) => {
                  const analyzer = await runDesignAnalyzer(
                    [
                      `Analyze brand signals from URL: ${url}`,
                      'Use fetch_url with format:"html" to inspect CSS, style tags, and typography.',
                    ].join('\n'),
                    {
                      userWorkspaceId: workspace.id,
                      signal: AbortSignal.timeout(60_000),
                    }
                  );
                  sourceInputs.push({
                    id: `url-${index + 1}`,
                    kind: 'url',
                    label: url,
                    confidence: Math.max(0.55, analyzer.confidence),
                    notes: analyzer.recommendations.slice(0, 3),
                  });
                  signalInputs.push(summarizeAnalyzerSignals(analyzer));
                })
              );

              const urlFailures = urlAnalysis.filter((result) => result.status === 'rejected');
              if (urlFailures.length > 0) {
                log.warn('Some URL analyses failed', {
                  workspaceId: workspace.id,
                  failedCount: urlFailures.length,
                });
              }
            }

            if (uploadedAssets.length > 0) {
              const assetAnalysis = await Promise.allSettled(
                uploadedAssets.map(async (asset, index) => {
                  const analyzer = await runDesignAnalyzer(
                    `Analyze this brand asset for colors, typography, motion cues, layout density, and voice.`,
                    {
                      userWorkspaceId: workspace.id,
                      attachments: [{ data: asset.base64, mimeType: asset.mimeType }],
                      signal: AbortSignal.timeout(60_000),
                    }
                  );
                  sourceInputs.push({
                    id: `asset-${index + 1}`,
                    kind: asset.mimeType === 'application/pdf' ? 'pdf' : 'image',
                    label: asset.fileName,
                    confidence: Math.max(0.5, analyzer.confidence),
                    notes: analyzer.recommendations.slice(0, 3),
                  });
                  signalInputs.push(summarizeAnalyzerSignals(analyzer));
                })
              );

              const assetFailures = assetAnalysis.filter((result) => result.status === 'rejected');
              if (assetFailures.length > 0) {
                log.warn('Some asset analyses failed', {
                  workspaceId: workspace.id,
                  failedCount: assetFailures.length,
                });
              }
            }

            const deterministicDossier = buildBrandDossier({
              sources: sourceInputs,
              signals: signalInputs,
              mood: 'professional',
              animationStyle: 'professional',
              accessibilityTarget: controls.contrastTarget,
              density: controls.layoutDensity,
              voiceTone: controls.voiceTone,
            });

            brandDossier = await runDesignDossierSynthesizer(
              [
                'Synthesize this canonical brand dossier from evidence. Return only the final dossier JSON.',
                '',
                'Current dossier draft:',
                JSON.stringify(deterministicDossier, null, 2),
                '',
                'Advanced controls:',
                JSON.stringify(controls, null, 2),
                '',
                'User request:',
                input.message,
              ].join('\n'),
              {
                userWorkspaceId: workspace.id,
                fallbackMode: 'value',
                fallbackValue: deterministicDossier,
                repairAttempts: 1,
                signal: AbortSignal.timeout(60_000),
              }
            );

            sendEvent({
              type: 'brand_dossier_ready',
              dossier: brandDossier,
              timestamp: Date.now(),
            });

            sendEvent({ type: 'design_concepts_started', timestamp: Date.now() });

            const generatedDirectionResults = await Promise.allSettled(
              DESIGN_DIRECTIONS.map(async (direction) => {
                sendEvent({
                  type: 'concept_direction_started',
                  directionId: direction.id,
                  directionTitle: direction.title,
                  timestamp: Date.now(),
                });

                const generated = await runDesignGenerator(
                  buildDirectionPrompt({
                    direction,
                    message: input.message,
                    historyText,
                    dossier: brandDossier!,
                    controls,
                    uploadedAssets,
                  }),
                  {
                    userWorkspaceId: workspace.id,
                    signal: AbortSignal.timeout(90_000),
                  }
                );

                const packageData = ensureDesignPackageDataV2({
                  ...generated,
                  brandDossier,
                });

                const qualityAudit = auditDesignPackageQuality(packageData);
                const confidenceScore = Math.round((brandDossier!.confidence.overall * 100 + controls.brandAlignment) / 2);
                const score = Math.max(0, Math.min(100, Math.round(qualityAudit.overallScore * 0.85 + confidenceScore * 0.15)));
                const rationale = qualityAudit.failedChecks.length === 0
                  ? `${direction.summaryHint} Structural checks passed.`
                  : `${direction.summaryHint} Needs refinement on: ${qualityAudit.failedChecks.join(', ')}.`;

                sendEvent({
                  type: 'concept_direction_scored',
                  directionId: direction.id,
                  directionTitle: direction.title,
                  score,
                  rationale,
                  timestamp: Date.now(),
                });

                return {
                  id: direction.id,
                  title: direction.title,
                  summary: `${direction.summaryHint} Quality score ${score}/100.`,
                  score,
                  rationale,
                  packageData,
                  qualityAudit,
                } satisfies DirectionConcept;
              })
            );

            for (const result of generatedDirectionResults) {
              if (result.status === 'fulfilled') {
                generatedConcepts.push(result.value);
              }
            }

            if (generatedConcepts.length === 0) {
              throw new Error('Failed to generate design concepts for all directions');
            }

            generatedConcepts.sort((a, b) => b.score - a.score);
            const selected = generatedConcepts[0]!;
            const minimumScore = controls.contrastTarget === 'aaa' ? 90 : 82;
            let repairAttempts = 0;
            let repairApplied = false;

            while (!passesQualityGate(selected.qualityAudit, minimumScore) && repairAttempts < 2) {
              repairAttempts += 1;
              repairApplied = true;

              sendEvent({
                type: 'quality_gate_repair',
                attempt: repairAttempts,
                reason: `Repairing ${selected.title} to pass hard checks and minimum score ${minimumScore}`,
                timestamp: Date.now(),
              });

              const repaired = await runDesignRefiner(
                buildRepairPrompt({
                  concept: selected,
                  controls,
                  message: input.message,
                }),
                {
                  userWorkspaceId: workspace.id,
                  signal: AbortSignal.timeout(90_000),
                }
              );

              const repairedPackage = ensureDesignPackageDataV2({
                ...repaired,
                brandDossier,
              });

              selected.packageData = repairedPackage;
              selected.qualityAudit = auditDesignPackageQuality(repairedPackage);
              selected.score = Math.max(
                selected.score,
                selected.qualityAudit.overallScore
              );
              selected.rationale = selected.qualityAudit.failedChecks.length === 0
                ? `${selected.title} repaired successfully and now passes quality gate.`
                : `${selected.title} repaired but still has remaining quality issues: ${selected.qualityAudit.failedChecks.join(', ')}.`;
            }

            const conceptScores = generatedConcepts.map((concept) => ({
              id: concept.id,
              title: concept.title,
              score: concept.score,
              rationale: concept.rationale,
            }));

            selected.packageData = ensureDesignPackageDataV2({
              ...selected.packageData,
              brandDossier,
              generationReport: buildGenerationReport({
                selectedConceptId: selected.id,
                selectedConceptTitle: selected.title,
                conceptScores,
                qualityAudit: selected.qualityAudit,
                repairAttempts,
                repairApplied,
              }),
            });

            selectedConceptPackage = selected.packageData;

            sendEvent({
              type: 'design_concepts_update',
              concepts: generatedConcepts.map((concept) => ({
                id: concept.id,
                title: concept.title,
                summary: conceptSummary(concept),
                score: concept.score,
                rationale: concept.rationale,
                packageData: concept.id === selected.id ? selected.packageData : concept.packageData,
              })),
              timestamp: Date.now(),
            });

            sendEvent({
              type: 'concept_merge_preview',
              payload: {
                selectedDirection: selected.id,
                conceptScores,
                recommendedMerge: {
                  colors: selected.id,
                  typography: selected.id,
                  motionSystem: selected.id,
                  layoutSystem: selected.id,
                  surfaceBlueprints: selected.id,
                },
              },
              timestamp: Date.now(),
            });

            sendEvent({
              type: 'design_preview_update',
              data: selected.packageData,
              timestamp: Date.now(),
            });
            previewUpdated = true;

            conceptContext = [
              'Generated concept candidates (validated):',
              ...generatedConcepts.map((concept) =>
                `- ${concept.id}: ${concept.summary}`
              ),
              '',
              `Selected concept: ${selected.id}`,
              `Selected quality score: ${selected.score}/100`,
              '',
              ...generatedConcepts.map((concept) =>
                `${concept.title} (${concept.id}) package:\n${JSON.stringify(concept.packageData, null, 2)}`
              ),
            ].join('\n');
          }

          const fullInput = [
            historyText ? `Previous conversation:\n${historyText}\n\n` : '',
            `User: ${input.message}`,
            `\n\nDesign controls:\n${JSON.stringify(controls, null, 2)}`,
            existingPackageContext,
            assetContext,
            brandDossier ? `\n\nCanonical brand dossier:\n${JSON.stringify(brandDossier, null, 2)}` : '',
            conceptContext ? `\n\n${conceptContext}` : '',
          ]
            .filter(Boolean)
            .join('');

          const toolCtx: CompanionToolContext = {
            workspaceId: workspace.id,
            userId,
          };
          const injectedTools = new Map<string, RuntimeToolDefinition>(buildCompanionTools(toolCtx));

          injectedTools.set('set_design_package', {
            name: 'set_design_package',
            description: 'Update the live design preview with a complete DesignPackageData V2.5 payload.',
            inputSchema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  description: 'Complete DesignPackageData V2.5 object',
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

          if (uploadedAssets.length > 0) {
            injectedTools.set('analyze_brand_asset', {
              name: 'analyze_brand_asset',
              description: 'Analyze an uploaded brand asset (image or PDF) for design attributes.',
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
                const asset = uploadedAssets.find((a) => a.id === String(args.assetId));
                if (!asset) return { error: 'Asset not found' };

                try {
                  const output = await runDesignAnalyzer(
                    `Analyze this uploaded brand asset "${asset.fileName}" for design attributes. Focus: ${args.focus ?? 'full'}.`,
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
                  return {
                    error: `Failed to analyze asset: ${err instanceof Error ? err.message : 'Unknown error'}`,
                  };
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

                if (input.sessionId) {
                  await db
                    .update(designPackageAssets)
                    .set({ designPackageId: pkg.id })
                    .where(
                      and(
                        eq(designPackageAssets.workspaceId, workspace.id),
                        eq(designPackageAssets.sessionId, input.sessionId),
                        isNull(designPackageAssets.designPackageId),
                      )
                    );
                }

                sendEvent({
                  type: 'design_saved',
                  packageId: pkg.id,
                  timestamp: Date.now(),
                });

                sendEvent({
                  type: 'component_generation_started',
                  timestamp: Date.now(),
                });

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

                executeInternalBaleybot('component_library_director', directorInput, {
                  userWorkspaceId: workspace.id,
                  onSegment: (event) => {
                    const evt = event as unknown as Record<string, unknown>;
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
                })
                  .then(() => {
                    sendEvent({
                      type: 'component_generation_complete',
                      timestamp: Date.now(),
                    });
                  })
                  .catch((err) => {
                    log.error('Component generation failed', {
                      error: err instanceof Error ? err.message : String(err),
                    });
                    sendEvent({
                      type: 'component_generation_error',
                      message: 'Component generation failed - you can regenerate later',
                      timestamp: Date.now(),
                    });
                  });

                return {
                  success: true,
                  packageId: pkg.id,
                  message: 'Design package saved. Component library generation started.',
                };
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

          if (!previewUpdated) {
            const fallbackRaw =
              spawnOutputs.get('design_refiner') ??
              spawnOutputs.get('design_generator') ??
              selectedConceptPackage;
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
                    : spawnOutputs.has('design_generator')
                      ? 'design_generator'
                      : 'selected_concept',
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
