# SEO Implementation

This document describes the SEO system for the MSM marketing/public surface. It is
**additive and backward-compatible** — no business functionality, auth, routes,
APIs or calculations were changed. The authenticated portal (`/app/**`) is
deliberately **not** indexed.

## Architecture

Centralized, environment-driven SEO lives in **`src/lib/seo/`**:

| File          | Responsibility                                                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `config.ts`   | Single source of truth: site URL, name, description, logo/OG image, locale, contact, verification tokens, GA id — all env-driven with production fallbacks. Helpers `absoluteUrl()`, `ogImageUrl()`, `logoUrl()`.              |
| `metadata.ts` | `buildMetadata({ path, title, description, keywords?, image?, index?, type? })` → a complete Next.js `Metadata` object (canonical, robots, OpenGraph, Twitter).                                                                |
| `schema.ts`   | Schema.org JSON-LD builders: `organizationSchema`, `websiteSchema`, `softwareApplicationSchema`, `webPageSchema`, `serviceSchema`, `breadcrumbSchema`, `faqSchema`, `articleSchema`, and `graph(...)` to compose one `@graph`. |
| `index.ts`    | Barrel — `import { buildMetadata, graph, breadcrumbSchema, seoConfig } from '@/lib/seo'`.                                                                                                                                      |

`src/lib/site-meta.ts` now sources its `BASE_URL`/`SITE_NAME` from this config, so
every existing page inherits the configurable URL with **no per-page edits**.

> The legacy client-side SEO hook (Vite era) moved from `src/lib/seo.ts` to
> `src/lib/app-seo.ts` (`applyAppSeo`, `applyFavicon`) so `@/lib/seo` cleanly
> resolves to the new module. Its only consumer, `app/_shell/app-shell.tsx`, was
> updated.

## Metadata strategy

- Server-rendered via the Next.js **Metadata API** (`export const metadata` /
  `generateMetadata`). No client-side meta injection on public pages.
- Root `app/layout.tsx` sets global defaults + `metadataBase` + env-driven
  `verification`. No global title `template` (existing pages already brand their
  own titles — a template would double-brand them).
- New public pages use `buildMetadata()` for consistency.

## Canonical strategy

Every public page has a **self-referencing canonical** built from
`seoConfig.siteUrl` + its path (`alternates.canonical`). The site URL is
normalized (no trailing slash) so canonicals are stable.

## Robots & indexing

- **`app/robots.ts`** (dynamic) — allows public pages; disallows `/app`, `/api/`,
  `/forgot-password`, `/reset-password`; declares the sitemap + host.
- **`next.config.mjs`** sends `X-Robots-Tag: noindex, nofollow` on `/app` and
  `/app/:path*` — a hard signal that the client-rendered portal is never indexed
  (defence in depth with the robots `Disallow` and the client auth gate).
- The former static `public/robots.txt` and `public/sitemap.xml` were removed
  (the dynamic routes replace them and follow `NEXT_PUBLIC_SITE_URL`).

**INDEX:** `/`, `/features`, `/features/*`, `/industries`, `/industries/*`,
`/about`, `/contact`, `/blog`, `/blog/*`, `/signup`, `/login`.
**NOINDEX:** `/app` + all `/app/**`, `/forgot-password`, `/reset-password`, API
routes.

## XML sitemap

**`app/sitemap.ts`** (dynamic) lists only canonical, public, indexable pages.
Blog and feature/industry entries are generated from their data sources
(`blogData.ts`, `solutionsData.ts`), so the sitemap scales automatically as
content is added — no manual edits.

## Structured data (JSON-LD)

Exactly **one** `<script id="route-jsonld">` per page (an `@graph` of multiple
nodes), matching the existing `app/_site/json-ld.tsx` renderer and the e2e
contract. Schemas in use:

- Home: SoftwareApplication + Organization + FAQPage
- Feature/Industry pages: WebPage + Service + BreadcrumbList + FAQPage + Organization
- Blog list/post: Blog / BlogPosting; About/Contact: AboutPage / ContactPage

No ratings, reviews, prices, awards or company facts are fabricated.

## Content, semantics & internal linking

- New data-driven landing pages: `/features` (+ 9 module pages) and `/industries`
  (+ 5 industry pages), each with a unique H1, H2 sections, benefits, FAQs,
  breadcrumbs, contextual **related-solution** links, and schema. Content is
  grounded in real modules only.
- One `<main>` landmark per public page (added to `SiteChrome`), single H1,
  proper H2/H3 hierarchy, `<header>/<nav>/<section>/<article>/<footer>`.
- Footer expanded into Features / Industries / Company groups with descriptive
  anchor text; header nav links to the new hubs.
- Custom **`app/not-found.tsx`** (HTTP 404) with helpful links.

## Analytics & Search Console

- **`app/_site/analytics.tsx`** loads GA4 via `next/script` (`afterInteractive`)
  **only when `NEXT_PUBLIC_GA_ID` is set** — zero third-party JS otherwise.
- Verification: set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` /
  `NEXT_PUBLIC_BING_SITE_VERIFICATION` / `NEXT_PUBLIC_YANDEX_VERIFICATION`.
  Submit `/sitemap.xml` in Google Search Console & Bing Webmaster Tools.

## Environment variables

See `.env.example`. All SEO vars are **optional** (production defaults apply):
`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_SITE_DESCRIPTION`,
`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, `NEXT_PUBLIC_BING_SITE_VERIFICATION`,
`NEXT_PUBLIC_YANDEX_VERIFICATION`, `NEXT_PUBLIC_GA_ID`. Never commit secrets.

## SEO audit command

```bash
npm run seo:audit                 # audits http://localhost:3000 (start a server first)
npm run seo:audit -- https://your-domain.tld
```

Crawls `/sitemap.xml` (fallback: a static public-route list) and checks every
page for title, meta description, canonical, single H1, OpenGraph, Twitter card,
JSON-LD and image alt; verifies `/robots.txt` + `/sitemap.xml`; flags duplicate
titles. Exits non-zero on critical issues (CI-friendly). Requires a running
server (`npm run dev` or `npm run build && npm run start`).

## Adding SEO to a new public page

```tsx
import type { Metadata } from 'next'
import {
  buildMetadata,
  graph,
  webPageSchema,
  breadcrumbSchema,
  organizationSchema,
} from '@/lib/seo'
import { SiteChrome } from '@/app/_site/site-chrome'
import { JsonLd } from '@/app/_site/json-ld'

export const metadata: Metadata = buildMetadata({
  path: '/your-path',
  title: 'Your Page Title | Machine Shop Management',
  description: 'A unique ~150-char description of this page.',
  keywords: ['relevant', 'keywords'],
})

export default function Page() {
  const jsonLd = graph(
    webPageSchema({ path: '/your-path', name: 'H1 here', description: '…' }),
    breadcrumbSchema([
      { name: 'Home', path: '/' },
      { name: 'Your Page', path: '/your-path' },
    ]),
    organizationSchema(),
  )
  return (
    <SiteChrome>
      <JsonLd data={jsonLd} />
      {/* one <h1>, then <h2> sections … */}
    </SiteChrome>
  )
}
```

Then add the route to `app/sitemap.ts` (or drive it from a data source, as the
feature/industry pages do). Keep exactly one `<JsonLd>` per page.
