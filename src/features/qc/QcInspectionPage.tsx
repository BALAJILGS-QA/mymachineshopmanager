'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, ClipboardCheck, ExternalLink, Plus, Trash2 } from 'lucide-react'
import type { JobOrder, QcDecision, QcDimensionInput } from '@/types'
import { useJobs, useTransitionJob } from '@/features/jobs/hooks/useJobs'
import { useRecordInspection, useJobInspections } from './hooks/useQc'
import { usePermissions } from '@/features/hrm/permissions'
import { useCompanyName } from '@/features/shared/lookups'
import { JobDrawingsPanel } from '@/features/production/components/JobDrawingsPanel'
import { PageHeader } from '@/components/common/PageHeader'
import { Card, EmptyState, Field, Input, Select, Badge } from '@/components/ui/primitives'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/shadcn/tabs'
import { JobStatusBadge } from '@/components/common/status'
import { useToast } from '@/components/ui/Toast'
import { useAppNavigate, AppLink } from '@/components/nav/app-link'
import { toUserMessage } from '@/lib/api/errors'
import { fmtDateTime, qty } from '@/lib/format'

const SAMPLES = Array.from({ length: 10 }, (_, i) => i + 1)

function newDimension(seq: number): QcDimensionInput {
  return {
    seq,
    name: '',
    nominal: undefined,
    unit: 'mm',
    tolPlus: undefined,
    tolMinus: undefined,
    specification: '',
    samples: SAMPLES.map((n) => ({ sampleNo: n, value: undefined })),
  }
}

