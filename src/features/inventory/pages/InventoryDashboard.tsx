import { useMemo } from 'react'
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  CheckCircle2,
  Coins,
  Download,
  History,
  Layers,
  PackageX,
  Send,
  Sliders,
  TrendingDown,
} from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { Card } from '@/components/ui/primitives'
import { AppLink } from '@/components/nav/app-link'
import { currency, fmtDate, qty } from '@/lib/format'
import { useCompanyName, useMaterialName } from '@/features/shared/lookups'
import { useLedger, useOwnPurchases } from '../hooks/useInventory'
import { useMaterialStockSummaries } from '../stockSummary'

const QUICK_LINKS = [
  {
    to: '/app/inventory/materials',
    label: 'Materials & Stock',
    icon: Boxes,
    tone: 'cyan' as const,
  },
  { to: '/app/inventory/movements', label: 'Movements', icon: History, tone: 'blue' as const },
  { to: '/app/inventory/adjustments', label: 'Adjustments', icon: Sliders, tone: 'amber' as const },
  {
    to: '/app/inventory/transfers',
    label: 'Transfers',
    icon: ArrowLeftRight,
    tone: 'purple' as const,
  },
  { to: '/app/inventory/history', label: 'Stock History', icon: History, tone: 'slate' as const },
  { to: '/app/inventory/reports', label: 'Reports', icon: Download, tone: 'green' as const },
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
  const summaries = useMaterialStockSummaries()
  const { data: ledger = [] } = useLedger()
  const { data: ownPurchases = [] } = useOwnPurchases()
  const companyName = useCompanyName()
  const materialName = useMaterialName()

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

  const byCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of summaries)
      if (s.current > 0)
        m.set(s.type || 'Uncategorised', (m.get(s.type || 'Uncategorised') ?? 0) + s.current)
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label, value, tone: 'bg-cyan-500' }))
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

  const lowStock = useMemo(
    () =>
      summaries
        .filter((s) => s.status === 'low' || s.status === 'out')
        .sort((a, b) => a.current - b.current)
        .slice(0, 8),
    [summaries],
  )

  const recent = ledger.slice(0, 8)

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Materials, stock, movements and valuation — the source of truth for material stock"
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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Stock by Category</h3>
          <BarList rows={byCategory} />
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Stock by Owner / Location</h3>
          <BarList rows={byOwner} />
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Top Consumed Materials</h3>
          <BarList rows={topConsumed} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Low / Out of Stock</h3>
          {lowStock.length === 0 ? (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
              All materials above reorder level.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lowStock.map((s) => (
                <li key={s.materialId} className="flex items-center justify-between py-2 text-sm">
                  <span className="truncate text-slate-700">{s.name}</span>
                  <span
                    className={`font-semibold ${s.current <= 0 ? 'text-red-600' : 'text-amber-600'}`}
                  >
                    {qty(s.current)} {s.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Recent Activity</h3>
          {recent.length === 0 ? (
            <p className="text-xs text-slate-500">No stock movements yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">
                      {r.txnType} · {materialName(r.materialId)}
                    </p>
                    <p className="truncate text-2xs text-slate-500">
                      {r.docNo} · {fmtDate(r.date)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-semibold ${r.qtyIn > 0 ? 'text-emerald-600' : 'text-red-600'}`}
                  >
                    {r.qtyIn > 0 ? `+${qty(r.qtyIn)}` : `-${qty(r.qtyOut)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
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
