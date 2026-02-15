import { PassThrough } from 'node:stream';
import { once } from 'node:events';
import type { ArtifactManifestEntry } from './types';
import { packageToCSSString } from './css-variables';
import { generateTailwindTheme } from './tailwind-theme';
import {
  createDefaultArtifactManifest,
  ensureDesignPackageDataV2,
  type DesignPackageDataV2,
} from './schema';

export interface ArtifactBundleFile {
  path: string;
  kind: ArtifactManifestEntry['kind'];
  description: string;
  content: string;
}

export interface ArtifactBundle {
  packageName: string;
  packageData: DesignPackageDataV2;
  files: ArtifactBundleFile[];
}

export interface ZippedArtifactBundle {
  filename: string;
  contentType: 'application/zip';
  base64: string;
  files: Array<Pick<ArtifactBundleFile, 'path' | 'kind' | 'description'>>;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'design-package';
}

function buildTokensCss(data: DesignPackageDataV2): string {
  const light = packageToCSSString(data, 'root', 'light')
    .replace('#root', ':root');
  const dark = packageToCSSString(data, 'root', 'dark')
    .replace('#root', '.dark');

  return [
    '/* Design Tokens (V2) */',
    `/* Generated: ${new Date().toISOString()} */`,
    '',
    light,
    '',
    dark,
    '',
  ].join('\n');
}

function buildTemplate(
  title: string,
  purpose: string,
  samplePrompt: string,
  sectionIds: string[]
): string {
  return `import React from 'react';

export default function ${title.replace(/\s+/g, '')}Template() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/70 px-6 py-4">
        <h1 className="text-2xl font-semibold tracking-tight">${title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">${purpose}</p>
      </header>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-3">
        <article className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
          <h2 className="text-lg font-medium">Primary Workspace</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Replace this with your production content and components.
          </p>
          <div className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Suggested sections: ${sectionIds.join(', ')}
          </div>
        </article>

        <aside className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">AI Prompt Seed</h3>
          <p className="mt-3 text-sm leading-relaxed">${samplePrompt}</p>
        </aside>
      </section>
    </main>
  );
}
`;
}

function buildReadme(name: string, files: ArtifactBundleFile[]): string {
  return [
    `# ${name} Design Artifact Bundle`,
    '',
    'This bundle was generated from BaleyUI Design Calibration V2.',
    '',
    '## Included files',
    ...files.map((f) => `- \`${f.path}\` — ${f.description}`),
    '',
    '## Recommended usage',
    '1. Import `tokens.css` into your app shell.',
    '2. Merge `tailwind-theme.json` into your Tailwind config tokens.',
    '3. Start from templates in `templates/react-tailwind/` and adapt sections to your product.',
    '4. Use blueprints as structured context when spawning future BaleyBots for UI generation.',
    '',
  ].join('\n');
}

export function buildArtifactBundle(
  packageName: string,
  rawData: unknown
): ArtifactBundle {
  const packageData = ensureDesignPackageDataV2(rawData);
  const tailwindTheme = packageData.tailwindTheme ?? generateTailwindTheme(packageData);
  const manifest = packageData.artifactManifest ?? createDefaultArtifactManifest();

  const landing = packageData.surfaceBlueprints.landing;
  const customerApp = packageData.surfaceBlueprints.customerApp;
  const internalApp = packageData.surfaceBlueprints.internalApp;

  const files: ArtifactBundleFile[] = [
    {
      path: 'design-package.v2.json',
      kind: 'json',
      description: 'Canonical design package payload including blueprints and systems',
      content: JSON.stringify(
        {
          ...packageData,
          tailwindTheme,
          artifactManifest: manifest,
        },
        null,
        2
      ),
    },
    {
      path: 'tokens.css',
      kind: 'css',
      description: 'CSS custom properties for light and dark themes',
      content: buildTokensCss(packageData),
    },
    {
      path: 'tailwind-theme.json',
      kind: 'json',
      description: 'Tailwind token extension map',
      content: JSON.stringify(tailwindTheme, null, 2),
    },
    {
      path: 'blueprints/landing.json',
      kind: 'json',
      description: 'Landing page blueprint',
      content: JSON.stringify(landing, null, 2),
    },
    {
      path: 'blueprints/customer-app.json',
      kind: 'json',
      description: 'Customer application blueprint',
      content: JSON.stringify(customerApp, null, 2),
    },
    {
      path: 'blueprints/internal-app.json',
      kind: 'json',
      description: 'Internal application blueprint',
      content: JSON.stringify(internalApp, null, 2),
    },
    {
      path: 'templates/react-tailwind/landing-page.tsx',
      kind: 'tsx',
      description: 'Landing page React + Tailwind starter',
      content: buildTemplate(
        'Landing Page',
        landing.purpose,
        landing.samplePrompt,
        landing.sectionOrder.map((section) => section.id)
      ),
    },
    {
      path: 'templates/react-tailwind/customer-app.tsx',
      kind: 'tsx',
      description: 'Customer app React + Tailwind starter',
      content: buildTemplate(
        'Customer App',
        customerApp.purpose,
        customerApp.samplePrompt,
        customerApp.sectionOrder.map((section) => section.id)
      ),
    },
    {
      path: 'templates/react-tailwind/internal-app.tsx',
      kind: 'tsx',
      description: 'Internal app React + Tailwind starter',
      content: buildTemplate(
        'Internal App',
        internalApp.purpose,
        internalApp.samplePrompt,
        internalApp.sectionOrder.map((section) => section.id)
      ),
    },
    {
      path: 'README.md',
      kind: 'md',
      description: 'Bundle usage guide',
      content: '',
    },
  ];

  const readme = buildReadme(packageName, files.filter((f) => f.path !== 'README.md'));
  const readmeIndex = files.findIndex((f) => f.path === 'README.md');
  if (readmeIndex >= 0) {
    const existingReadme = files[readmeIndex];
    if (existingReadme) {
      files[readmeIndex] = {
        ...existingReadme,
        content: readme,
      };
    }
  }

  return {
    packageName,
    packageData,
    files,
  };
}

export async function buildArtifactBundleZip(
  packageName: string,
  rawData: unknown
): Promise<ZippedArtifactBundle> {
  const bundle = buildArtifactBundle(packageName, rawData);

  const archiverModule = (await import('archiver')) as unknown as {
    default?: (format: string, options?: Record<string, unknown>) => {
      append: (content: string, options: { name: string }) => void;
      pipe: (stream: PassThrough) => void;
      finalize: () => Promise<void>;
    };
  };

  const createArchive = archiverModule.default;
  if (!createArchive) {
    throw new Error('zip archiver is unavailable in this environment');
  }

  const archive = createArchive('zip', { zlib: { level: 9 } });
  const stream = new PassThrough();
  const chunks: Buffer[] = [];

  archive.pipe(stream);
  stream.on('data', (chunk: Buffer) => {
    chunks.push(Buffer.from(chunk));
  });

  for (const file of bundle.files) {
    archive.append(file.content, { name: file.path });
  }

  await archive.finalize();
  await once(stream, 'end');

  const zipBuffer = Buffer.concat(chunks);
  return {
    filename: `${slugify(packageName)}-design-artifacts.zip`,
    contentType: 'application/zip',
    base64: zipBuffer.toString('base64'),
    files: bundle.files.map(({ path, kind, description }) => ({ path, kind, description })),
  };
}
