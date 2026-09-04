import { useMemo, useState } from 'react'
import { BarChart3, Download } from 'lucide-react'
import { clsx } from 'clsx'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Card } from '@/components/ui/primitives'
import { currency } from '@/lib/format'
import { usePermissions } from '@/features/hrm/permissions'
import { useTools, useToolInventory, useToolTransactions } from '../hooks/useToolroom'
import { downloadCsv } from '../exportCsv'
import type { ToolInventoryRow } from '../types'

type Report = { key: string; label: string }
const REPORTS: Report[] = [
  { key: 'stock', label: 'Tool Stock' },
  { key: 'low', label: 'Low Stock' },
  { key: 'out', label: 'Out of Stock' },
  { key: 'machine', label: 'Machine-wise Usage' },
  { key: 'consumption', label: 'Consumption Cost' },
]

interface Row {
  cells: (string | number)[]
}

export function ToolReportsPage() {
  const inventory = useToolInventory().data ?? []
  const txns = useToolTransactions().data ?? []
  const tools = useTools().list.data ?? []
  const canExport = usePermissions().can('TOOLROOM_REPORT')
  const [report, setReport] = useState('stock')
  const unitCostOf = (toolId: string) => tools.find((t) => t.id === toolId)?.unitCost ?? 0

  const { headers, rows } = useMemo(() => {
    switch (report) {
      case 'low':
      case 'out': {
        const src = inventory.filter((r) => (report === 'out' ? r.availableQty <= 0 : r.isLowStock))
        return {
          headers: ['Code', 'Tool', 'Available', 'Reorder level', 'Reorder qty', 'Suggested'],
          rows: src.map<Row>((r) => ({
            cells: [
              r.code ?? '',
              r.name,
              r.availableQty,
              r.reorderLevel,
              0,
              Math.max(0, r.reorderLevel - r.availableQty),
            ],
          })),
        }
      }
      case 'machine': {
        const agg = new Map<string, number>()
        for (const t of txns) {
          if (
            (t.txnType === 'issue' || t.txnType === 'issue_reserved' || t.txnType === 'consume') &&
            t.machine
          ) {
            agg.set(t.machine, (agg.get(t.machine) ?? 0) + t.qty)
          }
        }
        return {
          headers: ['Machine', 'Issued qty'],
          rows: [...agg.entries()]
            .sort((a, b) => b[1] - a[1])
            .map<Row>(([m, q]) => ({ cells: [m, q] })),
        }
      }
      case 'consumption': {
        const agg = new Map<string, number>()
        for (const t of txns) {
          if (t.txnType === 'consume') agg.set(t.toolId, (agg.get(t.toolId) ?? 0) + t.qty)
        }
        return {
          headers: ['Tool', 'Consumed qty', 'Unit cost', 'Total cost'],
          rows: [...agg.entries()].map<Row>(([toolId, q]) => {
            const name = tools.find((t) => t.id === toolId)?.name ?? toolId
            const uc = unitCostOf(toolId)
            return { cells: [name, q, uc, Math.round(q * uc * 100) / 100] }
          }),
        }
      }
      default: {
        const cols = (r: ToolInventoryRow) => [
          r.code ?? '',
          r.name,
          r.availableQty,
          r.issuedQty,
          r.reservedQty,
          r.maintenanceQty,
          r.calibrationQty,
          r.damagedQty,
          r.onHandQty,
        ]
        return {
          headers: [
            'Code',
            'Tool',
            'Available',
            'Issued',
            'Reserved',
            'Maintenance',
            'Calibration',
            'Damaged',
            'On hand',
          ],
          rows: inventory.map<Row>((r) => ({ cells: cols(r) })),
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, inventory, txns, tools])

  const isCurrency = report === 'consumption'
  const columns: DataTableColumn<Row>[] = headers.map((h, i) => ({
    key: h,
    header: h,
    headerClassName: i === 0 || i === 1 ? undefined : 'text-right',
    cellClassName:
      i === 0 || i === 1
        ? i === 1
          ? 'font-medium'
          : 'font-mono text-xs'
        : 'text-right tabular-nums',
    render: (row) => {
      const v = row.cells[i]
      if (isCurrency && (i === 2 || i === 3) && typeof v === 'number') return currency(v)
      return v
    },
  }))

  function exportCsv() {
    downloadCsv(
      `tool-room-${report}`,
      headers,
      rows.map((r) => r.cells),
    )
  }

  return (
    <div>
      <PageHeader
        title="Tool Room Reports"
        subtitle="Inventory, usage and cost reports"
        actions={
          canExport ? (
            <button className="btn-secondary btn-sm" onClick={exportCsv}>
              <Download size={15} /> Export CSV
            </button>
          ) : undefined
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
