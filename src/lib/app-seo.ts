import { useEffect } from 'react'
import { SITE_NAME, BASE_URL, DEFAULT_IMAGE } from './site-meta'

export interface SeoInput {
  title: string
  description: string
  path: string // e.g. '/', '/blog', '/blog/slug'
  keywords?: string
  image?: string
  type?: 'website' | 'article'
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
  noindex?: boolean
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

// Swap the browser-tab favicon at runtime (e.g. to a shop's uploaded icon).
// Pass a data URL or a path; falls back to the bundled default when empty.
export function applyFavicon(href: string) {
  const url = href || '/favicon.svg'
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'icon')
    document.head.appendChild(el)
  }
  // Data URLs carry their own MIME; a bare .svg path needs the SVG type hint.
  if (url.startsWith('data:')) el.removeAttribute('type')
  else if (url.endsWith('.svg')) el.setAttribute('type', 'image/svg+xml')
  else el.removeAttribute('type')
  el.setAttribute('href', url)
}

// Sets title, description, canonical, Open Graph, Twitter card and JSON-LD for
// the current route. Keeps a single managed JSON-LD block so SPA navigation
// leaves clean, crawlable, per-page metadata (Lighthouse SEO 100).
export function useSeo(input: SeoInput): void {
  const {
    title,
    description,
    path,
    keywords,
    image = DEFAULT_IMAGE,
    type = 'website',
    jsonLd,
    noindex,
  } = input

  useEffect(() => {
    const url = `${BASE_URL}${path}`
    const fullTitle = path === '/' ? title : `${title} · ${SITE_NAME}`
    document.title = fullTitle

    upsertMeta('name', 'description', description)
    if (keywords) upsertMeta('name', 'keywords', keywords)
    upsertMeta('name', 'robots', noindex ? 'noindex,nofollow' : 'index,follow')
    upsertLink('canonical', url)

    upsertMeta('property', 'og:site_name', SITE_NAME)
    upsertMeta('property', 'og:title', fullTitle)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:type', type)
    upsertMeta('property', 'og:url', url)
    upsertMeta('property', 'og:image', image)

    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', fullTitle)
    upsertMeta('name', 'twitter:description', description)
    upsertMeta('name', 'twitter:image', image)

    const ID = 'route-jsonld'
    document.getElementById(ID)?.remove()
    if (jsonLd) {
      const script = document.createElement('script')
      script.type = 'application/ld+json'
      script.id = ID
      script.text = JSON.stringify(jsonLd)
      document.head.appendChild(script)
    }
  }, [title, description, path, keywords, image, type, noindex, JSON.stringify(jsonLd)])
}

export { SITE } from './site-meta'

// Applies SEO/meta globally for the authenticated app using the configured shop
// profile. Called on every route so the shop name, description and keywords set
// in Settings → Shop Profile reflect in the document title and meta tags across
// all pages. Not a hook — safe to call from an effect.
export function applyAppSeo(opts: {
  shopName: string
  pageLabel: string
  description?: string
  keywords?: string
}): void {
  // Brand-led, page-specific tab title (e.g. "MSM | Dashboard"). The shop name
  // stays in og:site_name below and in the sidebar/login branding.
  const title = `MSM | ${opts.pageLabel}`
  document.title = title
  upsertMeta('name', 'description', opts.description || opts.shopName)
  if (opts.keywords) upsertMeta('name', 'keywords', opts.keywords)
  upsertMeta('property', 'og:site_name', opts.shopName)
  upsertMeta('property', 'og:title', title)
  if (opts.description) upsertMeta('property', 'og:description', opts.description)
  upsertMeta('property', 'og:type', 'website')
  upsertMeta('name', 'twitter:card', 'summary_large_image')
  upsertMeta('name', 'twitter:title', title)
  if (opts.description) upsertMeta('name', 'twitter:description', opts.description)
  upsertMeta('name', 'twitter:image', DEFAULT_IMAGE)
  upsertMeta('property', 'og:image', DEFAULT_IMAGE)
}
