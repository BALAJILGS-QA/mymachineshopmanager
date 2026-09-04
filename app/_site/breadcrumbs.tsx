import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

// Visual breadcrumb trail for public pages. The matching BreadcrumbList JSON-LD
// is emitted by the page via schema.ts (breadcrumbSchema) — this component is the
// on-page, accessible representation of the same hierarchy.
export function Breadcrumbs({ items }: { items: { name: string; path: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mx-auto max-w-6xl px-5 pt-8">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--ink-dim)]">
        {items.map((it, i) => {
          const last = i === items.length - 1
          return (
            <li key={it.path} className="flex items-center gap-1.5">
              {last ? (
                <span aria-current="page" className="font-medium text-[var(--ink)]">
                  {it.name}
                </span>
              ) : (
                <Link href={it.path} className="hover:text-[var(--ink)]">
                  {it.name}
                </Link>
              )}
              {!last && <ChevronRight size={14} className="text-[var(--ink-faint)]" />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
