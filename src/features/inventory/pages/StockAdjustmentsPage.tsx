import { useMemo, useState } from 'react'
import { Download, Search, Sliders } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { Badge, Card } from '@/components/ui/primitives'
import { DateRangeFilter } from '@/components/common/Filters'
import { useToast } from '@/components/ui/Toast'
import { fmtDate, inRange, qty } from '@/lib/format'
import { downloadXlsx } from '@/lib/xlsx'
import { usePermissions } from '@/features/hrm/permissions'
import { useCompanyName, useMaterialName } from '@/features/shared/lookups'
import { AdjustmentForm } from '@/features/materials/MaterialForms'
import { useAdjustments } from '../hooks/useInventory'
import type { StockAdjustment } from '@/types'

export function StockAdjustmentsPage() {
  const { data: adjustments = [], isLoading } = useAdjustments()
  const materialName = useMaterialName()
  const companyName = useCompanyName()
  const canAdjust = usePermissions().can('INVENTORY_ADJUST')
  const toast = useToast()

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const rows = useMemo(() => {
    const s = search.toLowerCase()
    return [...adjustments]
      .filter((a) => {
        if (!inRange(a.date, from, to)) return false
        if (s) {
          const hay = `${materialName(a.materialId)} ${a.adjNo} ${a.reason ?? ''}`.toLowerCase()
          if (!hay.includes(s)) return false
        }
        return true
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }, [adjustments, search, from, to, materialName])
  const pg = usePagination(rows)

  const columns: DataTableColumn<StockAdjustment>[] = [
    {
      key: 'date',
      header: 'Date',
      cellClassName: 'whitespace-nowrap text-slate-600',
      render: (a) => fmtDate(a.date),
    },
    { key: 'no', header: 'Adj No.', cellClassName: 'font-mono text-xs', render: (a) => a.adjNo },
    {
      key: 'mat',
      header: 'Material',
      cellClassName: 'font-medium',
      render: (a) => materialName(a.materialId),
    },
    {
      key: 'owner',
      header: 'Owner',
      render: (a) => (a.companyId ? companyName(a.companyId) : 'Own / Shop'),
    },
    {
      key: 'dir',
      header: 'Direction',
      render: (a) => (
        <Badge tone={a.quantity >= 0 ? 'green' : 'red'}>
          {a.quantity >= 0 ? 'Increase' : 'Decrease'}
        </Badge>
      ),
    },
    {
      key: 'qty',
      header: 'Qty',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums font-semibold',
      render: (a) => (
        <span className={a.quantity >= 0 ? 'text-emerald-600' : 'text-red-600'}>
          {a.quantity >= 0 ? '+' : ''}
          {qty(a.quantity)} {a.unit}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      cellClassName: 'text-slate-600',
      render: (a) => a.reason || '—',
    },
  ]

  function exportRows() {
    if (rows.length === 0) return toast.info('Nothing to export')
    downloadXlsx(
      'stock-adjustments',
      rows,
      [
        { header: 'Date', value: (a) => fmtDate(a.date), width: 14 },
        { header: 'Adj No', value: (a) => a.adjNo, width: 16 },
        { header: 'Material', value: (a) => materialName(a.materialId), width: 26 },
        {
          header: 'Owner',
          value: (a) => (a.companyId ? companyName(a.companyId) : 'Own / Shop'),
          width: 20,
        },
        { header: 'Quantity', value: (a) => a.quantity, width: 12 },
        { header: 'Unit', value: (a) => a.unit, width: 10 },
        { header: 'Reason', value: (a) => a.reason, width: 30 },
      ],
      'Stock Adjustments',
    )
  }

  return (
    <div>
      <PageHeader
        title="Stock Adjustments"
        subtitle="Increase, decrease, damage, loss and physical-count corrections — each posts a stock transaction"
        actions={
          <>
            <button className="btn-ghost btn-sm" onClick={exportRows}>
              <Download size={15} /> Export Excel
            </button>
            {canAdjust && (
              <button className="btn-primary btn-sm" onClick={() => setOpen(true)}>
                <Sliders size={15} /> New Adjustment
              </button>
            )}
          </>
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
              placeholder="Material, adj no, reason…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
        </div>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          rows={pg.pageItems}
          rowKey={(a) => a.id}
          loading={isLoading}
          minWidthClassName="min-w-[52rem]"
          empty={{
            icon: <Sliders size={40} />,
            title: 'No adjustments',
            description: 'Adjustments you post appear here and in Stock Movements.',
          }}
        />
        <Pagination pg={pg} />
      </Card>

      {open && <AdjustmentForm onClose={() => setOpen(false)} />}
    </div>
  )
}
