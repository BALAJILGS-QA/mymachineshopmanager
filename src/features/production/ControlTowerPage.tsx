'use client'

import { useMemo, useState } from 'react'
import { Activity } from 'lucide-react'
import type { JobOrder, JobStatus } from '@/types'
import { useJobs, useJobEvents } from '@/features/jobs/hooks/useJobs'
import { useJobInspections } from '@/features/qc/hooks/useQc'
import { useFgForJob } from '@/features/finishedgoods/hooks/useFinishedGoods'
import { useCompanyName, useMaterialName } from '@/features/shared/lookups'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { JobStatusBadge } from '@/components/common/status'
import { Card, Badge } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { SearchBox } from '@/components/common/Filters'
import { toUserMessage } from '@/lib/api/errors'
import { fmtDateTime, qty } from '@/lib/format'

const KPI_STATUSES: { label: string; statuses: JobStatus[] }[] = [
  { label: 'Pending', statuses: ['Pending'] },
  { label: 'In Production', statuses: ['In Progress'] },
  { label: 'Prod. Completed', statuses: ['Completed'] },
  { label: 'Under QC', statuses: ['Quality Control'] },
  { label: 'QC Approved', statuses: ['QC Approved'] },
  { label: 'Rework', statuses: ['Rework'] },
  { label: 'QC Rejected', statuses: ['QC Rejected'] },
  { label: 'Ready for Dispatch', statuses: ['Ready for Dispatch'] },
]

function produced(j: JobOrder): number {
  return j.completedQty ?? 0
}

export function ControlTowerPage() {
  const { data: jobs = [], isLoading, isError, error } = useJobs()
  const companyName = useCompanyName()
  const [search, setSearch] = useState('')
  const [trace, setTrace] = useState<JobOrder | null>(null)

  const rows = useMemo(() => {
    const s = search.toLowerCase()
    return jobs
      .filter((j) => !['Draft', 'Cancelled'].includes(j.status))
      .filter(
        (j) =>
          !s ||
          j.jobNo.toLowerCase().includes(s) ||
          j.partName.toLowerCase().includes(s) ||
          (j.partNumber ?? '').toLowerCase().includes(s) ||
          companyName(j.companyId).toLowerCase().includes(s),
      )
  }, [jobs, search, companyName])

  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const k of KPI_STATUSES)
      map[k.label] = jobs.filter((j) => k.statuses.includes(j.status)).length
    return map
  }, [jobs])

  const columns: DataTableColumn<JobOrder>[] = [
    {
      key: 'jobNo',
      header: 'Job Order',
      cellClassName: 'font-mono text-xs',
      render: (j) => j.jobNo,
    },
    { key: 'company', header: 'Company', render: (j) => companyName(j.companyId) },
    { key: 'item', header: 'Item', render: (j) => j.partName },
    { key: 'partNo', header: 'Part No', hideBelow: 'lg', render: (j) => j.partNumber ?? '—' },
    {
      key: 'ordered',
      header: 'Ord',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      render: (j) => qty(j.orderedQty),
    },
    {
      key: 'produced',
      header: 'Prod',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      hideBelow: 'md',
      render: (j) => qty(produced(j)),
    },
    {
      key: 'accepted',
      header: 'Acc',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      hideBelow: 'md',
      render: (j) => qty(j.acceptedQty ?? 0),
    },
    {
      key: 'rejected',
      header: 'Rej',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      hideBelow: 'lg',
      render: (j) => qty(j.rejectedQty ?? 0),
    },
    {
      key: 'rework',
      header: 'Rwk',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      hideBelow: 'lg',
      render: (j) => qty(j.reworkQty ?? 0),
    },
    { key: 'status', header: 'Status', render: (j) => <JobStatusBadge status={j.status} /> },
    {
      key: 'action',
      header: '',
      hideOnCard: true,
      render: (j) => (
        <button className="btn-ghost btn-sm" onClick={() => setTrace(j)}>
          Traceability
        </button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Production Control Tower"
        subtitle="Live view of every job across the production → dispatch lifecycle"
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {KPI_STATUSES.map((k) => (
          <Card key={k.label} className="p-3">
            <p className="text-2xs uppercase tracking-wide text-slate-400">{k.label}</p>
            <p className="text-xl font-bold text-slate-900">{counts[k.label] ?? 0}</p>
          </Card>
        ))}
      </div>

      <div className="mb-3">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search job, company, item, part no…"
        />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(j) => j.id}
        loading={isLoading}
        onRowClick={(j) => setTrace(j)}
        empty={{
          icon: <Activity className="h-6 w-6" />,
          title: isError ? 'Could not load jobs' : 'No active jobs',
          description: isError ? toUserMessage(error) : 'Active production jobs appear here.',
        }}
      />

      {trace && (
        <Modal
          open={!!trace}
          onClose={() => setTrace(null)}
          title={`Traceability · ${trace.jobNo}`}
          size="lg"
        >
          <Traceability job={trace} />
        </Modal>
      )}
    </div>
  )
}

