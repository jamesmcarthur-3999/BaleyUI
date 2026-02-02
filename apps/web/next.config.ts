import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@baleyui/db',
    '@baleybots/core',
    '@baleybots/chat',
    '@baleybots/react',
    '@baleybots/tools',
  ],
};

export default nextConfig;
