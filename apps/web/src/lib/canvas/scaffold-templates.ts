/**
 * Scaffold Templates
 *
 * Deterministic file contents for the base project template.
 * These are mounted into the WebContainer as the starting point
 * before Baley writes app-specific files.
 */

// ============================================================================
// NEXT.JS + SHADCN/UI TEMPLATE
// ============================================================================

function nextjsShadcnTemplate(): Record<string, string> {
  return {
    'package.json': JSON.stringify(
      {
        name: 'canvas-app',
        version: '0.1.0',
        private: true,
        scripts: {
          dev: 'next dev --turbopack --port 3000',
          build: 'next build',
          start: 'next start',
        },
        dependencies: {
          next: '15.1.0',
          react: '19.0.0',
          'react-dom': '19.0.0',
          'class-variance-authority': '^0.7.1',
          clsx: '^2.1.1',
          'tailwind-merge': '^2.6.0',
          'lucide-react': '^0.468.0',
          'tailwindcss': '^4.0.0',
          '@tailwindcss/postcss': '^4.0.0',
        },
        devDependencies: {
          typescript: '^5.7.0',
          '@types/node': '^22.0.0',
          '@types/react': '^19.0.0',
          '@types/react-dom': '^19.0.0',
        },
      },
      null,
      2,
    ),

    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2017',
          lib: ['dom', 'dom.iterable', 'esnext'],
          allowJs: true,
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          module: 'esnext',
          moduleResolution: 'bundler',
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: 'preserve',
          incremental: true,
          paths: { '@/*': ['./src/*'] },
        },
        include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
        exclude: ['node_modules'],
      },
      null,
      2,
    ),

    'next.config.ts': `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
`,

    'postcss.config.mjs': `/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
`,

    'src/app/globals.css': `@import "tailwindcss";

@theme {
  --color-background: oklch(1 0 0);
  --color-foreground: oklch(0.145 0 0);
  --color-card: oklch(1 0 0);
  --color-card-foreground: oklch(0.145 0 0);
  --color-primary: oklch(0.205 0 0);
  --color-primary-foreground: oklch(0.985 0 0);
  --color-secondary: oklch(0.97 0 0);
  --color-secondary-foreground: oklch(0.205 0 0);
  --color-muted: oklch(0.97 0 0);
  --color-muted-foreground: oklch(0.556 0 0);
  --color-accent: oklch(0.97 0 0);
  --color-accent-foreground: oklch(0.205 0 0);
  --color-destructive: oklch(0.577 0.245 27.325);
  --color-border: oklch(0.922 0 0);
  --color-input: oklch(0.922 0 0);
  --color-ring: oklch(0.708 0 0);
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: var(--color-background);
  color: var(--color-foreground);
}
`,

    'src/app/layout.tsx': `import type { Metadata } from 'next';
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
      <body>{children}</body>
    </html>
  );
}
`,

    'src/app/page.tsx': `export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Welcome</h1>
        <p className="text-muted-foreground">
          Baley is setting up your app...
        </p>
      </div>
    </main>
  );
}
`,

    'src/lib/utils.ts': `import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`,
  };
}

// ============================================================================
// REGISTRY
// ============================================================================

const TEMPLATES: Record<string, () => Record<string, string>> = {
  'nextjs-shadcn': nextjsShadcnTemplate,
};

/**
 * Get scaffold template files by name.
 */
export function getScaffoldTemplate(name: string): Record<string, string> {
  const factory = TEMPLATES[name];
  if (!factory) {
    throw new Error(`Unknown scaffold template: ${name}`);
  }
  return factory();
}

/**
 * List available scaffold template names.
 */
export function listScaffoldTemplates(): string[] {
  return Object.keys(TEMPLATES);
}
