import Link from 'next/link'
import { SiteChrome } from './_site/site-chrome'
import '@/index.css'

// Custom 404. Returns an HTTP 404 status (so crawlers never index it) and offers
// helpful links back into the public site instead of a dead end.
export default function NotFound() {
  const links = [
    { href: '/', label: 'Home' },
    { href: '/features', label: 'Features' },
    { href: '/industries', label: 'Industries' },
    { href: '/blog', label: 'Blog' },
    { href: '/contact', label: 'Contact' },
  ]
  return (
    <SiteChrome>
      <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-5 py-24 text-center">
        <p className="kicker">Error 404</p>
        <h1 className="display mt-3 text-4xl font-bold text-[var(--ink)] sm:text-5xl">
          This page could not be found.
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-[var(--ink-dim)]">
          The link may be broken or the page may have moved. Try one of these instead:
        </p>
        <nav
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
          aria-label="Helpful links"
        >
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="site-btn site-btn-ghost">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </SiteChrome>
  )
}
