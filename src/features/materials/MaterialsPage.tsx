import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import {
  ArrowLeft,
  ArrowUpDown,
  Boxes,
  Building2,
  ChevronRight,
  Download,
  Eye,
  Package,
  Pencil,
  Plus,
  Search,
  Send,
  Settings2,
  Sliders,
  Trash2,
} from 'lucide-react'
import type { Material, MaterialReceipt, MaterialReceiptStock } from '@/types'
import {
  useMaterials,
  useReceipts,
  useAdjustments,
  useOwnPurchases,
  useSourceStock,
  useDeleteMaterial,
  useRemoveReceipt,
} from './hooks/useMaterials'
import { useChallans } from '@/features/deliveries/hooks/useDeliveries'
import { useInvoices } from '@/features/invoices/hooks/useInvoices'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useCompanyName, useMaterialName } from '@/features/shared/lookups'
import { roundMoney } from '@/data/computations'
import { toUserMessage } from '@/lib/api/errors'
import { fmtDate, inRange, qty } from '@/lib/format'
import { downloadXlsx } from '@/lib/xlsx'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { Badge, Card, EmptyState } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { DateRangeFilter } from '@/components/common/Filters'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { AddMaterialForm, AdjustmentForm, MaterialForm } from './MaterialForms'

type View = 'customer' | 'own'
type Dialog = 'add' | 'adjust' | 'materials' | null
type StatusKey = 'in' | 'low' | 'out'
type SortKey = 'name' | 'current' | 'received' | 'issued' | 'updated'

// One received stock (source) with its per-source dispatch position, joined to
// the material master and the underlying receipt (for edit/delete actions).
interface SourceRow {
  rs: MaterialReceiptStock
  material?: Material
  receipt?: MaterialReceipt
}

// One row per unique material — its live stock summary, aggregated from all of
// that material's sources within the current view + filters. Reuses the existing
// per-source figures (received / totalDispatched / available), so the numbers can
// never diverge from the rest of the system.
interface MaterialSummary {
  materialId: string
  material?: Material
  name: string
  code?: string
  unit: string
  received: number
  issued: number
  current: number
  sourceCount: number
  lastDate: string
  sources: SourceRow[]
}

// Stock status from the material's own reorder level (the app's existing
// threshold). No new business rule is introduced: only reorderLevel is used.
function stockStatus(
  current: number,
  reorderLevel?: number,
): {
  key: StatusKey
  label: string
  tone: 'green' | 'amber' | 'red'
} {
  if (current <= 0) return { key: 'out', label: 'Out of Stock', tone: 'red' }
  if (reorderLevel && reorderLevel > 0 && current <= reorderLevel)
    return { key: 'low', label: 'Low Stock', tone: 'amber' }
  return { key: 'in', label: 'In Stock', tone: 'green' }
}

// Master + receipt collections the per-source grid derives from.
function useStockData() {
  const { data: materials = [] } = useMaterials()
  const { data: receipts = [] } = useReceipts()
  return { materials, receipts }
}

