import { useMemo, useState } from 'react'
import { Download, FileText, Truck, TrendingUp } from 'lucide-react'
import { useInvoices } from '@/features/invoices/hooks/useInvoices'
import { useChallans } from '@/features/deliveries/hooks/useDeliveries'
import { useMaterials } from '@/features/materials/hooks/useMaterials'
import { useCompanyName } from '@/features/shared/lookups'
import { currency, fmtDate, inRange, qty } from '@/lib/format'
import { downloadXlsx } from '@/lib/xlsx'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { TableSkeleton } from '@/components/common/Skeleton'
import { StatTile } from '@/components/common/StatTile'
import { Badge, Card, EmptyState } from '@/components/ui/primitives'
import { CompanyFilter, DateRangeFilter, FilterBar, SearchBox } from '@/components/common/Filters'
import { Pagination, usePagination } from '@/components/common/Pagination'

// One sold-material line, sourced from the same documents that reduced stock:
// non-cancelled delivery challans and non-cancelled invoices. Challan-sourced
// invoice lines carry no materialId (the challan already deducted), so a challan
// and its invoice never both appear — no double counting.
interface SaleRow {
  key: string
  date: string
  docType: 'Challan' | 'Invoice'
  docNo: string
  companyId: string
  material: string
  quantity: number
  unit: string
  amount?: number // invoices only (challans have no rate)
}

export function SalesPage() {
  const { data: invoices = [], isLoading: loadingInv } = useInvoices()
  const { data: challans = [], isLoading: loadingDc } = useChallans()
  const { data: materials = [] } = useMaterials()
  const companyName = useCompanyName()

  const [search, setSearch] = useState('')
  const [company, setCompany] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const unitOf = useMemo(() => {
    const m = new Map(materials.map((x) => [x.id, x.unit]))
    return (id?: string) => (id ? (m.get(id) ?? '') : '')
  }, [materials])

  // Every OWN material that left the shop as a sale. Sales of customer-supplied
  // stock (ownerType 'Company') are excluded — only own/shop stock ('Shop').
  const allSales = useMemo(() => {
    const rows: SaleRow[] = []
    for (const d of challans) {
      if (d.status === 'Cancelled') continue
      for (const l of d.lines) {
        if (!l.materialId || l.ownerType !== 'Shop') continue
        rows.push({
          key: `dc:${d.id}:${l.id}`,
          date: d.date,
          docType: 'Challan',
          docNo: d.dcNo,
          companyId: d.companyId,
          material: l.description || '—',
          quantity: l.quantity,
          unit: l.unit || unitOf(l.materialId),
        })
      }
    }
    for (const inv of invoices) {
      if (inv.status === 'Cancelled') continue
      for (const l of inv.lines) {
        if (!l.materialId || l.ownerType !== 'Shop') continue
        rows.push({
          key: `inv:${inv.id}:${l.id}`,
          date: inv.date,
          docType: 'Invoice',
          docNo: inv.invoiceNo,
          companyId: inv.companyId,
          material: l.description || '—',
          quantity: l.quantity,
          unit: l.unit || unitOf(l.materialId),
          amount: l.quantity * l.rate,
        })
      }
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [challans, invoices, unitOf])

  const rows = useMemo(() => {
    const s = search.toLowerCase()
    return allSales.filter((r) => {
      if (company && r.companyId !== company) return false
      if (!inRange(r.date, from, to)) return false
      if (s) {
        const hay = `${r.material} ${companyName(r.companyId)} ${r.docNo}`.toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [allSales, company, from, to, search, companyName])

  const pg = usePagination(rows)

  // Totals for the filtered view.
  const totalValue = rows.reduce((sum, r) => sum + (r.amount ?? 0), 0)
  // Quantity sold per material (name + unit) — the "Material name — Qty unit" view.
  const perMaterial = useMemo(() => {
    const m = new Map<string, { name: string; unit: string; qty: number }>()
    for (const r of rows) {
      const k = `${r.material}|${r.unit}`
      const cur = m.get(k) ?? { name: r.material, unit: r.unit, qty: 0 }
      cur.qty += r.quantity
      m.set(k, cur)
    }
    return [...m.values()].sort((a, b) => b.qty - a.qty)
  }, [rows])

  function exportExcel() {
    if (rows.length === 0) return
    downloadXlsx(
      'sales-report',
      rows,
      [
        { header: 'Date', value: (r) => fmtDate(r.date), width: 14 },
        { header: 'Type', value: (r) => r.docType, width: 12 },
        { header: 'Document', value: (r) => r.docNo, width: 18 },
        { header: 'Customer', value: (r) => companyName(r.companyId), width: 24 },
        { header: 'Material', value: (r) => r.material, width: 24 },
        { header: 'Quantity', value: (r) => r.quantity, width: 12 },
        { header: 'Unit', value: (r) => r.unit, width: 10 },
        { header: 'Amount', value: (r) => r.amount ?? '', width: 14 },
      ],
      'Sales',
    )
  }

  const isLoading = loadingInv || loadingDc

  return (
    <div>
      <PageHeader
        title="Sales"
        subtitle="Own materials sold via delivery challans and invoices — customer-supplied stock is excluded"
        actions={
          <button className="btn-secondary" onClick={exportExcel}>
            <Download size={16} /> Excel
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile
          icon={<TrendingUp size={18} />}
          label="Sale lines"
          value={rows.length}
          tone="brand"
        />
        <StatTile
          icon={<FileText size={18} />}
          label="Invoiced value"
          value={currency(totalValue)}
          tone="green"
        />
        <StatTile icon={<Truck size={18} />} label="Materials sold" value={perMaterial.length} />
      </div>

      {/* Quantity sold per material — "Material name — Qty unit". */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
        <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-slate-500">
          Sold by material
        </p>
        {perMaterial.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing sold for the current filters.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {perMaterial.map((m) => (
              <span
                key={`${m.name}|${m.unit}`}
                className="inline-flex items-baseline gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm"
              >
                <span className="font-medium text-slate-800">{m.name}</span>
                <span className="text-slate-400">—</span>
                <span className="font-semibold text-brand-700">{qty(m.qty)}</span>
                <span className="text-2xs text-slate-500">{m.unit}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <FilterBar>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search material, customer, doc…"
        />
        <CompanyFilter value={company} onChange={setCompany} />
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </FilterBar>

      <Card>
        {isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<TrendingUp size={40} />}
            title="No sales yet"
            description="Sales appear here when you dispatch a delivery challan or raise an invoice against stock."
          />
        ) : (
          <ResponsiveTable className="min-w-[52rem]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">Date</th>
                <th className="th">Document</th>
                <th className="th">Customer</th>
                <th className="th">Material</th>
                <th className="th text-right">Qty</th>
                <th className="th text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pg.pageItems.map((r) => (
                <tr key={r.key} className="hover:bg-slate-50/60">
                  <td className="td text-slate-600">{fmtDate(r.date)}</td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <Badge tone={r.docType === 'Invoice' ? 'green' : 'blue'}>{r.docType}</Badge>
                      <span className="font-mono text-2xs text-slate-500">{r.docNo}</span>
                    </div>
                  </td>
                  <td className="td font-medium text-slate-800">{companyName(r.companyId)}</td>
                  <td className="td">{r.material}</td>
                  <td className="td text-right">
                    <span className="font-semibold">{qty(r.quantity)}</span>
                    <span className="ml-1 text-2xs text-slate-500">{r.unit}</span>
                  </td>
                  <td className="td text-right">
                    {r.amount != null ? (
                      currency(r.amount)
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        )}
        <Pagination pg={pg} />
      </Card>
    </div>
  )
}
