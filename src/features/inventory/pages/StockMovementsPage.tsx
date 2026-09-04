import { useMemo, useState } from 'react'
import { Download, History, Search } from 'lucide-react'
import { clsx } from 'clsx'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { Badge, Card } from '@/components/ui/primitives'
import { DateRangeFilter } from '@/components/common/Filters'
import { useToast } from '@/components/ui/Toast'
import { fmtDate, inRange, qty } from '@/lib/format'
import { downloadXlsx } from '@/lib/xlsx'
import { useCompanyName, useMaterialName } from '@/features/shared/lookups'
import { useLedger, useMaterials } from '../hooks/useInventory'
import type { InventoryLedgerRow } from '@/types'

const TYPE_TONE: Record<string, string> = { Receipt: 'green', Issue: 'amber', Adjustment: 'blue' }

// Friendly transaction label: an Issue linked to a challan/invoice is a Dispatch;
// linked to a job it is Consumption. Derived from the ledger's reference_type.
function txnLabel(r: InventoryLedgerRow): string {
  if (r.txnType === 'Issue') {
    if (r.referenceType === 'DELIVERY_CHALLAN' || r.referenceType === 'INVOICE') return 'Dispatch'
    if (r.referenceType === 'JOB_ORDER') return 'Consumption'
  }
  return r.txnType
}

export function StockMovementsPage() {
  const { data: ledger = [], isLoading } = useLedger()
  const { data: materials = [] } = useMaterials()
  const materialName = useMaterialName()
  const companyName = useCompanyName()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [fMaterial, setFMaterial] = useState('')
  const [fType, setFType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const rows = useMemo(() => {
    const s = search.toLowerCase()
    return ledger.filter((r) => {
      if (fMaterial && r.materialId !== fMaterial) return false
      if (fType && r.txnType !== fType) return false
      if (!inRange(r.date, from, to)) return false
      if (s) {
        const hay = `${materialName(r.materialId)} ${r.docNo} ${r.note ?? ''}`.toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [ledger, search, fMaterial, fType, from, to, materialName])

  // Running balance is only meaningful for a single material (oldest → newest).
  const balanceById = useMemo(() => {
    if (!fMaterial) return null
    const asc = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    const m = new Map<string, number>()
    let bal = 0
    for (const r of asc) {
      bal += (r.qtyIn || 0) - (r.qtyOut || 0)
      m.set(r.id, bal)
    }
    return m
  }, [rows, fMaterial])

  const pg = usePagination(rows)

  const columns: DataTableColumn<InventoryLedgerRow>[] = [
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
      key: 'in',
      header: 'In',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums text-emerald-600',
      render: (r) => (r.qtyIn ? qty(r.qtyIn) : ''),
    },
    {
      key: 'out',
      header: 'Out',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums text-red-600',
      render: (r) => (r.qtyOut ? qty(r.qtyOut) : ''),
    },
    {
      key: 'bal',
      header: 'Balance',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums font-semibold',
      render: (r) => (balanceById ? qty(balanceById.get(r.id) ?? 0) : '—'),
    },
    { key: 'unit', header: 'Unit', render: (r) => r.unit },
    {
      key: 'owner',
      header: 'Owner',
      render: (r) => (r.ownership === 'Shop' ? 'Own / Shop' : companyName(r.companyId ?? '')),
    },
    {
      key: 'ref',
      header: 'Reference',
      cellClassName: 'text-xs text-slate-500',
      render: (r) => r.referenceType?.replace(/_/g, ' ') ?? '—',
    },
  ]

  function exportRows() {
    if (rows.length === 0) return toast.info('Nothing to export')
    downloadXlsx(
      'stock-movements',
      rows,
      [
        { header: 'Date', value: (r) => fmtDate(r.date), width: 14 },
        { header: 'Txn No', value: (r) => r.docNo, width: 18 },
        { header: 'Material', value: (r) => materialName(r.materialId), width: 26 },
        { header: 'Type', value: (r) => txnLabel(r), width: 14 },
        { header: 'Qty In', value: (r) => r.qtyIn || '', width: 12 },
        { header: 'Qty Out', value: (r) => r.qtyOut || '', width: 12 },
        { header: 'Unit', value: (r) => r.unit, width: 10 },
        {
          header: 'Owner',
          value: (r) => (r.ownership === 'Shop' ? 'Own / Shop' : companyName(r.companyId ?? '')),
          width: 20,
        },
        { header: 'Reference', value: (r) => r.referenceType ?? '', width: 18 },
        { header: 'Note', value: (r) => r.note ?? '', width: 28 },
      ],
      'Stock Movements',
    )
  }

  return (
    <div>
      <PageHeader
        title="Stock Movements"
        subtitle="Every inventory transaction — receipts, issues, dispatches, consumption and adjustments"
        actions={
          <button className="btn-ghost btn-sm" onClick={exportRows}>
            <Download size={15} /> Export Excel
          </button>
        }
      />

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <label className="label">Search</label>
            <Search
              size={16}
              className="absolute left-3 top-[2.15rem] -translate-y-1/2 text-slate-500"
            />
            <input
              className="input pl-9"
              placeholder="Material, doc no, note…"
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
            <label className="label">Type</label>
            <select
              className="input min-w-[9rem]"
              value={fType}
              onChange={(e) => setFType(e.target.value)}
            >
              <option value="">All types</option>
              <option value="Receipt">Receipt</option>
              <option value="Issue">Issue / Dispatch</option>
              <option value="Adjustment">Adjustment</option>
            </select>
          </div>
          <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
        </div>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          rows={pg.pageItems}
          rowKey={(r) => r.id}
          loading={isLoading}
          minWidthClassName="min-w-[64rem]"
          empty={{
            icon: <History size={40} />,
            title: 'No movements',
            description: 'Adjust the filters or record stock in Materials & Stock.',
          }}
        />
        <Pagination pg={pg} />
      </Card>

      {!fMaterial && (
        <p className={clsx('mt-2 text-2xs text-slate-400')}>
          Tip: filter by a single material to see a running balance.
        </p>
      )}
    </div>
  )
}
