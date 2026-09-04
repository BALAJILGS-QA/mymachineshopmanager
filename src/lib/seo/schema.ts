// Schema.org (JSON-LD) builders. Each returns a plain object so a page can
// compose several into ONE `@graph` and render a single <JsonLd> (the app keeps
// exactly one `script#route-jsonld` per page — see app/_site/json-ld.tsx and the
// e2e contract). Nothing here fabricates ratings, reviews, prices or awards.

import { seoConfig, absoluteUrl, ogImageUrl, logoUrl } from './config'

type Node = Record<string, unknown>

/** Organization — the company/brand behind the product. */
export function organizationSchema(): Node {
  return {
    '@type': 'Organization',
    '@id': `${seoConfig.siteUrl}/#organization`,
    name: seoConfig.legalName,
    alternateName: seoConfig.siteName,
    url: seoConfig.siteUrl,
    logo: logoUrl(),
    description: seoConfig.siteDescription,
    email: seoConfig.contact.email,
    address: { '@type': 'PostalAddress', addressCountry: seoConfig.contact.location },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: seoConfig.contact.email,
      availableLanguage: ['English'],
    },
  }
}

/** WebSite — enables sitelinks/search understanding for the domain. */
export function websiteSchema(): Node {
  return {
    '@type': 'WebSite',
    '@id': `${seoConfig.siteUrl}/#website`,
    name: seoConfig.siteName,
    url: seoConfig.siteUrl,
    description: seoConfig.siteDescription,
    publisher: { '@id': `${seoConfig.siteUrl}/#organization` },
    inLanguage: 'en',
  }
}

/** SoftwareApplication — the product itself (free trial; no fabricated pricing). */
export function softwareApplicationSchema(): Node {
  return {
    '@type': 'SoftwareApplication',
    name: seoConfig.siteName,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: seoConfig.siteDescription,
    url: seoConfig.siteUrl,
    image: ogImageUrl(),
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
    publisher: { '@id': `${seoConfig.siteUrl}/#organization` },
  }
}

/** Generic WebPage node for a public page. */
export function webPageSchema(opts: { path: string; name: string; description: string }): Node {
  const url = absoluteUrl(opts.path)
  return {
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: opts.name,
    description: opts.description,
    isPartOf: { '@id': `${seoConfig.siteUrl}/#website` },
    inLanguage: 'en',
  }
}

/** A Service offered by the product (used on feature/module pages). */
export function serviceSchema(opts: {
  name: string
  description: string
  path: string
  serviceType?: string
}): Node {
  return {
    '@type': 'Service',
    name: opts.name,
    description: opts.description,
    url: absoluteUrl(opts.path),
    serviceType: opts.serviceType ?? opts.name,
    provider: { '@id': `${seoConfig.siteUrl}/#organization` },
    areaServed: seoConfig.contact.location,
  }
}

/** BreadcrumbList from an ordered list of { name, path } crumbs. */
export function breadcrumbSchema(items: { name: string; path: string }[]): Node {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  }
}

/** FAQPage from question/answer pairs. */
export function faqSchema(faqs: { q: string; a: string }[]): Node {
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
}

/** Article / BlogPosting node. */
export function articleSchema(opts: {
  path: string
  headline: string
  description: string
  datePublished: string
  dateModified?: string
  author?: string
  keywords?: string[]
}): Node {
  const url = absoluteUrl(opts.path)
  return {
    '@type': 'BlogPosting',
    headline: opts.headline,
    description: opts.description,
    datePublished: opts.datePublished,
    dateModified: opts.dateModified ?? opts.datePublished,
    author: { '@type': 'Organization', name: opts.author ?? seoConfig.siteName },
    publisher: { '@id': `${seoConfig.siteUrl}/#organization` },
    mainEntityOfPage: url,
    url,
    image: ogImageUrl(),
    ...(opts.keywords?.length ? { keywords: opts.keywords.join(', ') } : {}),
  }
}

/** Wrap composed nodes into a single @graph document for one <JsonLd>. */
export function graph(...nodes: Node[]): Record<string, unknown> {
  return { '@context': 'https://schema.org', '@graph': nodes }
}
