import type { ReactNode } from 'react'
import { clsx } from 'clsx'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { AppLink } from '@/components/nav/app-link'

// Premium multi-colour KPI tile system (MSM). Each metric tile uses a SOFT
// tinted background + subtle coloured border + a tinted icon chip in the
// semantic accent colour, with dark text so the number stays the focal point.
// Colour is semantic (see §3 of the tile spec), never decorative:
//   orange  → primary / pending / action        blue   → information / counts
//   green   → completed / available / success    purple → planning / process
//   red     → critical / delayed / low stock      cyan   → materials / inventory
//   slate   → neutral / draft / general
// Legacy tone aliases (brand→orange, violet→purple, amber→warning) are kept so
// every existing call site keeps working.
const TILE: Record<string, { card: string; icon: string }> = {
  orange: { card: 'border-orange-200 bg-orange-50', icon: 'bg-orange-100 text-orange-500' },
  brand: { card: 'border-orange-200 bg-orange-50', icon: 'bg-orange-100 text-orange-500' },
  blue: { card: 'border-blue-200 bg-blue-50', icon: 'bg-blue-100 text-blue-600' },
  green: { card: 'border-green-200 bg-green-50', icon: 'bg-green-100 text-green-600' },
  purple: { card: 'border-purple-200 bg-purple-50', icon: 'bg-purple-100 text-purple-600' },
  violet: { card: 'border-purple-200 bg-purple-50', icon: 'bg-purple-100 text-purple-600' },
  red: { card: 'border-red-200 bg-red-50', icon: 'bg-red-100 text-red-600' },
  cyan: { card: 'border-cyan-200 bg-cyan-50', icon: 'bg-cyan-100 text-cyan-600' },
  amber: { card: 'border-amber-200 bg-amber-50', icon: 'bg-amber-100 text-amber-600' },
  slate: { card: 'border-slate-200 bg-slate-50', icon: 'bg-slate-100 text-slate-600' },
}

// Compact KPI tile: tinted icon chip + optional trend pill on top, then label,
// large metric and an optional supporting line — a consistent scan pattern
// across every module.
//
// Optional extras (all backward-compatible):
//  - `hint`  — a secondary supporting line under the value (e.g. "12 due today").
//  - `delta` — a trend pill (e.g. "+8.2%"); `deltaDir` sets the arrow,
//              `deltaTone` overrides the colour for "lower is better" metrics.
//  - `to`    — makes the whole tile a link with a subtle hover affordance.
export function StatTile({
  icon,
  label,
  value,
  tone = 'brand',
  hint,
  delta,
  deltaDir,
  deltaTone,
  to,
}: {
  icon: ReactNode
  label: string
  value: string | number
  tone?: keyof typeof TILE
  hint?: string
  delta?: string
  deltaDir?: 'up' | 'down'
  /** Colour of the trend pill. Defaults to green for `up`, red for `down`.
   *  Set explicitly for metrics where a rise is bad (e.g. outstanding). */
  deltaTone?: 'positive' | 'negative'
  to?: string
}) {
  const t = TILE[tone] ?? TILE.brand
  const deltaNegative = deltaTone ? deltaTone === 'negative' : deltaDir === 'down'

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div
          className={clsx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', t.icon)}
        >
          {icon}
        </div>
        {delta && (
          <span
            className={clsx(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-2xs font-semibold',
              deltaNegative ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700',
            )}
          >
            {deltaDir === 'down' ? <ArrowDownRight size={11} /> : <ArrowUpRight size={11} />}
            {delta}
          </span>
        )}
      </div>
      <div className="mt-3">
        <div className="truncate text-2xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </div>
        <div className="tnum mt-1 truncate text-2xl font-bold leading-none text-slate-900">
          {value}
        </div>
        {hint && <div className="mt-1.5 truncate text-2xs text-slate-500">{hint}</div>}
      </div>
    </>
  )

  const base = clsx(
    'flex min-h-[116px] flex-col justify-between rounded-xl border p-4 transition-all duration-150',
    t.card,
  )

  if (to) {
    return (
      <AppLink to={to} className={clsx(base, 'hover:-translate-y-px hover:shadow-md')}>
        {body}
      </AppLink>
    )
  }

  return <div className={clsx(base, 'hover:-translate-y-px hover:shadow-md')}>{body}</div>
}
