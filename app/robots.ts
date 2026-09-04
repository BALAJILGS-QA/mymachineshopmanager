import type { MetadataRoute } from 'next'
import { seoConfig, absoluteUrl } from '@/lib/seo'

// Dynamic robots.txt (replaces the former static public/robots.txt so the host
// and sitemap URL follow NEXT_PUBLIC_SITE_URL). Public marketing pages are
// crawlable; the authenticated portal, API routes and one-time auth-utility
// pages are blocked. The portal is also protected by an X-Robots-Tag header
// (next.config.mjs) and client-side auth — defence in depth.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/app', '/api/', '/forgot-password', '/reset-password'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: seoConfig.siteUrl,
  }
}
