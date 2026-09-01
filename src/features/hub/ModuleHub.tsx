import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { NAV_GROUPS } from '@/components/layout/nav'
import { useAuth } from '@/features/auth/auth'
import { PageHeader } from '@/components/common/PageHeader'

// A group landing page: clicking a grouped menu (e.g. "Production Planning")
// lands here and shows one big button per sub-module. Items are read from the
// shared NAV_GROUPS so the hub and the sidebar never drift apart.
export function ModuleHub({ title, subtitle }: { title: string; subtitle?: string }) {
  const { isSuperAdmin } = useAuth()
  const group = NAV_GROUPS.find((g) => g.title === title)
  const items = (group?.items ?? []).filter((n) => !n.superAdmin || isSuperAdmin)

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 transition group-hover:bg-brand-gradient group-hover:text-white">
              <item.icon size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-900">{item.label}</span>
              <span className="block text-2xs text-slate-500">Open {item.label}</span>
            </span>
            <ChevronRight
              size={18}
              className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500"
            />
          </Link>
        ))}
      </div>
    </div>
  )
}
