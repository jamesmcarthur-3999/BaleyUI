import { z } from 'zod';

export const DESIGN_MOODS = [
  'playful',
  'professional',
  'minimal',
  'elegant',
  'bold',
] as const;

export const ANIMATION_STYLES = [
  'playful',
  'professional',
  'minimal',
] as const;

export const DESIGN_COLOR_KEYS = [
  'background',
  'foreground',
  'card',
  'cardForeground',
  'primary',
  'primaryForeground',
  'secondary',
  'secondaryForeground',
  'muted',
  'mutedForeground',
  'accent',
  'accentForeground',
  'destructive',
  'destructiveForeground',
  'border',
  'input',
  'ring',
  'success',
  'warning',
  'error',
  'info',
] as const;

const colorPaletteShape = Object.fromEntries(
  DESIGN_COLOR_KEYS.map((key) => [key, z.string().min(1)])
) as Record<(typeof DESIGN_COLOR_KEYS)[number], z.ZodString>;

export const colorPaletteSchema = z.object(colorPaletteShape).strict();

export const typographySchema = z.object({
  fontFamily: z.string().min(1),
  fontFamilyHeading: z.string().min(1).optional(),
  googleFontsUrl: z.string().min(1).optional(),
});

export const designFoundationSchema = z.object({
  brandPersonality: z.string().min(1),
  voiceTone: z.string().min(1),
  designPrinciples: z.array(z.string().min(1)).min(3).max(8),
  accessibilityTarget: z.enum(['aa', 'aaa']),
  brandAlignment: z.preprocess(
    (value) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return value;
      if (value > 1 && value <= 100) return value / 100;
      return value;
    },
    z.number().min(0).max(1)
  ),
});

export const motionSystemSchema = z.object({
  intensity: z.enum(['subtle', 'moderate', 'expressive']),
  transitionStyle: z.string().min(1),
  durationScale: z.object({
    fastMs: z.number().int().min(50).max(400),
    normalMs: z.number().int().min(100).max(700),
    slowMs: z.number().int().min(150).max(1200),
  }),
  easingPreset: z.string().min(1),
  reducedMotionStrategy: z.string().min(1),
});

export const layoutSystemSchema = z.object({
  density: z.enum(['compact', 'comfortable', 'spacious']),
  spacingBasePx: z.number().int().min(2).max(16),
  contentWidth: z.object({
    landing: z.enum(['narrow', 'standard', 'wide']),
    customerApp: z.enum(['standard', 'wide']),
    internalApp: z.enum(['wide', 'full']),
  }),
  navigationPattern: z.object({
    landing: z.enum(['top', 'split', 'minimal']),
    customerApp: z.enum(['top', 'side', 'hybrid']),
    internalApp: z.enum(['side', 'dense-side', 'hybrid']),
  }),
  grid: z.object({
    columns: z.number().int().min(4).max(16),
    gutterPx: z.number().int().min(8).max(48),
  }),
});

const blueprintSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.number().int().min(1).max(5),
  components: z.array(z.string().min(1)).default([]),
  interactionNotes: z.array(z.string().min(1)).default([]),
});

const surfaceBlueprintSchema = z.object({
  purpose: z.string().min(1),
  layoutSummary: z.string().min(1),
  sectionOrder: z.array(blueprintSectionSchema).min(3),
  animationGuidelines: z.array(z.string().min(1)).min(2),
  samplePrompt: z.string().min(1),
});

export const surfaceBlueprintsSchema = z.object({
  landing: surfaceBlueprintSchema,
  customerApp: surfaceBlueprintSchema,
  internalApp: surfaceBlueprintSchema,
});

const artifactEntrySchema = z.object({
  path: z.string().min(1),
  kind: z.enum(['json', 'css', 'tsx', 'md']),
  description: z.string().min(1),
});

export const artifactManifestSchema = z.object({
  version: z.literal(2),
  generatedAt: z.string().datetime(),
  codeTarget: z.literal('react-tailwind'),
  artifacts: z.array(artifactEntrySchema).min(1),
});

const brandSourceRecordSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['url', 'image', 'pdf', 'text']),
  label: z.string().min(1),
  confidence: z.number().min(0).max(1),
  notes: z.array(z.string().min(1)),
});

const brandConflictRecordSchema = z.object({
  topic: z.string().min(1),
  detail: z.string().min(1),
  resolution: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const brandDossierSchema = z.object({
  version: z.literal(1),
  createdAt: z.string().datetime(),
  sources: z.array(brandSourceRecordSchema).min(1),
  extractedTokens: z.array(z.string().min(1)),
  typographySignals: z.array(z.string().min(1)),
  motionSignals: z.array(z.string().min(1)),
  layoutSignals: z.array(z.string().min(1)),
  voiceSignals: z.array(z.string().min(1)),
  conflicts: z.array(brandConflictRecordSchema),
  confidence: z.object({
    overall: z.number().min(0).max(1),
    color: z.number().min(0).max(1),
    typography: z.number().min(0).max(1),
    motion: z.number().min(0).max(1),
    layout: z.number().min(0).max(1),
    voice: z.number().min(0).max(1),
  }),
  recommendedDefaults: z.object({
    mood: z.enum(DESIGN_MOODS),
    animationStyle: z.enum(ANIMATION_STYLES),
    accessibilityTarget: z.enum(['aa', 'aaa']),
    density: z.enum(['compact', 'comfortable', 'spacious']),
    voiceTone: z.string().min(1),
  }),
});

const qualityCheckResultSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  passed: z.boolean(),
  score: z.number().min(0).max(100),
  detail: z.string().min(1),
});

const conceptScoreSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  score: z.number().min(0).max(100),
  rationale: z.string().min(1),
});

export const generationReportSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  selectedConceptId: z.string().min(1),
  overallScore: z.number().min(0).max(100),
  repairAttempts: z.number().int().min(0).max(10),
  repairApplied: z.boolean(),
  failedChecks: z.array(z.string().min(1)),
  qualityChecks: z.array(qualityCheckResultSchema),
  conceptScores: z.array(conceptScoreSchema).min(1),
});

export const designPackageDataV2Schema = z.object({
  colors: z.object({
    light: colorPaletteSchema,
    dark: colorPaletteSchema,
  }),
  typography: typographySchema,
  borderRadius: z.string().min(1),
  mood: z.enum(DESIGN_MOODS),
  animationStyle: z.enum(ANIMATION_STYLES),
  foundation: designFoundationSchema,
  motionSystem: motionSystemSchema,
  layoutSystem: layoutSystemSchema,
  surfaceBlueprints: surfaceBlueprintsSchema,
  artifactManifest: artifactManifestSchema,
  brandDossier: brandDossierSchema,
  generationReport: generationReportSchema,
  componentRegistry: z.any().optional(),
  tailwindTheme: z.any().optional(),
});

const legacyPackageDataSchema = z.object({
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
  mood: z.enum(DESIGN_MOODS).catch('professional'),
  animationStyle: z.enum(ANIMATION_STYLES).catch('professional'),
  componentRegistry: z.any().optional(),
  tailwindTheme: z.any().optional(),
}).passthrough();

export type DesignPackageDataV2 = z.infer<typeof designPackageDataV2Schema>;

const DEFAULT_LIGHT: z.infer<typeof colorPaletteSchema> = {
  background: '0 0% 100%',
  foreground: '240 10% 4%',
  card: '0 0% 100%',
  cardForeground: '240 10% 4%',
  primary: '222 47% 11%',
  primaryForeground: '210 40% 98%',
  secondary: '210 40% 96%',
  secondaryForeground: '222 47% 11%',
  muted: '210 40% 96%',
  mutedForeground: '215 16% 47%',
  accent: '210 40% 96%',
  accentForeground: '222 47% 11%',
  destructive: '0 84% 60%',
  destructiveForeground: '210 40% 98%',
  border: '214 32% 91%',
  input: '214 32% 91%',
  ring: '222 84% 5%',
  success: '142 76% 36%',
  warning: '38 92% 50%',
  error: '0 84% 60%',
  info: '199 89% 48%',
};

