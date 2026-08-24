import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Cog, Menu, X, ArrowUpRight } from 'lucide-react'
import { clsx } from 'clsx'
import './site.css'

const NAV = [{ to: '/blog', label: 'Blog' }]

function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--amber)] text-[#1a0e04]">
        <Cog size={20} className="spin-slow" />
      </span>
      <span className="leading-none">
        <span className="display block text-[15px] font-bold tracking-tight">SREE BALAJI</span>
        <span className="mono block text-[9px] tracking-[0.3em] text-[var(--ink-dim)]">INDUSTRIES · CNC</span>
      </span>
    </Link>
  )
}

export function SiteLayout({
  children,
  showFooter = true,
}: {
  children: ReactNode
  showFooter?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="site grain relative min-h-screen">
      <header
        className={clsx(
          'sticky top-0 z-40 transition-colors',
          scrolled ? 'border-b border-[var(--line)] bg-[rgba(10,13,18,0.82)] backdrop-blur' : 'bg-transparent',
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Wordmark />
          <nav className="hidden items-center gap-7 md:flex">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="text-sm text-[var(--ink-dim)] transition hover:text-[var(--ink)]">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            <Link to="/login" className="site-btn site-btn-ghost">
              Sign In
            </Link>
            <Link to="/signup" className="site-btn site-btn-primary">
              Sign Up <ArrowUpRight size={16} />
            </Link>
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
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 flex h-full w-72 flex-col gap-1 border-l border-[var(--line)] bg-[var(--bg-2)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <Wordmark />
              <button onClick={() => setOpen(false)} aria-label="Close" className="p-1 text-[var(--ink-dim)]">
                <X size={22} />
              </button>
            </div>
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-[var(--ink-dim)] hover:bg-white/5 hover:text-[var(--ink)]"
              >
                {n.label}
              </Link>
            ))}
            <div className="mt-4 flex flex-col gap-2">
              <Link to="/login" className="site-btn site-btn-ghost justify-center" onClick={() => setOpen(false)}>
                Sign In
              </Link>
              <Link to="/signup" className="site-btn site-btn-primary justify-center" onClick={() => setOpen(false)}>
                Sign Up
              </Link>
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
    <footer id="contact" className="relative border-t border-[var(--line)] bg-[var(--bg-2)]">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--ink-dim)]">
            Precision CNC turning and milling for pumps, engineering and industrial components.
            Company-wise job tracking from order to delivery.
          </p>
          <a href="mailto:contact@sreebalajiindustries.com" className="mono mt-4 inline-block text-sm text-[var(--amber-soft)]">
            contact@sreebalajiindustries.com
          </a>
        </div>
        <div>
          <p className="kicker mb-3">Company</p>
          <ul className="space-y-2 text-sm text-[var(--ink-dim)]">
            <li><a href="/#capabilities" className="hover:text-[var(--ink)]">Capabilities</a></li>
            <li><a href="/#process" className="hover:text-[var(--ink)]">Process</a></li>
            <li><a href="/#industries" className="hover:text-[var(--ink)]">Industries</a></li>
            <li><NavLink to="/blog" className="hover:text-[var(--ink)]">Blog</NavLink></li>
          </ul>
        </div>
        <div>
          <p className="kicker mb-3">Access</p>
          <ul className="space-y-2 text-sm text-[var(--ink-dim)]">
            <li><NavLink to="/login" className="hover:text-[var(--ink)]">Client Portal</NavLink></li>
            <li><a href="/#contact" className="hover:text-[var(--ink)]">Request a Quote</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[var(--line)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 py-5 text-xs text-[var(--ink-faint)] sm:flex-row">
          <p>© {year} Sree Balaji Industries. All rights reserved.</p>
          <p className="mono">PRECISION · REPEATABILITY · TRACEABILITY</p>
        </div>
      </div>
    </footer>
  )
}
