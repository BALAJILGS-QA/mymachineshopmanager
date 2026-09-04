// Centralized, environment-driven SEO configuration — the single source of truth
// for site URL, branding, verification codes and analytics. Pure module (no
// React/browser deps) so it is safe to import from Server Components, Client
// Components and Node scripts alike.
//
// Every value falls back to the existing production defaults, so nothing changes
// unless the corresponding NEXT_PUBLIC_* env var is set. This keeps preview
// deployments and existing tests working while letting hosting override the URL.

import { BRAND } from '@/lib/brand'

// Read a NEXT_PUBLIC_* var at build/runtime with a fallback. process.env access
// is statically inlined by Next for NEXT_PUBLIC_* keys.
function envUrl(): string {
  // Only an EXPLICIT NEXT_PUBLIC_SITE_URL overrides the stable production domain.
  // We deliberately do NOT fall back to Vercel's per-deployment URL — that value
  // changes every deploy, which would make canonicals/sitemap/OG unstable. When
  // unset, canonicals point at the stable production domain (so preview builds
  // correctly canonicalize to production instead of to an ephemeral host).
  const raw = process.env.NEXT_PUBLIC_SITE_URL || 'https://sreebalajiindustries.netlify.app'
  // Normalise: strip a trailing slash so `${siteUrl}/path` never doubles up.
  return raw.replace(/\/+$/, '')
}

export const seoConfig = {
  /** Absolute origin used for canonical URLs, OG tags and the sitemap. */
  siteUrl: envUrl(),
  /** Product/site name shown in titles and OpenGraph. */
  siteName: process.env.NEXT_PUBLIC_SITE_NAME || BRAND.product,
  /** Legal/organization name for structured data. */
  legalName: BRAND.legalName,
  /** Default meta description used when a page does not set its own. */
  siteDescription: process.env.NEXT_PUBLIC_SITE_DESCRIPTION || BRAND.description,
  /** Default keyword string (pages should still set page-specific keywords). */
  keywords: BRAND.keywords,
  /** Logo + default social share image (relative paths resolved against siteUrl). */
  logoPath: '/favicon.svg',
  ogImagePath: '/og-image.svg',
  /** Locale for OpenGraph. */
  locale: 'en_IN',
  /** Contact details surfaced in Organization schema. */
  contact: BRAND.contact,
  /** Search-engine verification tokens (optional; env-driven, never hardcoded). */
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    bing: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION || undefined,
    yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION || undefined,
  },
  /** Google Analytics 4 measurement id (optional; analytics is a no-op if unset). */
  gaId: process.env.NEXT_PUBLIC_GA_ID || undefined,
} as const

/** Join the site origin with a path → an absolute, canonical URL. */
export function absoluteUrl(path = '/'): string {
  if (/^https?:\/\//i.test(path)) return path
  const p = path.startsWith('/') ? path : `/${path}`
  return `${seoConfig.siteUrl}${p === '/' ? '/' : p.replace(/\/+$/, '')}`
}

/** Absolute URL of the default social-share (OpenGraph) image. */
export function ogImageUrl(): string {
  return absoluteUrl(seoConfig.ogImagePath)
}

/** Absolute URL of the brand logo. */
export function logoUrl(): string {
  return absoluteUrl(seoConfig.logoPath)
}