const DEFAULT_DARK: z.infer<typeof colorPaletteSchema> = {
  background: '222 47% 11%',
  foreground: '210 40% 98%',
  card: '222 47% 11%',
  cardForeground: '210 40% 98%',
  primary: '210 40% 98%',
  primaryForeground: '222 47% 11%',
  secondary: '217 33% 17%',
  secondaryForeground: '210 40% 98%',
  muted: '217 33% 17%',
  mutedForeground: '215 20% 65%',
  accent: '217 33% 17%',
  accentForeground: '210 40% 98%',
  destructive: '0 63% 31%',
  destructiveForeground: '210 40% 98%',
  border: '217 33% 20%',
  input: '217 33% 20%',
  ring: '212 27% 84%',
  success: '142 70% 45%',
  warning: '38 92% 50%',
  error: '0 72% 51%',
  info: '199 89% 58%',
};

function completePalette(
  candidate: Record<string, string> | undefined,
  fallback: z.infer<typeof colorPaletteSchema>
): z.infer<typeof colorPaletteSchema> {
  const normalized: Record<string, string> = {};
  for (const key of DESIGN_COLOR_KEYS) {
    const value = candidate?.[key];
    normalized[key] = typeof value === 'string' && value.trim().length > 0
      ? value
      : fallback[key];
  }
  return colorPaletteSchema.parse(normalized);
}

function defaultPrinciplesForMood(mood: (typeof DESIGN_MOODS)[number]): string[] {
  const byMood: Record<(typeof DESIGN_MOODS)[number], string[]> = {
    playful: [
      'Expressive color pairings with high legibility',
      'Generous whitespace and rounded affordances',
      'Friendly micro-interactions with motion restraint',
    ],
    professional: [
      'Clear hierarchy and predictable information architecture',
      'Moderate contrast and restrained accent usage',
      'Confidence-building motion and feedback cues',
    ],
    minimal: [
      'Strong typography and spacing over decorative detail',
      'Low-noise color system with precise accents',
      'Fast, subtle motion with no visual clutter',
    ],
    elegant: [
      'Refined typography and generous negative space',
      'Layered neutrals with selective rich accents',
      'Soft motion and premium transitions',
    ],
    bold: [
      'High-contrast statements and decisive hierarchy',
      'Strong accents with intentional saturation',
      'Confident motion that reinforces action',
    ],
  };
  return byMood[mood];
}

function defaultMotionSystem(animationStyle: (typeof ANIMATION_STYLES)[number]) {
  if (animationStyle === 'playful') {
    return {
      intensity: 'expressive' as const,
      transitionStyle: 'springy',
      durationScale: { fastMs: 140, normalMs: 260, slowMs: 420 },
      easingPreset: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      reducedMotionStrategy: 'Reduce scale and remove non-essential transforms',
    };
  }

  if (animationStyle === 'minimal') {
    return {
      intensity: 'subtle' as const,
      transitionStyle: 'snappy',
      durationScale: { fastMs: 90, normalMs: 160, slowMs: 240 },
      easingPreset: 'cubic-bezier(0.2, 0, 0, 1)',
      reducedMotionStrategy: 'Use opacity-only transitions for reduced motion',
    };
  }

  return {
    intensity: 'moderate' as const,
    transitionStyle: 'smooth',
    durationScale: { fastMs: 120, normalMs: 220, slowMs: 340 },
    easingPreset: 'cubic-bezier(0.4, 0, 0.2, 1)',
    reducedMotionStrategy: 'Cut durations by half and remove large spatial movement',
  };
}

function defaultLayoutSystem() {
  return {
    density: 'comfortable' as const,
    spacingBasePx: 4,
    contentWidth: {
      landing: 'wide' as const,
      customerApp: 'standard' as const,
      internalApp: 'full' as const,
    },
    navigationPattern: {
      landing: 'top' as const,
      customerApp: 'top' as const,
      internalApp: 'side' as const,
    },
    grid: {
      columns: 12,
      gutterPx: 24,
    },
  };
}

