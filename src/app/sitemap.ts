import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://arklms.institute'
  return [
    { url: `${base}/`, changeFrequency: 'monthly', priority: 1 },
    { url: `${base}/about`, changeFrequency: 'yearly', priority: 0.7 },
    { url: `${base}/contact`, changeFrequency: 'yearly', priority: 0.7 },
  ]
}