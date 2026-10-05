import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/seo'
import { FEATURES } from '@/features/site/solutionsData'

// Dynamic XML sitemap (replaces the former static public/sitemap.xml). Lists only
// canonical, public, indexable pages — the authenticated portal, API routes and
// one-time auth-utility pages are excluded. Feature entries are generated from
// their data source, so the sitemap scales as content grows.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const core: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1.0, lastModified: now },
    { url: absoluteUrl('/features'), changeFrequency: 'monthly', priority: 0.9, lastModified: now },
    { url: absoluteUrl('/about'), changeFrequency: 'monthly', priority: 0.6, lastModified: now },
    { url: absoluteUrl('/contact'), changeFrequency: 'yearly', priority: 0.6, lastModified: now },
    { url: absoluteUrl('/signup'), changeFrequency: 'yearly', priority: 0.6, lastModified: now },
    { url: absoluteUrl('/login'), changeFrequency: 'yearly', priority: 0.4, lastModified: now },
    { url: absoluteUrl('/terms'), changeFrequency: 'yearly', priority: 0.3, lastModified: now },
  ]

  const features: MetadataRoute.Sitemap = FEATURES.map((f) => ({
    url: absoluteUrl(`/features/${f.slug}`),
    changeFrequency: 'monthly',
    priority: 0.8,
    lastModified: now,
  }))

  return [...core, ...features]
}