function defaultSurfaceBlueprints(mood: (typeof DESIGN_MOODS)[number]) {
  const sharedAnimationGuidelines = [
    'Use motion to reinforce hierarchy and state transitions only',
    'Avoid simultaneous large-scale animations on multiple regions',
  ];

  return {
    landing: {
      purpose: 'Convert new visitors with strong brand storytelling and clear CTA flow',
      layoutSummary: 'Hero-first narrative with proof, features, and CTA reinforcement',
      sectionOrder: [
        {
          id: 'hero',
          title: 'Hero',
          description: 'Communicate the core value proposition in one screen',
          priority: 1,
          components: ['TopNav', 'Hero', 'PrimaryCTA'],
          interactionNotes: ['Keep CTA visible above the fold'],
        },
        {
          id: 'social-proof',
          title: 'Social Proof',
          description: 'Establish trust with testimonials and metrics',
          priority: 2,
          components: ['LogoStrip', 'TestimonialCard', 'StatsRow'],
          interactionNotes: ['Use subtle enter animation on scroll'],
        },
        {
          id: 'feature-grid',
          title: 'Feature Grid',
          description: 'Explain product capabilities quickly',
          priority: 3,
          components: ['FeatureCard', 'SectionHeading'],
          interactionNotes: ['Maintain equal card heights for scanability'],
        },
      ],
      animationGuidelines: sharedAnimationGuidelines,
      samplePrompt: `Build a ${mood} landing page with strong conversion focus and clear CTA hierarchy.`,
    },
    customerApp: {
      purpose: 'Support customer task completion with clear flows and low cognitive load',
      layoutSummary: 'Top-level navigation with focused content area and contextual panels',
      sectionOrder: [
        {
          id: 'global-nav',
          title: 'Global Navigation',
          description: 'Persistent wayfinding for core customer journeys',
          priority: 1,
          components: ['TopNav', 'SearchField', 'UserMenu'],
          interactionNotes: ['Ensure keyboard and mobile accessibility'],
        },
        {
          id: 'primary-work-area',
          title: 'Primary Work Area',
          description: 'Main interactive surface for customer actions',
          priority: 2,
          components: ['Cards', 'DataTable', 'PrimaryActions'],
          interactionNotes: ['Use optimistic UI feedback for actions'],
        },
        {
          id: 'assistive-panel',
          title: 'Assistive Panel',
          description: 'Contextual help and secondary actions',
          priority: 3,
          components: ['HelpCard', 'RecentActivity', 'NotificationList'],
          interactionNotes: ['Collapse on smaller viewports'],
        },
      ],
      animationGuidelines: sharedAnimationGuidelines,
      samplePrompt: `Build a ${mood} customer-facing app shell optimized for task completion and clarity.`,
    },
    internalApp: {
      purpose: 'Maximize operator throughput with dense information and fast controls',
      layoutSummary: 'Sidebar-driven workspace with high-density data views and utilities',
      sectionOrder: [
        {
          id: 'sidebar',
          title: 'Operations Sidebar',
          description: 'Fast navigation across internal workflows',
          priority: 1,
          components: ['Sidebar', 'WorkspaceSwitcher', 'StatusPills'],
          interactionNotes: ['Support compact and expanded states'],
        },
        {
          id: 'dashboard-grid',
          title: 'Dashboard Grid',
          description: 'KPI tiles, queue status, and operational alerts',
          priority: 2,
          components: ['KpiTile', 'AlertBanner', 'QueueTable'],
          interactionNotes: ['Surface critical alerts with strong contrast'],
        },
        {
          id: 'detail-panel',
          title: 'Detail Panel',
          description: 'Drill-down panel for selected records',
          priority: 3,
          components: ['DetailDrawer', 'Tabs', 'ActionToolbar'],
          interactionNotes: ['Preserve context when switching records'],
        },
      ],
      animationGuidelines: sharedAnimationGuidelines,
      samplePrompt: `Build a ${mood} internal operations app with dense data visibility and fast actions.`,
    },
  };
}

