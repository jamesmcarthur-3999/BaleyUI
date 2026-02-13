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
