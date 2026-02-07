import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  experimental: {
    reactCompiler: true,
  },
  async headers() {
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
    'isolated-vm',
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
    disable: true,
  },
});
