import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // ESLint v8 is used but eslint.config.mjs uses flat config (v9 format).
    // Linting is run separately via `next lint` in CI — not during builds.
    ignoreDuringBuilds: true,
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Suppress known benign Genkit/OpenTelemetry third-party warnings
      config.ignoreWarnings = [
        { module: /require-in-the-middle/ },
        { module: /@opentelemetry\/instrumentation/ },
        { module: /express\/lib\/view/ },
      ];
    }
    return config;
  },
};

export default withSerwist(nextConfig);
