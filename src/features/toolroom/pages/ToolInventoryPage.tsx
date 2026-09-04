import { useMemo, useState } from 'react'
import { Boxes, Search } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { Badge, Card } from '@/components/ui/primitives'
import { clsx } from 'clsx'
import { useToolCategories, useToolInventory } from '../hooks/useToolroom'
import { ToolActionsMenu } from '../components/ToolActionsMenu'
import { availabilityLabel } from '../toolroomUi'
import type { ToolInventoryRow } from '../types'

type FilterKey =
  | 'all'
  | 'available'
  | 'low'
  | 'out'
  | 'issued'
  | 'reserved'
  | 'maintenance'
  | 'calibration'
  | 'damaged'

const FILTERS: Array<{ key: FilterKey; label: string; test: (r: ToolInventoryRow) => boolean }> = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'available', label: 'Available', test: (r) => r.availableQty > 0 },
  { key: 'low', label: 'Low stock', test: (r) => !!r.isLowStock },
  { key: 'out', label: 'Out of stock', test: (r) => r.availableQty <= 0 },
  { key: 'issued', label: 'Issued', test: (r) => r.issuedQty > 0 },
  { key: 'reserved', label: 'Reserved', test: (r) => r.reservedQty > 0 },
  { key: 'maintenance', label: 'Maintenance', test: (r) => r.maintenanceQty > 0 },
  { key: 'calibration', label: 'Calibration', test: (r) => r.calibrationQty > 0 },
  { key: 'damaged', label: 'Damaged', test: (r) => r.damagedQty > 0 },
]

export function ToolInventoryPage() {
  const inv = useToolInventory()
  const rows = inv.data ?? []
  const categories = useToolCategories().list.data ?? []
  const catName = (id?: string) => categories.find((c) => c.id === id)?.name ?? '—'
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const test = FILTERS.find((f) => f.key === filter)!.test
    return rows.filter(
      (r) =>
        test(r) &&
        (!s ||
          r.name.toLowerCase().includes(s) ||
          (r.code ?? '').toLowerCase().includes(s) ||
          (r.partNumber ?? '').toLowerCase().includes(s) ||
          (r.serialNumber ?? '').toLowerCase().includes(s)),
    )
  }, [rows, q, filter])
  const pg = usePagination(filtered)

  const numCol = (
    label: string,
    get: (r: ToolInventoryRow) => number,
    tone?: string,
  ): DataTableColumn<ToolInventoryRow> => ({
    key: label,
    header: label,
    headerClassName: 'text-right',
    cellClassName: clsx('text-right tabular-nums', tone),
    render: (r) => get(r) || 0,
  })

  const columns: DataTableColumn<ToolInventoryRow>[] = [
    {
      key: 'code',
      header: 'Code',
      cellClassName: 'font-mono text-xs',
      render: (r) => r.code || '—',
    },
    { key: 'name', header: 'Tool', cellClassName: 'font-semibold', render: (r) => r.name },
    { key: 'category', header: 'Category', render: (r) => catName(r.categoryId) },
    {
      key: 'location',
      header: 'Location',
      render: (r) => r.toolRoomLocation || r.storeLocation || r.binLocation || '—',
    },
    numCol('Avail', (r) => r.availableQty, 'font-bold text-green-700'),
    numCol('Issued', (r) => r.issuedQty),
    numCol('Resvd', (r) => r.reservedQty),
    numCol('Maint', (r) => r.maintenanceQty),
    numCol('Calib', (r) => r.calibrationQty),
    numCol('Dmg', (r) => r.damagedQty),
    numCol('Reorder', (r) => r.reorderLevel),
    {
      key: 'status',
      header: 'Status',
      render: (r) => {
        const a = availabilityLabel(r)
        return <Badge tone={a.tone}>{a.label}</Badge>
      },
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      render: (r) => (
        <ToolActionsMenu inventory={rows} toolId={r.toolId} compact triggerLabel="Actions" />
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Tool Inventory"
        subtitle="Real-time availability — every quantity is derived from the transaction ledger"
        actions={
          <ToolActionsMenu
            inventory={rows}
            only={['receive', 'adjust']}
            triggerLabel="Receive / Adjust"
          />
        }
      />

      <Card className="mb-3 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-xs flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9"
              placeholder="Search code, name, part, serial…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={clsx(
                  'rounded-full px-3 py-1 text-xs font-medium transition',
                  filter === f.key
                    ? 'bg-brand-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          rows={pg.pageItems}
          rowKey={(r) => r.toolId}
          loading={inv.isLoading}
          minWidthClassName="min-w-[64rem]"
          empty={{
            icon: <Boxes size={40} />,
            title: 'No tools match',
            description: 'Adjust the search or filter, or add tools in the Tool Master.',
          }}
        />
        <Pagination pg={pg} />
      </Card>
    </div>
  )
}
