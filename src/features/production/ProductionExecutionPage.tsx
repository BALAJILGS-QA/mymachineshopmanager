'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, Pause, Play, CheckCircle2, ClipboardCheck } from 'lucide-react'
import type { JobOrder, JobStatus } from '@/types'
import { useJobs, useTransitionJob } from '@/features/jobs/hooks/useJobs'
import { useMaterials } from '@/features/materials/hooks/useMaterials'
import { usePermissions } from '@/features/hrm/permissions'
import { useCompanyName } from '@/features/shared/lookups'
import { PageHeader } from '@/components/common/PageHeader'
import { Card, EmptyState, Field, Input, Textarea } from '@/components/ui/primitives'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/shadcn/tabs'
import { JobStatusBadge, PriorityBadge } from '@/components/common/status'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useAppNavigate } from '@/components/nav/app-link'
import { toUserMessage } from '@/lib/api/errors'
import { fmtDate, qty } from '@/lib/format'
import { JobDrawingsPanel } from './components/JobDrawingsPanel'
import { MachineProgramPanel } from './components/MachineProgramPanel'

function produced(j: JobOrder): number {
  return j.completedQty ?? 0
}
function remaining(j: JobOrder): number {
  return Math.max(0, (j.orderedQty ?? 0) - produced(j))
}

