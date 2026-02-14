/**
 * Token Stream Parser for Design Package Incremental Morphing
 *
 * Parses partial JSON from set_design_package tool call argument deltas,
 * extracting complete "key": "value" pairs as they arrive. This enables
 * real-time CSS variable updates — colors morph onto the preview one by one
 * as the AI streams the design package JSON.
 *
 * The parser is regex-based and stateful: it tracks whether we're inside
 * colors.light or colors.dark by scanning for the last "light" or "dark" key.
 */

/** A single parsed token ready to be applied as a CSS variable */
export interface ParsedToken {
  /** Dot-separated path, e.g. "colors.light.primary" */
  path: string;
  /** Raw value, e.g. "262 83% 58%" */
  value: string;
  /** CSS variable name, e.g. "--primary" */
  cssVariable: string | null;
  /** Category for grouping: 'color' | 'typography' | 'layout' | 'meta' */
  category: 'color' | 'typography' | 'layout' | 'meta';
}

/** Map from ColorPalette key names to CSS variable names */
const COLOR_KEY_TO_CSS: Record<string, string> = {
  background: '--background',
  foreground: '--foreground',
  card: '--card',
  cardForeground: '--card-foreground',
  primary: '--primary',
  primaryForeground: '--primary-foreground',
  secondary: '--secondary',
  secondaryForeground: '--secondary-foreground',
  muted: '--muted',
  mutedForeground: '--muted-foreground',
  accent: '--accent',
  accentForeground: '--accent-foreground',
  destructive: '--destructive',
  destructiveForeground: '--destructive-foreground',
  border: '--border',
  input: '--input',
  ring: '--ring',
  success: '--color-success',
  warning: '--color-warning',
  error: '--color-error',
  info: '--color-info',
};

/** All color keys for quick set lookup */
const COLOR_KEYS = new Set(Object.keys(COLOR_KEY_TO_CSS));

/**
 * Stateful parser for incremental JSON token extraction.
 * Create one instance per tool call stream, feed deltas via `feed()`,
 * and collect `ParsedToken[]` from each call.
 */
export class DesignTokenStreamParser {
  /** Accumulated raw JSON so far */
  private buffer = '';
  /** Current color mode context: 'light' | 'dark' | null */
  private colorMode: 'light' | 'dark' | null = null;
  /** Current section context */
  private section: 'colors' | 'typography' | null = null;
  /** Position already scanned for key-value pairs */
  private scanOffset = 0;

  /** Cache of tokens by mode for toggling */
  readonly lightTokens: Map<string, ParsedToken> = new Map();
  readonly darkTokens: Map<string, ParsedToken> = new Map();

  /**
   * Feed a new delta chunk and extract any newly complete tokens.
   * Returns tokens that completed in this chunk (may be empty).
   */
  feed(delta: string): ParsedToken[] {
    this.buffer += delta;
    const tokens: ParsedToken[] = [];

    // Update section/mode context by scanning the new content for context keys.
    // We scan the whole buffer for mode context since it's cumulative.
    this.updateContext();

    // Extract complete "key": "value" pairs from the unscanned portion.
    // We use a regex that matches JSON key-value pairs.
    const scanRegion = this.buffer.slice(this.scanOffset);

    // Match: "key": "value" (string values)
    const stringPairRegex = /"([a-zA-Z_][a-zA-Z0-9_]*)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
    let match: RegExpExecArray | null;

    while ((match = stringPairRegex.exec(scanRegion)) !== null) {
      const key = match[1]!;
      const value = match[2]!;
      const token = this.classifyToken(key, value);
      if (token) {
        tokens.push(token);
        // Cache by mode
        if (token.category === 'color') {
          if (this.colorMode === 'light') {
            this.lightTokens.set(key, token);
          } else if (this.colorMode === 'dark') {
            this.darkTokens.set(key, token);
          }
        }
      }
    }

    // Advance scan offset to avoid re-processing.
    // Leave some overlap for partial matches at the boundary.
    if (this.buffer.length > 100) {
      this.scanOffset = Math.max(0, this.buffer.length - 100);
    }

    return tokens;
  }

  /**
   * Get all cached tokens for a given mode.
   */
  getTokensForMode(mode: 'light' | 'dark'): ParsedToken[] {
    const cache = mode === 'light' ? this.lightTokens : this.darkTokens;
    return Array.from(cache.values());
  }

  /** Reset parser state for reuse */
  reset(): void {
    this.buffer = '';
    this.colorMode = null;
    this.section = null;
    this.scanOffset = 0;
    this.lightTokens.clear();
    this.darkTokens.clear();
  }

  /** Update section and color mode context from accumulated buffer */
  private updateContext(): void {
    // Scan for the most recent context indicators.
    // We look for "light" or "dark" keys which indicate color mode.
    // We look for "colors" or "typography" keys which indicate section.

    // Find last occurrence of section markers
    const lastColorsIdx = this.buffer.lastIndexOf('"colors"');
    const lastTypographyIdx = this.buffer.lastIndexOf('"typography"');

    if (lastTypographyIdx > lastColorsIdx) {
      this.section = 'typography';
      this.colorMode = null;
    } else if (lastColorsIdx >= 0) {
      this.section = 'colors';
      // Within colors, check for light/dark
      const afterColors = this.buffer.slice(lastColorsIdx);
      const lastLightIdx = afterColors.lastIndexOf('"light"');
      const lastDarkIdx = afterColors.lastIndexOf('"dark"');

      if (lastDarkIdx > lastLightIdx) {
        this.colorMode = 'dark';
      } else if (lastLightIdx >= 0) {
        this.colorMode = 'light';
      }
    }
  }

  /** Classify a key-value pair into a ParsedToken, or null if not relevant */
  private classifyToken(key: string, value: string): ParsedToken | null {
    // Color tokens
    if (COLOR_KEYS.has(key) && this.section === 'colors' && this.colorMode) {
      return {
        path: `colors.${this.colorMode}.${key}`,
        value,
        cssVariable: COLOR_KEY_TO_CSS[key] ?? null,
        category: 'color',
      };
    }

    // Typography tokens
    if (key === 'fontFamily') {
      return {
        path: 'typography.fontFamily',
        value,
        cssVariable: '--font-family',
        category: 'typography',
      };
    }
    if (key === 'fontFamilyHeading') {
      return {
        path: 'typography.fontFamilyHeading',
        value,
        cssVariable: '--font-family-heading',
        category: 'typography',
      };
    }
    if (key === 'googleFontsUrl') {
      return {
        path: 'typography.googleFontsUrl',
        value,
        cssVariable: null,
        category: 'typography',
      };
    }

    // Layout tokens
    if (key === 'borderRadius') {
      return {
        path: 'borderRadius',
        value,
        cssVariable: '--radius',
        category: 'layout',
      };
    }

    // Meta tokens (mood, animationStyle)
    if (key === 'mood') {
      return { path: 'mood', value, cssVariable: null, category: 'meta' };
    }
    if (key === 'animationStyle') {
      return { path: 'animationStyle', value, cssVariable: null, category: 'meta' };
    }

    return null;
  }
}
