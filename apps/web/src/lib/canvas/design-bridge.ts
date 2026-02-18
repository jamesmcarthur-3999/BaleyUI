/**
 * Design Bridge
 *
 * Converts a DesignPackage into CSS/Tailwind files for injection
 * into the WebContainer scaffold template. This is the bridge between
 * the brand design system and the live canvas app.
 */

import { packageToCSS } from '@/lib/design-packages/css-variables';
import type { DesignPackageData } from '@/lib/design-packages/types';

// ============================================================================
// TYPES
// ============================================================================

export interface DesignBridgeFiles {
  /** globals.css with Tailwind v4 @theme overrides from the design package */
  'src/app/globals.css': string;
  /** Optional Google Fonts <link> injected into layout.tsx */
  'src/app/layout.tsx'?: string;
}

// ============================================================================
// CORE
// ============================================================================

/**
 * Convert a DesignPackageData into file content strings that can be
 * written into the WebContainer template via write_file.
 */
export function designPackageToFiles(
  data: DesignPackageData,
): DesignBridgeFiles {
  const lightVars = packageToCSS(data, 'light');
  const darkVars = packageToCSS(data, 'dark');

  // Build @theme block for Tailwind v4
  const lightEntries = Object.entries(lightVars)
    .map(([key, val]) => `  --color${key.replace('--', '-')}: ${val};`)
    .join('\n');

  const darkEntries = Object.entries(darkVars)
    .map(([key, val]) => `  --color${key.replace('--', '-')}: ${val};`)
    .join('\n');

  // Font family
  const fontFamily = data.typography.fontFamily || 'system-ui, -apple-system, sans-serif';
  const headingFont = data.typography.fontFamilyHeading;

  // Border radius tokens
  const radius = data.borderRadius || '0.5rem';

  const globalsCss = `@import "tailwindcss";

@theme {
  /* Light mode colors (design package) */
${lightEntries}

  /* Radius */
  --radius-sm: calc(${radius} - 4px);
  --radius-md: calc(${radius} - 2px);
  --radius-lg: ${radius};
  --radius-xl: calc(${radius} + 4px);
}

/* Dark mode overrides */
@media (prefers-color-scheme: dark) {
  :root {
${darkEntries}
  }
}

.dark {
${darkEntries}
}

body {
  font-family: ${fontFamily};
  background: var(--color-background);
  color: var(--color-foreground);
}

${headingFont ? `h1, h2, h3, h4, h5, h6 {\n  font-family: ${headingFont};\n}` : ''}
`;

  const result: DesignBridgeFiles = {
    'src/app/globals.css': globalsCss,
  };

  // If there's a Google Fonts URL, update layout.tsx to include it.
  // Validate the URL comes from fonts.googleapis.com to prevent template injection.
  const fontsUrl = data.typography.googleFontsUrl;
  if (fontsUrl && fontsUrl.startsWith('https://fonts.googleapis.com/')) {
    result['src/app/layout.tsx'] = buildLayoutWithFonts(fontsUrl);
  }

  return result;
}

// ============================================================================
// HELPERS
// ============================================================================

function buildLayoutWithFonts(googleFontsUrl: string): string {
  return `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Canvas App',
  description: 'Built with Baley',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="${googleFontsUrl}" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
`;
}
