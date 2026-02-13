import type { DesignPackageData, ColorPalette } from './types';

/** Map of CSS variable names to HSL values */
export type CSSVariableMap = Record<string, string>;

/** Convert a ColorPalette to CSS variable entries */
function paletteToVariables(palette: ColorPalette): CSSVariableMap {
  return {
    '--background': palette.background,
    '--foreground': palette.foreground,
    '--card': palette.card,
    '--card-foreground': palette.cardForeground,
    '--popover': palette.card,
    '--popover-foreground': palette.cardForeground,
    '--primary': palette.primary,
    '--primary-foreground': palette.primaryForeground,
    '--secondary': palette.secondary,
    '--secondary-foreground': palette.secondaryForeground,
    '--muted': palette.muted,
    '--muted-foreground': palette.mutedForeground,
    '--accent': palette.accent,
    '--accent-foreground': palette.accentForeground,
    '--destructive': palette.destructive,
    '--destructive-foreground': palette.destructiveForeground,
    '--border': palette.border,
    '--input': palette.input,
    '--ring': palette.ring,
    '--color-success': palette.success,
    '--color-warning': palette.warning,
    '--color-error': palette.error,
    '--color-info': palette.info,
  };
}

/** Convert a DesignPackageData to CSS variables for a given mode */
export function packageToCSS(
  data: DesignPackageData,
  mode: 'light' | 'dark'
): CSSVariableMap {
  const palette = mode === 'light' ? data.colors.light : data.colors.dark;
  const vars = paletteToVariables(palette);

  // Add typography
  vars['--font-family'] = data.typography.fontFamily;
  if (data.typography.fontFamilyHeading) {
    vars['--font-family-heading'] = data.typography.fontFamilyHeading;
  }

  // Add border radius
  vars['--radius'] = data.borderRadius;

  return vars;
}

/** Generate a CSS string for scoping under a container ID */
export function packageToCSSString(
  data: DesignPackageData,
  containerId: string,
  mode: 'light' | 'dark'
): string {
  const vars = packageToCSS(data, mode);
  const entries = Object.entries(vars)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');
  return `#${containerId} {\n${entries}\n}`;
}

/** Parse an HSL string ("262 83% 58%") into { h, s, l } */
export function parseHSL(hsl: string): { h: number; s: number; l: number } | null {
  const match = hsl.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!match) return null;
  return {
    h: parseFloat(match[1]!),
    s: parseFloat(match[2]!),
    l: parseFloat(match[3]!),
  };
}

/** Format { h, s, l } back to an HSL string */
export function formatHSL(h: number, s: number, l: number): string {
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

/** Convert HSL string to hex for color pickers */
export function hslToHex(hsl: string): string {
  const parsed = parseHSL(hsl);
  if (!parsed) return '#000000';
  const { h, s, l } = parsed;
  const sNorm = s / 100;
  const lNorm = l / 100;
  const a = sNorm * Math.min(lNorm, 1 - lNorm);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = lNorm - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Convert hex to HSL string */
export function hexToHSL(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0 0% 0%';
  const r = parseInt(result[1]!, 16) / 255;
  const g = parseInt(result[2]!, 16) / 255;
  const b = parseInt(result[3]!, 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return formatHSL(0, 0, l * 100);
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return formatHSL(h * 360, s * 100, l * 100);
}