export function createDefaultBrandDossier(args: {
  mood: (typeof DESIGN_MOODS)[number];
  animationStyle: (typeof ANIMATION_STYLES)[number];
  accessibilityTarget?: 'aa' | 'aaa';
  density?: 'compact' | 'comfortable' | 'spacious';
  voiceTone?: string;
}): z.infer<typeof brandDossierSchema> {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    sources: [
      {
        id: 'user-brief',
        kind: 'text',
        label: 'User brief',
        confidence: 0.7,
        notes: ['Default dossier synthesized from available package inputs'],
      },
    ],
    extractedTokens: ['semantic-colors', 'typography-hierarchy', 'surface-blueprints'],
    typographySignals: ['Prefer clear reading rhythm for body and stronger heading contrast'],
    motionSignals: ['Favor purposeful motion tied to state transitions'],
    layoutSignals: ['Keep navigation pattern consistent by surface type'],
    voiceSignals: [args.voiceTone ?? 'Clear and confident'],
    conflicts: [],
    confidence: {
      overall: 0.7,
      color: 0.75,
      typography: 0.7,
      motion: 0.65,
      layout: 0.7,
      voice: 0.7,
    },
    recommendedDefaults: {
      mood: args.mood,
      animationStyle: args.animationStyle,
      accessibilityTarget: args.accessibilityTarget ?? 'aa',
      density: args.density ?? 'comfortable',
      voiceTone: args.voiceTone ?? 'Clear and confident',
    },
  };
}

export function createDefaultGenerationReport(args: {
  selectedConceptId: string;
  overallScore?: number;
  repairAttempts?: number;
  repairApplied?: boolean;
  failedChecks?: string[];
  conceptScores?: Array<{
    id: string;
    title: string;
    score: number;
    rationale: string;
  }>;
  qualityChecks?: Array<{
    id: string;
    label: string;
    passed: boolean;
    score: number;
    detail: string;
  }>;
}): z.infer<typeof generationReportSchema> {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    selectedConceptId: args.selectedConceptId,
    overallScore: args.overallScore ?? 82,
    repairAttempts: args.repairAttempts ?? 0,
    repairApplied: args.repairApplied ?? false,
    failedChecks: args.failedChecks ?? [],
    qualityChecks: args.qualityChecks ?? [
      {
        id: 'wcag-core',
        label: 'Core WCAG contrast pairs',
        passed: true,
        score: 90,
        detail: 'Baseline contrast checks passed for primary text and action pairs',
      },
      {
        id: 'v2-completeness',
        label: 'V2 package completeness',
        passed: true,
        score: 95,
        detail: 'Foundation, motion, layout, and surface blueprints are present',
      },
    ],
    conceptScores: args.conceptScores ?? [
      {
        id: args.selectedConceptId,
        title: 'Default Concept',
        score: args.overallScore ?? 82,
        rationale: 'Selected as the highest quality available concept in current context',
      },
    ],
  };
}

export function createDefaultArtifactManifest(): z.infer<typeof artifactManifestSchema> {
  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    codeTarget: 'react-tailwind',
    artifacts: [
      { path: 'design-package.v2.json', kind: 'json', description: 'Canonical full design package payload' },
      { path: 'tokens.css', kind: 'css', description: 'CSS custom properties for light and dark tokens' },
      { path: 'tailwind-theme.json', kind: 'json', description: 'Tailwind-compatible token map and defaults' },
      { path: 'brand-dossier.v1.json', kind: 'json', description: 'Brand signal synthesis and confidence report' },
      { path: 'quality-report.json', kind: 'json', description: 'Generation quality checks and repair trace' },
      { path: 'blueprints/landing.json', kind: 'json', description: 'Landing page blueprint and interaction model' },
      { path: 'blueprints/customer-app.json', kind: 'json', description: 'Customer-facing app blueprint' },
      { path: 'blueprints/internal-app.json', kind: 'json', description: 'Internal app blueprint' },
      { path: 'concepts/direction-a.json', kind: 'json', description: 'Direction A concept package snapshot' },
      { path: 'concepts/direction-b.json', kind: 'json', description: 'Direction B concept package snapshot' },
      { path: 'concepts/direction-c.json', kind: 'json', description: 'Direction C concept package snapshot' },
      { path: 'templates/react-tailwind/landing-page.tsx', kind: 'tsx', description: 'Landing page starter template' },
      { path: 'templates/react-tailwind/customer-app.tsx', kind: 'tsx', description: 'Customer app starter template' },
      { path: 'templates/react-tailwind/internal-app.tsx', kind: 'tsx', description: 'Internal app starter template' },
      { path: 'README.md', kind: 'md', description: 'Bundle usage guide' },
    ],
  };
}