function num(v: string): number | undefined {
  if (v.trim() === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function samplePass(d: QcDimensionInput, value?: number): boolean | null {
  if (value == null || d.nominal == null) return null
  return value >= d.nominal - (d.tolMinus ?? 0) && value <= d.nominal + (d.tolPlus ?? 0)
}

export function QcInspectionPage({ jobId }: { jobId: string }) {
  const { data: jobs = [], isLoading, isError, error } = useJobs()
  const nav = useAppNavigate()
  const companyName = useCompanyName()
  const perms = usePermissions()
  const job = useMemo(() => jobs.find((j) => j.id === jobId), [jobs, jobId])

  if (isLoading) return <p className="p-6 text-sm text-slate-500">Loading job…</p>
  if (isError) {
    return (
      <Card className="m-4 border-red-200 bg-red-50">
        <p className="text-sm font-medium text-red-700">{toUserMessage(error)}</p>
      </Card>
    )
  }
  if (!job) {
    return (
      <EmptyState
        icon={<ClipboardCheck className="h-6 w-6" />}
        title="Job not found"
        action={
          <button className="btn-secondary btn-sm" onClick={() => nav('/app/qc')}>
            Back to QC
          </button>
        }
      />
    )
  }

  return (
    <div>
      <button className="btn-ghost btn-sm mb-2" onClick={() => nav('/app/qc')}>
        <ArrowLeft className="mr-1 h-4 w-4" />
        QC queue
      </button>
      <PageHeader
        title={`QC · ${job.jobNo}`}
        subtitle={`${companyName(job.companyId)} · ${job.partName}${job.partNumber ? ` · ${job.partNumber}` : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <JobStatusBadge status={job.status} />
            <AppLink to={`/app/jobs/${job.id}`} className="btn-secondary btn-sm">
              <ExternalLink className="mr-1 h-4 w-4" />
              Open order
            </AppLink>
          </div>
        }
      />

      <Tabs defaultValue="inspect">
        <TabsList>
          <TabsTrigger value="inspect">Inspection</TabsTrigger>
          <TabsTrigger value="drawing">Drawing &amp; Dimensions</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="inspect">
          <InspectTab job={job} perms={perms} />
        </TabsContent>
        <TabsContent value="drawing">
          <JobDrawingsPanel job={job} canUpload={false} />
        </TabsContent>
        <TabsContent value="history">
          <InspectionHistory jobId={job.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function InspectTab({ job, perms }: { job: JobOrder; perms: ReturnType<typeof usePermissions> }) {
  const transition = useTransitionJob()
  const record = useRecordInspection()
  const toast = useToast()
  const nav = useAppNavigate()

  const [dimensions, setDimensions] = useState<QcDimensionInput[]>([newDimension(1)])
  const [producedQty, setProducedQty] = useState(String(job.completedQty ?? 0))
  const [acceptedQty, setAcceptedQty] = useState('')
  const [rejectedQty, setRejectedQty] = useState('')
  const [reworkQty, setReworkQty] = useState('')
  const [decision, setDecision] = useState<QcDecision>('Approved')
  const [remarks, setRemarks] = useState('')

  const prod = num(producedQty) ?? 0
  const acc = num(acceptedQty) ?? 0
  const rej = num(rejectedQty) ?? 0
  const rew = num(reworkQty) ?? 0
  const sum = acc + rej + rew
  const balanced = sum === prod && prod > 0

  function patchDim(idx: number, patch: Partial<QcDimensionInput>) {
    setDimensions((ds) => ds.map((d, i) => (i === idx ? { ...d, ...patch } : d)))
  }
  function patchSample(idx: number, sampleNo: number, value?: number) {
    setDimensions((ds) =>
      ds.map((d, i) =>
        i === idx
          ? { ...d, samples: d.samples.map((s) => (s.sampleNo === sampleNo ? { ...s, value } : s)) }
          : d,
      ),
    )
  }

  async function beginQc() {
    try {
      await transition.mutateAsync({ id: job.id, to: 'Quality Control' })
      toast.success('Job moved to Quality Control')
    } catch (ex) {
      toast.error(toUserMessage(ex))
    }
  }

  async function submit() {
    if (!balanced) {
      toast.error('Accepted + Rejected + Rework must equal Produced.')
      return
    }
    try {
      await record.mutateAsync({
        jobId: job.id,
        producedQty: prod,
        acceptedQty: acc,
        rejectedQty: rej,
        reworkQty: rew,
        decision,
        remarks: remarks || undefined,
        dimensions: dimensions.filter((d) => d.name.trim() !== ''),
      })
      toast.success(`QC ${decision} recorded`)
      nav('/app/qc')
    } catch (ex) {
      toast.error(toUserMessage(ex))
    }
  }

  if (job.status === 'Completed') {
    return (
      <Card>
        <p className="mb-3 text-sm text-slate-600">
          This job is production-complete. Begin QC to move it into inspection.
        </p>
        {perms.can('QC_INSPECT') ? (
          <button className="btn-primary btn-sm" onClick={beginQc} disabled={transition.isPending}>
            <ClipboardCheck className="mr-1 h-4 w-4" />
            Begin QC
          </button>
        ) : (
          <p className="text-sm text-slate-500">You do not have permission to start QC.</p>
        )}
      </Card>
    )
  }

  if (job.status !== 'Quality Control') {
    return (
      <Card>
        <p className="text-sm text-slate-500">
          This job is not currently in Quality Control (status: {job.status}). Rework must pass back
          through production before re-inspection.
        </p>
      </Card>
    )
  }

  if (!perms.can('QC_INSPECT')) {
    return (
      <Card>
        <p className="text-sm text-slate-500">
          You do not have permission to enter QC measurements.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">10-Sample Dimensional Inspection</h3>
          <button
            className="btn-ghost btn-sm"
            onClick={() => setDimensions((ds) => [...ds, newDimension(ds.length + 1)])}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add dimension
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="p-1">Dimension</th>
                <th className="p-1">Nominal</th>
                <th className="p-1">Unit</th>
                <th className="p-1">Tol +</th>
                <th className="p-1">Tol −</th>
                {SAMPLES.map((n) => (
                  <th key={n} className="p-1 text-center">
                    S{n}
                  </th>
                ))}
                <th className="p-1"></th>
              </tr>
            </thead>
            <tbody>
              {dimensions.map((d, idx) => (
                <tr key={idx} className="border-b border-slate-100">
                  <td className="p-1">
                    <input
                      className="input-cell w-36"
                      value={d.name}
                      onChange={(e) => patchDim(idx, { name: e.target.value })}
                      placeholder="e.g. Overall Length"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      className="input-cell w-20"
                      inputMode="decimal"
                      value={d.nominal ?? ''}
                      onChange={(e) => patchDim(idx, { nominal: num(e.target.value) })}
                    />
                  </td>
                  <td className="p-1">
                    <input
                      className="input-cell w-14"
                      value={d.unit ?? ''}
                      onChange={(e) => patchDim(idx, { unit: e.target.value })}
                    />
                  </td>
                  <td className="p-1">
                    <input
                      className="input-cell w-16"
                      inputMode="decimal"
                      value={d.tolPlus ?? ''}
                      onChange={(e) => patchDim(idx, { tolPlus: num(e.target.value) })}
                    />
                  </td>
                  <td className="p-1">
                    <input
                      className="input-cell w-16"
                      inputMode="decimal"
                      value={d.tolMinus ?? ''}
                      onChange={(e) => patchDim(idx, { tolMinus: num(e.target.value) })}
                    />
                  </td>
                  {d.samples.map((s) => {
                    const st = samplePass(d, s.value)
                    const tone =
                      st == null ? '' : st ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    return (
                      <td key={s.sampleNo} className="p-1">
                        <input
                          className={`input-cell w-16 text-center ${tone}`}
                          inputMode="decimal"
                          value={s.value ?? ''}
                          onChange={(e) => patchSample(idx, s.sampleNo, num(e.target.value))}
                        />
                      </td>
                    )
                  })}
                  <td className="p-1">
                    {dimensions.length > 1 && (
                      <button
                        className="btn-ghost btn-sm text-red-500"
                        onClick={() => setDimensions((ds) => ds.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-2xs text-slate-400">
          Cells turn green/red against nominal ± tolerance as a guide; pass/fail is recomputed and
          stored server-side.
        </p>
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">QC Summary &amp; Decision</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Produced" required>
            <Input
              type="number"
              min={0}
              value={producedQty}
              onChange={(e) => setProducedQty(e.target.value)}
            />
          </Field>
          <Field label="Accepted" required>
            <Input
              type="number"
              min={0}
              value={acceptedQty}
              onChange={(e) => setAcceptedQty(e.target.value)}
            />
          </Field>
          <Field label="Rejected" required>
            <Input
              type="number"
              min={0}
              value={rejectedQty}
              onChange={(e) => setRejectedQty(e.target.value)}
            />
          </Field>
          <Field label="Rework" required>
            <Input
              type="number"
              min={0}
              value={reworkQty}
              onChange={(e) => setReworkQty(e.target.value)}
            />
          </Field>
        </div>
        <div
          className={`mt-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
            balanced
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          <span className="tabular-nums">
            Accepted {acc} + Rejected {rej} + Rework {rew} = {sum}
          </span>
          <span>
            {balanced
              ? `✓ matches produced (${prod})`
              : `✕ must equal produced (${prod}) before you can record`}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Decision" required>
            <Select value={decision} onChange={(e) => setDecision(e.target.value as QcDecision)}>
              {perms.can('QC_APPROVE') && <option value="Approved">Approve</option>}
              {perms.can('QC_REWORK') && <option value="Rework">Rework</option>}
              {perms.can('QC_REJECT') && <option value="Rejected">Reject</option>}
            </Select>
          </Field>
          <Field label="Remarks">
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </div>
        <div className="mt-3">
          <button
            className="btn-primary btn-sm"
            onClick={submit}
            disabled={record.isPending || !balanced}
          >
            {record.isPending ? 'Saving…' : `Record QC ${decision}`}
          </button>
        </div>
      </Card>
    </div>
  )
}

function InspectionHistory({ jobId }: { jobId: string }) {
  const { data: inspections = [], isLoading } = useJobInspections(jobId)
  if (isLoading)
    return (
      <Card>
        <p className="text-sm text-slate-500">Loading…</p>
      </Card>
    )
  if (inspections.length === 0)
    return (
      <Card>
        <EmptyState icon={<ClipboardCheck className="h-6 w-6" />} title="No inspections yet" />
      </Card>
    )
  return (
    <Card>
      <ul className="divide-y divide-slate-100">
        {inspections.map((i) => (
          <li key={i.id} className="py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-800">{i.inspectionNo ?? i.id}</span>
              <Badge
                tone={
                  i.decision === 'Approved' ? 'green' : i.decision === 'Rework' ? 'violet' : 'red'
                }
              >
                {i.decision}
              </Badge>
            </div>
            <p className="text-2xs text-slate-500">
              {fmtDateTime(i.inspectedAt)} · produced {qty(i.producedQty)} · accepted{' '}
              {qty(i.acceptedQty)} · rejected {qty(i.rejectedQty)} · rework {qty(i.reworkQty)}
              {i.inspector ? ` · ${i.inspector}` : ''}
            </p>
            {i.remarks && <p className="text-2xs italic text-slate-400">{i.remarks}</p>}
          </li>
        ))}
      </ul>
    </Card>
  )
}
