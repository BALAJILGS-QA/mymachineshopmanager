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
  Plus,
  Route,
  SkipForward,
  Trash2,
} from 'lucide-react'
import type { JobOperation, JobOrder, JobStatus, Routing } from '@/types'
import {
  useJobs,
  useJobEvents,
  useUpdateJob,
  useDeleteJob,
  useTransitionJob,
} from './hooks/useJobs'
import { JobForm } from './JobForm'
import {
  useJobMaterialStatus,
  useReservationsForJob,
  useSetMaterialRequirement,
  useReserveMaterial,
  useReleaseMaterial,
  useConsumeMaterial,
} from './hooks/useReservations'
import {
  useJobOperations,
  useCreateJobOperation,
  useDeleteJobOperation,
  useInstantiateRouting,
  useStartJobOperation,
  useCompleteJobOperation,
  useSkipJobOperation,
} from './hooks/useJobOperations'
import {
  useRoutings,
  useOperations,
  useWorkCenters,
  useMachines,
} from '@/features/masters/hooks/useMasters'
import { useMaterials } from '@/features/materials/hooks/useMaterials'
import { useJobInspections } from '@/features/qc/hooks/useQc'
import { useFgForJob } from '@/features/finishedgoods/hooks/useFinishedGoods'
import { usePermissions } from '@/features/hrm/permissions'
import { useCompanyName } from '@/features/shared/lookups'
import { JobDrawingsPanel } from '@/features/production/components/JobDrawingsPanel'
import { MachineProgramPanel } from '@/features/production/components/MachineProgramPanel'
import { Breadcrumb } from '@/components/common/Breadcrumb'
import { Card, EmptyState, Field, Input, Select, Badge } from '@/components/ui/primitives'
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
import { materialAvailability, jobPendingQty } from '@/data/computations'
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
          <OperationsTab job={job} />
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

