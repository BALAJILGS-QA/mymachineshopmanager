import { useMemo } from 'react'
import { History } from 'lucide-react'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { Badge } from '@/components/ui/primitives'
import { fmtDateTime } from '@/lib/format'
import { useTools, useToolTransactions } from '../hooks/useToolroom'
import { txnLabel } from '../toolStock'
import type { ToolTransaction, ToolTxnType } from '../types'

const TYPE_TONE: Record<string, string> = {
  receipt: 'green',
  issue: 'amber',
  issue_reserved: 'amber',
  consume: 'amber',
  return_available: 'blue',
  return_damaged: 'red',
  return_maintenance: 'violet',
  return_calibration: 'blue',
  reserve: 'blue',
  release: 'slate',
  transfer: 'violet',
  maintenance_send: 'violet',
  maintenance_pass: 'green',
  maintenance_scrap: 'red',
  calibrate_send: 'blue',
  calibrate_pass: 'green',
  calibrate_scrap: 'red',
  scrap: 'red',
  adjust: 'slate',
}

// A ledger table filtered to a set of transaction types (or all). Resolves tool
// names, shows in/out quantities and context. Used by the Issue/Return/Transfer/
// Ledger pages so movement history is rendered identically everywhere.
export function ToolTxnTable({
  toolId,
  types,
  emptyTitle = 'No movements yet',
  showBalance = false,
}: {
  toolId?: string
  types?: ToolTxnType[]
  emptyTitle?: string
  showBalance?: boolean
}) {
  const txnQuery = useToolTransactions(toolId)
  const tools = useTools().list.data ?? []
  const toolName = useMemo(() => {
    const m = new Map(tools.map((t) => [t.id, t]))
    return (id: string) => {
      const t = m.get(id)
      return t ? `${t.code ? t.code + ' · ' : ''}${t.name}` : id
    }
  }, [tools])

  const rows = useMemo(() => {
    const all = txnQuery.data ?? []
    return types ? all.filter((t) => types.includes(t.txnType)) : all
  }, [txnQuery.data, types])
  const pg = usePagination(rows)

  const columns: DataTableColumn<ToolTransaction>[] = [
    {
      key: 'at',
      header: 'Date',
      cellClassName: 'whitespace-nowrap text-xs text-slate-500',
      render: (t) => fmtDateTime(t.at),
    },
    { key: 'no', header: 'Ref', cellClassName: 'font-mono text-xs', render: (t) => t.txnNo || '—' },
    {
      key: 'tool',
      header: 'Tool',
      cellClassName: 'font-medium',
      render: (t) => toolName(t.toolId),
    },
    {
      key: 'type',
      header: 'Type',
      render: (t) => <Badge tone={TYPE_TONE[t.txnType] ?? 'slate'}>{txnLabel(t.txnType)}</Badge>,
    },
    {
      key: 'in',
      header: 'In',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums text-green-700',
      render: (t) =>
        t.toBucket && t.toBucket !== 'consumed' && t.toBucket !== 'scrap' ? t.qty : '',
    },
    {
      key: 'out',
      header: 'Out',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums text-red-600',
      render: (t) => (t.fromBucket ? t.qty : ''),
    },
    {
      key: 'qty',
      header: 'Qty',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      render: (t) => `${t.qty} ${t.unit ?? ''}`,
    },
    {
      key: 'context',
      header: 'Context',
      cellClassName: 'text-xs text-slate-600',
      render: (t) =>
        [
          t.machine,
          t.employee,
          t.locationFrom && t.locationTo ? `${t.locationFrom}→${t.locationTo}` : t.locationTo,
          t.condition,
          t.purpose,
          t.note,
        ]
          .filter(Boolean)
          .join(' · ') || '—',
    },
  ]
  if (!showBalance) columns.splice(6, 1) // drop the plain Qty column unless requested

  return (
    <>
      <DataTable
        columns={columns}
        rows={pg.pageItems}
        rowKey={(t) => t.id}
        loading={txnQuery.isLoading}
        minWidthClassName="min-w-[60rem]"
        empty={{ icon: <History size={40} />, title: emptyTitle }}
      />
      <Pagination pg={pg} />
    </>
  )
}
