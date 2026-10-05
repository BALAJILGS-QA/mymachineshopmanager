import { useMemo, useState } from 'react'
import { Boxes, Factory, History, PackageX, TrendingDown } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { StatTile } from '@/components/common/StatTile'
import { Badge, Card } from '@/components/ui/primitives'
import { DateRangeFilter } from '@/components/common/Filters'
import { fmtDate, inRange, qty } from '@/lib/format'
import { useCompanyName, useMaterialName } from '@/features/shared/lookups'
import { useLedger, useMaterials } from '../hooks/useInventory'
import { useMaterialStockSummaries, type MaterialStockSummary } from '../stockSummary'
import type { InventoryLedgerRow } from '@/types'

// Production-planning raw-material tracker. Reuses the EXISTING stock data layer
// (useMaterialStockSummaries + useLedger over inventory_ledger) — no new stock
// logic, so numbers can never diverge from Inventory / Materials & Stock.

const STATUS_TONE: Record<string, string> = { in: 'green', low: 'amber', out: 'red' }
const STATUS_LABEL: Record<string, string> = { in: 'In stock', low: 'Low', out: 'Out' }
const TYPE_TONE: Record<string, string> = { Receipt: 'green', Issue: 'amber', Adjustment: 'blue' }

function txnLabel(r: InventoryLedgerRow): string {
  if (r.txnType === 'Receipt') return 'Material Received'
  if (r.txnType === 'Issue') return r.referenceType === 'JOB_ORDER' ? 'Consumption' : 'Dispatch'
  return r.txnType
}

