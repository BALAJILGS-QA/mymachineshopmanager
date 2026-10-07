'use client'

import { useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  ClipboardCheck,
  ExternalLink,
  PauseCircle,
  RotateCcw,
  XCircle,
} from 'lucide-react'
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
import { AppLink } from '@/components/nav/app-link'
import { toUserMessage } from '@/lib/api/errors'
import { fmtDate, fmtDateTime, qty } from '@/lib/format'

type KpiTone = 'slate' | 'blue' | 'purple' | 'amber' | 'green' | 'orange' | 'red'
const KPI_STATUSES: { label: string; status: JobStatus; tone: KpiTone }[] = [
  { label: 'Pending', status: 'Pending', tone: 'amber' },
  { label: 'In Production', status: 'In Progress', tone: 'blue' },
  { label: 'Prod. Completed', status: 'Completed', tone: 'purple' },
  { label: 'Under QC', status: 'Quality Control', tone: 'amber' },
  { label: 'QC Approved', status: 'QC Approved', tone: 'green' },
  { label: 'Rework', status: 'Rework', tone: 'purple' },
  { label: 'QC Rejected', status: 'QC Rejected', tone: 'red' },
  { label: 'Ready for Dispatch', status: 'Ready for Dispatch', tone: 'orange' },
]

function produced(j: JobOrder): number {
  return j.completedQty ?? 0
}

// --- Exceptions engine -----------------------------------------------------
// Actionable alerts derived purely from the job row (no extra queries), so the
// control tower surfaces what needs attention instead of only counting states.
type Severity = 'critical' | 'warning' | 'info'
interface ProdException {
  id: string
  severity: Severity
  category: string
  job: JobOrder
  detail: string
}

const TERMINAL: JobStatus[] = ['Delivered', 'Cancelled', 'Draft']

function computeExceptions(jobs: JobOrder[], today: string): ProdException[] {
  const out: ProdException[] = []
  for (const j of jobs) {
    if (TERMINAL.includes(j.status)) continue
    const due = j.dueDate ? j.dueDate.slice(0, 10) : undefined
    if (due && due < today) {
      out.push({
        id: `${j.id}-overdue`,
        severity: 'critical',
        category: 'Overdue',
        job: j,
        detail: `Due ${fmtDate(j.dueDate)} · still ${j.status}`,
      })
    } else if (due && due === today) {
      out.push({
        id: `${j.id}-due`,
        severity: 'warning',
        category: 'Due today',
        job: j,
        detail: `Due today · ${j.status}`,
      })
    }
    if (j.status === 'QC Rejected') {
      out.push({
        id: `${j.id}-rej`,
        severity: 'critical',
        category: 'QC Rejected',
        job: j,
        detail: `${qty(j.rejectedQty ?? 0)} rejected — needs disposition`,
      })
    } else if (j.status === 'Rework') {
      out.push({
        id: `${j.id}-rwk`,
        severity: 'warning',
        category: 'Rework',
        job: j,
        detail: `${qty(j.reworkQty ?? 0)} to re-process`,
      })
    } else if (j.status === 'On Hold') {
      out.push({
        id: `${j.id}-hold`,
        severity: 'warning',
        category: 'On Hold',
        job: j,
        detail: 'Production paused',
      })
    } else if (j.status === 'Quality Control') {
      out.push({
        id: `${j.id}-qc`,
        severity: 'info',
        category: 'Awaiting QC',
        job: j,
        detail: 'Inspection pending',
      })
    }
  }
  const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity])
}

const SEV_STYLE: Record<Severity, { row: string; icon: typeof AlertTriangle; chip: string }> = {
  critical: { row: 'border-red-200 bg-red-50', icon: AlertTriangle, chip: 'text-red-600' },
  warning: { row: 'border-amber-200 bg-amber-50', icon: PauseCircle, chip: 'text-amber-600' },
  info: { row: 'border-blue-200 bg-blue-50', icon: ClipboardCheck, chip: 'text-blue-600' },
}

const CATEGORY_ICON: Record<string, typeof AlertTriangle> = {
  Overdue: AlertTriangle,
  'Due today': CalendarClock,
  'QC Rejected': XCircle,
  Rework: RotateCcw,
  'On Hold': PauseCircle,
  'Awaiting QC': ClipboardCheck,
}

