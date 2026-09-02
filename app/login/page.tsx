// Dedicated /login route — a split-screen sign-in page. Left column: the
// "Welcome Back" sign-in form (client island, Supabase/local auth). Right column:
// a dark marketing panel server-rendered for SEO. The header "Login" button on
// the landing page links here.

import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Boxes, ClipboardCheck, ReceiptText, Workflow } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { LoginForm } from './login-form'
import { SITE } from '@/lib/site-meta'
import { BRAND } from '@/lib/brand'
import '@/index.css'
import '@/features/site/site.css'

const TITLE = `Login — ${BRAND.product}`
const DESCRIPTION = `Log in to ${BRAND.product} to manage job orders, materials, delivery challans, invoices and payments for your machine shop.`

export const metadata: Metadata = {
  metadataBase: new URL(SITE.BASE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: BRAND.keywords,
  alternates: { canonical: `${SITE.BASE_URL}/login` },
  robots: 'index,follow',
  openGraph: {
    siteName: SITE.SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    url: `${SITE.BASE_URL}/login`,
    images: [SITE.DEFAULT_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [SITE.DEFAULT_IMAGE],
  },
}

const PANEL_FEATURES = [
  {
    icon: ClipboardCheck,
    t: 'Job Orders',
    d: 'Raise and track every job with documented QC from first-off to dispatch.',
  },
  {
    icon: Boxes,
    t: 'Materials & Traceability',
    d: 'Batch-level stock so every part traces back to its heat and lot.',
  },
  {
    icon: ReceiptText,
    t: 'Invoices & Challans',
    d: 'GST-ready invoices and delivery challans, generated in seconds.',
  },
  {
    icon: Workflow,
    t: 'Order-to-Dispatch',
    d: 'One live pipeline across production, sales and accounts.',
  },
]

export default function LoginPage() {
  return (
    <div className="site min-h-screen lg:grid lg:h-screen lg:grid-cols-2 lg:overflow-hidden">
      {/* Left — sign-in */}
      <div className="relative flex min-h-screen flex-col px-6 py-8 sm:px-10 lg:min-h-0 lg:px-14">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5" aria-label={BRAND.product}>
            <Logo size={34} className="rounded-[28%] shadow-sm" />
            <span className="display text-[15px] font-bold tracking-tight text-[var(--ink)]">
              {BRAND.product}
            </span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm font-medium text-[var(--ink-dim)] transition hover:text-[var(--ink)]"
          >
            <ArrowLeft size={15} /> Back to site
          </Link>
        </div>

        <div className="flex flex-1 flex-col justify-center py-12">
          <div className="mx-auto w-full max-w-sm">
            <h1 className="display text-3xl font-bold text-[var(--ink)] sm:text-4xl">
              Welcome back!
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink-dim)]">
              Sign in to continue to your MSM dashboard.
            </p>

            <div className="mt-8">
              <LoginForm />
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-[var(--ink-faint)]">
          © 2026 {BRAND.legalName}. All rights reserved.
        </p>
      </div>

      {/* Right — marketing panel */}
      <div className="relative hidden overflow-hidden bg-[#1f2430] lg:block">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(60% 45% at 85% 0%, rgba(234,88,12,0.28), transparent 60%), radial-gradient(55% 45% at 0% 100%, rgba(194,65,12,0.22), transparent 60%)',
          }}
        />
        <div className="relative flex h-full flex-col justify-center px-14 py-16 text-white">
          <p className="kicker" style={{ color: '#fb923c' }}>
            Machine Shop Management System
          </p>
          <h2 className="display mt-4 max-w-md text-4xl font-bold leading-[1.08]">
            The smart way to run your{' '}
            <span
              style={{
                background: 'linear-gradient(100deg, #fb923c, #f97316 60%, #fdba74)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              precision business.
            </span>
          </h2>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-white/70">
            {BRAND.product} brings job orders, automated production workflows, material
            traceability, and invoicing under one professional hub.
          </p>

          <div className="mt-10 grid max-w-lg grid-cols-2 gap-4">
            {PANEL_FEATURES.map((f) => (
              <div
                key={f.t}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-[#fdba74]">
                  <f.icon size={20} />
                </div>
                <h3 className="display mt-3 text-sm font-bold text-white">{f.t}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-white/60">{f.d}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/signup"
              style={{ color: '#1f2430' }}
              className="rounded-xl bg-white px-6 py-3 text-sm font-semibold transition hover:bg-white/90"
            >
              Request Demo
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