export function MaterialTrackerPage() {
  const summaries = useMaterialStockSummaries()
  const { data: materials = [] } = useMaterials()
  const materialName = useMaterialName()
  const companyName = useCompanyName()

  const [search, setSearch] = useState('')
  const [fMaterial, setFMaterial] = useState('')
  const [fType, setFType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const { data: ledger = [], isLoading: ledgerLoading } = useLedger(
    fMaterial ? { materialId: fMaterial } : {},
  )

  const k = useMemo(() => {
    const available = summaries.reduce((s, m) => s + m.current, 0)
    return {
      materials: summaries.length,
      available,
      low: summaries.filter((m) => m.status === 'low').length,
      out: summaries.filter((m) => m.status === 'out').length,
    }
  }, [summaries])

  // Raw-material stock table (production readiness).
  const stockRows = useMemo(() => {
    const s = search.toLowerCase()
    return summaries
      .filter((m) => (fMaterial ? m.materialId === fMaterial : true))
      .filter((m) =>
        s ? `${m.name} ${m.code ?? ''} ${m.type ?? ''}`.toLowerCase().includes(s) : true,
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [summaries, search, fMaterial])

  // Movement rows (newest first), filtered.
  const moveRows = useMemo(() => {
    const s = search.toLowerCase()
    return ledger
      .filter((r) => (fMaterial ? r.materialId === fMaterial : true))
      .filter((r) => (fType ? r.txnType === fType : true))
      .filter((r) => inRange(r.date, from, to))
      .filter((r) =>
        s
          ? `${materialName(r.materialId)} ${r.docNo} ${r.note ?? ''}`.toLowerCase().includes(s)
          : true,
      )
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }, [ledger, search, fMaterial, fType, from, to, materialName])

  const pg = usePagination(moveRows)

  const stockCols: DataTableColumn<MaterialStockSummary>[] = [
    { key: 'name', header: 'Material', cellClassName: 'font-medium', render: (m) => m.name },
    { key: 'grade', header: 'Grade', render: (m) => m.type || '—' },
    { key: 'unit', header: 'Unit', render: (m) => m.unit },
    {
      key: 'avail',
      header: 'Available',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums font-semibold',
      render: (m) => `${qty(m.current)} ${m.unit}`,
    },
    {
      key: 'recv',
      header: 'Received',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums text-emerald-600',
      render: (m) => qty(m.received),
    },
    {
      key: 'cons',
      header: 'Issued / Consumed',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums text-red-600',
      render: (m) => qty(m.dispatched),
    },
    {
      key: 'status',
      header: 'Status',
      render: (m) => <Badge tone={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge>,
    },
  ]

  const moveCols: DataTableColumn<InventoryLedgerRow>[] = [
    {
      key: 'date',
      header: 'Date',
      cellClassName: 'whitespace-nowrap text-slate-600',
      render: (r) => fmtDate(r.date),
    },
    {
      key: 'doc',
      header: 'Txn No.',
      cellClassName: 'font-mono text-xs',
      render: (r) => r.docNo || '—',
    },
    {
      key: 'mat',
      header: 'Material',
      cellClassName: 'font-medium',
      render: (r) => materialName(r.materialId),
    },
    {
      key: 'type',
      header: 'Type',
      render: (r) => <Badge tone={TYPE_TONE[r.txnType] ?? 'slate'}>{txnLabel(r)}</Badge>,
    },
    {
      key: 'qty',
      header: 'Quantity',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      render: (r) => {
        const amount = r.qtyIn || r.qtyOut || 0
        if (!amount) return ''
        const isIn = (r.qtyIn || 0) > 0
        return (
          <span className={isIn ? 'text-emerald-600' : 'text-red-600'}>
            {isIn ? '+' : '-'}
            {qty(amount)} {r.unit}
          </span>
        )
      },
    },
    {
      key: 'owner',
      header: 'Owner',
      render: (r) => (r.ownership === 'Shop' ? 'Own / Shop' : companyName(r.companyId ?? '')),
    },
    {
      key: 'ref',
      header: 'Reference',
      cellClassName: 'text-xs text-slate-500',
      render: (r) =>
        r.referenceType?.replace(/_/g, ' ') ?? (r.txnType === 'Receipt' ? 'MATERIAL RECEIPT' : '—'),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Raw Material Tracker"
        subtitle="Raw-material stock and movements for production planning — receipts in, consumption out, live balances."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          icon={<Boxes size={18} />}
          label="Raw Materials"
          value={k.materials}
          tone="blue"
        />
        <StatTile
          icon={<TrendingDown size={18} />}
          label="Available Stock"
          value={qty(k.available)}
          tone="cyan"
        />
        <StatTile icon={<Factory size={18} />} label="Low Stock" value={k.low} tone="amber" />
        <StatTile icon={<PackageX size={18} />} label="Out of Stock" value={k.out} tone="red" />
      </div>

      {/* Filters shared by both sections */}
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <label className="label">Search</label>
            <input
              className="input"
              placeholder="Material, grade, doc no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Material</label>
            <select
              className="input min-w-[12rem]"
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
            <label className="label">Movement type</label>
            <select
              className="input min-w-[9rem]"
              value={fType}
              onChange={(e) => setFType(e.target.value)}
            >
              <option value="">All types</option>
              <option value="Receipt">Received</option>
              <option value="Issue">Issued / Consumed</option>
              <option value="Adjustment">Adjustment</option>
            </select>
          </div>
          <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
        </div>
      </Card>

      {/* Raw material stock (production readiness) */}
      <Card className="mb-4">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
          Raw Material Stock
        </div>
        <DataTable
          columns={stockCols}
          rows={stockRows}
          rowKey={(m) => m.materialId}
          minWidthClassName="min-w-[48rem]"
          empty={{
            icon: <Boxes size={40} />,
            title: 'No materials',
            description: 'Add materials in Materials & Stock to track them here.',
          }}
        />
      </Card>

      {/* Material movements */}
      <Card>
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
          Material Movements
        </div>
        <DataTable
          columns={moveCols}
          rows={pg.pageItems}
          rowKey={(r) => r.id}
          loading={ledgerLoading}
          minWidthClassName="min-w-[56rem]"
          empty={{
            icon: <History size={40} />,
            title: 'No movements',
            description: 'Receipts and consumption will appear here as materials move.',
          }}
        />
        <Pagination pg={pg} />
      </Card>
    </div>
  )
}