function OperationsTab({ job }: { job: JobOrder }) {
  const perms = usePermissions()
  const canManage = perms.can('MASTERS_MANAGE')
  const canExecute = perms.can('PRODUCTION_EXECUTE')
  const canComplete = perms.can('PRODUCTION_COMPLETE')
  const { data: ops = [], isLoading } = useJobOperations(job.id)
  const { data: routings = [] } = useRoutings()
  const removeOp = useDeleteJobOperation(job.id)
  const instantiate = useInstantiateRouting(job.id)
  const startOp = useStartJobOperation(job.id)
  const skipOp = useSkipJobOperation(job.id)
  const toast = useToast()
  const confirm = useConfirm()
  const [attaching, setAttaching] = useState(false)
  const [addingStep, setAddingStep] = useState(false)
  const [completing, setCompleting] = useState<JobOperation | null>(null)

  // Routings tied to this order's material float to the top of the picker.
  const sortedRoutings = useMemo(() => {
    const matched = routings.filter(
      (r) => r.active && r.materialId && r.materialId === job.materialId,
    )
    const rest = routings.filter((r) => r.active && !matched.includes(r))
    return [...matched, ...rest]
  }, [routings, job.materialId])

  const statusTone = (s: string) =>
    s === 'Completed' ? 'green' : s === 'In Progress' ? 'blue' : s === 'Skipped' ? 'gray' : 'slate'

  // Sequential routing: an op can start only when every earlier-seq op is done/skipped.
  const firstOpenSeq = useMemo(() => {
    const open = ops
      .filter((o) => o.status !== 'Completed' && o.status !== 'Skipped')
      .map((o) => o.seq)
    return open.length ? Math.min(...open) : null
  }, [ops])

  const done = ops.filter((o) => o.status === 'Completed').length
  const skipped = ops.filter((o) => o.status === 'Skipped').length
  const jobRunning = job.status === 'In Progress'
  // Order still In Progress but every op is terminal (≥1 completed) → the
  // completion rollup didn't fire (caller lacks PRODUCTION_COMPLETE). Surface it.
  const allOpsDone = ops.length > 0 && firstOpenSeq === null && done > 0
  const awaitingCompletion = jobRunning && allOpsDone && !canComplete

  async function handleStart(o: JobOperation) {
    try {
      await startOp.mutateAsync({ id: o.id })
    } catch (e) {
      toast.error(toUserMessage(e, 'Could not start operation'))
    }
  }

  async function handleSkip(o: JobOperation) {
    if (
      !(await confirm({
        title: 'Skip operation',
        message: `Skip "${o.operationName}" for this order? It will not be run.`,
        confirmLabel: 'Skip',
      }))
    )
      return
    try {
      await skipOp.mutateAsync({ id: o.id })
    } catch (e) {
      toast.error(toUserMessage(e, 'Could not skip operation'))
    }
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs text-slate-500">
            Operation sequence for this production order. Plan it from a routing or add steps
            ad-hoc, then run each operation on the floor.
          </p>
          {ops.length > 0 && (
            <p className="mt-0.5 text-2xs text-slate-400">
              {done} of {ops.length} completed
              {skipped > 0 ? ` · ${skipped} skipped` : ''}
              {!jobRunning && canExecute
                ? ' · start production on the order to run operations'
                : ''}
            </p>
          )}
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button className="btn-secondary btn-sm" onClick={() => setAttaching(true)}>
              <Route size={15} /> Attach routing
            </button>
            <button className="btn-primary btn-sm" onClick={() => setAddingStep(true)}>
              <Plus size={15} /> Add step
            </button>
          </div>
        )}
      </div>

      {awaitingCompletion && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          <Check size={15} />
          All operations are complete — awaiting production completion by a supervisor (requires the
          Complete-production permission).
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : ops.length === 0 ? (
        <EmptyState
          icon={<Factory size={36} />}
          title="No operations planned"
          description={
            canManage
              ? 'Attach a routing to copy its steps, or add operations one at a time.'
              : 'No operation sequence has been planned for this order yet.'
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-2xs uppercase tracking-wide text-slate-400">
                <th className="py-1 pr-3">Seq</th>
                <th className="py-1 pr-3">Operation</th>
                <th className="py-1 pr-3">Work Centre</th>
                <th className="py-1 pr-3">Machine</th>
                <th className="py-1 pr-3 text-right">Done</th>
                <th className="py-1 pr-3 text-right">Actual</th>
                <th className="py-1 pr-3">Operator</th>
                <th className="py-1 pr-3">Status</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {ops.map((o) => {
                const terminal = o.status === 'Completed' || o.status === 'Skipped'
                const isNext = o.seq === firstOpenSeq
                const canStart = canExecute && jobRunning && o.status === 'Planned' && isNext
                const canComplete = canExecute && o.status === 'In Progress'
                const canSkip = canExecute && !terminal
                return (
                  <tr key={o.id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3 font-mono text-xs text-slate-500">{o.seq}</td>
                    <td className="py-1.5 pr-3 font-medium text-slate-800">
                      {o.operationName || '—'}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-600">{o.workCenterName || '—'}</td>
                    <td className="py-1.5 pr-3 text-slate-600">{o.machineName || '—'}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {o.qtyCompleted ? qty(o.qtyCompleted) : '—'}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">
                      {o.actualMinutes != null ? `${qty(o.actualMinutes)}m` : '—'}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-600">{o.operator || '—'}</td>
                    <td className="py-1.5 pr-3">
                      <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      {canStart && (
                        <button
                          className="btn-ghost btn-sm text-emerald-600"
                          title="Start operation"
                          disabled={startOp.isPending}
                          onClick={() => handleStart(o)}
                        >
                          <Play size={14} />
                        </button>
                      )}
                      {canComplete && (
                        <button
                          className="btn-ghost btn-sm text-blue-600"
                          title="Complete operation"
                          onClick={() => setCompleting(o)}
                        >
                          <Check size={14} />
                        </button>
                      )}
                      {canSkip && (
                        <button
                          className="btn-ghost btn-sm text-slate-400"
                          title="Skip operation"
                          disabled={skipOp.isPending}
                          onClick={() => handleSkip(o)}
                        >
                          <SkipForward size={14} />
                        </button>
                      )}
                      {canManage && !terminal && o.status === 'Planned' && (
                        <button
                          className="btn-ghost btn-sm text-red-500"
                          title="Remove"
                          onClick={async () => {
                            if (
                              !(await confirm({
                                title: 'Remove operation',
                                message: `Remove "${o.operationName}" from this order?`,
                                danger: true,
                                confirmLabel: 'Remove',
                              }))
                            )
                              return
                            try {
                              await removeOp.mutateAsync(o.id)
                            } catch (e) {
                              toast.error(toUserMessage(e, 'Remove failed'))
                            }
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {completing && (
        <CompleteOperationModal job={job} op={completing} onClose={() => setCompleting(null)} />
      )}
      {attaching && (
        <AttachRoutingModal
          routings={sortedRoutings}
          hasExisting={ops.length > 0}
          busy={instantiate.isPending}
          onClose={() => setAttaching(false)}
          onAttach={async (routingId) => {
            try {
              await instantiate.mutateAsync({ routingId, replace: true })
              toast.success('Routing attached')
              setAttaching(false)
            } catch (e) {
              toast.error(toUserMessage(e, 'Could not attach routing'))
            }
          }}
        />
      )}
      {addingStep && (
        <AddJobOperationModal
          job={job}
          nextSeq={ops.length ? Math.max(...ops.map((o) => o.seq)) + 10 : 10}
          onClose={() => setAddingStep(false)}
        />
      )}
    </Card>
  )
}

function AttachRoutingModal({
  routings,
  hasExisting,
  busy,
  onClose,
  onAttach,
}: {
  routings: Routing[]
  hasExisting: boolean
  busy: boolean
  onClose: () => void
  onAttach: (routingId: string) => void
}) {
  const [routingId, setRoutingId] = useState('')
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Attach routing"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={() => routingId && onAttach(routingId)}
            disabled={busy || !routingId}
          >
            {busy ? 'Attaching…' : 'Attach'}
          </button>
        </>
      }
    >
      <Field label="Routing">
        <Select value={routingId} onChange={(e) => setRoutingId(e.target.value)}>
          <option value="">— select a routing —</option>
          {routings.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.code ? ` (${r.code})` : ''}
            </option>
          ))}
        </Select>
      </Field>
      {hasExisting && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          This replaces the current operation sequence on the order.
        </p>
      )}
      {routings.length === 0 && (
        <p className="mt-2 text-2xs text-slate-500">
          No active routings yet — create one under Masters.
        </p>
      )}
    </Modal>
  )
}

function AddJobOperationModal({
  job,
  nextSeq,
  onClose,
}: {
  job: JobOrder
  nextSeq: number
  onClose: () => void
}) {
  const { data: ops = [] } = useOperations()
  const { data: centres = [] } = useWorkCenters()
  const { data: machines = [] } = useMachines()
  const create = useCreateJobOperation(job.id)
  const toast = useToast()
  const [operationId, setOp] = useState('')
  const [workCenterId, setWc] = useState('')
  const [machineId, setMc] = useState('')
  const [setupMin, setSetup] = useState('')
  const [cycleMin, setCycle] = useState('')

  async function save() {
    if (!operationId) return toast.error('Pick an operation')
    const op = ops.find((o) => o.id === operationId)
    const wc = centres.find((c) => c.id === workCenterId)
    const mc = machines.find((m) => m.id === machineId)
    try {
      await create.mutateAsync({
        seq: nextSeq,
        operationId,
        operationName: op?.name,
        workCenterId: workCenterId || undefined,
        workCenterName: wc?.name,
        machineId: machineId || undefined,
        machineName: mc?.name,
        setupMin: setupMin === '' ? undefined : Number(setupMin),
        cycleMin: cycleMin === '' ? undefined : Number(cycleMin),
      })
      toast.success('Operation added')
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Could not add operation'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Add operation (seq ${nextSeq})`}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={create.isPending}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Add'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Operation" required className="sm:col-span-2">
          <Select value={operationId} onChange={(e) => setOp(e.target.value)}>
            <option value="">— select —</option>
            {ops.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Work Centre">
          <Select value={workCenterId} onChange={(e) => setWc(e.target.value)}>
            <option value="">— none —</option>
            {centres.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Machine">
          <Select value={machineId} onChange={(e) => setMc(e.target.value)}>
            <option value="">— none —</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Setup (min)">
          <Input
            type="number"
            step="0.1"
            value={setupMin}
            onChange={(e) => setSetup(e.target.value)}
          />
        </Field>
        <Field label="Cycle (min/pc)">
          <Input
            type="number"
            step="0.1"
            value={cycleMin}
            onChange={(e) => setCycle(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  )
}

function CompleteOperationModal({
  job,
  op,
  onClose,
}: {
  job: JobOrder
  op: JobOperation
  onClose: () => void
}) {
  const complete = useCompleteJobOperation(job.id)
  const toast = useToast()
  const [qtyDone, setQtyDone] = useState(op.qtyCompleted ? String(op.qtyCompleted) : '')
  const [actualMin, setActualMin] = useState('')
  const [note, setNote] = useState('')

  async function save() {
    try {
      await complete.mutateAsync({
        id: op.id,
        qty: qtyDone === '' ? undefined : Number(qtyDone),
        actualMin: actualMin === '' ? undefined : Number(actualMin),
        note: note.trim() || undefined,
      })
      toast.success('Operation completed')
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Could not complete operation'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Complete: ${op.operationName || `operation ${op.seq}`}`}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={complete.isPending}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={complete.isPending}>
            {complete.isPending ? 'Saving…' : 'Complete'}
          </button>
        </>
      }
    >
      <p className="mb-3 text-xs text-slate-500">
        Record how many pieces this operation finished and the time taken. Leave time blank to use
        the elapsed time since it was started.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Qty completed">
          <Input
            type="number"
            step="1"
            min="0"
            value={qtyDone}
            onChange={(e) => setQtyDone(e.target.value)}
          />
        </Field>
        <Field label="Actual (min)">
          <Input
            type="number"
            step="0.1"
            min="0"
            placeholder="auto"
            value={actualMin}
            onChange={(e) => setActualMin(e.target.value)}
          />
        </Field>
        <Field label="Note" className="sm:col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

type ReserveAction = 'Reserve' | 'Release' | 'Consume' | 'Requirement'

const STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'slate'> = {
  Ready: 'green',
  Partial: 'amber',
  Shortage: 'red',
  None: 'slate',
}

function MaterialsTab({ job }: { job: JobOrder }) {
  const perms = usePermissions()
  const companyName = useCompanyName()
  const { data: materials = [] } = useMaterials()
  const material = materials.find((m) => m.id === job.materialId)
  const { data: status } = useJobMaterialStatus(job.id)
  const { data: ledger = [] } = useReservationsForJob(job.id)
  const [action, setAction] = useState<ReserveAction | null>(null)

  if (!job.materialId)
    return (
      <Card>
        <EmptyState
          icon={<ClipboardList size={36} />}
          title="No raw material linked"
          description="Link a raw material to this production order (via Edit) to plan its requirement, reserve stock and consume it on the floor."
        />
      </Card>
    )

  const unit = material?.unit ?? status?.unit ?? ''
  const required = status?.required ?? job.materialRequiredQty ?? 0
  const reserved = status?.reserved ?? 0
  const consumed = status?.consumed ?? 0
  const free = status?.free ?? 0
  const balance = status?.balance ?? 0
  const { remaining, status: avail } = materialAvailability(required, reserved, consumed, free)
  const poolLabel =
    status?.ownerScope == null ? 'Own (shop) stock' : `${companyName(status.ownerScope)} stock`

  const canReserve = perms.can('PRODUCTION_RESERVE')
  const canConsume = perms.can('PRODUCTION_CONSUME')
  const canOverride = perms.can('PRODUCTION_RESERVE_OVERRIDE')

  const stats: [string, string][] = [
    ['Required', `${qty(required)} ${unit}`],
    ['Reserved', `${qty(reserved)} ${unit}`],
    ['Consumed', `${qty(consumed)} ${unit}`],
    ['Remaining', `${qty(remaining)} ${unit}`],
    ['Free to reserve', `${qty(free)} ${unit}`],
    ['On-hand balance', `${qty(balance)} ${unit}`],
  ]

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-800">{material?.name || 'Material'}</p>
            <p className="text-2xs text-slate-500">
              {poolLabel}
              {material?.partNumber ? ` · ${material.partNumber}` : ''}
              {material?.binNo ? ` · Bin ${material.binNo}` : ''}
            </p>
          </div>
          <Badge tone={STATUS_TONE[avail]}>{avail === 'None' ? 'No requirement' : avail}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map(([k, v]) => (
            <div key={k} className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-2xs uppercase tracking-wide text-slate-400">{k}</p>
              <p className="text-sm font-semibold text-slate-800">{v}</p>
            </div>
          ))}
        </div>

        {avail === 'Shortage' && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            Shortage — {qty(remaining)} {unit} still required but only {qty(free)} {unit} free to
            reserve. Replenish stock, or an authorised user can reserve beyond availability
            (override).
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {canReserve && (
            <button className="btn-secondary btn-sm" onClick={() => setAction('Requirement')}>
              {required > 0 ? 'Edit requirement' : 'Set requirement'}
            </button>
          )}
          {canReserve && (
            <button className="btn-primary btn-sm" onClick={() => setAction('Reserve')}>
              Reserve
            </button>
          )}
          {canReserve && reserved > 0 && (
            <button className="btn-secondary btn-sm" onClick={() => setAction('Release')}>
              Release
            </button>
          )}
          {canConsume && reserved > 0 && (
            <button className="btn-secondary btn-sm" onClick={() => setAction('Consume')}>
              Consume
            </button>
          )}
        </div>
        {!canReserve && !canConsume && (
          <p className="mt-3 text-2xs text-slate-400">
            You don’t have permission to reserve or consume material for this order.
          </p>
        )}
      </Card>

      <Card>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          Reservation ledger
        </p>
        {ledger.length === 0 ? (
          <p className="text-sm text-slate-500">No reservation movements yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-2xs uppercase tracking-wide text-slate-400">
                  <th className="py-1 pr-4">Date</th>
                  <th className="py-1 pr-4">Movement</th>
                  <th className="py-1 pr-4 text-right">Qty</th>
                  <th className="py-1 pr-4">By</th>
                  <th className="py-1">Note</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-4 text-slate-500">{fmtDateTime(r.createdAt)}</td>
                    <td className="py-1.5 pr-4">
                      <Badge
                        tone={
                          r.kind === 'Reserve' ? 'blue' : r.kind === 'Consume' ? 'green' : 'slate'
                        }
                      >
                        {r.kind}
                      </Badge>
                    </td>
                    <td className="py-1.5 pr-4 text-right font-medium">
                      {qty(r.quantity)} {r.unit || unit}
                    </td>
                    <td className="py-1.5 pr-4 text-slate-500">{r.actorEmail || '—'}</td>
                    <td className="py-1.5 text-slate-500">{r.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {action && (
        <ReservationActionModal
          job={job}
          action={action}
          unit={unit}
          reserved={reserved}
          free={free}
          required={required}
          ownerScope={status?.ownerScope ?? null}
          canOverride={canOverride}
          onClose={() => setAction(null)}
        />
      )}
    </div>
  )
}

function ReservationActionModal({
  job,
  action,
  unit,
  reserved,
  free,
  required,
  ownerScope,
  canOverride,
  onClose,
}: {
  job: JobOrder
  action: ReserveAction
  unit: string
  reserved: number
  free: number
  required: number
  ownerScope: string | null
  canOverride: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const setRequirement = useSetMaterialRequirement()
  const reserveMaterial = useReserveMaterial()
  const releaseMaterial = useReleaseMaterial()
  const consumeMaterial = useConsumeMaterial()
  const companyName = useCompanyName()

  // Default: Requirement prefilled to current required; moves prefilled to the
  // obvious amount (remaining-to-reserve / full reserved).
  const defaultQty =
    action === 'Requirement'
      ? required || job.orderedQty || 0
      : action === 'Reserve'
        ? Math.max(0, (required || 0) - reserved)
        : reserved
  const [value, setValue] = useState(String(defaultQty || ''))
  const [scope, setScope] = useState<string>(ownerScope ?? '')
  const [override, setOverride] = useState(false)
  const num = Number(value) || 0
  const busy =
    setRequirement.isPending ||
    reserveMaterial.isPending ||
    releaseMaterial.isPending ||
    consumeMaterial.isPending

  const shortageReserve = action === 'Reserve' && num > free

  async function submit() {
    if (action !== 'Requirement' && !(num > 0)) {
      toast.error('Enter a quantity greater than zero.')
      return
    }
    try {
      if (action === 'Requirement') {
        await setRequirement.mutateAsync({
          jobId: job.id,
          requiredQty: num,
          ownerScope: scope || null,
        })
        toast.success('Material requirement updated')
      } else if (action === 'Reserve') {
        await reserveMaterial.mutateAsync({ jobId: job.id, quantity: num, override })
        toast.success(`Reserved ${qty(num)} ${unit}`)
      } else if (action === 'Release') {
        await releaseMaterial.mutateAsync({ jobId: job.id, quantity: num })
        toast.success(`Released ${qty(num)} ${unit}`)
      } else {
        await consumeMaterial.mutateAsync({ jobId: job.id, quantity: num })
        toast.success(`Consumed ${qty(num)} ${unit}`)
      }
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Action failed'))
    }
  }

  const title =
    action === 'Requirement'
      ? 'Set material requirement'
      : action === 'Reserve'
        ? 'Reserve material'
        : action === 'Release'
          ? 'Release reservation'
          : 'Consume reserved material'

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : 'Confirm'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={action === 'Requirement' ? 'Required quantity' : 'Quantity'}>
          <Input
            type="number"
            step="0.001"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>

        {action === 'Requirement' && (
          <Field label="Stock pool" hint="Which stock this order draws from">
            <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="">Own (shop) stock</option>
              <option value={job.companyId}>{companyName(job.companyId)} stock</option>
            </select>
          </Field>
        )}

        {action === 'Release' && (
          <p className="text-2xs text-slate-500">
            Reserved now: {qty(reserved)} {unit}.
          </p>
        )}
        {action === 'Consume' && (
          <p className="text-2xs text-slate-500">
            Issues material from stock against this order’s reservation. Reserved now:{' '}
            {qty(reserved)} {unit}.
          </p>
        )}

        {action === 'Reserve' && (
          <>
            <p className="text-2xs text-slate-500">
              Free to reserve: {qty(free)} {unit}.
            </p>
            {shortageReserve &&
              (canOverride ? (
                <label className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={override}
                    onChange={(e) => setOverride(e.target.checked)}
                  />
                  <span>
                    Reserve beyond available stock (shortage override). This is recorded in the
                    audit log.
                  </span>
                </label>
              ) : (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                  {qty(num)} {unit} exceeds the {qty(free)} {unit} free to reserve, and you’re not
                  authorised to override a shortage.
                </p>
              ))}
          </>
        )}
      </div>
    </Modal>
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
