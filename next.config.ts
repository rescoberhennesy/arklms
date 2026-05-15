import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'graph.microsoft.com',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '54321',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // Move it here, right at the root of nextConfig
  outputFileTracingIncludes: {
    '/api/ai/quiz/export': [
      './node_modules/pdfkit/js/data/**',
    ],
  },
};

export default nextConfig;