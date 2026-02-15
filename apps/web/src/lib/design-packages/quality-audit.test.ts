import { describe, expect, it } from 'vitest';
import { ensureDesignPackageDataV2 } from './schema';
import { auditDesignPackageQuality, passesQualityGate } from './quality-audit';

function createBasePackage() {
  return ensureDesignPackageDataV2({
    colors: {
      light: {
        background: '0 0% 100%',
        foreground: '222 47% 11%',
        card: '0 0% 100%',
        cardForeground: '222 47% 11%',
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
      },
      dark: {
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
      },
    },
    typography: {
      fontFamily: 'Inter, sans-serif',
    },
    borderRadius: '0.75rem',
    mood: 'professional',
    animationStyle: 'professional',
  });
}

describe('quality-audit', () => {
  it('treats wcag as a soft gate when hard checks pass and score threshold is lower', () => {
    const pkg = createBasePackage();
    const lowContrast = ensureDesignPackageDataV2({
      ...pkg,
      colors: {
        ...pkg.colors,
        light: {
          ...pkg.colors.light,
          foreground: pkg.colors.light.background,
        },
      },
    });

    const audit = auditDesignPackageQuality(lowContrast);
    expect(audit.failedChecks).toContain('wcag-core');
    expect(audit.failedHardChecks).toHaveLength(0);
    expect(passesQualityGate(audit, 75)).toBe(true);
  });

  it('fails gate when a hard structural check fails regardless of score threshold', () => {
    const pkg = createBasePackage();
    const broken = {
      ...pkg,
      surfaceBlueprints: {
        ...pkg.surfaceBlueprints,
        internalApp: undefined,
      },
    } as unknown as typeof pkg;

    const audit = auditDesignPackageQuality(broken);
    expect(audit.failedHardChecks).toContain('blueprint-completeness');
    expect(passesQualityGate(audit, 50)).toBe(false);
  });
});
