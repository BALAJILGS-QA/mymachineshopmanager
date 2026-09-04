import { useState } from 'react'
import { clsx } from 'clsx'
import { PageHeader } from '@/components/common/PageHeader'
import { Card } from '@/components/ui/primitives'
import { ToolTxnTable } from '../components/ToolTxnTable'
import type { ToolTxnType } from '../types'

const GROUPS: Array<{ key: string; label: string; types?: ToolTxnType[] }> = [
  { key: 'all', label: 'All' },
  { key: 'receipt', label: 'Receipts', types: ['receipt'] },
  { key: 'issue', label: 'Issues', types: ['issue', 'issue_reserved', 'consume'] },
  {
    key: 'return',
    label: 'Returns',
    types: ['return_available', 'return_damaged', 'return_maintenance', 'return_calibration'],
  },
  { key: 'reserve', label: 'Reservations', types: ['reserve', 'release'] },
  { key: 'transfer', label: 'Transfers', types: ['transfer'] },
  {
    key: 'maintenance',
    label: 'Maintenance',
    types: ['maintenance_send', 'maintenance_pass', 'maintenance_scrap'],
  },
  {
    key: 'calibration',
    label: 'Calibration',
    types: ['calibrate_send', 'calibrate_pass', 'calibrate_scrap'],
  },
  { key: 'scrap', label: 'Scrap', types: ['scrap'] },
  { key: 'adjust', label: 'Adjustments', types: ['adjust'] },
]

export function ToolLedgerPage() {
  const [group, setGroup] = useState('all')
  const active = GROUPS.find((g) => g.key === group)!

  return (
    <div>
      <PageHeader
        title="Tool Movement History"
        subtitle="Every stock movement, in one immutable ledger. Inventory balances are derived from these rows."
      />
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap gap-1.5">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              onClick={() => setGroup(g.key)}
              className={clsx(
                'rounded-full px-3 py-1 text-xs font-medium transition',
                group === g.key
                  ? 'bg-brand-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      </Card>
      <Card>
        <ToolTxnTable types={active.types} showBalance emptyTitle="No transactions" />
      </Card>
    </div>
  )
}
