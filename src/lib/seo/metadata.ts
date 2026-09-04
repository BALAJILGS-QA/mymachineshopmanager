// buildMetadata() — one helper that produces a complete, consistent Next.js
// Metadata object (title, description, canonical, robots, OpenGraph, Twitter) for
// any public page. Pages pass a path (used for a self-referencing canonical) plus
// the copy; branding/URL come from the centralized seoConfig.

import type { Metadata } from 'next'
import { seoConfig, absoluteUrl, ogImageUrl } from './config'

export interface BuildMetadataInput {
  /** Page path for the self-referencing canonical, e.g. "/features/inventory-management". */
  path: string
  title: string
  description: string
  keywords?: string | string[]
  /** Absolute or site-relative OG/Twitter image; defaults to the brand OG image. */
  image?: string
  /** Defaults to index,follow. Pass false for private/utility pages. */
  index?: boolean
  /** OpenGraph type — "website" (default) or "article". */
  type?: 'website' | 'article'
}

export function buildMetadata(input: BuildMetadataInput): Metadata {
  const url = absoluteUrl(input.path)
  const image = input.image ? absoluteUrl(input.image) : ogImageUrl()
  const keywords = Array.isArray(input.keywords) ? input.keywords.join(', ') : input.keywords
  const index = input.index ?? true

  return {
    metadataBase: new URL(seoConfig.siteUrl),
    title: input.title,
    description: input.description,
    ...(keywords ? { keywords } : {}),
    alternates: { canonical: url },
    robots: index ? 'index,follow' : 'noindex,nofollow',
    openGraph: {
      siteName: seoConfig.siteName,
      title: input.title,
      description: input.description,
      type: input.type ?? 'website',
      url,
      locale: seoConfig.locale,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
      images: [image],
    },
  }
}
