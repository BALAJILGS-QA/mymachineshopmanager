import type { ReactNode } from 'react'
import { clsx } from 'clsx'
import { Card } from '@/components/ui/primitives'

const TILE_TONES: Record<string, string> = {
  brand: 'bg-brand-100 text-brand-700',
  green: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  blue: 'bg-blue-100 text-blue-700',
  violet: 'bg-violet-100 text-violet-700',
  slate: 'bg-slate-200 text-slate-700',
}

// Compact summary tile: coloured icon chip + big value + small label.
// Matches the summary cards used on the Inventory / Dashboard screens.
export function StatTile({
  icon,
  label,
  value,
  tone = 'brand',
}: {
  icon: ReactNode
  label: string
  value: string | number
  tone?: keyof typeof TILE_TONES
}) {
  return (
    <Card className="flex items-center gap-3 p-3">
      <div
        className={clsx(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          TILE_TONES[tone] ?? TILE_TONES.brand,
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-lg font-bold leading-none text-slate-900">{value}</div>
        <div className="mt-0.5 text-2xs text-slate-500">{label}</div>
      </div>
    </Card>
  )
}
