// Next.js port of the landing route `/` (was src/routes/index.tsx +
// src/features/site/LandingPage.tsx). Server Component: marketing content is
// server-rendered, SEO via the Metadata API (replacing client `useSeo`), and the
// Sign In/Sign Up card is a client island (`LandingAuth`) so Supabase auth runs
// only on the client. Markup/classes preserved 1:1 from the Vite LandingPage.
//
// `@/index.css` is imported here so the app component classes AuthForm relies on
// (.input/.label/.btn-primary/.btn-secondary) are available on this route, exactly
// as the Vite app loads them globally.

import type { Metadata } from 'next'
import { Boxes, Gauge, ShieldCheck } from 'lucide-react'
import { SiteChrome } from './_site/site-chrome'
import { JsonLd } from './_site/json-ld'
import { LandingAuth } from './_site/landing-auth'
import { SITE } from '@/lib/site-meta'
import { BRAND } from '@/lib/brand'
import '@/index.css'

const TITLE = `${BRAND.product} — Job Orders, Invoices & Delivery Challans`

export const metadata: Metadata = {
  metadataBase: new URL(SITE.BASE_URL),
  title: TITLE,
  description: BRAND.description,
  keywords: BRAND.keywords,
  alternates: { canonical: `${SITE.BASE_URL}/` },
  robots: 'index,follow',
  openGraph: {
    siteName: SITE.SITE_NAME,
    title: TITLE,
    description: BRAND.description,
    type: 'website',
    url: `${SITE.BASE_URL}/`,
    images: [SITE.DEFAULT_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: BRAND.description,
    images: [SITE.DEFAULT_IMAGE],
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: BRAND.product,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description: BRAND.description,
  url: SITE.BASE_URL,
  image: SITE.DEFAULT_IMAGE,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
}

const FEATURES = [
  { icon: Gauge, t: 'Tight tolerances' },
  { icon: ShieldCheck, t: 'Documented QC' },
  { icon: Boxes, t: 'Batch traceability' },
]

export default function LandingPage() {
  return (
    <SiteChrome showFooter={false}>
      <JsonLd data={jsonLd} />
      <section className="blueprint relative overflow-hidden">
        <div className="glow-amber pointer-events-none absolute inset-x-0 top-0 h-[520px]" />
        <div className="mx-auto grid min-h-[calc(100vh-64px)] max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Marketing */}
          <div>
            <p className="kicker rise d1">{BRAND.product}</p>
            <h1 className="display rise d2 mt-4 text-4xl font-bold leading-[1.03] text-[var(--ink)] sm:text-5xl md:text-6xl">
              Run your shop floor with <span className="grad">total traceability.</span>
            </h1>
            <p className="rise d3 mt-5 max-w-xl text-base leading-relaxed text-[var(--ink-dim)]">
              Machine Shop Management tracks job orders, raw material, delivery challans, invoices,
              payments and expenses — company-wise, from order to dispatch, in one place.
            </p>
            <div className="rise d4 mt-8 flex flex-wrap gap-x-8 gap-y-3">
              {FEATURES.map((f) => (
                <span
                  key={f.t}
                  className="flex items-center gap-2 text-sm font-medium text-[var(--ink-dim)]"
                >
                  <f.icon size={16} className="text-[var(--amber)]" /> {f.t}
                </span>
              ))}
            </div>
          </div>

          {/* Auth (merged login/sign-up) — client island */}
          <div className="rise d3 mx-auto w-full max-w-md">
            <LandingAuth />
          </div>
        </div>
      </section>
    </SiteChrome>
  )
}
