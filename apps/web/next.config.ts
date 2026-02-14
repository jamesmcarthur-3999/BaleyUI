import path from 'path';
import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// Resolve @baleybots/tools deep sub-path imports that aren't in the package's exports map.
// The barrel import pulls in @baleybots/core → express → fs, breaking client-side bundles.
const toolsPkgDir = path.dirname(require.resolve('@baleybots/tools/package.json'));
const dslDir = path.join(toolsPkgDir, 'dist', 'esm', 'baleybots-dsl-v2');
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
  webpack: (config, { isServer }) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@baleybots/tools/dsl/lexer': path.join(dslDir, 'lexer.js'),
      '@baleybots/tools/dsl/parser': path.join(dslDir, 'parser.js'),
      '@baleybots/tools/dsl/types': path.join(dslDir, 'types.js'),
      '@baleybots/tools/dsl/type-builder': path.join(dslDir, 'type-builder.js'),
    };
    config.infrastructureLogging = {
      ...(config.infrastructureLogging || {}),
      level: 'error',
    };

    // @baleybots/core's adapters barrel loads platform/node (fs/promises, child_process)
    // at import time. These modules are never executed client-side — only the platform/browser
    // adapter runs in the browser. Provide empty fallbacks so webpack doesn't fail.
    // NOTE: The @baleybots/auth → express chain was fixed upstream (baleybots/baleybots#37),
    // but core's own platform/node code still needs these fallbacks.
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
    // CSP directives — allows Vercel analytics and inline styles (Next.js requires them)
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://*.neon.tech wss://*.neon.tech https://*.public.blob.vercel-storage.com",
      "frame-src 'self' https://challenges.cloudflare.com",
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
