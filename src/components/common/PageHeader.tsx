import type { ReactNode } from 'react'
import { clsx } from 'clsx'

// Premium ERP page header: left-aligned title + description on the left, primary
// actions on the right. Consistent across every module.
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:pt-0.5">{actions}</div>
      )}
    </div>
  )
}

export function ResponsiveTable({
  children,
  className,
}: {
  children: ReactNode
  /** Override the table min-width (default `min-w-full`). Use e.g. `min-w-[72rem]`
   * for wide tables so they scroll horizontally on small screens instead of squishing. */
  className?: string
}) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={clsx('w-full border-collapse', className ?? 'min-w-full')}>
        {children}
      </table>
    </div>
  )
}
