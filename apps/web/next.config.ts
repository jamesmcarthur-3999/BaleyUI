import path from 'path';
import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// Resolve @baleybots/tools deep sub-path imports that aren't in the package's exports map.
// The barrel import pulls in @baleybots/core → express → fs, breaking client-side bundles.
const toolsPkgDir = path.dirname(require.resolve('@baleybots/tools/package.json'));
const dslDir = path.join(toolsPkgDir, 'dist', 'esm', 'baleybots-dsl-v2');
// Turbopack resolveAlias doesn't support absolute paths (treats /foo as ./foo).
// Compute a relative path from the project root for Turbopack aliases.
const relativeDslDir = './' + path.relative(process.cwd(), dslDir).split(path.sep).join('/');
const workspaceRoot = path.join(process.cwd(), '../..');

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [],
  },
  experimental: {
    reactCompiler: true,
  },
  // Explicitly pin tracing root to this monorepo to avoid Next.js inferring
  // a parent directory when unrelated lockfiles exist on the host machine.
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    resolveAlias: {
      // DSL sub-path aliases (equivalent to webpack resolve.alias).
      // Uses relative paths because Turbopack doesn't support absolute paths in resolveAlias.
      '@baleybots/tools/dsl/lexer': relativeDslDir + '/lexer.js',
      '@baleybots/tools/dsl/parser': relativeDslDir + '/parser.js',
      '@baleybots/tools/dsl/types': relativeDslDir + '/types.js',
      '@baleybots/tools/dsl/type-builder': relativeDslDir + '/type-builder.js',
      // Redirect @baleybots/auth to a lightweight shim that only exports the pure
      // functions used by @baleybots/core (getRequestHeaders). This eliminates the
      // transitive express dependency that Turbopack can't bundle (dynamic require).
      '@baleybots/auth': './src/lib/baleybots-auth-shim.ts',
      // @baleybots/core optionally imports these providers via try/catch. Turbopack
      // treats dynamic import() as a hard requirement. Alias to empty so the import
      // succeeds silently — actual provider availability is checked at runtime.
      'ollama-ai-provider': './turbopack-empty.js',
      // Client-side fallbacks for Node.js builtins (equivalent to webpack resolve.fallback)
      fs: { browser: './turbopack-empty.js' },
      net: { browser: './turbopack-empty.js' },
      tls: { browser: './turbopack-empty.js' },
      child_process: { browser: './turbopack-empty.js' },
      'fs/promises': { browser: './turbopack-empty.js' },
    },
  },
  webpack: (config, { isServer }) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@baleybots/tools/dsl/lexer': path.join(dslDir, 'lexer.js'),
      '@baleybots/tools/dsl/parser': path.join(dslDir, 'parser.js'),
      '@baleybots/tools/dsl/types': path.join(dslDir, 'types.js'),
      '@baleybots/tools/dsl/type-builder': path.join(dslDir, 'type-builder.js'),
      // Same shim as Turbopack — eliminates express from @baleybots/auth.
      '@baleybots/auth': path.join(__dirname, 'src/lib/baleybots-auth-shim.ts'),
    };
    config.infrastructureLogging = {
      ...(config.infrastructureLogging || {}),
      level: 'error',
    };

    // @baleybots/core's adapters barrel loads platform/node (fs/promises, child_process)
    // at import time. These modules are never executed client-side — only the platform/browser
    // adapter runs in the browser. Provide empty fallbacks so webpack doesn't fail.
    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        net: false,
        tls: false,
        child_process: false,
        'fs/promises': false,
      };
    }

    return config;
  },
  async headers() {
    const isDev = process.env.NODE_ENV === 'development';

    // CSP directives — allows Vercel analytics and inline styles (Next.js requires them)
    // In dev, better-auth's betterFetch uses absolute http://localhost:* URLs which
    // don't match 'self' in some Next.js dev server configurations.
    const connectSrc = [
      "'self'",
      'https://*.neon.tech',
      'wss://*.neon.tech',
      'https://*.public.blob.vercel-storage.com',
      ...(isDev ? ['http://localhost:*'] : []),
    ].join(' ');

    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com",
      "font-src 'self' https://fonts.gstatic.com",
      `connect-src ${connectSrc}`,
      "frame-src 'self' https://challenges.cloudflare.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Content-Security-Policy', value: cspDirectives },
        ],
      },
    ];
  },
  // Only @baleyui/db needs transpilation — it ships TypeScript source (src/*.ts).
  // All @baleybots/* packages ship pre-built ESM (dist/esm/) and must NOT be here.
  transpilePackages: [
    '@baleyui/db',
  ],
  // Server-external packages are resolved by Node.js at runtime, not bundled.
  // @baleybots/* packages have heavy transitive deps (express, @baleybots/auth, ws,
  // child_process) that cause infinite dev compilation hangs when bundled. Since they
  // ship pre-built ESM and are only used server-side, externalizing is correct.
  serverExternalPackages: [
    '@baleybots/core',
    '@baleybots/tools',
    '@baleybots/chat',
    '@baleybots/react',
    // @baleybots/auth is aliased to a lightweight shim (no express) via resolveAlias.
    // Turbopack can't resolve these through pnpm's isolated node_modules
    // (they're transitive deps of @baleyui/db). Let Node.js resolve at runtime.
    'drizzle-orm',
    'postgres',
  ],
  // Note: 'standalone' output removed — Vercel uses its own adapter.
  // For Docker/self-hosted, re-add output: 'standalone'.
};

export default withSentryConfig(nextConfig, {
  // Suppress source map upload logs in CI
  silent: true,
  // Skip source map upload when no auth token is configured
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
