import type { ReactNode } from 'react'
import { clsx } from 'clsx'
import { ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/primitives'
import { AppLink } from '@/components/nav/app-link'

// Reference-style dashboard panels (Zoho-Inventory-like): colored-number
// "activity" stats and labelled summary rows. Presentation only — all values
// are passed in from existing data/computations.

const NUM_TONES: Record<string, string> = {
  brand: 'text-brand-600',
  blue: 'text-blue-600',
  green: 'text-emerald-600',
  amber: 'text-amber-600',
  red: 'text-red-600',
  violet: 'text-violet-600',
  slate: 'text-slate-700',
}

const DOT_TONES: Record<string, string> = {
  brand: 'bg-brand-500',
  blue: 'bg-blue-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  violet: 'bg-violet-500',
  slate: 'bg-slate-400',
}

// Soft tinted card surfaces for the colored-number activity tiles — matches the
// StatTile palette so KPI tiles look identical across every module.
const CARD_TONES: Record<string, string> = {
  brand: 'border-orange-200 bg-orange-50',
  blue: 'border-blue-200 bg-blue-50',
  green: 'border-green-200 bg-green-50',
  amber: 'border-amber-200 bg-amber-50',
  red: 'border-red-200 bg-red-50',
  violet: 'border-purple-200 bg-purple-50',
  slate: 'border-slate-200 bg-slate-50',
}

export type SummaryTone = keyof typeof NUM_TONES

// A card wrapper with a title row and an optional "view all" link — the shared
// chrome used by the activity / summary panels below.
export function PanelCard({
  title,
  to,
  action,
  className,
  children,
}: {
  title: string
  to?: string
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <Card className={clsx('p-4', className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {action}
        {to && !action && (
          <AppLink
            to={to}
            className="flex items-center gap-0.5 text-2xs font-medium text-brand-600 hover:underline"
          >
            View all <ArrowRight size={12} />
          </AppLink>
        )}
      </div>
      {children}
    </Card>
  )
}

// A single colored-number activity stat (reference "Sales Activity" tiles):
// large tinted value over a small uppercase label. Optional link + icon.
export function BigStat({
  label,
  value,
  tone = 'brand',
  icon,
  to,
}: {
  label: string
  value: string | number
  tone?: SummaryTone
  icon?: ReactNode
  to?: string
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span className={clsx('tnum text-3xl font-bold leading-none', NUM_TONES[tone])}>
          {value}
        </span>
        {icon && <span className={clsx('shrink-0', NUM_TONES[tone])}>{icon}</span>}
      </div>
      <div className="mt-2 text-2xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
    </>
  )
  const base = clsx(
    'rounded-xl border p-3.5 transition-all duration-150',
    CARD_TONES[tone] ?? CARD_TONES.brand,
  )
  if (to) {
    return (
      <AppLink to={to} className={clsx(base, 'block hover:-translate-y-px hover:shadow-md')}>
        {inner}
      </AppLink>
    )
  }
  return <div className={base}>{inner}</div>
}

// A labelled numeric row (reference "Inventory Summary" / "Product Details"):
// a leading dot + label on the left, colored value on the right.
export function SummaryRow({
  label,
  value,
  tone = 'slate',
  to,
}: {
  label: string
  value: string | number
  tone?: SummaryTone
  to?: string
}) {
  const inner = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', DOT_TONES[tone])} />
        <span className="truncate text-sm text-slate-600">{label}</span>
      </span>
      <span className={clsx('tnum shrink-0 text-sm font-semibold', NUM_TONES[tone])}>{value}</span>
    </>
  )
  if (to) {
    return (
      <AppLink
        to={to}
        className="-mx-1.5 flex items-center justify-between gap-3 rounded-md px-1.5 py-2 transition-colors hover:bg-slate-50"
      >
        {inner}
      </AppLink>
    )
  }
  return <div className="flex items-center justify-between gap-3 py-2">{inner}</div>
}
