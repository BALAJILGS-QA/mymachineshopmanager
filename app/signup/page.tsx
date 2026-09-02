// Dedicated /signup route — a split-screen registration page. Left column: the
// "Start your free trial" registration form (client island → useAuth().register,
// stored as a pending profile for super-admin approval). Right column: a dark
// marketing panel. Every "Try for free" button links here.

import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Boxes, ClipboardCheck, ShieldCheck, Workflow } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { SignupForm } from './signup-form'
import { SITE } from '@/lib/site-meta'
import { BRAND } from '@/lib/brand'
import '@/index.css'
import '@/features/site/site.css'

const TITLE = `Start your free trial — ${BRAND.product}`
const DESCRIPTION = `Create your ${BRAND.product} account. Register your machine shop and, once approved, manage job orders, materials, invoices and payments in one place.`

export const metadata: Metadata = {
  metadataBase: new URL(SITE.BASE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: BRAND.keywords,
  alternates: { canonical: `${SITE.BASE_URL}/signup` },
  robots: 'index,follow',
  openGraph: {
    siteName: SITE.SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    url: `${SITE.BASE_URL}/signup`,
    images: [SITE.DEFAULT_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [SITE.DEFAULT_IMAGE],
  },
}

const STEPS = [
  {
    icon: ClipboardCheck,
    t: 'Register your shop',
    d: 'Tell us about your business — it takes under a minute.',
  },
  {
    icon: ShieldCheck,
    t: 'Get approved',
    d: 'An administrator reviews and approves your access.',
  },
  {
    icon: Boxes,
    t: 'Run your floor',
    d: 'Manage job orders, materials, invoices and dispatch in one place.',
  },
  {
    icon: Workflow,
    t: 'Order to dispatch',
    d: 'One live pipeline across production, sales and accounts.',
  },
]

export default function SignupPage() {
  return (
    <div className="site min-h-screen lg:grid lg:h-screen lg:grid-cols-2 lg:overflow-hidden">
      {/* Left — registration */}
      <div className="relative flex min-h-screen flex-col overflow-y-auto px-6 py-6 sm:px-10 lg:min-h-0 lg:px-14">
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

        <div className="flex flex-1 flex-col justify-center py-6">
          <div className="mx-auto w-full max-w-md">
            <h1 className="display text-2xl font-bold text-[var(--ink)] sm:text-3xl">
              Start your free trial
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-dim)]">
              Register your machine shop. An administrator will review and approve your access —
              then you can sign in.
            </p>

            <div className="mt-5">
              <SignupForm />
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-[var(--ink-faint)]">
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
            Get your shop floor{' '}
            <span
              style={{
                background: 'linear-gradient(100deg, #fb923c, #f97316 60%, #fdba74)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              online in minutes.
            </span>
          </h2>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-white/70">
            Join precision manufacturers running {BRAND.product} to track job orders, material
            traceability, invoicing and payments — company-wise, from order to dispatch.
          </p>

          <ol className="mt-10 max-w-lg space-y-4">
            {STEPS.map((f, i) => (
              <li key={f.t} className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#fdba74]">
                  <f.icon size={20} />
                </div>
                <div>
                  <h3 className="display text-sm font-bold text-white">
                    <span className="mr-1.5 text-white/40">{i + 1}.</span>
                    {f.t}
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-white/60">{f.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
