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
      <section className="blueprint relative overflow-hidden border-b border-[var(--line)]">
        <div className="glow-amber pointer-events-none absolute inset-x-0 top-0 h-[420px]" />
        <div className="relative mx-auto grid max-w-6xl items-start gap-12 px-5 py-20 lg:grid-cols-[0.85fr_1.15fr]">
          {/* Intro + details */}
          <div>
            <p className="kicker">Contact us</p>
            <h1 className="display mt-3 text-4xl font-bold leading-[1.05] text-[var(--ink)] sm:text-5xl">
              Let&apos;s get your shop floor <span className="grad">online.</span>
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-[var(--ink-dim)]">
              Questions about {BRAND.product}, a demo, or onboarding your machine shop? Send us a
              message and our team will get back to you.
            </p>

            <div className="mt-10 space-y-4">
              {DETAILS.map((d) => {
                const body = (
                  <div className="flex items-start gap-4 rounded-2xl border border-[var(--line)] bg-white/70 p-5 shadow-sm">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[var(--amber)]">
                      <d.icon size={22} />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[var(--ink-faint)]">
                        {d.label}
                      </p>
                      <p className="mt-0.5 break-all text-sm font-medium text-[var(--ink)]">
                        {d.value}
                      </p>
                    </div>
                  </div>
                )
                return d.href ? (
                  <a key={d.label} href={d.href} className="block transition hover:opacity-80">
                    {body}
                  </a>
                ) : (
                  <div key={d.label}>{body}</div>
                )
              })}
            </div>
          </div>

          {/* Form */}
          <div className="lg:pt-2">
            <ContactForm />
          </div>
        </div>
      </section>
    </SiteChrome>
  )
}
