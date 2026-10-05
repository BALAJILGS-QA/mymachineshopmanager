import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  CheckCircle2,
  Coins,
  History,
  Layers,
  PackageX,
  Send,
  TrendingDown,
} from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { Card } from '@/components/ui/primitives'
import { AppLink } from '@/components/nav/app-link'
import { currency, qty } from '@/lib/format'
import { SHOP_SCOPE } from '@/data/computations'
import { useCompanyName } from '@/features/shared/lookups'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useOwnPurchases } from '../hooks/useInventory'
import { useMaterialStockSummaries } from '../stockSummary'

// Quick Actions only link to current Inventory destinations (the removed
// Adjustments / Transfers / Stock History / Reports screens are no longer in nav).
const QUICK_LINKS = [
  {
    to: '/app/inventory/materials',
    label: 'Materials & Stock',
    icon: Boxes,
    tone: 'cyan' as const,
  },
  {
    to: '/app/inventory/movements',
    label: 'Stock Movements',
    icon: History,
    tone: 'blue' as const,
  },
]

// Simple horizontal-bar list (matches the app's lightweight chart style).
function BarList({ rows }: { rows: Array<{ label: string; value: number; tone?: string }> }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  if (rows.length === 0) return <p className="text-xs text-slate-400">No data.</p>
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="truncate text-slate-600">{r.label}</span>
            <span className="font-semibold text-slate-900">{qty(r.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${r.tone ?? 'bg-brand-500'}`}
              style={{ width: `${Math.round((r.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function InventoryDashboard() {
  // Company filter: '' = all, SHOP_SCOPE = own/shop stock, else a company id.
  // The scope flows into the existing per-source stock query, so all KPIs and
  // sections reflect the selected company's material stocks with no new logic.
  const [scope, setScope] = useState('')
  const { data: companies = [] } = useCompanies()
  const summaries = useMaterialStockSummaries(scope || undefined)
  const { data: ownPurchases = [] } = useOwnPurchases()
  const companyName = useCompanyName()

  const k = useMemo(() => {
    const totalQty = summaries.reduce((s, m) => s + m.current, 0)
    const value = summaries.reduce((s, m) => s + m.value, 0)
    const received = summaries.reduce((s, m) => s + m.received, 0)
    const dispatched = summaries.reduce((s, m) => s + m.dispatched, 0)
    return {
      totalMaterials: summaries.length,
      totalQty,
      available: totalQty,
      low: summaries.filter((m) => m.status === 'low').length,
      out: summaries.filter((m) => m.status === 'out').length,
      value,
      received,
      dispatched,
    }
  }, [summaries])

  const byOwner = useMemo(() => {
    // Materials have no location dimension; owner scope stands in for "location".
    const m = new Map<string, number>()
    for (const s of summaries) {
      if (s.current <= 0) continue
      const owner = s.material?.companyId ? companyName(s.material.companyId) : 'Own / Shop'
      m.set(owner, (m.get(owner) ?? 0) + s.current)
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label, value, tone: 'bg-blue-500' }))
  }, [summaries, companyName])

  const topConsumed = useMemo(
    () =>
      [...summaries]
        .filter((s) => s.dispatched > 0)
        .sort((a, b) => b.dispatched - a.dispatched)
        .slice(0, 6)
        .map((s) => ({ label: s.name, value: s.dispatched, tone: 'bg-amber-500' })),
    [summaries],
  )

  return (
    <div>
      <PageHeader
        title="Stock Overview"
        subtitle="Materials, stock, movements and valuation — the source of truth for material stock"
        actions={
          <select
            className="input w-full sm:w-56"
            aria-label="Filter stock by company"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="">All companies</option>
            <option value={SHOP_SCOPE}>Own / Shop stock</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile
          icon={<Boxes size={18} />}
          label="Total Materials"
          value={k.totalMaterials}
          tone="blue"
          to="/app/inventory/materials"
        />
        <StatTile
          icon={<Layers size={18} />}
          label="Total Stock Qty"
          value={qty(k.totalQty)}
          tone="cyan"
        />
        <StatTile
          icon={<CheckCircle2 size={18} />}
          label="Available Stock"
          value={qty(k.available)}
          tone="green"
        />
        <StatTile
          icon={<Coins size={18} />}
          label="Stock Value"
          value={currency(k.value)}
          tone="purple"
        />
        <StatTile
          icon={<Send size={18} />}
          label="Issued / Dispatched"
          value={qty(k.dispatched)}
          tone="blue"
        />
        <StatTile
          icon={<TrendingDown size={18} />}
          label="Incoming (received)"
          value={qty(k.received)}
          tone="cyan"
        />
        <StatTile
          icon={<AlertTriangle size={18} />}
          label="Low Stock"
          value={k.low}
          tone="amber"
          to="/app/inventory/materials"
        />
        <StatTile
          icon={<PackageX size={18} />}
          label="Out of Stock"
          value={k.out}
          tone="red"
          to="/app/inventory/materials"
        />
        <StatTile
          icon={<ArrowLeftRight size={18} />}
          label="Reserved"
          value={0}
          tone="slate"
          hint="n/a for materials"
        />
        <StatTile
          icon={<Coins size={18} />}
          label="Own Purchases"
          value={ownPurchases.length}
          tone="amber"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Stock by Owner / Location</h3>
          <BarList rows={byOwner} />
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Top Consumed Materials</h3>
          <BarList rows={topConsumed} />
        </Card>
      </div>

      <Card className="mt-4 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {QUICK_LINKS.map((l) => (
            <AppLink
              key={l.to}
              to={l.to}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white py-3 text-xs font-semibold text-slate-700 transition hover:border-brand-300 hover:bg-brand-50"
            >
              <l.icon size={20} className="text-slate-500" />
              {l.label}
            </AppLink>
          ))}
        </div>
      </Card>
    </div>
  )
}
