import { Link, type LinkProps } from '@tanstack/react-router'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { clsx } from 'clsx'
import { Card } from '@/components/ui/primitives'

export interface WorkflowStage {
  label: string
  count: number | string
  icon: LucideIcon
  to: LinkProps['to']
  tone?: 'brand' | 'blue' | 'amber' | 'green' | 'slate'
}

const TONES: Record<NonNullable<WorkflowStage['tone']>, string> = {
  brand: 'bg-brand-50 text-brand-700',
  blue: 'bg-blue-50 text-blue-600',
  amber: 'bg-amber-50 text-amber-600',
  green: 'bg-emerald-50 text-emerald-600',
  slate: 'bg-slate-100 text-slate-600',
}

// A subtle horizontal shop-floor flow: Received → Stock → Machining → Ready →
// Dispatched. Each stage shows a live count and links to its screen — the
// "manufacturing control center" glance (spec §17). Scrolls on narrow widths.
export function WorkflowStepper({ stages }: { stages: WorkflowStage[] }) {
  return (
    <Card className="mb-4 overflow-x-auto p-3">
      <div className="flex min-w-max items-stretch gap-1">
        {stages.map((s, i) => (
          <div key={s.label} className="flex items-center">
            <Link
              to={s.to}
              className="group flex min-w-[9.5rem] items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-slate-50"
            >
              <span
                className={clsx(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  TONES[s.tone ?? 'slate'],
                )}
              >
                <s.icon size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-2xs font-medium uppercase tracking-wide text-slate-500">
                  {s.label}
                </span>
                <span className="tnum block text-lg font-bold leading-tight text-slate-900">
                  {s.count}
                </span>
              </span>
            </Link>
            {i < stages.length - 1 && (
              <ChevronRight size={18} className="mx-0.5 shrink-0 text-slate-300" aria-hidden />
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
