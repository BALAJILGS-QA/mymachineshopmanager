'use client'

import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ClipboardList,
  Factory,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Trash2,
} from 'lucide-react'
import type { JobOrder, JobStatus } from '@/types'
import {
  useJobs,
  useJobEvents,
  useUpdateJob,
  useDeleteJob,
  useTransitionJob,
} from './hooks/useJobs'
import { JobForm } from './JobForm'
import { useMaterials, useMaterialBalance } from '@/features/materials/hooks/useMaterials'
import { useJobInspections } from '@/features/qc/hooks/useQc'
import { useFgForJob } from '@/features/finishedgoods/hooks/useFinishedGoods'
import { usePermissions } from '@/features/hrm/permissions'
import { useCompanyName } from '@/features/shared/lookups'
import { JobDrawingsPanel } from '@/features/production/components/JobDrawingsPanel'
import { MachineProgramPanel } from '@/features/production/components/MachineProgramPanel'
import { Breadcrumb } from '@/components/common/Breadcrumb'
import { Card, EmptyState, Field, Input, Badge } from '@/components/ui/primitives'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/shadcn/tabs'
import { Modal } from '@/components/ui/Modal'
import { JobStatusBadge, PriorityBadge } from '@/components/common/status'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/shadcn/dropdown-menu'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useAppNavigate, AppLink } from '@/components/nav/app-link'
import { toUserMessage } from '@/lib/api/errors'
import { SHOP_SCOPE, jobPendingQty } from '@/data/computations'
import { fmtDate, fmtDateTime, qty } from '@/lib/format'

// ---- Production Order object page (Phase 2) --------------------------------
// The Production Order (internally `job_orders`) is the central manufacturing
// object; this is its dedicated workspace — NOT a modal. Phase 2 ships the
// header + lifecycle-gated actions, the authoritative quantity summary, the
// lifecycle tracker, and the Overview + History tabs. The remaining tabs reuse
// data/components that already exist (drawings, machine programs, QC, FG) and
// deep-link to their dedicated screens; the Operations tab is an honest GAP
// placeholder until routing masters land in Phase 4.

// Real lifecycle milestones (every value is a status that actually exists in
// the `job_status` enum — no invented stages). Off-track statuses (On Hold,
// Rework, QC Rejected, Cancelled) anchor to a base milestone and surface a
// banner instead of inventing a step.
const MILESTONES: { key: string; label: string }[] = [
  { key: 'created', label: 'Created' },
  { key: 'production', label: 'In Production' },
  { key: 'produced', label: 'Produced' },
  { key: 'qc', label: 'Quality Control' },
  { key: 'approved', label: 'QC Approved' },
  { key: 'ready', label: 'Ready for Dispatch' },
  { key: 'dispatched', label: 'Dispatched' },
]

function milestoneIndex(status: JobStatus): number {
  switch (status) {
    case 'Draft':
    case 'Pending':
      return 0
    case 'In Progress':
    case 'On Hold':
      return 1
    case 'Completed':
      return 2
    case 'Quality Control':
    case 'Rework':
    case 'QC Rejected':
      return 3
    case 'QC Approved':
      return 4
    case 'Ready for Dispatch':
      return 5
    case 'Delivered':
      return 6
    case 'Cancelled':
      return -1
  }
}

// Off-track banner text (null = on the happy path, no banner).
function branchNote(status: JobStatus): { tone: string; text: string } | null {
  switch (status) {
    case 'On Hold':
      return { tone: 'violet', text: 'This production order is on hold — production is paused.' }
    case 'Rework':
      return {
        tone: 'violet',
        text: 'Quality control sent quantity back for rework; it re-enters production before re-inspection.',
      }
    case 'QC Rejected':
      return { tone: 'red', text: 'Quality control rejected inspected quantity on this order.' }
    case 'Cancelled':
      return { tone: 'red', text: 'This production order was cancelled.' }
    default:
      return null
  }
}

function produced(j: JobOrder) {
  return j.completedQty ?? 0
}

