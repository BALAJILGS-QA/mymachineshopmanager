import { clsx } from 'clsx'
import { Card } from '@/components/ui/primitives'

// Neutral shimmer block. Compose these into skeleton rows/cards so data-heavy
// pages never flash a blank white screen (premium loading states, §41).
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-md bg-slate-200/70', className)} />
}

// Skeleton rows for a table that is still loading. Renders card-less so it drops
// straight into an existing <Card>; `cols` roughly matches the real table shape.
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div aria-hidden className="divide-y divide-slate-100">
      <div className="flex items-center gap-4 border-b border-slate-100 bg-slate-50 px-3 py-3">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} className={clsx('h-2.5', c === 0 ? 'w-24 flex-none' : 'flex-1')} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-3 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={clsx('h-3.5', c === 0 ? 'w-32 flex-none' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  )
}

// A grid of skeleton stat tiles for dashboard/summary rows.
export function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-6 w-16" />
          </div>
          <Skeleton className="h-10 w-10 rounded-lg" />
        </Card>
      ))}
    </>
  )
}