export function ControlTowerPage() {
  const { data: jobs = [], isLoading, isError, error } = useJobs()
  const companyName = useCompanyName()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<JobStatus | null>(null)
  const [trace, setTrace] = useState<JobOrder | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const exceptions = useMemo(() => computeExceptions(jobs, today), [jobs, today])

  const rows = useMemo(() => {
    const s = search.toLowerCase()
    return jobs
      .filter((j) => !['Draft', 'Cancelled'].includes(j.status))
      .filter((j) => !statusFilter || j.status === statusFilter)
      .filter(
        (j) =>
          !s ||
          j.jobNo.toLowerCase().includes(s) ||
          j.partName.toLowerCase().includes(s) ||
          (j.partNumber ?? '').toLowerCase().includes(s) ||
          companyName(j.companyId).toLowerCase().includes(s),
      )
  }, [jobs, search, statusFilter, companyName])

  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const k of KPI_STATUSES) map[k.status] = jobs.filter((j) => j.status === k.status).length
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
        <div className="flex justify-end gap-1">
          <button
            className="btn-ghost btn-sm"
            onClick={(e) => {
              e.stopPropagation()
              setTrace(j)
            }}
          >
            Traceability
          </button>
          <AppLink
            to={`/app/jobs/${j.id}`}
            className="btn-ghost btn-sm"
            title="Open production order"
          >
            <ExternalLink className="h-4 w-4" />
          </AppLink>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Production Control Tower"
        subtitle="Live view of every job across the production → dispatch lifecycle"
      />

      <ExceptionsPanel exceptions={exceptions} />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {KPI_STATUSES.map((k) => {
          const active = statusFilter === k.status
          return (
            <button
              key={k.label}
              type="button"
              onClick={() => setStatusFilter(active ? null : k.status)}
              className={`rounded-xl border p-3 text-left transition-all hover:-translate-y-px hover:shadow-sm ${
                active ? 'border-brand-400 bg-brand-50 ring-1 ring-brand-300' : 'border-slate-200'
              }`}
            >
              <p className="truncate text-2xs uppercase tracking-wide text-slate-400">{k.label}</p>
              <p className="text-xl font-bold text-slate-900">{counts[k.status] ?? 0}</p>
            </button>
          )
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-[14rem] flex-1">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search job, company, item, part no…"
          />
        </div>
        {statusFilter && (
          <button className="btn-ghost btn-sm" onClick={() => setStatusFilter(null)}>
            Clear filter: {statusFilter} ✕
          </button>
        )}
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

function ExceptionsPanel({ exceptions }: { exceptions: ProdException[] }) {
  const [expanded, setExpanded] = useState(false)
  const critical = exceptions.filter((e) => e.severity === 'critical').length
  const warning = exceptions.filter((e) => e.severity === 'warning').length

  if (exceptions.length === 0) {
    return (
      <Card className="mb-4 border-green-200 bg-green-50">
        <p className="flex items-center gap-2 text-sm font-medium text-green-700">
          <ClipboardCheck className="h-4 w-4" /> No exceptions — every active order is on track.
        </p>
      </Card>
    )
  }

  const shown = expanded ? exceptions : exceptions.slice(0, 5)
  return (
    <Card className="mb-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Exceptions
          <span className="text-2xs font-normal text-slate-500">
            {critical > 0 && <span className="text-red-600">{critical} critical</span>}
            {critical > 0 && warning > 0 && ' · '}
            {warning > 0 && <span className="text-amber-600">{warning} warning</span>}
          </span>
        </h3>
        {exceptions.length > 5 && (
          <button className="btn-ghost btn-sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Show less' : `Show all ${exceptions.length}`}
          </button>
        )}
      </div>
      <ul className="space-y-1.5">
        {shown.map((e) => {
          const style = SEV_STYLE[e.severity]
          const Icon = CATEGORY_ICON[e.category] ?? style.icon
          return (
            <li key={e.id}>
              <AppLink
                to={`/app/jobs/${e.job.id}`}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors hover:brightness-95 ${style.row}`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${style.chip}`} />
                <span className="w-28 shrink-0 text-xs font-semibold text-slate-700">
                  {e.category}
                </span>
                <span className="shrink-0 font-mono text-2xs text-slate-500">{e.job.jobNo}</span>
                <span className="truncate text-xs text-slate-600">
                  {e.job.partName} · {e.detail}
                </span>
                <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400" />
              </AppLink>
            </li>
          )
        })}
      </ul>
    </Card>
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
