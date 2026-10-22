import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'graph.microsoft.com',
      },
      // Supabase cloud storage (live site)
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      // Local Supabase (development)
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '54321',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  outputFileTracingIncludes: {
    '/api/ai/quiz/export': [
      './node_modules/pdfkit/js/data/**',
    ],
  },
};

export default nextConfig;