function Traceability({ job }: { job: JobOrder }) {
  const { data: events = [], isLoading: le } = useJobEvents(job.id)
  const { data: inspections = [] } = useJobInspections(job.id)
  const { data: fg = [] } = useFgForJob(job.id)
  const materialName = useMaterialName()
  const companyName = useCompanyName()

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
        <Info k="Customer" v={companyName(job.companyId)} />
        <Info k="Item" v={job.partName} />
        <Info k="Part No" v={job.partNumber ?? '—'} />
        <Info k="Raw Material" v={job.materialId ? materialName(job.materialId) : '—'} />
        <Info k="Ordered" v={qty(job.orderedQty)} />
        <Info k="Accepted" v={qty(job.acceptedQty ?? 0)} />
      </div>

      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Lifecycle events
        </h4>
        {le && <p className="text-slate-500">Loading…</p>}
        {!le && events.length === 0 && <p className="text-slate-500">No events recorded.</p>}
        <ol className="relative border-l border-slate-200 pl-4">
          {events.map((e) => (
            <li key={e.id} className="mb-3">
              <span className="absolute -left-1 mt-1 h-2 w-2 rounded-full bg-brand-600" />
              <p className="font-medium text-slate-800">
                {e.fromStatus ? `${e.fromStatus} → ` : ''}
                {e.toStatus ?? e.type}
              </p>
              <p className="text-2xs text-slate-500">
                {fmtDateTime(e.at)}
                {e.operator ? ` · ${e.operator}` : ''}
                {e.completedQty != null ? ` · qty ${qty(e.completedQty)}` : ''}
              </p>
              {e.note && <p className="text-2xs italic text-slate-400">{e.note}</p>}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          QC inspections
        </h4>
        {inspections.length === 0 && <p className="text-slate-500">None.</p>}
        {inspections.map((i) => (
          <div key={i.id} className="mb-1 flex items-center justify-between">
            <span className="text-slate-700">
              {i.inspectionNo ?? i.id} · {fmtDateTime(i.inspectedAt)}
            </span>
            <Badge
              tone={
                i.decision === 'Approved' ? 'green' : i.decision === 'Rework' ? 'violet' : 'red'
              }
            >
              {i.decision} · acc {qty(i.acceptedQty)} / rej {qty(i.rejectedQty)} / rwk{' '}
              {qty(i.reworkQty)}
            </Badge>
          </div>
        ))}
      </section>

      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Finished goods movements
        </h4>
        {fg.length === 0 && <p className="text-slate-500">None.</p>}
        {fg.map((f) => (
          <div key={f.id} className="mb-1 flex items-center justify-between text-2xs">
            <span className="text-slate-700">
              {f.entryNo ?? f.id} · {f.txnType} · {fmtDateTime(f.createdAt)}
              {f.binNo ? ` · ${f.binNo}` : ''}
            </span>
            <span className="tabular-nums">
              {f.qtyIn > 0 ? `+${qty(f.qtyIn)}` : `-${qty(f.qtyOut)}`}
            </span>
          </div>
        ))}
      </section>
    </div>
  )
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-2xs uppercase tracking-wide text-slate-400">{k}</p>
      <p className="font-medium text-slate-800">{v}</p>
    </div>
  )
}
