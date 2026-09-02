// Public /contact route — a dedicated Contact Us page. Server-rendered marketing
// shell + SEO metadata; the form is a client island (ContactForm) that writes to
// the CRM. Submissions appear in the app under CRM → Contact Enquiries.

import type { Metadata } from 'next'
import { Clock, Mail, MapPin } from 'lucide-react'
import { SiteChrome } from '../_site/site-chrome'
import { JsonLd } from '../_site/json-ld'
import { ContactForm } from './contact-form'
import { SITE } from '@/lib/site-meta'
import { BRAND } from '@/lib/brand'
import '@/index.css'

const TITLE = `Contact Us — ${BRAND.product}`
const DESCRIPTION = `Get in touch with ${BRAND.legalName}. Questions about ${BRAND.product}, demos or onboarding your machine shop — send us a message and our team will respond.`

export const metadata: Metadata = {
  metadataBase: new URL(SITE.BASE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: BRAND.keywords,
  alternates: { canonical: `${SITE.BASE_URL}/contact` },
  robots: 'index,follow',
  openGraph: {
    siteName: SITE.SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    url: `${SITE.BASE_URL}/contact`,
    images: [SITE.DEFAULT_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [SITE.DEFAULT_IMAGE],
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ContactPage',
  name: TITLE,
  url: `${SITE.BASE_URL}/contact`,
  about: {
    '@type': 'Organization',
    name: BRAND.legalName,
    email: BRAND.contact.email,
    url: SITE.BASE_URL,
  },
}

const DETAILS = [
  {
    icon: Mail,
    label: 'Email',
    value: BRAND.contact.email,
    href: `mailto:${BRAND.contact.email}`,
  },
  { icon: MapPin, label: 'Location', value: BRAND.contact.location },
  { icon: Clock, label: 'Response time', value: 'Within 1 business day' },
]

export default function ContactPage() {
  return (
    <SiteChrome showFooter>
      <JsonLd data={jsonLd} />

      {/* Hero — compact, subtle grid, orange used only as an accent */}
      <section className="relative overflow-hidden border-b border-[var(--line)]">
        <div className="blueprint pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <p className="kicker rise d1">Contact us</p>
          <h1 className="display rise d2 mt-3 max-w-2xl text-4xl font-bold leading-[1.05] text-[var(--ink)] sm:text-5xl">
            Let&apos;s simplify your <span className="text-[var(--amber)]">shop floor.</span>
          </h1>
          <p className="rise d3 mt-4 max-w-xl text-base leading-relaxed text-[var(--ink-dim)]">
            Have questions about {BRAND.product}, need a demo, or want help getting started? Our
            team is here to help.
          </p>
        </div>
      </section>

      {/* Main — premium 40 / 60 two-column layout */}
      <section>
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16 lg:py-20">
          {/* Left — contact information */}
          <div className="reveal">
            <h2 className="display text-2xl font-bold text-[var(--ink)] sm:text-3xl">
              Let&apos;s talk about your business.
            </h2>
            <p className="mt-3 max-w-md text-base leading-relaxed text-[var(--ink-dim)]">
              Whether you have a question, need a product walkthrough, or want help getting started,
              we&apos;d love to hear from you.
            </p>

            <div className="mt-8 border-t border-[var(--line)]">
              {DETAILS.map((d) => {
                const inner = (
                  <>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-[var(--amber)] transition group-hover:border-[var(--amber)]/50 group-hover:bg-orange-50/60">
                      <d.icon size={18} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)]">
                        {d.label}
                      </span>
                      <span className="mt-0.5 block break-words text-sm font-medium text-[var(--ink)] transition group-hover:text-[var(--amber)]">
                        {d.value}
                      </span>
                    </span>
                  </>
                )
                return d.href ? (
                  <a
                    key={d.label}
                    href={d.href}
                    className="group flex items-center gap-4 border-b border-[var(--line)] py-4"
                  >
                    {inner}
                  </a>
                ) : (
                  <div
                    key={d.label}
                    className="group flex items-center gap-4 border-b border-[var(--line)] py-4"
                  >
                    {inner}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right — contact form */}
          <div className="reveal">
            <ContactForm />
          </div>
        </div>
      </section>
    </SiteChrome>
  )
}
