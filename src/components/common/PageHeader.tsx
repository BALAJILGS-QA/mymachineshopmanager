import type { ReactNode } from 'react'
import { clsx } from 'clsx'

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
    <div className="mb-4 flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-3">
      {/* Left spacer balances the actions column so the title stays centered. */}
      <div className="hidden sm:block sm:flex-1" aria-hidden />
      <div className="min-w-0 text-center">
        <h1 className="text-gradient-brand text-lg font-bold sm:text-xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 sm:flex-1 sm:justify-end">
        {actions}
      </div>
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
