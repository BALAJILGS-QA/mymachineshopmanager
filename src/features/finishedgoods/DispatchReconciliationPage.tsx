'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileWarning, PackageX, Scale } from 'lucide-react'
import type { JobOrder } from '@/types'
import { useJobs } from '@/features/jobs/hooks/useJobs'
import { useFgBalances } from './hooks/useFinishedGoods'
import { useChallans } from '@/features/deliveries/hooks/useDeliveries'
import { useCompanyName } from '@/features/shared/lookups'
import { PageHeader } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Badge } from '@/components/ui/primitives'
import { SearchBox } from '@/components/common/Filters'
import { AppLink } from '@/components/nav/app-link'
import {
  dispatchReconciliation,
  type DispatchReconRow,
  type DispatchReconStatus,
} from '@/data/computations'
import { toUserMessage } from '@/lib/api/errors'
import { qty } from '@/lib/format'

const STATUS_TONE: Record<DispatchReconStatus, string> = {
  Matched: 'green',
  'Over-dispatched': 'red',
  'Under-dispatched': 'amber',
  'No challan': 'amber',
  'Not from FG': 'red',
}

interface Row extends DispatchReconRow {
  job?: JobOrder
}

export function DispatchReconciliationPage() {
  const { data: jobs = [], isLoading: lj, isError, error } = useJobs()
  const { data: balances = [], isLoading: lb } = useFgBalances()
  const { data: challans = [], isLoading: lc } = useChallans()
  const companyName = useCompanyName()
  const [search, setSearch] = useState('')
  const [onlyIssues, setOnlyIssues] = useState(false)

  const jobById = useMemo(() => {
    const m = new Map<string, JobOrder>()
    for (const j of jobs) m.set(j.id, j)
    return m
  }, [jobs])

  const recon = useMemo<Row[]>(() => {
    return dispatchReconciliation(balances, challans).map((r) => ({
      ...r,
      job: jobById.get(r.jobId),
    }))
  }, [balances, challans, jobById])

  const kpis = useMemo(() => {
    const matched = recon.filter((r) => r.status === 'Matched').length
    const variance = recon.filter(
      (r) => r.status === 'Over-dispatched' || r.status === 'Under-dispatched',
    ).length
    const noChallan = recon.filter((r) => r.status === 'No challan').length
    const notFromFg = recon.filter((r) => r.status === 'Not from FG').length
    return { matched, variance, noChallan, notFromFg }
  }, [recon])

  const rows = useMemo(() => {
    const s = search.toLowerCase()
    return recon
      .filter((r) => !onlyIssues || r.status !== 'Matched')
      .filter((r) => {
        if (!s) return true
        const j = r.job
        return (
          (j?.jobNo ?? '').toLowerCase().includes(s) ||
          (j?.partName ?? '').toLowerCase().includes(s) ||
          (j ? companyName(j.companyId) : '').toLowerCase().includes(s)
        )
      })
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
  }, [recon, onlyIssues, search, companyName])

  const columns: DataTableColumn<Row>[] = [
    {
      key: 'jobNo',
      header: 'Order',
      cellClassName: 'font-mono text-xs',
      render: (r) =>
        r.job ? (
          <AppLink to={`/app/jobs/${r.job.id}`} className="text-brand-600 hover:underline">
            {r.job.jobNo}
          </AppLink>
        ) : (
          <span className="text-slate-400">{r.jobId}</span>
        ),
    },
    {
      key: 'company',
      header: 'Customer',
      render: (r) => (r.job ? companyName(r.job.companyId) : '—'),
    },
    { key: 'item', header: 'Item', hideBelow: 'md', render: (r) => r.job?.partName ?? '—' },
    {
      key: 'fg',
      header: 'FG Dispatched',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      render: (r) => qty(r.fgDispatched),
    },
    {
      key: 'challan',
      header: 'Challan Qty',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      render: (r) => qty(r.challanQty),
    },
    {
      key: 'variance',
      header: 'Variance',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums font-semibold',
      render: (r) => (
        <span
          className={
            r.variance === 0 ? 'text-slate-500' : r.variance > 0 ? 'text-red-600' : 'text-amber-600'
          }
        >
          {r.variance > 0 ? '+' : ''}
          {qty(r.variance)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>,
    },
  ]

  const loading = lj || lb || lc

  return (
    <div>
      <PageHeader
        title="Dispatch Reconciliation"
        subtitle="Finished-goods dispatches vs delivery challans, per production order"
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<CheckCircle2 size={18} />}
          tone="green"
          label="Matched"
          value={kpis.matched}
        />
        <StatTile
          icon={<Scale size={18} />}
          tone="red"
          label="Quantity variance"
          value={kpis.variance}
          hint="over / under dispatched"
        />
        <StatTile
          icon={<FileWarning size={18} />}
          tone="orange"
          label="No challan"
          value={kpis.noChallan}
          hint="FG shipped, undocumented"
        />
        <StatTile
          icon={<PackageX size={18} />}
          tone="purple"
          label="Not from FG"
          value={kpis.notFromFg}
          hint="challan without FG drawdown"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-[14rem] flex-1">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search order, item, customer…"
          />
        </div>
        <button
          className={onlyIssues ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
          onClick={() => setOnlyIssues((v) => !v)}
        >
          <AlertTriangle className="mr-1 h-4 w-4" />
          {onlyIssues ? 'Showing issues only' : 'Issues only'}
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.jobId}
        loading={loading}
        empty={{
          icon: <Scale className="h-6 w-6" />,
          title: isError ? 'Could not load reconciliation' : 'Nothing to reconcile',
          description: isError
            ? toUserMessage(error)
            : 'Orders with finished-goods dispatches or delivery challans appear here.',
        }}
      />
    </div>
  )
}
