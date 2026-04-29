import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enable if needed
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'graph.microsoft.com',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
      },
    ],
  },
};

export default nextConfig;