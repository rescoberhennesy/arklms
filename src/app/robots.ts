import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/about', '/contact'],
      disallow: ['/teacher', '/student', '/admin', '/api', '/auth'],
    },
    sitemap: 'https://arklms.institute/sitemap.xml',
  }
}