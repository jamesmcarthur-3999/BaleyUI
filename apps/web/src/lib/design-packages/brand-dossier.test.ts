import { describe, expect, it } from 'vitest';
import { buildBrandDossier } from './brand-dossier';

describe('buildBrandDossier', () => {
  it('builds a canonical dossier with deduped signals', () => {
    const dossier = buildBrandDossier({
      sources: [
        {
          id: 'url-1',
          kind: 'url',
          label: 'https://example.com',
          confidence: 0.9,
          notes: ['Primary brand site'],
        },
      ],
      signals: [
        {
          extractedTokens: ['primary:220 80% 54%', 'primary:220 80% 54%'],
          typographySignals: ['primary-font:Manrope'],
          motionSignals: ['motion:moderate'],
          layoutSignals: ['density:comfortable'],
          voiceSignals: ['clear and direct'],
        },
      ],
      mood: 'professional',
      animationStyle: 'professional',
      accessibilityTarget: 'aaa',
      density: 'comfortable',
      voiceTone: 'clear and direct',
    });

    expect(dossier.sources).toHaveLength(1);
    expect(dossier.extractedTokens).toContain('primary:220 80% 54%');
    expect(dossier.extractedTokens.length).toBeGreaterThan(0);
    expect(dossier.recommendedDefaults.accessibilityTarget).toBe('aaa');
    expect(dossier.recommendedDefaults.voiceTone).toBe('clear and direct');
    expect(dossier.confidence.overall).toBeGreaterThan(0);
  });

  it('falls back safely when no sources are provided', () => {
    const dossier = buildBrandDossier({
      sources: [],
      mood: 'minimal',
      animationStyle: 'minimal',
    });

    expect(dossier.sources.length).toBeGreaterThan(0);
    expect(dossier.recommendedDefaults.mood).toBe('minimal');
    expect(dossier.recommendedDefaults.animationStyle).toBe('minimal');
  });
});
