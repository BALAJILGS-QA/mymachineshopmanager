import { Fragment } from 'react'
import { ChevronRight } from 'lucide-react'
import { AppLink } from '@/components/nav/app-link'

// Enterprise object-navigation breadcrumb. Intermediate crumbs with a `to` are
// links (framework-agnostic AppLink); the last crumb is the current object and
// is rendered as plain text. Shared across the Production Planning module (and
// reusable elsewhere) so object pages get consistent drill-down context.
export interface Crumb {
  label: string
  to?: string
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
        {items.map((c, i) => {
          const last = i === items.length - 1
          return (
            <Fragment key={`${c.label}-${i}`}>
              <li className="flex items-center">
                {c.to && !last ? (
                  <AppLink
                    to={c.to}
                    className="font-medium text-slate-500 hover:text-brand-600 hover:underline"
                  >
                    {c.label}
                  </AppLink>
                ) : (
                  <span
                    className={last ? 'font-semibold text-slate-700' : 'text-slate-500'}
                    aria-current={last ? 'page' : undefined}
                  >
                    {c.label}
                  </span>
                )}
              </li>
              {!last && <ChevronRight size={13} className="text-slate-300" aria-hidden />}
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
