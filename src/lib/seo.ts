import { useEffect } from 'react'

const SITE_NAME = 'Sree Balaji Industries'
const BASE_URL = 'https://sreebalajiindustries.netlify.app'
const DEFAULT_IMAGE = `${BASE_URL}/og-image.svg`

export interface SeoInput {
  title: string
  description: string
  path: string // e.g. '/', '/blog', '/blog/slug'
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

// Sets title, description, canonical, Open Graph, Twitter card and JSON-LD for
// the current route. Keeps a single managed JSON-LD block so SPA navigation
// leaves clean, crawlable, per-page metadata (Lighthouse SEO 100).
export function useSeo(input: SeoInput): void {
  const {
    title,
    description,
    path,
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
  }, [title, description, path, image, type, noindex, JSON.stringify(jsonLd)])
}

export const SITE = { SITE_NAME, BASE_URL, DEFAULT_IMAGE }