export function ProductionOrderPage({ jobId }: { jobId: string }) {
  const { data: jobs = [], isLoading, isError, error } = useJobs()
  const companyName = useCompanyName()
  const perms = usePermissions()
  const nav = useAppNavigate()

  const [editing, setEditing] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)

  const job = useMemo(() => jobs.find((j) => j.id === jobId), [jobs, jobId])

  if (isLoading || perms.isLoading)
    return <p className="p-6 text-sm text-slate-500">Loading production order…</p>
  if (isError)
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">{toUserMessage(error)}</p>
      </div>
    )
  if (!perms.can('JOB_ORDER_VIEW'))
    return (
      <EmptyState
        icon={<ClipboardList size={40} />}
        title="Access denied"
        description="You do not have permission to view production orders."
      />
    )
  if (!job)
    return (
      <EmptyState
        icon={<ClipboardList size={40} />}
        title="Production order not found"
        description="It may have been removed, or you may not have access to it."
        action={
          <button className="btn-secondary btn-sm" onClick={() => nav('/app/jobs')}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to Production Orders
          </button>
        }
      />
    )

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Production Planning', to: '/app/production-planning' },
          { label: 'Production Orders', to: '/app/jobs' },
          { label: job.jobNo },
        ]}
      />

      <OrderHeader
        job={job}
        companyName={companyName(job.companyId)}
        canEdit={perms.can('JOB_ORDER_UPDATE')}
        canExecute={perms.can('PRODUCTION_EXECUTE') || perms.can('JOB_ORDER_UPDATE')}
        onEdit={() => setEditing(true)}
        onReschedule={() => setRescheduling(true)}
        onDeleted={() => nav('/app/jobs')}
      />

      <LifecycleTracker status={job.status} />
      <QuantitySummary job={job} />

      <Tabs defaultValue="overview" className="mt-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="materials">Materials</TabsTrigger>
          <TabsTrigger value="drawings">Drawing &amp; Documents</TabsTrigger>
          <TabsTrigger value="programs">Machine Programs</TabsTrigger>
          <TabsTrigger value="production">Production</TabsTrigger>
          <TabsTrigger value="quality">Quality</TabsTrigger>
          <TabsTrigger value="fg">Finished Goods</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab job={job} customer={companyName(job.companyId)} />
        </TabsContent>
        <TabsContent value="operations">
          <OperationsTab />
        </TabsContent>
        <TabsContent value="materials">
          <MaterialsTab job={job} />
        </TabsContent>
        <TabsContent value="drawings">
          <JobDrawingsPanel job={job} canUpload={perms.can('JOB_ORDER_UPDATE')} />
        </TabsContent>
        <TabsContent value="programs">
          <MachineProgramPanel
            job={job}
            canUpload={perms.can('PRODUCTION_UPLOAD_PROGRAM')}
            canApprove={perms.can('PRODUCTION_APPROVE_PROGRAM')}
            canView={perms.can('PRODUCTION_VIEW_PROGRAM')}
          />
        </TabsContent>
        <TabsContent value="production">
          <ProductionTab job={job} />
        </TabsContent>
        <TabsContent value="quality">
          <QualityTab job={job} />
        </TabsContent>
        <TabsContent value="fg">
          <FinishedGoodsTab job={job} />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTab jobId={job.id} />
        </TabsContent>
      </Tabs>

      {editing && <JobForm job={job} onClose={() => setEditing(false)} />}
      {rescheduling && <RescheduleModal job={job} onClose={() => setRescheduling(false)} />}
    </div>
  )
}

// ---- Header + lifecycle-gated actions --------------------------------------