export function upconvertDesignPackageData(input: unknown): DesignPackageDataV2 {
  const parsedV2 = designPackageDataV2Schema.safeParse(input);
  if (parsedV2.success) {
    return {
      ...parsedV2.data,
      artifactManifest: {
        ...parsedV2.data.artifactManifest,
        generatedAt: parsedV2.data.artifactManifest.generatedAt || new Date().toISOString(),
      },
      brandDossier: {
        ...parsedV2.data.brandDossier,
        createdAt: parsedV2.data.brandDossier.createdAt || new Date().toISOString(),
      },
      generationReport: {
        ...parsedV2.data.generationReport,
        generatedAt: parsedV2.data.generationReport.generatedAt || new Date().toISOString(),
      },
    };
  }

  const legacy = legacyPackageDataSchema.parse(input);
  const mood = legacy.mood ?? 'professional';
  const animationStyle = legacy.animationStyle ?? 'professional';

  const v2Candidate: DesignPackageDataV2 = {
    colors: {
      light: completePalette(legacy.colors.light, DEFAULT_LIGHT),
      dark: completePalette(legacy.colors.dark, DEFAULT_DARK),
    },
    typography: {
      fontFamily: legacy.typography.fontFamily || 'Inter, sans-serif',
      fontFamilyHeading: legacy.typography.fontFamilyHeading,
      googleFontsUrl: legacy.typography.googleFontsUrl,
    },
    borderRadius: legacy.borderRadius || '0.75rem',
    mood,
    animationStyle,
    foundation: {
      brandPersonality: `${mood} and consistent`,
      voiceTone: mood === 'playful' ? 'Friendly and energetic' : 'Clear and confident',
      designPrinciples: defaultPrinciplesForMood(mood),
      accessibilityTarget: 'aa',
      brandAlignment: 0.85,
    },
    motionSystem: defaultMotionSystem(animationStyle),
    layoutSystem: defaultLayoutSystem(),
    surfaceBlueprints: defaultSurfaceBlueprints(mood),
    artifactManifest: createDefaultArtifactManifest(),
    brandDossier: createDefaultBrandDossier({
      mood,
      animationStyle,
      accessibilityTarget: 'aa',
      density: 'comfortable',
      voiceTone: mood === 'playful' ? 'Friendly and energetic' : 'Clear and confident',
    }),
    generationReport: createDefaultGenerationReport({
      selectedConceptId: 'directionA',
      overallScore: 80,
      conceptScores: [
        {
          id: 'directionA',
          title: 'Direction A',
          score: 80,
          rationale: 'Default up-converted concept for legacy package data',
        },
      ],
    }),
    componentRegistry: legacy.componentRegistry,
    tailwindTheme: legacy.tailwindTheme,
  };

  return designPackageDataV2Schema.parse(v2Candidate);
}

export function ensureDesignPackageDataV2(input: unknown): DesignPackageDataV2 {
  return upconvertDesignPackageData(input);
}

export const designPackageDataInputSchema = z
  .union([designPackageDataV2Schema, legacyPackageDataSchema])
  .transform((value) => ensureDesignPackageDataV2(value));
