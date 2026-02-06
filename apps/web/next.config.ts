import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    reactCompiler: true,
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
  // Use standalone output to skip static page generation
  // Required when building without full env vars (e.g., Clerk keys)
  output: 'standalone',
};

export default nextConfig;
