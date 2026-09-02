// Public /about route — the About page. Server-rendered marketing content in the
// site shell, with SEO metadata + AboutPage JSON-LD. "Start Free Trial" → /signup.

import type { Metadata } from 'next'
import {
  ArrowUpRight,
  CheckCircle2,
  Gauge,
  LayoutGrid,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react'
import { SiteChrome } from '../_site/site-chrome'
import { JsonLd } from '../_site/json-ld'
import { SITE } from '@/lib/site-meta'
import { BRAND } from '@/lib/brand'
import '@/index.css'

const TITLE = `About Us — ${BRAND.product}`
const DESCRIPTION =
  'MSM brings customers, inventory, delivery challans, invoices, payments and expenses together in one simple platform — helping businesses reduce manual work and stay in control of their operations.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE.BASE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: BRAND.keywords,
  alternates: { canonical: `${SITE.BASE_URL}/about` },
  robots: 'index,follow',
  openGraph: {
    siteName: SITE.SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    url: `${SITE.BASE_URL}/about`,
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
  '@type': 'AboutPage',
  name: TITLE,
  url: `${SITE.BASE_URL}/about`,
  about: {
    '@type': 'Organization',
    name: BRAND.legalName,
    alternateName: BRAND.product,
    url: SITE.BASE_URL,
    email: BRAND.contact.email,
  },
}

const CAPABILITIES = [
  'Manage customers and business records efficiently',
  'Create and track delivery challans',
  'Generate and manage invoices',
  'Track payments and outstanding amounts',
  'Manage expenses and financial transactions',
  'Monitor inventory and stock movement',
  'Keep your business data organized in one place',
]

const VALUES = [
  {
    icon: Sparkles,
    t: 'Simple & Intuitive',
    d: 'Designed for everyday business users with a clean interface that requires minimal technical knowledge.',
  },
  {
    icon: LayoutGrid,
    t: 'Everything in One Place',
    d: 'Customers, inventory, delivery challans, invoices, payments, expenses and operations — connected in one platform.',
  },
  {
    icon: Gauge,
    t: 'Built for Efficiency',
    d: 'Reduce repetitive manual work, minimize errors and get better visibility into your business operations.',
  },
  {
    icon: TrendingUp,
    t: 'Ready to Grow With You',
    d: 'Whether you run a small operation or a growing business, MSM provides the tools and structure to stay organized.',
  },
]

export default function AboutPage() {
  return (
    <SiteChrome showFooter>
      <JsonLd data={jsonLd} />

      {/* Hero */}
      <section className="blueprint relative overflow-hidden border-b border-[var(--line)]">
        <div className="glow-amber pointer-events-none absolute inset-x-0 top-0 h-[420px]" />
        <div className="relative mx-auto max-w-4xl px-5 py-24 text-center">
          <p className="kicker rise d1">About {BRAND.product}</p>
          <h1 className="display rise d2 mt-4 text-4xl font-bold leading-[1.05] text-[var(--ink)] sm:text-5xl md:text-6xl">
            Built for <span className="grad">modern businesses.</span>
          </h1>
          <p className="rise d3 mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[var(--ink-dim)]">
            MSM is designed to simplify the way businesses manage their day-to-day operations — from
            customers and inventory to delivery challans, invoices, payments and expenses, all in
            one place.
          </p>
          <div className="rise d4 mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href="/signup" className="site-btn site-btn-primary">
              Start Free Trial <ArrowUpRight size={16} />
            </a>
            <a href="/contact" className="site-btn site-btn-ghost">
              Talk to us
            </a>
          </div>
        </div>
      </section>

      {/* Why MSM */}
      <section className="border-t border-[var(--line)] bg-white/50">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div className="reveal">
            <p className="kicker">Why MSM?</p>
            <h2 className="display mt-3 text-3xl font-bold text-[var(--ink)] sm:text-4xl">
              One platform instead of <span className="grad">scattered tools.</span>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-[var(--ink-dim)]">
              Many businesses still depend on spreadsheets, notebooks, WhatsApp messages and
              disconnected tools to manage their operations. As the business grows, this can lead to
              missed updates, duplicate entries, paperwork and difficulty keeping track of important
              transactions.
            </p>
            <p className="mt-4 text-base leading-relaxed text-[var(--ink-dim)]">
              MSM brings everything together in one simple, organized platform — helping businesses
              reduce manual work, improve visibility and stay in control of their operations.
            </p>
          </div>
          <div className="reveal rounded-2xl border border-[var(--line)] bg-white/80 p-6 shadow-sm sm:p-8">
            <ul className="space-y-3.5">
              {CAPABILITIES.map((c) => (
                <li key={c} className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[var(--amber)]" />
                  <span className="text-sm leading-relaxed text-[var(--ink)]">{c}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Mission + values */}
      <section className="border-t border-[var(--line)]">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="reveal max-w-2xl">
            <p className="kicker">Our mission</p>
            <h2 className="display mt-3 text-3xl font-bold text-[var(--ink)] sm:text-4xl">
              Powerful capabilities, a <span className="grad">clean experience.</span>
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[var(--ink-dim)]">
              Our mission is to help businesses move away from manual processes and manage their
              operations with greater simplicity, accuracy and efficiency. We believe business
              software shouldn&apos;t be complicated — so owners and their teams can spend less time
              on paperwork and more time growing the business.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map((v) => (
              <div
                key={v.t}
                className="reveal rounded-2xl border border-[var(--line)] bg-white/70 p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--amber)] hover:shadow-md"
              >
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-md"
                  style={{ background: 'linear-gradient(135deg, #fb923c, #ea580c)' }}
                >
                  <v.icon size={22} />
                </div>
                <h3 className="display mt-4 text-lg font-bold text-[var(--ink)]">{v.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--ink-dim)]">{v.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Vision — navy band */}
      <section className="relative overflow-hidden bg-[#111a2b]">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(55% 45% at 85% 0%, rgba(234,88,12,0.22), transparent 60%), radial-gradient(50% 45% at 0% 100%, rgba(56,189,248,0.12), transparent 60%)',
          }}
        />
        <div className="relative mx-auto max-w-3xl px-5 py-20 text-center text-white">
          <div className="reveal">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-[#fdba74]">
              <Target size={22} />
            </span>
            <p className="kicker mt-4" style={{ color: '#fb923c' }}>
              Our vision
            </p>
            <h2 className="display mt-3 text-3xl font-bold sm:text-4xl">
              Business management made simpler, smarter and more{' '}
              <span
                style={{
                  background: 'linear-gradient(100deg, #fb923c, #f97316 60%, #fdba74)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                accessible.
              </span>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-white/65">
              To make business management simpler, smarter and more accessible for businesses of
              every size. MSM is continuously evolving to help businesses streamline their
              workflows, make better decisions and operate with confidence.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-[var(--line)] bg-white/50">
        <div className="mx-auto max-w-3xl px-5 py-20 text-center">
          <div className="reveal">
            <h2 className="display text-3xl font-bold text-[var(--ink)] sm:text-4xl">
              Manage your business <span className="grad">smarter.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-[var(--ink-dim)]">
              Bring your everyday business operations together with {BRAND.product} and experience a
              simpler way to manage your business.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a href="/signup" className="site-btn site-btn-primary">
                Start Free Trial <ArrowUpRight size={16} />
              </a>
              <a href="/#features" className="site-btn site-btn-ghost">
                Explore features
              </a>
            </div>
          </div>
        </div>
      </section>
    </SiteChrome>
  )
}
