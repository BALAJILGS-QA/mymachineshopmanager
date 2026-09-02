// /forgot-password — request a password reset link by email. The link lands on
// /reset-password. Noindex (auth utility page).

import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'
import { ForgotForm } from './forgot-form'
import { SITE } from '@/lib/site-meta'
import { BRAND } from '@/lib/brand'
import '@/index.css'
import '@/features/site/site.css'

export const metadata: Metadata = {
  metadataBase: new URL(SITE.BASE_URL),
  title: `Reset password — ${BRAND.product}`,
  description: `Reset your ${BRAND.product} password.`,
  alternates: { canonical: `${SITE.BASE_URL}/forgot-password` },
  robots: 'noindex,follow',
}

export default function ForgotPasswordPage() {
  return (
    <div className="site blueprint relative flex min-h-screen flex-col overflow-hidden">
      <div className="glow-amber pointer-events-none absolute inset-x-0 top-0 h-[420px]" />
      <div className="relative flex items-center justify-between px-6 py-8 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5" aria-label={BRAND.product}>
          <Logo size={34} className="rounded-[28%] shadow-sm" />
          <span className="display text-[15px] font-bold tracking-tight text-[var(--ink)]">
            {BRAND.product}
          </span>
        </Link>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <h1 className="display text-3xl font-bold text-[var(--ink)] sm:text-4xl">
              Forgot your password?
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink-dim)]">
              Enter your registered email and we&apos;ll send you a link to reset it.
            </p>
          </div>
          <ForgotForm />
        </div>
      </div>

      <p className="relative pb-8 text-center text-xs text-[var(--ink-faint)]">
        © 2026 {BRAND.legalName}. All rights reserved.
      </p>
    </div>
  )
}
