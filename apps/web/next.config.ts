import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@baleyui/db',
    '@baleybots/core',
    '@baleybots/chat',
    '@baleybots/react',
    '@baleybots/tools',
  ],
  // Mark native modules as external - required for Vercel deployment
  // These modules have native bindings that can't be bundled
  serverExternalPackages: ['isolated-vm'],
  // Temporarily ignore ESLint during builds after merge
  // TODO: Fix remaining `any` types and remove this
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Use standalone output to skip static page generation
  // Required when building without full env vars (e.g., Clerk keys)
  output: 'standalone',
};

export default nextConfig;
