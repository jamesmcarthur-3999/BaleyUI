import type { DesignMood, AnimationStyle } from './types';
import {
  brandDossierSchema,
  createDefaultBrandDossier,
  type DesignPackageDataV2,
} from './schema';

export interface BrandDossierSourceInput {
  id: string;
  kind: 'url' | 'image' | 'pdf' | 'text';
  label: string;
  confidence?: number;
  notes?: string[];
}

export interface BrandDossierSignalInput {
  extractedTokens?: string[];
  typographySignals?: string[];
  motionSignals?: string[];
  layoutSignals?: string[];
  voiceSignals?: string[];
}

export interface BuildBrandDossierInput {
  sources: BrandDossierSourceInput[];
  signals?: BrandDossierSignalInput[];
  mood: DesignMood;
  animationStyle: AnimationStyle;
  accessibilityTarget?: 'aa' | 'aaa';
  density?: 'compact' | 'comfortable' | 'spacious';
  voiceTone?: string;
}

function dedupeSorted(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function summarizeConfidence(sources: BrandDossierSourceInput[]): {
  overall: number;
  color: number;
  typography: number;
  motion: number;
  layout: number;
  voice: number;
} {
  if (sources.length === 0) {
    return {
      overall: 0.6,
      color: 0.6,
      typography: 0.6,
      motion: 0.55,
      layout: 0.55,
      voice: 0.65,
    };
  }

  const confidences = sources.map((source) => clamp01(source.confidence ?? 0.7));
  const average = confidences.reduce((sum, value) => sum + value, 0) / confidences.length;
  return {
    overall: Number(average.toFixed(3)),
    color: Number(Math.min(1, average + 0.05).toFixed(3)),
    typography: Number(average.toFixed(3)),
    motion: Number(Math.max(0, average - 0.08).toFixed(3)),
    layout: Number(Math.max(0, average - 0.06).toFixed(3)),
    voice: Number(Math.min(1, average + 0.03).toFixed(3)),
  };
}

export function buildBrandDossier(input: BuildBrandDossierInput): DesignPackageDataV2['brandDossier'] {
  const fallback = createDefaultBrandDossier({
    mood: input.mood,
    animationStyle: input.animationStyle,
    accessibilityTarget: input.accessibilityTarget,
    density: input.density,
    voiceTone: input.voiceTone,
  });

  const aggregatedSignals = (input.signals ?? []).reduce<{
    extractedTokens: string[];
    typographySignals: string[];
    motionSignals: string[];
    layoutSignals: string[];
    voiceSignals: string[];
  }>(
    (acc, signal) => {
      acc.extractedTokens.push(...(signal.extractedTokens ?? []));
      acc.typographySignals.push(...(signal.typographySignals ?? []));
      acc.motionSignals.push(...(signal.motionSignals ?? []));
      acc.layoutSignals.push(...(signal.layoutSignals ?? []));
      acc.voiceSignals.push(...(signal.voiceSignals ?? []));
      return acc;
    },
    {
      extractedTokens: [] as string[],
      typographySignals: [] as string[],
      motionSignals: [] as string[],
      layoutSignals: [] as string[],
      voiceSignals: [] as string[],
    }
  );

  const sources = (input.sources.length > 0 ? input.sources : fallback.sources).map((source) => ({
    id: source.id,
    kind: source.kind,
    label: source.label,
    confidence: clamp01(source.confidence ?? 0.7),
    notes: source.notes ?? [],
  }));

  return brandDossierSchema.parse({
    ...fallback,
    sources,
    extractedTokens: dedupeSorted([
      ...fallback.extractedTokens,
      ...aggregatedSignals.extractedTokens,
    ]),
    typographySignals: dedupeSorted([
      ...fallback.typographySignals,
      ...aggregatedSignals.typographySignals,
    ]),
    motionSignals: dedupeSorted([
      ...fallback.motionSignals,
      ...aggregatedSignals.motionSignals,
    ]),
    layoutSignals: dedupeSorted([
      ...fallback.layoutSignals,
      ...aggregatedSignals.layoutSignals,
    ]),
    voiceSignals: dedupeSorted([
      ...fallback.voiceSignals,
      ...aggregatedSignals.voiceSignals,
    ]),
    confidence: summarizeConfidence(sources),
    recommendedDefaults: {
      mood: input.mood,
      animationStyle: input.animationStyle,
      accessibilityTarget: input.accessibilityTarget ?? fallback.recommendedDefaults.accessibilityTarget,
      density: input.density ?? fallback.recommendedDefaults.density,
      voiceTone: input.voiceTone ?? fallback.recommendedDefaults.voiceTone,
    },
  });
}