export function ProductionExecutionPage({ jobId }: { jobId: string }) {
  const { data: jobs = [], isLoading, isError, error } = useJobs()
  const { data: materials = [] } = useMaterials()
  const companyName = useCompanyName()
  const nav = useAppNavigate()
  const perms = usePermissions()

  const job = useMemo(() => jobs.find((j) => j.id === jobId), [jobs, jobId])
  const material = useMemo(() => materials.find((m) => m.id === job?.materialId), [materials, job])

  if (isLoading) return <p className="p-6 text-sm text-slate-500">Loading job…</p>
  if (isError) return <p className="p-6 text-sm text-red-600">{toUserMessage(error)}</p>
  if (!job) {
    return (
      <EmptyState
        icon={<ClipboardCheck className="h-6 w-6" />}
        title="Job order not found"
        description="It may have been removed, or you may not have access."
        action={
          <button className="btn-secondary btn-sm" onClick={() => nav('/app/production')}>
            Back to production
          </button>
        }
      />
    )
  }

  return (
    <div>
      <button className="btn-ghost btn-sm mb-2" onClick={() => nav('/app/production')}>
        <ArrowLeft className="mr-1 h-4 w-4" />
        Production queue
      </button>
      <PageHeader
        title={`${job.jobNo} · ${job.partName}`}
        subtitle={`${companyName(job.companyId)}${job.partNumber ? ` · ${job.partNumber}` : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <PriorityBadge priority={job.priority} />
            <JobStatusBadge status={job.status} />
          </div>
        }
      />

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Job Info</TabsTrigger>
          <TabsTrigger value="drawing">Drawing &amp; Dimensions</TabsTrigger>
          <TabsTrigger value="program">Machine Program</TabsTrigger>
          <TabsTrigger value="execute">Execute</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <JobInfo
            job={job}
            materialName={material?.name}
            hsn={material?.hsn}
            binNo={material?.binNo}
          />
        </TabsContent>

        <TabsContent value="drawing">
          <JobDrawingsPanel job={job} canUpload={perms.can('JOB_ORDER_UPDATE')} />
          <Card className="mt-3">
            <h3 className="mb-1 text-sm font-semibold text-slate-800">Dimensions</h3>
            <p className="text-sm text-slate-500">
              Inspection dimensions and tolerances are captured during Quality Control (10-sample
              grid). Refer to the uploaded drawing above for nominal dimensions.
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="program">
          <MachineProgramPanel
            job={job}
            canUpload={perms.can('PRODUCTION_UPLOAD_PROGRAM')}
            canApprove={perms.can('PRODUCTION_APPROVE_PROGRAM')}
            canView={perms.can('PRODUCTION_VIEW_PROGRAM')}
          />
        </TabsContent>

        <TabsContent value="execute">
          <ExecutePanel
            job={job}
            canExecute={perms.can('PRODUCTION_EXECUTE')}
            canComplete={perms.can('PRODUCTION_COMPLETE')}
            canInspect={perms.can('QC_INSPECT')}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function JobInfo({
  job,
  materialName,
  hsn,
  binNo,
}: {
  job: JobOrder
  materialName?: string
  hsn?: string
  binNo?: string
}) {
  const rows: [string, string][] = [
    ['Ordered Qty', qty(job.orderedQty)],
    ['Planned Qty', qty(job.plannedQty ?? job.orderedQty)],
    ['Produced Qty', qty(produced(job))],
    ['Accepted Qty', qty(job.acceptedQty ?? 0)],
    ['Rejected Qty', qty(job.rejectedQty ?? 0)],
    ['Rework Qty', qty(job.reworkQty ?? 0)],
    ['Remaining (production)', qty(remaining(job))],
    ['Raw Material', materialName ?? '—'],
    ['HSN', hsn ?? '—'],
    ['Bin No', binNo ?? '—'],
    ['Order Date', fmtDate(job.orderDate)],
    ['Due Date', fmtDate(job.dueDate)],
    ['Operator', job.operator ?? '—'],
  ]
  return (
    <Card>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-2xs uppercase tracking-wide text-slate-400">{k}</dt>
            <dd className="text-sm font-medium text-slate-800">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

function ExecutePanel({
  job,
  canExecute,
  canComplete,
  canInspect,
}: {
  job: JobOrder
  canExecute: boolean
  canComplete: boolean
  canInspect: boolean
}) {
  const transition = useTransitionJob()
  const toast = useToast()
  const [modal, setModal] = useState<{ to: JobStatus; title: string } | null>(null)
  const [qtyVal, setQtyVal] = useState('')
  const [note, setNote] = useState('')

  async function go(to: JobStatus, opts?: { completedQty?: number; note?: string }) {
    try {
      await transition.mutateAsync({ id: job.id, to, opts })
      toast.success(`Job moved to ${to}`)
      setModal(null)
      setQtyVal('')
      setNote('')
    } catch (ex) {
      toast.error(toUserMessage(ex))
    }
  }

  function submitModal() {
    if (!modal) return
    const n = Number(qtyVal)
    if (modal.to === 'Completed') {
      if (!Number.isFinite(n) || n <= 0) {
        toast.error('Enter a valid produced quantity.')
        return
      }
      void go('Completed', { completedQty: n, note: note || undefined })
    } else if (modal.to === 'In Progress') {
      void go('In Progress', {
        completedQty: Number.isFinite(n) && n > 0 ? n : undefined,
        note: note || undefined,
      })
    }
  }

  const s = job.status
  return (
    <Card>
      <div className="mb-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Ordered" value={qty(job.orderedQty)} />
        <Stat label="Produced" value={qty(produced(job))} />
        <Stat label="Remaining" value={qty(remaining(job))} />
        <Stat label="Status" value={job.status} />
      </div>

      {!canExecute && !canComplete && (
        <p className="text-sm text-slate-500">You do not have permission to execute production.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {canExecute && (s === 'Pending' || s === 'On Hold' || s === 'Rework') && (
          <button
            className="btn-primary btn-sm"
            onClick={() => go('In Progress')}
            disabled={transition.isPending}
          >
            <Play className="mr-1 h-4 w-4" />
            Start production
          </button>
        )}
        {canExecute && s === 'In Progress' && (
          <>
            <button
              className="btn-secondary btn-sm"
              onClick={() => setModal({ to: 'In Progress', title: 'Update produced quantity' })}
            >
              Update produced qty
            </button>
            <button
              className="btn-secondary btn-sm"
              onClick={() => go('On Hold')}
              disabled={transition.isPending}
            >
              <Pause className="mr-1 h-4 w-4" />
              Hold
            </button>
          </>
        )}
        {canComplete && s === 'In Progress' && (
          <button
            className="btn-primary btn-sm"
            onClick={() => setModal({ to: 'Completed', title: 'Complete production' })}
          >
            <CheckCircle2 className="mr-1 h-4 w-4" />
            Complete production
          </button>
        )}
        {s === 'Completed' &&
          (canInspect ? (
            <button
              className="btn-primary btn-sm"
              onClick={() => go('Quality Control')}
              disabled={transition.isPending}
            >
              <ClipboardCheck className="mr-1 h-4 w-4" />
              Move to Quality Control
            </button>
          ) : (
            <p className="text-sm text-slate-500">Production complete — awaiting QC.</p>
          ))}
        {[
          'Quality Control',
          'QC Approved',
          'QC Rejected',
          'Ready for Dispatch',
          'Delivered',
        ].includes(s) && (
          <p className="text-sm text-slate-500">
            This job has moved past production (status: {s}). See the QC / Finished Goods screens.
          </p>
        )}
      </div>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.title ?? ''}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={submitModal} disabled={transition.isPending}>
              Confirm
            </button>
          </>
        }
      >
        <Field label="Produced quantity" required hint={`Ordered ${qty(job.orderedQty)}`}>
          <Input type="number" min={0} value={qtyVal} onChange={(e) => setQtyVal(e.target.value)} />
        </Field>
        <Field label="Note" className="mt-3">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Modal>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-2xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  )
}
