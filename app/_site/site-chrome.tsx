'use client'

// Next.js port of `src/features/site/SiteLayout.tsx` (marketing/site shell).
// Markup, classes and behaviour are preserved 1:1 from the Vite version — the
// ONLY change is navigation: TanStack Router `<Link to>` → Next `<Link href>`.
// Pure/reusable pieces (Logo, BRAND, site.css, useReveal) are imported from src,
// so there is no duplicated logic — only the router-bound shell is re-homed.
//
// During the migration the Vite SiteLayout stays in place for the Vite build;
// this file serves the same UI under Next. Both are retired to one when Vite is
// removed (cleanup phase).

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Menu, X, ArrowUpRight } from 'lucide-react'
import { clsx } from 'clsx'
import { Logo } from '@/components/ui/Logo'
import { BRAND } from '@/lib/brand'
import { useReveal } from '@/features/site/useReveal'
import '@/features/site/site.css'

// `/`, `/about`, `/blog` and `/contact` are real routes; hash entries scroll.
const NAV = [
  { href: '/', label: 'Home' },
  { href: '/#features', label: 'Features' },
  { href: '/about', label: 'About' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/blog', label: 'Blog' },
  { href: '/contact', label: 'Reach Us' },
]

// In-page hash links use a plain <a> (reliable anchor scrolling); real routes use
// Next <Link> for prefetching.
function NavItem({
  href,
  label,
  className,
  onClick,
}: {
  href: string
  label: string
  className?: string
  onClick?: () => void
}) {
  if (href.includes('#')) {
    return (
      <a href={href} className={className} onClick={onClick}>
        {label}
      </a>
    )
  }
  return (
    <Link href={href} className={className} onClick={onClick}>
      {label}
    </Link>
  )
}

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label={BRAND.product}>
      <Logo size={38} className="rounded-[28%] shadow-sm" />
      <span className="display text-[15px] font-bold leading-tight tracking-tight text-[var(--ink)]">
        {BRAND.product}
      </span>
    </Link>
  )
}

export function SiteChrome({
  children,
  showFooter = true,
  revealKey,
}: {
  children: ReactNode
  showFooter?: boolean
  // Changing this re-runs the scroll-reveal observer (e.g. per blog slug), matching
  // the Vite pages that called `useReveal([slug])`.
  revealKey?: string
}) {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Server-rendered `.reveal` children animate in once hydrated — same as Vite.
  useReveal([revealKey])

  return (
    <div className="site relative min-h-screen">
      <header
        className={clsx(
          'sticky top-0 z-40 transition-colors',
          scrolled ? 'border-b border-[var(--line)] bg-white/80 backdrop-blur' : 'bg-transparent',
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Wordmark />
          <nav className="hidden items-center gap-7 md:flex">
            {NAV.map((n) => (
              <NavItem
                key={n.href}
                href={n.href}
                label={n.label}
                className="text-sm font-medium text-[var(--ink-dim)] transition hover:text-[var(--ink)]"
              />
            ))}
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            <a href="/login" className="site-btn site-btn-ghost">
              Login
            </a>
            <a href="/signup" className="site-btn site-btn-primary">
              Try for free <ArrowUpRight size={16} />
            </a>
          </div>
          <button
            className="rounded-lg p-2 text-[var(--ink)] md:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 flex h-full w-72 flex-col gap-1 border-l border-[var(--line)] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <Wordmark />
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="p-1 text-[var(--ink-dim)]"
              >
                <X size={22} />
              </button>
            </div>
            {NAV.map((n) => (
              <NavItem
                key={n.href}
                href={n.href}
                label={n.label}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-[var(--ink-dim)] hover:bg-black/5 hover:text-[var(--ink)]"
              />
            ))}
            <div className="mt-4 flex flex-col gap-2">
              <a
                href="/login"
                className="site-btn site-btn-ghost justify-center"
                onClick={() => setOpen(false)}
              >
                Login
              </a>
              <a
                href="/signup"
                className="site-btn site-btn-primary justify-center"
                onClick={() => setOpen(false)}
              >
                Try for free
              </a>
            </div>
          </div>
        </div>
      )}

      {children}

      {showFooter && <Footer />}
    </div>
  )
}

function Footer() {
  const year = 2026
  return (
    <footer className="relative border-t border-[var(--line)] bg-white/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--ink-dim)]">
            {BRAND.product} — job orders, materials, delivery challans, invoices, payments and
            expenses, tracked company-wise from order to dispatch.
          </p>
        </div>
        <div>
          <p className="kicker mb-3">Company</p>
          <ul className="space-y-2 text-sm text-[var(--ink-dim)]">
            <li>
              <a href="/#features" className="hover:text-[var(--ink)]">
                Features
              </a>
            </li>
            <li>
              <Link href="/about" className="hover:text-[var(--ink)]">
                About
              </Link>
            </li>
            <li>
              <a href="/#faq" className="hover:text-[var(--ink)]">
                FAQ
              </a>
            </li>
            <li>
              <Link href="/blog" className="hover:text-[var(--ink)]">
                Blog
              </Link>
            </li>
            <li>
              <Link href="/contact" className="hover:text-[var(--ink)]">
                Reach Us
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="kicker mb-3">Access</p>
          <ul className="space-y-2 text-sm text-[var(--ink-dim)]">
            <li>
              <a href="/login" className="hover:text-[var(--ink)]">
                Login
              </a>
            </li>
            <li>
              <a href="/signup" className="hover:text-[var(--ink)]">
                Try for free
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[var(--line)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 py-5 text-xs text-[var(--ink-faint)] sm:flex-row">
          <p>
            © {year} {BRAND.product}. All rights reserved.
          </p>
          <p className="mono">PRECISION · REPEATABILITY · TRACEABILITY</p>
        </div>
      </div>
    </footer>
  )
}