function OrderHeader({
  job,
  companyName,
  canEdit,
  canExecute,
  onEdit,
  onReschedule,
  onDeleted,
}: {
  job: JobOrder
  companyName: string
  canEdit: boolean
  canExecute: boolean
  onEdit: () => void
  onReschedule: () => void
  onDeleted: () => void
}) {
  const transition = useTransitionJob()
  const del = useDeleteJob()
  const toast = useToast()
  const confirm = useConfirm()
  const nav = useAppNavigate()

  async function move(to: JobStatus, label: string) {
    try {
      await transition.mutateAsync({ id: job.id, to })
      toast.success(label)
    } catch (e) {
      toast.error(toUserMessage(e))
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: 'Delete production order',
      message: `Delete ${job.jobNo}? Cancelled orders are usually kept for history.`,
      danger: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await del.mutateAsync(job.id)
      toast.success('Production order deleted')
      onDeleted()
    } catch (e) {
      toast.error(toUserMessage(e, 'Delete failed'))
    }
  }

  const s = job.status
  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-lg font-bold text-slate-900">{job.jobNo}</span>
            <PriorityBadge priority={job.priority} />
            <JobStatusBadge status={job.status} />
          </div>
          <p className="mt-1 text-sm font-medium text-slate-800">{job.partName}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {companyName}
            {job.partNumber ? ` · ${job.partNumber}` : ''}
            {` · Due ${fmtDate(job.dueDate)}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <button className="btn-secondary btn-sm" onClick={onEdit}>
              <Pencil className="mr-1 h-4 w-4" /> Edit
            </button>
          )}
          {canExecute && s === 'In Progress' && (
            <button
              className="btn-secondary btn-sm"
              disabled={transition.isPending}
              onClick={() => move('On Hold', 'Production order placed on hold')}
            >
              <Pause className="mr-1 h-4 w-4" /> Hold
            </button>
          )}
          {canExecute && s === 'On Hold' && (
            <button
              className="btn-primary btn-sm"
              disabled={transition.isPending}
              onClick={() => move('In Progress', 'Production resumed')}
            >
              <Play className="mr-1 h-4 w-4" /> Resume
            </button>
          )}
          {canEdit && (
            <button className="btn-secondary btn-sm" onClick={onReschedule}>
              <CalendarClock className="mr-1 h-4 w-4" /> Reschedule
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="btn-ghost btn-sm" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => nav(`/app/production/${job.id}`)}>
                <Factory className="mr-2 h-4 w-4" /> Open production floor
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => nav(`/app/qc/${job.id}`)}>
                <Check className="mr-2 h-4 w-4" /> Quality control
              </DropdownMenuItem>
              {canEdit && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={onDelete}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

// ---- Lifecycle tracker ------------------------------------------------------

function LifecycleTracker({ status }: { status: JobStatus }) {
  const current = milestoneIndex(status)
  const branch = branchNote(status)
  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
      <ol className="flex flex-wrap items-center gap-y-3">
        {MILESTONES.map((m, i) => {
          const done = current > i
          const active = current === i
          return (
            <li key={m.key} className="flex items-center">
              <div className="flex flex-col items-center">
                <span
                  className={clsx(
                    'flex h-6 w-6 items-center justify-center rounded-full text-2xs font-bold ring-2',
                    done && 'bg-emerald-500 text-white ring-emerald-500',
                    active && 'bg-brand-500 text-white ring-brand-500',
                    !done && !active && 'bg-white text-slate-400 ring-slate-200',
                  )}
                  aria-hidden
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span
                  className={clsx(
                    'mt-1 max-w-[5.5rem] text-center text-2xs leading-tight',
                    active ? 'font-semibold text-slate-800' : 'text-slate-500',
                  )}
                >
                  {m.label}
                </span>
              </div>
              {i < MILESTONES.length - 1 && (
                <span
                  className={clsx(
                    'mx-1.5 h-0.5 w-6 sm:w-10',
                    current > i ? 'bg-emerald-400' : 'bg-slate-200',
                  )}
                  aria-hidden
                />
              )}
            </li>
          )
        })}
      </ol>
      {branch && (
        <div className="mt-3">
          <Badge tone={branch.tone}>{status}</Badge>
          <span className="ml-2 text-xs text-slate-600">{branch.text}</span>
        </div>
      )}
    </div>
  )
}

// ---- Quantity summary (single authoritative source: the job row aggregates) -

function QuantitySummary({ job }: { job: JobOrder }) {
  const planned = job.plannedQty ?? job.orderedQty
  const prod = produced(job)
  const remaining = jobPendingQty(job.orderedQty, job.completedQty)
  const pct = job.orderedQty > 0 ? Math.round((prod / job.orderedQty) * 100) : 0
  const cells: { label: string; value: number; tone?: string }[] = [
    { label: 'Order', value: job.orderedQty },
    { label: 'Planned', value: planned },
    { label: 'Produced', value: prod },
    { label: 'Accepted', value: job.acceptedQty ?? 0, tone: 'text-emerald-700' },
    { label: 'Rejected', value: job.rejectedQty ?? 0, tone: 'text-red-600' },
    { label: 'Rework', value: job.reworkQty ?? 0, tone: 'text-violet-700' },
    { label: 'Remaining', value: remaining, tone: 'font-bold' },
  ]
  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {cells.map((c) => (
          <div key={c.label} className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-2xs uppercase tracking-wide text-slate-400">{c.label}</p>
            <p className={clsx('text-base font-semibold tabular-nums text-slate-800', c.tone)}>
              {qty(c.value)}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand-500"
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <span className="text-xs font-medium text-slate-600">
          {qty(prod)} / {qty(job.orderedQty)} · {pct}%
        </span>
      </div>
    </div>
  )
}

// ---- Tabs -------------------------------------------------------------------

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-sm font-medium text-slate-800">{value}</dd>
    </div>
  )
}

function OverviewTab({ job, customer }: { job: JobOrder; customer: string }) {
  const { data: materials = [] } = useMaterials()
  const material = materials.find((m) => m.id === job.materialId)
  return (
    <Card>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        <Row label="Customer" value={customer} />
        <Row label="Customer PO" value={job.customerPo || '—'} />
        <Row label="Part" value={job.partName} />
        <Row label="Part Number" value={job.partNumber || '—'} />
        <Row label="HSN" value={material?.hsn || '—'} />
        <Row label="Raw Material" value={material?.name || '—'} />
        <Row label="Order Quantity" value={qty(job.orderedQty)} />
        <Row label="Planned Quantity" value={qty(job.plannedQty ?? job.orderedQty)} />
        <Row label="Priority" value={job.priority} />
        <Row label="Status" value={job.status} />
        <Row label="Order Date" value={fmtDate(job.orderDate)} />
        <Row label="Due Date" value={fmtDate(job.dueDate)} />
        <Row label="Created" value={fmtDateTime(job.createdAt)} />
        <Row label="Operator" value={job.operator || '—'} />
      </dl>
      {job.notes && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-2xs uppercase tracking-wide text-slate-400">Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{job.notes}</p>
        </div>
      )}
    </Card>
  )
}

function OperationsTab() {
  return (
    <Card>
      <EmptyState
        icon={<Factory size={36} />}
        title="Operations & routing not yet available"
        description="Operation sequences, work centers, machines and routings are planned for Phase 4. The underlying masters do not exist in MSM today, so no operation data is shown here yet."
      />
    </Card>
  )
}

function MaterialsTab({ job }: { job: JobOrder }) {
  const { data: materials = [] } = useMaterials()
  const material = materials.find((m) => m.id === job.materialId)
  const { data: available = 0 } = useMaterialBalance(job.materialId ?? '', SHOP_SCOPE)
  if (!job.materialId)
    return (
      <Card>
        <EmptyState
          icon={<ClipboardList size={36} />}
          title="No raw material linked"
          description="Link a raw material on the order to track availability. Reservation, consumption and shortage handling arrive in Phase 3."
        />
      </Card>
    )
  return (
    <Card>
      <p className="mb-3 text-xs text-slate-500">
        Live availability from the existing raw-material stock ledger. Required / reserved /
        consumed quantities and shortage gating are introduced in Phase 3.
      </p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        <Row label="Material" value={material?.name || '—'} />
        <Row label="Part Number" value={material?.partNumber || '—'} />
        <Row label="Bin" value={material?.binNo || '—'} />
        <Row label="Available (own stock)" value={qty(available)} />
      </dl>
      <div className="mt-3">
        <Badge tone={available > 0 ? 'green' : 'red'}>
          {available > 0 ? 'In stock' : 'No stock'}
        </Badge>
      </div>
    </Card>
  )
}

function ProductionTab({ job }: { job: JobOrder }) {
  const remaining = Math.max(0, (job.plannedQty ?? job.orderedQty) - produced(job))
  const stats: [string, string][] = [
    ['Produced', qty(produced(job))],
    ['Accepted', qty(job.acceptedQty ?? 0)],
    ['Rejected', qty(job.rejectedQty ?? 0)],
    ['Rework', qty(job.reworkQty ?? 0)],
    ['Remaining (plan)', qty(remaining)],
  ]
  return (
    <Card>
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-2xs uppercase tracking-wide text-slate-400">{k}</p>
            <p className="text-sm font-semibold text-slate-800">{v}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-slate-600">
        Operator execution (start / pause / hold / resume / complete and produced-qty reporting)
        runs on the dedicated shop-floor screen.
      </p>
      <AppLink to={`/app/production/${job.id}`} className="btn-primary btn-sm mt-3 inline-flex">
        <Factory className="mr-1 h-4 w-4" /> Open production floor
      </AppLink>
    </Card>
  )
}

function QualityTab({ job }: { job: JobOrder }) {
  const { data: inspections = [], isLoading } = useJobInspections(job.id)
  return (
    <Card>
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading inspections…</p>
      ) : inspections.length === 0 ? (
        <p className="text-sm text-slate-500">No QC inspections recorded yet.</p>
      ) : (
        <div className="space-y-1">
          {inspections.map((i) => (
            <div key={i.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-700">
                {i.inspectionNo ?? i.id} · {fmtDateTime(i.inspectedAt)}
              </span>
              <Badge
                tone={
                  i.decision === 'Approved' ? 'green' : i.decision === 'Rework' ? 'violet' : 'red'
                }
              >
                {i.decision ?? '—'} · acc {qty(i.acceptedQty)} / rej {qty(i.rejectedQty)} / rwk{' '}
                {qty(i.reworkQty)}
              </Badge>
            </div>
          ))}
        </div>
      )}
      <AppLink to={`/app/qc/${job.id}`} className="btn-secondary btn-sm mt-3 inline-flex">
        <Check className="mr-1 h-4 w-4" /> Open quality control
      </AppLink>
    </Card>
  )
}

function FinishedGoodsTab({ job }: { job: JobOrder }) {
  const { data: fg = [], isLoading } = useFgForJob(job.id)
  const received = fg.reduce((s, f) => s + (f.qtyIn ?? 0), 0)
  const dispatched = fg.reduce((s, f) => s + (f.qtyOut ?? 0), 0)
  const balance = received - dispatched
  return (
    <Card>
      <div className="mb-3 grid grid-cols-3 gap-3">
        {[
          ['Received', received],
          ['Dispatched', dispatched],
          ['Available FG', balance],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-2xs uppercase tracking-wide text-slate-400">{k}</p>
            <p className="text-sm font-semibold text-slate-800">{qty(v as number)}</p>
          </div>
        ))}
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading movements…</p>
      ) : fg.length === 0 ? (
        <p className="text-sm text-slate-500">No finished-goods movements yet.</p>
      ) : (
        <div className="space-y-1">
          {fg.map((f) => (
            <div key={f.id} className="flex items-center justify-between text-2xs">
              <span className="text-slate-700">
                {f.entryNo ?? f.id} · {f.txnType} · {fmtDateTime(f.createdAt)}
                {f.binNo ? ` · ${f.binNo}` : ''}
              </span>
              <span className="tabular-nums">
                {f.qtyIn > 0 ? `+${qty(f.qtyIn)}` : `-${qty(f.qtyOut)}`}
              </span>
            </div>
          ))}
        </div>
      )}
      <AppLink to="/app/finished-goods" className="btn-secondary btn-sm mt-3 inline-flex">
        Open finished goods
      </AppLink>
    </Card>
  )
}

function HistoryTab({ jobId }: { jobId: string }) {
  const { data: events = [], isLoading } = useJobEvents(jobId)
  return (
    <Card>
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading history…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-slate-500">No events recorded yet.</p>
      ) : (
        <ol className="relative border-l border-slate-200 pl-4">
          {events.map((e) => (
            <li key={e.id} className="mb-3">
              <span className="absolute -left-1 mt-1 h-2 w-2 rounded-full bg-brand-600" />
              <p className="text-sm font-medium text-slate-800">
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
      )}
    </Card>
  )
}

// ---- Reschedule modal (edits only the due date via updateJob) ---------------

function RescheduleModal({ job, onClose }: { job: JobOrder; onClose: () => void }) {
  const update = useUpdateJob()
  const toast = useToast()
  const [due, setDue] = useState(job.dueDate ?? '')

  async function save() {
    try {
      await update.mutateAsync({ id: job.id, patch: { dueDate: due || undefined } })
      toast.success('Due date updated')
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Reschedule · ${job.jobNo}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={update.isPending}>
            Save
          </button>
        </>
      }
    >
      <Field label="Due date">
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>
    </Modal>
  )
}
