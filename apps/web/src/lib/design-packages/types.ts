/**
 * Design Package types — defines the shape of a complete design system configuration.
 *
 * A DesignPackage is a JSON blob containing color palettes (light + dark),
 * typography settings, border radius, mood, and animation preferences.
 * When applied, these values become CSS custom property overrides that
 * retheme all shadcn/ui components instantly.
 */

export interface DesignPackageData {
  colors: { light: ColorPalette; dark: ColorPalette };
  typography: {
    fontFamily: string;
    fontFamilyHeading?: string;
    googleFontsUrl?: string;
  };
  borderRadius: string; // e.g. "0.75rem"
  mood: DesignMood;
  animationStyle: AnimationStyle;
  /** Brand-level design intent and quality constraints (V2) */
  foundation?: DesignFoundation;
  /** Motion behavior defaults and accessibility posture (V2) */
  motionSystem?: MotionSystem;
  /** Density/grid/navigation defaults for generated surfaces (V2) */
  layoutSystem?: LayoutSystem;
  /** Explicit blueprints for multiple generated surfaces (V2) */
  surfaceBlueprints?: SurfaceBlueprintSet;
  /** Generated artifact metadata for export bundles (V2) */
  artifactManifest?: ArtifactManifest;
  /** Canonical source synthesis used to generate this package (V2.5) */
  brandDossier?: BrandDossier;
  /** Generation scoring and repair trace for quality gating (V2.5) */
  generationReport?: GenerationReport;
  /** AI-generated component library (populated after save) */
  componentRegistry?: ComponentRegistry;
  /** Deterministic Tailwind theme tokens (populated after save) */
  tailwindTheme?: TailwindThemeTokens;
}

export type DesignMood = 'playful' | 'professional' | 'minimal' | 'elegant' | 'bold';
export type AnimationStyle = 'playful' | 'professional' | 'minimal';

export interface ColorPalette {
  background: string; // HSL: "30 25% 98%"
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

export interface DesignFoundation {
  brandPersonality: string;
  voiceTone: string;
  designPrinciples: string[];
  accessibilityTarget: 'aa' | 'aaa';
  brandAlignment: number;
}

export interface MotionSystem {
  intensity: 'subtle' | 'moderate' | 'expressive';
  transitionStyle: string;
  durationScale: {
    fastMs: number;
    normalMs: number;
    slowMs: number;
  };
  easingPreset: string;
  reducedMotionStrategy: string;
}

export interface LayoutSystem {
  density: 'compact' | 'comfortable' | 'spacious';
  spacingBasePx: number;
  contentWidth: {
    landing: 'narrow' | 'standard' | 'wide';
    customerApp: 'standard' | 'wide';
    internalApp: 'wide' | 'full';
  };
  navigationPattern: {
    landing: 'top' | 'split' | 'minimal';
    customerApp: 'top' | 'side' | 'hybrid';
    internalApp: 'side' | 'dense-side' | 'hybrid';
  };
  grid: {
    columns: number;
    gutterPx: number;
  };
}

export interface SurfaceBlueprintSection {
  id: string;
  title: string;
  description: string;
  priority: number;
  components: string[];
  interactionNotes: string[];
}

export interface SurfaceBlueprint {
  purpose: string;
  layoutSummary: string;
  sectionOrder: SurfaceBlueprintSection[];
  animationGuidelines: string[];
  samplePrompt: string;
}

export interface SurfaceBlueprintSet {
  landing: SurfaceBlueprint;
  customerApp: SurfaceBlueprint;
  internalApp: SurfaceBlueprint;
}

export interface ArtifactManifestEntry {
  path: string;
  kind: 'json' | 'css' | 'tsx' | 'md';
  description: string;
}

export interface ArtifactManifest {
  version: 2;
  generatedAt: string;
  codeTarget: 'react-tailwind';
  artifacts: ArtifactManifestEntry[];
}

export interface BrandSourceRecord {
  id: string;
  kind: 'url' | 'image' | 'pdf' | 'text';
  label: string;
  confidence: number;
  notes: string[];
}

export interface BrandConflictRecord {
  topic: string;
  detail: string;
  resolution: string;
  confidence: number;
}

export interface BrandDossier {
  version: 1;
  createdAt: string;
  sources: BrandSourceRecord[];
  extractedTokens: string[];
  typographySignals: string[];
  motionSignals: string[];
  layoutSignals: string[];
  voiceSignals: string[];
  conflicts: BrandConflictRecord[];
  confidence: {
    overall: number;
    color: number;
    typography: number;
    motion: number;
    layout: number;
    voice: number;
  };
  recommendedDefaults: {
    mood: DesignMood;
    animationStyle: AnimationStyle;
    accessibilityTarget: 'aa' | 'aaa';
    density: 'compact' | 'comfortable' | 'spacious';
    voiceTone: string;
  };
}

export interface QualityCheckResult {
  id: string;
  label: string;
  passed: boolean;
  score: number;
  detail: string;
}

export interface ConceptScore {
  id: string;
  title: string;
  score: number;
  rationale: string;
}

export interface GenerationReport {
  version: 1;
  generatedAt: string;
  selectedConceptId: string;
  overallScore: number;
  repairAttempts: number;
  repairApplied: boolean;
  failedChecks: string[];
  qualityChecks: QualityCheckResult[];
  conceptScores: ConceptScore[];
}

// ============================================================================
// Component Library Types
// ============================================================================

export type ComponentCategory =
  | 'action'
  | 'layout'
  | 'form'
  | 'data'
  | 'feedback'
  | 'navigation'
  | 'overlay';

export interface ComponentAnimations {
  hover?: string;
  focus?: string;
  active?: string;
  enter?: string;
}

export interface TypographyOverrides {
  weight?: string;
  letterSpacing?: string;
  textTransform?: string;
}

export interface ComponentVariant {
  name: string;
  classes: string;
  usage: string;
  animations?: ComponentAnimations;
  customCSS?: string;
  typographyOverrides?: TypographyOverrides;
  designNotes?: string;
}

export interface ComponentDefinition {
  name: string;
  category: ComponentCategory;
  variants: ComponentVariant[];
  source: 'theme-generated' | 'bb-contributed';
  contributedBy?: string;
}

export interface ComponentRegistry {
  version: 1;
  generatedAt: string;
  generationMethod: 'parallel-agents' | 'manual';
  components: ComponentDefinition[];
}

// ============================================================================
// Tailwind Theme Tokens
// ============================================================================

export interface TailwindThemeTokens {
  cssVariables: { light: Record<string, string>; dark: Record<string, string> };
  colorUtilities: Record<string, string>;
  borderRadius: {
    none: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    full: string;
  };
  fontFamily: { sans: string; heading?: string };
  googleFontsLink?: string;
  defaultShadow: string;
  defaultTransition: string;
  defaultHoverScale: string;
}

// ============================================================================
// Source Resources & Package
// ============================================================================

export interface SourceResource {
  name: string;
  type: string; // 'image' | 'pdf' | 'url' | 'text'
  uploadedAt: string;
}

export type DesignPackageSourceType = 'ai_generated' | 'manual' | 'preset';

/** Row shape from the designPackages table */
export interface DesignPackage {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  packageData: DesignPackageData;
  sourceType: string | null;
  sourceResources: SourceResource[] | null;
  isDefault: boolean | null;
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}