export function MaterialsPage() {
  const [view, setView] = useState<View>('customer')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [historyFor, setHistoryFor] = useState<MaterialReceiptStock | null>(null)
  const [editReceipt, setEditReceipt] = useState<MaterialReceipt | null>(null)
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null)
  const [fCompany, setFCompany] = useState('')
  const [fMaterial, setFMaterial] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | StatusKey>('all')
  const [sortBy, setSortBy] = useState<SortKey>('name')

  const toast = useToast()
  const confirm = useConfirm()
  const removeReceipt = useRemoveReceipt()
  const { materials, receipts } = useStockData()
  // Per-source stock — the source of truth for Received / DC / Invoice / Available.
  // Derived client-side so it renders with or without the DB view (migration 0015).
  const receiptStockRows = useSourceStock()
  const { data: companies = [] } = useCompanies()
  const { data: ownPurchases = [] } = useOwnPurchases()
  const companyName = useCompanyName()

  const materialById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials])
  const receiptById = useMemo(() => new Map(receipts.map((r) => [r.id, r])), [receipts])

  // Customer stock: one row per received stock (source), each tracked + reduced
  // independently — MC-ESVA-001 and MC-ESVA-002 never merge.
  const customerRows = useMemo<SourceRow[]>(() => {
    return receiptStockRows
      .filter((r) => r.ownership === 'Company')
      .map((rs) => ({
        rs,
        material: materialById.get(rs.materialId),
        receipt: receiptById.get(rs.receiptId),
      }))
      .sort((a, b) => (a.rs.date < b.rs.date ? 1 : -1))
  }, [receiptStockRows, materialById, receiptById])

  const customerFiltered = useMemo(() => {
    const s = search.toLowerCase()
    return customerRows.filter(({ rs, material }) => {
      if (fCompany && rs.companyId !== fCompany) return false
      if (fMaterial && rs.materialId !== fMaterial) return false
      if (!inRange(rs.date, from, to)) return false
      if (s) {
        const hay =
          `${material?.name ?? ''} ${companyName(rs.companyId ?? '')} ${rs.supplier ?? ''} ${rs.sourceDocNo ?? ''}`.toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [customerRows, fCompany, fMaterial, from, to, search, companyName])

  // Own stock: one row per purchase receipt (source), with its landed cost.
  const ownRows = useMemo(() => {
    return receiptStockRows
      .filter((r) => r.ownership === 'Shop')
      .map((rs) => {
        const purchase = ownPurchases.find((p) => p.receiptId === rs.receiptId)
        return {
          rs,
          material: materialById.get(rs.materialId),
          receipt: receiptById.get(rs.receiptId),
          cost: purchase?.totalCost ?? 0,
          gst: purchase?.totalGst ?? 0,
          supplier: purchase?.supplier ?? rs.supplier,
        }
      })
      .sort((a, b) => (a.rs.date < b.rs.date ? 1 : -1))
  }, [receiptStockRows, ownPurchases, materialById, receiptById])

  const ownFiltered = useMemo(() => {
    const s = search.toLowerCase()
    return ownRows.filter(({ rs, material }) => {
      if (fMaterial && rs.materialId !== fMaterial) return false
      if (!inRange(rs.date, from, to)) return false
      if (s && !(material?.name ?? '').toLowerCase().includes(s)) return false
      return true
    })
  }, [ownRows, fMaterial, from, to, search])

  // Headline totals for the active view + filters: total on-hand stock vs total
  // dispatched (Nos). Reflects the company / material / date-range / search
  // filters because it sums the already-filtered rows.
  const totals = useMemo(() => {
    const rows = view === 'customer' ? customerFiltered : ownFiltered
    let stock = 0
    let dispatched = 0
    for (const { rs } of rows) {
      stock += rs.available
      dispatched += rs.totalDispatched
    }
    return { stock: roundMoney(stock), dispatched: roundMoney(dispatched) }
  }, [view, customerFiltered, ownFiltered])

  // Active filtered per-source rows (used for aggregation AND export).
  const activeFiltered = view === 'customer' ? customerFiltered : ownFiltered

  // Aggregate per-source rows into one summary per unique material. Uses the
  // existing per-source received / totalDispatched / available figures, so the
  // material-level totals stay identical to the underlying system.
  const summaries = useMemo<MaterialSummary[]>(() => {
    const map = new Map<string, MaterialSummary>()
    for (const row of activeFiltered) {
      const rs = row.rs
      const material = row.material
      let s = map.get(rs.materialId)
      if (!s) {
        s = {
          materialId: rs.materialId,
          material,
          name: material?.name ?? rs.materialId,
          code: material?.code,
          unit: rs.unit,
          received: 0,
          issued: 0,
          current: 0,
          sourceCount: 0,
          lastDate: rs.date,
          sources: [],
        }
        map.set(rs.materialId, s)
      }
      s.received += rs.received
      s.issued += rs.totalDispatched
      s.current += rs.available
      s.sourceCount += 1
      s.sources.push({ rs, material, receipt: receiptById.get(rs.receiptId) })
      if (rs.date > s.lastDate) s.lastDate = rs.date
      if (!s.material && material) {
        s.material = material
        s.name = material.name
        s.code = material.code
      }
    }
    return [...map.values()].map((s) => ({
      ...s,
      received: roundMoney(s.received),
      issued: roundMoney(s.issued),
      current: roundMoney(s.current),
    }))
  }, [activeFiltered, receiptById])

  // Live status counts across all materials in the current view + filters.
  const counts = useMemo(() => {
    let inS = 0
    let low = 0
    let out = 0
    for (const s of summaries) {
      const k = stockStatus(s.current, s.material?.reorderLevel).key
      if (k === 'in') inS += 1
      else if (k === 'low') low += 1
      else out += 1
    }
    return { total: summaries.length, in: inS, low, out }
  }, [summaries])

  // Apply the status filter + sort at the material level.
  const summaryRows = useMemo(() => {
    let rows = summaries
    if (statusFilter !== 'all')
      rows = rows.filter(
        (s) => stockStatus(s.current, s.material?.reorderLevel).key === statusFilter,
      )
    return [...rows].sort((a, b) => {
      switch (sortBy) {
        case 'current':
          return b.current - a.current
        case 'received':
          return b.received - a.received
        case 'issued':
          return b.issued - a.issued
        case 'updated':
          return a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0
        default:
          return a.name.localeCompare(b.name)
      }
    })
  }, [summaries, statusFilter, sortBy])

  const pg = usePagination(summaryRows)

  const selectedSummary = useMemo(
    () => summaries.find((s) => s.materialId === selectedMaterialId) ?? null,
    [summaries, selectedMaterialId],
  )
  // If the selected material drops out of the current view/filters, close the drawer.
  useEffect(() => {
    if (selectedMaterialId && !selectedSummary) setSelectedMaterialId(null)
  }, [selectedMaterialId, selectedSummary])

  const filtersActive = Boolean(
    fCompany || fMaterial || search || from || to || statusFilter !== 'all',
  )
  function clearFilters() {
    setFCompany('')
    setFMaterial('')
    setSearch('')
    setFrom('')
    setTo('')
    setStatusFilter('all')
  }

  async function onDeleteReceipt(rc: MaterialReceipt) {
    const ok = await confirm({
      title: 'Delete intake',
      message: `Delete receipt ${rc.receiptNo}? Stock balances will be recalculated.`,
      danger: true,
    })
    if (!ok) return
    try {
      await removeReceipt.mutateAsync(rc.id)
      toast.success('Intake deleted')
    } catch (e) {
      toast.error(toUserMessage(e, 'Delete failed'))
    }
  }

  // Download the current view as an Excel (.xlsx) stock report.
  // Export the material-wise stock summary (one row per material) for the current
  // view + filters. Uses the same aggregated figures shown in the grid.
  function exportReport() {
    if (summaryRows.length === 0) return toast.info('Nothing to export')
    downloadXlsx(
      view === 'customer' ? 'materials-stock-summary' : 'own-stock-summary',
      summaryRows,
      [
        { header: 'Material', value: (s) => s.name, width: 26 },
        { header: 'Code', value: (s) => s.code ?? '—', width: 14 },
        { header: 'Received', value: (s) => s.received, width: 14 },
        { header: 'Issued', value: (s) => s.issued, width: 14 },
        { header: 'Current Stock', value: (s) => s.current, width: 16 },
        { header: 'Unit', value: (s) => s.unit, width: 10 },
        {
          header: 'Status',
          value: (s) => stockStatus(s.current, s.material?.reorderLevel).label,
          width: 16,
        },
      ],
      view === 'customer' ? 'Customer Stock Summary' : 'Own Stock Summary',
    )
  }

  const countChips: { key: 'all' | StatusKey; label: string; n: number; dot: string }[] = [
    { key: 'all', label: 'Materials', n: counts.total, dot: 'bg-slate-400' },
    { key: 'in', label: 'In Stock', n: counts.in, dot: 'bg-emerald-500' },
    { key: 'low', label: 'Low Stock', n: counts.low, dot: 'bg-amber-500' },
    { key: 'out', label: 'Out of Stock', n: counts.out, dot: 'bg-red-500' },
  ]

  return (
    <div>
      {selectedSummary ? (
        <MaterialDetailFullPage
          summary={selectedSummary}
          view={view}
          onBack={() => setSelectedMaterialId(null)}
          onEditReceipt={(r) => setEditReceipt(r)}
          onDeleteReceipt={onDeleteReceipt}
          onViewSource={(rs) => setHistoryFor(rs)}
        />
      ) : (
        <>
          <PageHeader
            title="Materials & Stock"
            subtitle="Manage customer materials, own materials, stock movements and stock history"
            actions={
              <>
                <button className="btn-ghost btn-sm" onClick={exportReport}>
                  <Download size={15} /> Export Excel
                </button>
                <button className="btn-ghost btn-sm" onClick={() => setDialog('materials')}>
                  <Settings2 size={15} /> Materials
                </button>
                <button className="btn-ghost btn-sm" onClick={() => setDialog('adjust')}>
                  <Sliders size={15} /> Adjust
                </button>
                <button className="btn-primary" onClick={() => setDialog('add')}>
                  <Plus size={16} /> Add Material
                </button>
              </>
            }
          />

          {/* Summary — total on-hand stock vs total dispatched for the current
          view + filters (updates dynamically). Values/calculations unchanged. */}
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="relative flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 pl-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <span className="absolute inset-y-0 left-0 w-1.5 bg-brand-500" aria-hidden />
              <div className="min-w-0">
                <p className="truncate text-2xs font-semibold uppercase tracking-wide text-slate-500">
                  {`Total material stock${view === 'customer' && fCompany ? ` — ${companyName(fCompany)}` : ''}`}
                </p>
                <p className="tnum mt-1 text-2xl font-bold leading-none text-slate-900">
                  {qty(totals.stock)}
                  <span className="ml-1 text-sm font-semibold text-slate-400">Nos</span>
                </p>
                <p className="mt-1.5 text-2xs text-slate-400">On-hand available stock</p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                <Boxes size={20} />
              </div>
            </div>

            <div className="relative flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 pl-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <span className="absolute inset-y-0 left-0 w-1.5 bg-blue-500" aria-hidden />
              <div className="min-w-0">
                <p className="truncate text-2xs font-semibold uppercase tracking-wide text-slate-500">
                  Total materials dispatched
                </p>
                <p className="tnum mt-1 text-2xl font-bold leading-none text-slate-900">
                  {qty(totals.dispatched)}
                  <span className="ml-1 text-sm font-semibold text-slate-400">Nos</span>
                </p>
                <p className="mt-1.5 text-2xs text-slate-400">Delivery challans + invoices</p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                <Send size={20} />
              </div>
            </div>
          </div>

          {/* Material count summary — click a chip to filter by status. */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {countChips.map((c) => {
              const active = statusFilter === c.key
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setStatusFilter(c.key)}
                  className={clsx(
                    'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'border-brand-300 bg-brand-50 text-brand-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  <span className={clsx('h-1.5 w-1.5 rounded-full', c.dot)} />
                  <span className="tnum font-bold text-slate-900">{c.n}</span>
                  {c.label}
                </button>
              )
            })}
          </div>

          {/* Filters */}
          <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
            <div>
              <label className="label">Stock Type</label>
              {/* Segmented control — drives the same `view` state / filter logic as
              the previous dropdown (functional behaviour unchanged). */}
              <div
                role="group"
                aria-label="Stock type"
                className="inline-flex items-center gap-0.5 rounded-lg border border-slate-300 bg-slate-100 p-0.5"
              >
                {(
                  [
                    ['customer', 'Customer Stock'],
                    ['own', 'Own Stock'],
                  ] as [View, string][]
                ).map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    name="stockType"
                    aria-pressed={view === val}
                    onClick={() => setView(val)}
                    className={clsx(
                      'rounded-md px-3 py-1.5 text-sm font-semibold transition-colors',
                      view === val
                        ? 'bg-white text-brand-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700',
                    )}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative min-w-[12rem] flex-1">
              <label className="label">Search</label>
              <Search
                size={16}
                className="absolute left-3 top-[2.15rem] -translate-y-1/2 text-slate-500"
              />
              <input
                className="input pl-9"
                aria-label="Search material or company"
                name="materialSearch"
                placeholder="Search materials…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {view === 'customer' && (
              <div>
                <label className="label">Company</label>
                <select
                  className="input min-w-[11rem]"
                  aria-label="Company"
                  name="materialCompanyFilter"
                  value={fCompany}
                  onChange={(e) => setFCompany(e.target.value)}
                >
                  <option value="">All companies</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="label">Material</label>
              <select
                className="input min-w-[12rem]"
                aria-label="Material"
                name="materialFilter"
                value={fMaterial}
                onChange={(e) => setFMaterial(e.target.value)}
              >
                <option value="">All materials</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select
                className="input min-w-[9rem]"
                aria-label="Status"
                name="materialStatusFilter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | StatusKey)}
              >
                <option value="all">All statuses</option>
                <option value="in">In Stock</option>
                <option value="low">Low Stock</option>
                <option value="out">Out of Stock</option>
              </select>
            </div>
            <div>
              <label className="label">Sort by</label>
              <div className="relative">
                <ArrowUpDown
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <select
                  className="input min-w-[10rem] pl-8"
                  aria-label="Sort by"
                  name="materialSort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                >
                  <option value="name">Material name</option>
                  <option value="current">Current stock</option>
                  <option value="received">Received</option>
                  <option value="issued">Issued</option>
                  <option value="updated">Last updated</option>
                </select>
              </div>
            </div>
            <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
            {filtersActive && (
              <button className="btn-ghost btn-sm mb-0.5" onClick={clearFilters}>
                Clear
              </button>
            )}
          </div>

          {/* Material-wise stock summary */}
          <Card>
            {summaryRows.length === 0 ? (
              <EmptyState
                icon={view === 'customer' ? <Building2 size={40} /> : <Package size={40} />}
                title={
                  filtersActive
                    ? 'No materials found'
                    : `No ${view === 'customer' ? 'customer' : 'own'} stock`
                }
                description={
                  filtersActive
                    ? 'No materials match your search / filters.'
                    : view === 'customer'
                      ? 'Use “Add Material” (Customer material) to receive customer-supplied material into stock.'
                      : 'Use “Add Material” (Own material) to record a purchase — it adds stock and an expense.'
                }
                action={
                  filtersActive ? (
                    <button className="btn-secondary btn-sm" onClick={clearFilters}>
                      Clear filters
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <>
                {/* Desktop / tablet: table */}
                <div className="hidden w-full overflow-x-auto md:block">
                  <table className="w-full min-w-[52rem] border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="th">Material</th>
                        <th className="th text-right">Received</th>
                        <th className="th text-right">Issued</th>
                        <th className="th text-right">Current Stock</th>
                        <th className="th">Unit</th>
                        <th className="th">Status</th>
                        <th className="th text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {pg.pageItems.map((s) => {
                        const st = stockStatus(s.current, s.material?.reorderLevel)
                        return (
                          <tr
                            key={s.materialId}
                            className="cursor-pointer transition-colors hover:bg-slate-50/70"
                            onClick={() => setSelectedMaterialId(s.materialId)}
                          >
                            <td className="td">
                              <div className="flex items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                                  <Package size={16} />
                                </span>
                                <span className="min-w-0">
                                  <span className="block font-semibold text-slate-800">
                                    {s.name}
                                  </span>
                                  {s.code && (
                                    <span className="block text-2xs text-slate-400">{s.code}</span>
                                  )}
                                </span>
                              </div>
                            </td>
                            <td className="td text-right font-medium text-blue-700">
                              {qty(s.received)}
                            </td>
                            <td className="td text-right font-medium text-slate-700">
                              {qty(s.issued)}
                            </td>
                            <td className="td text-right">
                              <span
                                className={clsx(
                                  'tnum text-base font-bold',
                                  s.current > 0 ? 'text-emerald-600' : 'text-red-600',
                                )}
                              >
                                {qty(s.current)}
                              </span>
                            </td>
                            <td className="td text-slate-500">{s.unit}</td>
                            <td className="td">
                              <Badge tone={st.tone}>{st.label}</Badge>
                            </td>
                            <td className="td text-right">
                              <span className="inline-flex items-center gap-1 text-2xs font-semibold text-brand-700">
                                View details <ChevronRight size={13} />
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile: cards */}
                <div className="divide-y divide-slate-100 md:hidden">
                  {pg.pageItems.map((s) => {
                    const st = stockStatus(s.current, s.material?.reorderLevel)
                    return (
                      <button
                        key={s.materialId}
                        type="button"
                        onClick={() => setSelectedMaterialId(s.materialId)}
                        className="flex w-full flex-col gap-3 p-4 text-left transition-colors active:bg-slate-50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800">{s.name}</p>
                            {s.code && <p className="text-2xs text-slate-400">{s.code}</p>}
                          </div>
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </div>
                        <div className="flex items-end justify-between">
                          <div>
                            <p className="text-2xs uppercase tracking-wide text-slate-400">
                              Current stock
                            </p>
                            <p
                              className={clsx(
                                'tnum text-xl font-bold',
                                s.current > 0 ? 'text-emerald-600' : 'text-red-600',
                              )}
                            >
                              {qty(s.current)}
                              <span className="ml-1 text-2xs font-medium text-slate-400">
                                {s.unit}
                              </span>
                            </p>
                          </div>
                          <div className="flex gap-4 text-right">
                            <div>
                              <p className="text-2xs uppercase tracking-wide text-slate-400">
                                Received
                              </p>
                              <p className="tnum font-semibold text-blue-700">{qty(s.received)}</p>
                            </div>
                            <div>
                              <p className="text-2xs uppercase tracking-wide text-slate-400">
                                Issued
                              </p>
                              <p className="tnum font-semibold text-slate-700">{qty(s.issued)}</p>
                            </div>
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-1 text-2xs font-semibold text-brand-700">
                          View details <ChevronRight size={13} />
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
            <Pagination pg={pg} />
          </Card>
        </>
      )}

      {dialog === 'add' && <AddMaterialForm onClose={() => setDialog(null)} />}
      {editReceipt && (
        <AddMaterialForm receipt={editReceipt} onClose={() => setEditReceipt(null)} />
      )}
      {dialog === 'adjust' && <AdjustmentForm onClose={() => setDialog(null)} />}
      {dialog === 'materials' && <MaterialsManager onClose={() => setDialog(null)} />}
      {historyFor && <SourceHistoryModal row={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  )
}

// Full-page detail for one material: its per-source stock records (the original
// intake-level columns), with the existing view / edit / delete actions. Opens
// when a material row is clicked; "Back" returns to the material summary.
function MaterialDetailFullPage({
  summary,
  view,
  onBack,
  onEditReceipt,
  onDeleteReceipt,
  onViewSource,
}: {
  summary: MaterialSummary
  view: View
  onBack: () => void
  onEditReceipt: (r: MaterialReceipt) => void
  onDeleteReceipt: (r: MaterialReceipt) => void
  onViewSource: (rs: MaterialReceiptStock) => void
}) {
  const companyName = useCompanyName()
  const st = stockStatus(summary.current, summary.material?.reorderLevel)
  const pg = usePagination(summary.sources)

  // Export all per-source records for THIS material (the detail table columns).
  function exportMaterial() {
    downloadXlsx(
      `material-${summary.code || summary.name}-records`,
      summary.sources,
      [
        {
          header: 'Company',
          value: ({ rs }) => (view === 'customer' ? companyName(rs.companyId ?? '') : 'Own (shop)'),
          width: 22,
        },
        { header: 'Item', value: ({ material }) => material?.name ?? '—', width: 22 },
        { header: 'Challan/Inv No', value: ({ rs }) => rs.sourceDocNo || rs.receiptNo, width: 18 },
        { header: 'From Date', value: ({ rs }) => fmtDate(rs.date), width: 14 },
        { header: 'Received', value: ({ rs }) => rs.received, width: 12 },
        { header: 'DC Qty', value: ({ rs }) => rs.dcQty, width: 12 },
        { header: 'Invoice Qty', value: ({ rs }) => rs.invoiceQty, width: 12 },
        { header: 'Total Dispatched', value: ({ rs }) => rs.totalDispatched, width: 16 },
        { header: 'Available', value: ({ rs }) => rs.available, width: 12 },
        { header: 'Status', value: ({ rs }) => rs.status, width: 16 },
      ],
      summary.name.slice(0, 28),
    )
  }

  const kpis = [
    {
      label: 'Received',
      value: summary.received,
      cls: 'text-blue-700',
      chip: 'border-blue-100 bg-blue-50/60',
    },
    {
      label: 'Issued',
      value: summary.issued,
      cls: 'text-slate-700',
      chip: 'border-slate-200 bg-slate-50',
    },
    {
      label: 'Current Stock',
      value: summary.current,
      cls: summary.current > 0 ? 'text-emerald-700' : 'text-red-700',
      chip:
        summary.current > 0 ? 'border-emerald-100 bg-emerald-50/60' : 'border-red-100 bg-red-50/60',
    },
  ]

  return (
    <div>
      <button onClick={onBack} className="btn-ghost btn-sm mb-3 -ml-2">
        <ArrowLeft size={15} /> Back to materials
      </button>
      <PageHeader
        title={summary.name}
        subtitle={`${summary.code ? `${summary.code} · ` : ''}${summary.unit}${
          view === 'own' ? ' · Own (shop)' : ''
        }`}
        actions={
          <>
            <button className="btn-ghost btn-sm" onClick={exportMaterial}>
              <Download size={15} /> Export Excel
            </button>
            <Badge tone={st.tone}>{st.label}</Badge>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className={clsx('rounded-xl border px-4 py-3', k.chip)}>
            <p className="text-2xs font-semibold uppercase tracking-wide text-slate-500">
              {k.label}
            </p>
            <p className={clsx('tnum mt-0.5 text-xl font-bold', k.cls)}>
              {qty(k.value)}
              <span className="ml-1 text-xs font-medium text-slate-400">{summary.unit}</span>
            </p>
          </div>
        ))}
      </div>

      <Card>
        <ResponsiveTable className="min-w-[80rem]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="th">Company</th>
              <th className="th">Item</th>
              <th className="th">Challan/Inv No</th>
              <th className="th">From Date</th>
              <th className="th text-right">Received</th>
              <th className="th text-right">DC Qty</th>
              <th className="th text-right">Invoice Qty</th>
              <th className="th text-right">Total Dispatched</th>
              <th className="th text-right">Available</th>
              <th className="th">Status</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {pg.pageItems.map(({ rs, material, receipt }) => {
              const fullyOut = rs.available <= 0
              return (
                <tr key={rs.receiptId} className="hover:bg-slate-50/60">
                  <td className="td font-medium text-slate-800">
                    {view === 'customer' ? companyName(rs.companyId ?? '') : 'Own (shop)'}
                  </td>
                  <td className="td">{material?.name ?? rs.materialId}</td>
                  <td className="td">
                    <div className="font-mono text-2xs text-slate-600">
                      {rs.sourceDocNo || rs.receiptNo}
                    </div>
                    {rs.supplier && <div className="text-2xs text-slate-400">{rs.supplier}</div>}
                  </td>
                  <td className="td text-slate-600">{fmtDate(rs.date)}</td>
                  <td className="td text-right font-medium text-blue-700">
                    {qty(rs.received)}
                    <span className="ml-1 text-2xs font-normal text-slate-400">{rs.unit}</span>
                  </td>
                  <td className="td text-right text-slate-600">{qty(rs.dcQty)}</td>
                  <td className="td text-right text-slate-600">{qty(rs.invoiceQty)}</td>
                  <td className="td text-right font-medium text-slate-700">
                    {qty(rs.totalDispatched)}
                  </td>
                  <td className="td text-right">
                    <span
                      className={clsx(
                        'font-semibold',
                        fullyOut ? 'text-red-600' : 'text-emerald-600',
                      )}
                    >
                      {qty(rs.available)}
                    </span>
                    <span className="ml-1 text-2xs text-slate-400">{rs.unit}</span>
                  </td>
                  <td className="td">
                    <Badge tone={fullyOut ? 'red' : 'green'}>{rs.status}</Badge>
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <button
                        className="btn-ghost btn-sm text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                        title="View source history"
                        onClick={() => onViewSource(rs)}
                      >
                        <Eye size={15} />
                      </button>
                      {view === 'customer' && receipt && (
                        <>
                          <button
                            className="btn-ghost btn-sm"
                            title="Edit intake"
                            onClick={() => onEditReceipt(receipt)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            className="btn-ghost btn-sm text-red-500"
                            title="Delete intake"
                            onClick={() => onDeleteReceipt(receipt)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </ResponsiveTable>
        <Pagination pg={pg} />
      </Card>
    </div>
  )
}

// History of ONE received stock (source): the intake, then every delivery
// challan / invoice that consumed THIS specific source, plus any adjustment
// booked against it — with a running balance. Derived from the documents' own
// source tags (challan.lines / invoice.lines), so it is accurate per source.
interface SourceMovement {
  id: string
  date: string
  txnType: 'Receipt' | 'Delivery Challan' | 'Invoice' | 'Adjustment'
  docNo: string
  qtyIn: number
  qtyOut: number
  note?: string
}

function SourceHistoryModal({ row, onClose }: { row: MaterialReceiptStock; onClose: () => void }) {
  const materialName = useMaterialName()
  const companyName = useCompanyName()
  const { data: challans = [] } = useChallans()
  const { data: invoices = [] } = useInvoices()
  const { data: adjustments = [] } = useAdjustments()

  const withBalance = useMemo(() => {
    const moves: SourceMovement[] = []
    // The intake itself.
    moves.push({
      id: `rcpt_${row.receiptId}`,
      date: row.date,
      txnType: 'Receipt',
      docNo: row.sourceDocNo || row.receiptNo,
      qtyIn: row.received,
      qtyOut: 0,
      note: row.supplier ? `Received from ${row.supplier}` : 'Received into stock',
    })
    // Delivery challans that dispatched this source (skip cancelled).
    for (const c of challans) {
      if (c.status === 'Cancelled') continue
      for (const l of c.lines) {
        if (l.sourceReceiptId === row.receiptId && l.quantity > 0)
          moves.push({
            id: `dc_${c.id}_${l.id}`,
            date: c.date,
            txnType: 'Delivery Challan',
            docNo: c.dcNo,
            qtyIn: 0,
            qtyOut: l.quantity,
            note: `Dispatched via challan ${c.dcNo}`,
          })
      }
    }
    // Invoices that billed this source directly (skip cancelled).
    for (const iv of invoices) {
      if (iv.status === 'Cancelled') continue
      for (const l of iv.lines) {
        if (l.sourceReceiptId === row.receiptId && l.quantity > 0)
          moves.push({
            id: `inv_${iv.id}_${l.id}`,
            date: iv.date,
            txnType: 'Invoice',
            docNo: iv.invoiceNo,
            qtyIn: 0,
            qtyOut: l.quantity,
            note: `Billed via invoice ${iv.invoiceNo}`,
          })
      }
    }
    // Adjustments booked against this source (e.g. dispatch reversals).
    for (const a of adjustments) {
      if (a.sourceReceiptId === row.receiptId)
        moves.push({
          id: `adj_${a.id}`,
          date: a.date,
          txnType: 'Adjustment',
          docNo: a.adjNo,
          qtyIn: a.quantity > 0 ? a.quantity : 0,
          qtyOut: a.quantity < 0 ? -a.quantity : 0,
          note: a.reason,
        })
    }
    // Oldest → newest for the running balance, then show newest first.
    const asc = moves.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
    let bal = 0
    const out = asc.map((r) => {
      bal += r.qtyIn - r.qtyOut
      return { ...r, balance: bal }
    })
    return out.reverse()
  }, [row, challans, invoices, adjustments])

  const scopeLabel = row.ownership === 'Shop' ? 'Own (shop)' : companyName(row.companyId ?? '')
  const source = row.sourceDocNo || row.receiptNo

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${materialName(row.materialId)} — ${source} · ${scopeLabel}`}
    >
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5">
          <p className="text-2xs font-semibold uppercase tracking-wide text-blue-600/80">
            Received
          </p>
          <p className="tnum mt-0.5 text-lg font-bold text-blue-700">
            {qty(row.received)}
            <span className="ml-1 text-2xs font-medium text-blue-500/70">{row.unit}</span>
          </p>
        </div>
        <div className="rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2.5">
          <p className="text-2xs font-semibold uppercase tracking-wide text-brand-600/80">
            Dispatched
          </p>
          <p className="tnum mt-0.5 text-lg font-bold text-brand-700">
            {qty(row.totalDispatched)}
            <span className="ml-1 text-2xs font-medium text-brand-500/70">{row.unit}</span>
          </p>
        </div>
        <div
          className={clsx(
            'rounded-lg border px-3 py-2.5',
            row.available > 0
              ? 'border-emerald-100 bg-emerald-50/60'
              : 'border-red-100 bg-red-50/60',
          )}
        >
          <p
            className={clsx(
              'text-2xs font-semibold uppercase tracking-wide',
              row.available > 0 ? 'text-emerald-600/80' : 'text-red-600/80',
            )}
          >
            Available
          </p>
          <p
            className={clsx(
              'tnum mt-0.5 text-lg font-bold',
              row.available > 0 ? 'text-emerald-700' : 'text-red-700',
            )}
          >
            {qty(row.available)}
            <span className="ml-1 text-2xs font-medium opacity-70">{row.unit}</span>
          </p>
        </div>
      </div>
      {withBalance.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">No transactions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] overflow-hidden rounded-lg text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-2xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Transaction</th>
                <th className="px-3 py-2.5">Doc</th>
                <th className="px-3 py-2.5 text-right">In</th>
                <th className="px-3 py-2.5 text-right">Out</th>
                <th className="px-3 py-2.5 text-right">Balance</th>
                <th className="px-3 py-2.5">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {withBalance.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-slate-50/70">
                  <td className="px-3 py-2 text-slate-600">{fmtDate(r.date)}</td>
                  <td className="px-3 py-2">
                    <Badge
                      tone={
                        r.txnType === 'Receipt'
                          ? 'green'
                          : r.txnType === 'Invoice'
                            ? 'violet'
                            : r.txnType === 'Adjustment'
                              ? 'amber'
                              : 'blue'
                      }
                    >
                      {r.txnType}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-2xs text-slate-500">{r.docNo}</td>
                  <td className="px-3 py-2 text-right font-semibold text-emerald-600">
                    {r.qtyIn ? qty(r.qtyIn) : ''}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-red-500">
                    {r.qtyOut ? qty(r.qtyOut) : ''}
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-slate-900">
                    {qty(r.balance)}
                  </td>
                  <td className="px-3 py-2 text-2xs text-slate-500">{r.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

// Material master management: list + add/edit/deactivate, scoped by company.
function MaterialsManager({ onClose }: { onClose: () => void }) {
  const { data: allMaterials = [] } = useMaterials()
  const { data: companies = [] } = useCompanies()
  const companyName = useCompanyName()
  const deleteMaterial = useDeleteMaterial()
  const toast = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Material | null | undefined>(undefined)
  const [fCompany, setFCompany] = useState('')
  const materials = allMaterials.filter((m) =>
    !fCompany ? true : fCompany === 'shared' ? !m.companyId : m.companyId === fCompany,
  )

  async function onDelete(m: Material) {
    const ok = await confirm({
      title: 'Delete material',
      message: `Delete "${m.name}"?`,
      danger: true,
    })
    if (!ok) return
    try {
      await deleteMaterial.mutateAsync(m.id)
      toast.success('Material deleted')
    } catch (e) {
      toast.error(toUserMessage(e, 'Delete failed'))
    }
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title="Materials"
        footer={
          <>
            <button className="btn-secondary" onClick={onClose}>
              Close
            </button>
            <button className="btn-primary" onClick={() => setEditing(null)}>
              <Plus size={16} /> Add Material
            </button>
          </>
        }
      >
        <div className="mb-3">
          <label className="label">Belongs to</label>
          <select
            className="input max-w-xs"
            aria-label="Belongs to"
            name="materialBelongsTo"
            value={fCompany}
            onChange={(e) => setFCompany(e.target.value)}
          >
            <option value="">All materials</option>
            <option value="shared">Shared / Own</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {materials.length === 0 ? (
          <EmptyState
            icon={<Boxes size={40} />}
            title="No materials"
            description="Add a material — pick a customer under “Belongs to”, or leave it shared/own."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-2xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Belongs to</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2">Reorder</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {materials.map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{m.code}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-800">{m.name}</td>
                    <td className="px-3 py-1.5 text-slate-600">
                      {m.companyId ? companyName(m.companyId) : 'Shared / Own'}
                    </td>
                    <td className="px-3 py-1.5">{m.unit}</td>
                    <td className="px-3 py-1.5 text-slate-500">{m.reorderLevel ?? '—'}</td>
                    <td className="px-3 py-1.5">
                      {m.active ? (
                        <Badge tone="green">Active</Badge>
                      ) : (
                        <Badge tone="gray">Inactive</Badge>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost btn-sm" onClick={() => setEditing(m)}>
                          <Pencil size={15} />
                        </button>
                        <button
                          className="btn-ghost btn-sm text-red-500"
                          onClick={() => onDelete(m)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
      {editing !== undefined && (
        <MaterialForm material={editing} onClose={() => setEditing(undefined)} />
      )}
    </>
  )
}
