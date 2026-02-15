import {
  DESIGN_COLOR_KEYS,
  ensureDesignPackageDataV2,
  type DesignPackageDataV2,
  type brandDossierSchema,
  type layoutArtifactSchema,
  type motionArtifactSchema,
  type paletteArtifactSchema,
  type qualityArtifactSchema,
  type surfaceBlueprintArtifactSchema,
  type typographyArtifactSchema,
  type foundationArtifactSchema,
} from './schema';
import type { z } from 'zod';

type SurfaceKey = 'landing' | 'customerApp' | 'internalApp';

type PaletteArtifact = z.infer<typeof paletteArtifactSchema>;
type TypographyArtifact = z.infer<typeof typographyArtifactSchema>;
type FoundationArtifact = z.infer<typeof foundationArtifactSchema>;
type MotionArtifact = z.infer<typeof motionArtifactSchema>;
type LayoutArtifact = z.infer<typeof layoutArtifactSchema>;
type SurfaceBlueprintArtifact = z.infer<typeof surfaceBlueprintArtifactSchema>;
type QualityArtifact = z.infer<typeof qualityArtifactSchema>;
type BrandDossier = z.infer<typeof brandDossierSchema>;

export interface DirectionArtifactSet {
  palette?: PaletteArtifact;
  typography?: TypographyArtifact;
  foundation?: FoundationArtifact;
  motion?: MotionArtifact;
  layout?: LayoutArtifact;
  blueprints?: Partial<Record<SurfaceKey, SurfaceBlueprintArtifact>>;
  quality?: QualityArtifact;
}

function buildNeutralPalette(isDark: boolean): Record<string, string> {
  const fallbackValue = isDark ? '222 47% 11%' : '210 40% 98%';
  return Object.fromEntries(DESIGN_COLOR_KEYS.map((key) => [key, fallbackValue]));
}

function buildSeedPackage(artifacts: DirectionArtifactSet): DesignPackageDataV2 {
  const palette = artifacts.palette?.colors ?? {
    light: buildNeutralPalette(false),
    dark: buildNeutralPalette(true),
  };
  const typography = artifacts.typography;

  return ensureDesignPackageDataV2({
    colors: palette,
    typography: typography?.typography ?? {
      fontFamily: 'Inter, sans-serif',
    },
    borderRadius: typography?.borderRadius ?? '0.75rem',
    mood: typography?.mood ?? 'professional',
    animationStyle: typography?.animationStyle ?? 'professional',
  });
}

export function assembleDesignPackageFromArtifacts(args: {
  artifacts: DirectionArtifactSet;
  brandDossier?: BrandDossier;
  seedPackage?: DesignPackageDataV2;
}): DesignPackageDataV2 {
  const seed = args.seedPackage ?? buildSeedPackage(args.artifacts);

  return ensureDesignPackageDataV2({
    ...seed,
    colors: args.artifacts.palette?.colors ?? seed.colors,
    typography: args.artifacts.typography?.typography ?? seed.typography,
    borderRadius: args.artifacts.typography?.borderRadius ?? seed.borderRadius,
    mood: args.artifacts.typography?.mood ?? seed.mood,
    animationStyle: args.artifacts.typography?.animationStyle ?? seed.animationStyle,
    foundation: args.artifacts.foundation?.foundation ?? seed.foundation,
    motionSystem: args.artifacts.motion?.motionSystem ?? seed.motionSystem,
    layoutSystem: args.artifacts.layout?.layoutSystem ?? seed.layoutSystem,
    surfaceBlueprints: {
      landing: args.artifacts.blueprints?.landing?.blueprint ?? seed.surfaceBlueprints.landing,
      customerApp:
        args.artifacts.blueprints?.customerApp?.blueprint ?? seed.surfaceBlueprints.customerApp,
      internalApp:
        args.artifacts.blueprints?.internalApp?.blueprint ?? seed.surfaceBlueprints.internalApp,
    },
    brandDossier: args.brandDossier ?? seed.brandDossier,
  });
}

export function summarizeArtifactCoverage(artifacts: DirectionArtifactSet): {
  complete: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  if (!artifacts.palette) missing.push('palette');
  if (!artifacts.typography) missing.push('typography');
  if (!artifacts.foundation) missing.push('foundation');
  if (!artifacts.motion) missing.push('motion');
  if (!artifacts.layout) missing.push('layout');
  if (!artifacts.blueprints?.landing) missing.push('blueprints.landing');
  if (!artifacts.blueprints?.customerApp) missing.push('blueprints.customerApp');
  if (!artifacts.blueprints?.internalApp) missing.push('blueprints.internalApp');

  return {
    complete: missing.length === 0,
    missing,
  };
}

