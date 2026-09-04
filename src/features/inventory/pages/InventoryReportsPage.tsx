import { useMemo, useState } from 'react'
import { BarChart3, Download } from 'lucide-react'
import { clsx } from 'clsx'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Card } from '@/components/ui/primitives'
import { currency, fmtDate, qty } from '@/lib/format'
import { downloadXlsx } from '@/lib/xlsx'
import { useMaterialName } from '@/features/shared/lookups'
import { useAdjustments, useLedger } from '../hooks/useInventory'
import { useStockTransfers } from '../hooks/useInventory'
import { useMaterialStockSummaries } from '../stockSummary'

const REPORTS = [
  { key: 'stock', label: 'Current Stock' },
  { key: 'valuation', label: 'Stock Valuation' },
  { key: 'low', label: 'Low Stock' },
  { key: 'out', label: 'Out of Stock' },
  { key: 'consumption', label: 'Consumption' },
  { key: 'movements', label: 'Movements' },
  { key: 'adjustments', label: 'Adjustments' },
  { key: 'transfers', label: 'Transfers' },
] as const

type Cell = string | number
interface Row {
  cells: Cell[]
}

export function InventoryReportsPage() {
  const summaries = useMaterialStockSummaries()
  const { data: ledger = [] } = useLedger()
  const { data: adjustments = [] } = useAdjustments()
  const transfers = useStockTransfers().list.data ?? []
  const materialName = useMaterialName()
  const [report, setReport] = useState<string>('stock')

  const { headers, rows, currencyCols } = useMemo<{
    headers: string[]
    rows: Row[]
    currencyCols: number[]
  }>(() => {
    switch (report) {
      case 'valuation':
        return {
          headers: ['Code', 'Material', 'Current', 'Unit', 'Rate', 'Value'],
          currencyCols: [4, 5],
          rows: summaries
            .filter((s) => s.current > 0)
            .sort((a, b) => b.value - a.value)
            .map((s) => ({
              cells: [
                s.code ?? '',
                s.name,
                s.current,
                s.unit,
                s.material?.defaultRate ?? 0,
                s.value,
              ],
            })),
        }
      case 'low':
      case 'out':
        return {
          headers: ['Code', 'Material', 'Current', 'Reorder level', 'Unit', 'Status'],
          currencyCols: [],
          rows: summaries
            .filter((s) => (report === 'out' ? s.status === 'out' : s.status === 'low'))
            .map((s) => ({
              cells: [
                s.code ?? '',
                s.name,
                s.current,
                s.material?.reorderLevel ?? 0,
                s.unit,
                report === 'out' ? 'Out of Stock' : 'Low Stock',
              ],
            })),
        }
      case 'consumption':
        return {
          headers: ['Code', 'Material', 'Received', 'Issued/Dispatched', 'Current', 'Unit'],
          currencyCols: [],
          rows: summaries
            .filter((s) => s.dispatched > 0)
            .sort((a, b) => b.dispatched - a.dispatched)
            .map((s) => ({
              cells: [s.code ?? '', s.name, s.received, s.dispatched, s.current, s.unit],
            })),
        }
      case 'movements':
        return {
          headers: ['Date', 'Txn No', 'Material', 'Type', 'In', 'Out', 'Unit'],
          currencyCols: [],
          rows: ledger.map((r) => ({
            cells: [
              fmtDate(r.date),
              r.docNo,
              materialName(r.materialId),
              r.txnType,
              r.qtyIn || '',
              r.qtyOut || '',
              r.unit,
            ],
          })),
        }
      case 'adjustments':
        return {
          headers: ['Date', 'Adj No', 'Material', 'Quantity', 'Unit', 'Reason'],
          currencyCols: [],
          rows: [...adjustments]
            .sort((a, b) => (a.date < b.date ? 1 : -1))
            .map((a) => ({
              cells: [
                fmtDate(a.date),
                a.adjNo,
                materialName(a.materialId),
                a.quantity,
                a.unit,
                a.reason,
              ],
            })),
        }
      case 'transfers':
        return {
          headers: ['Transfer No', 'Date', 'Material', 'From → To', 'Qty', 'Status'],
          currencyCols: [],
          rows: transfers.map((t) => ({
            cells: [
              t.transferNo ?? '',
              fmtDate(t.transferDate),
              materialName(t.materialId),
              `${t.fromLocation} → ${t.toLocation}`,
              t.quantity,
              t.status ?? '',
            ],
          })),
        }
      default:
        return {
          headers: ['Code', 'Material', 'Received', 'Issued', 'Current', 'Unit', 'Status'],
          currencyCols: [],
          rows: summaries.map((s) => ({
            cells: [
              s.code ?? '',
              s.name,
              s.received,
              s.dispatched,
              s.current,
              s.unit,
              s.status === 'out' ? 'Out of Stock' : s.status === 'low' ? 'Low Stock' : 'In Stock',
            ],
          })),
        }
    }
  }, [report, summaries, ledger, adjustments, transfers, materialName])

  const columns: DataTableColumn<Row>[] = headers.map((h, i) => ({
    key: `${h}-${i}`,
    header: h,
    headerClassName: i >= 2 && typeof rows[0]?.cells[i] === 'number' ? 'text-right' : undefined,
    cellClassName: clsx(i === 1 && 'font-medium', i === 0 && 'font-mono text-xs'),
    render: (row) => {
      const v = row.cells[i]
      if (currencyCols.includes(i) && typeof v === 'number') return currency(v)
      if (typeof v === 'number') return qty(v)
      return v
    },
  }))

  function exportReport() {
    downloadXlsx(
      `inventory-${report}`,
      rows,
      headers.map((h, i) => ({ header: h, value: (r: Row) => r.cells[i], width: 18 })),
      REPORTS.find((r) => r.key === report)?.label ?? 'Report',
    )
  }

  return (
    <div>
      <PageHeader
        title="Inventory Reports"
        subtitle="Stock, valuation, consumption and movement reports"
        actions={
          <button className="btn-ghost btn-sm" onClick={exportReport}>
            <Download size={15} /> Export Excel
          </button>
        }
      />
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap gap-1.5">
          {REPORTS.map((r) => (
            <button
              key={r.key}
              onClick={() => setReport(r.key)}
              className={clsx(
                'rounded-full px-3 py-1 text-xs font-medium transition',
                report === r.key
                  ? 'bg-brand-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </Card>
      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.cells.join('|')}
          minWidthClassName="min-w-[48rem]"
          empty={{ icon: <BarChart3 size={40} />, title: 'No data for this report' }}
        />
      </Card>
    </div>
  )
}
