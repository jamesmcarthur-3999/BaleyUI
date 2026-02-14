/**
 * Deterministic Tailwind Theme Generator
 *
 * Converts DesignPackageData into TailwindThemeTokens. This is NOT AI-generated —
 * it's a pure function that maps design tokens to Tailwind-compatible format,
 * including mood-driven global defaults for shadows, transitions, and hover scale.
 */

import type { DesignPackageData, TailwindThemeTokens, DesignMood } from './types';
import { packageToCSS } from './css-variables';

/** Mood-driven global defaults */
const MOOD_DEFAULTS: Record<
  DesignMood,
  { shadow: string; transition: string; hoverScale: string }
> = {
  minimal: {
    shadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    transition: 'all 150ms ease',
    hoverScale: '1',
  },
  professional: {
    shadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    transition: 'all 200ms ease',
    hoverScale: '1',
  },
  elegant: {
    shadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    transition: 'all 250ms cubic-bezier(0.4, 0, 0.2, 1)',
    hoverScale: '1.01',
  },
  bold: {
    shadow: '0 10px 25px -5px rgb(0 0 0 / 0.15), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    hoverScale: '1.02',
  },
  playful: {
    shadow: '0 4px 14px -3px rgb(0 0 0 / 0.12), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    transition: 'all 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
    hoverScale: '1.03',
  },
};

/** Border radius scale based on the base radius value */
function buildRadiusScale(baseRadius: string): TailwindThemeTokens['borderRadius'] {
  // Parse the numeric value from the radius string (e.g., "0.75rem" -> 0.75)
  const match = baseRadius.match(/^([\d.]+)/);
  const base = match ? parseFloat(match[1]!) : 0.75;

  return {
    none: '0',
    sm: `${(base * 0.5).toFixed(3)}rem`,
    md: `${base.toFixed(3)}rem`,
    lg: `${(base * 1.5).toFixed(3)}rem`,
    xl: `${(base * 2).toFixed(3)}rem`,
    full: '9999px',
  };
}

/**
 * Generate Tailwind theme tokens from a DesignPackageData.
 * This is a pure deterministic function — no AI involved.
 */
export function generateTailwindTheme(data: DesignPackageData): TailwindThemeTokens {
  const lightVars = packageToCSS(data, 'light');
  const darkVars = packageToCSS(data, 'dark');

  // Build color utility mappings (maps Tailwind class names to CSS variable references)
  const colorUtilities: Record<string, string> = {
    primary: 'hsl(var(--primary))',
    'primary-foreground': 'hsl(var(--primary-foreground))',
    secondary: 'hsl(var(--secondary))',
    'secondary-foreground': 'hsl(var(--secondary-foreground))',
    muted: 'hsl(var(--muted))',
    'muted-foreground': 'hsl(var(--muted-foreground))',
    accent: 'hsl(var(--accent))',
    'accent-foreground': 'hsl(var(--accent-foreground))',
    destructive: 'hsl(var(--destructive))',
    'destructive-foreground': 'hsl(var(--destructive-foreground))',
    background: 'hsl(var(--background))',
    foreground: 'hsl(var(--foreground))',
    card: 'hsl(var(--card))',
    'card-foreground': 'hsl(var(--card-foreground))',
    border: 'hsl(var(--border))',
    input: 'hsl(var(--input))',
    ring: 'hsl(var(--ring))',
    success: 'hsl(var(--color-success))',
    warning: 'hsl(var(--color-warning))',
    error: 'hsl(var(--color-error))',
    info: 'hsl(var(--color-info))',
  };

  const moodDefaults = MOOD_DEFAULTS[data.mood] ?? MOOD_DEFAULTS.professional;

  return {
    cssVariables: { light: lightVars, dark: darkVars },
    colorUtilities,
    borderRadius: buildRadiusScale(data.borderRadius),
    fontFamily: {
      sans: data.typography.fontFamily,
      ...(data.typography.fontFamilyHeading
        ? { heading: data.typography.fontFamilyHeading }
        : {}),
    },
    googleFontsLink: data.typography.googleFontsUrl,
    defaultShadow: moodDefaults.shadow,
    defaultTransition: moodDefaults.transition,
    defaultHoverScale: moodDefaults.hoverScale,
  };
}
