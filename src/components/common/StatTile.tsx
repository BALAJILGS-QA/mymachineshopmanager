import type { ReactNode } from 'react'
import { clsx } from 'clsx'
import { Card } from '@/components/ui/primitives'

const TILE_TONES: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-700',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  blue: 'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
  slate: 'bg-slate-100 text-slate-600',
}

// Compact summary tile: label + prominent value, with a subtle tinted icon chip.
// The value leads (data over decoration); the icon is a quiet accent.
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
    <Card className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="truncate text-2xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </div>
        <div className="tnum mt-1 truncate text-2xl font-bold leading-none text-slate-900">
          {value}
        </div>
      </div>
      <div
        className={clsx(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          TILE_TONES[tone] ?? TILE_TONES.brand,
        )}
      >
        {icon}
      </div>
    </Card>
  )
}
