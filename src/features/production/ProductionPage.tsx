import { useMemo, useState } from 'react'
import { Factory, History, Pause, Play, CheckCircle2, Truck } from 'lucide-react'
import type { JobOrder, JobStatus } from '@/types'
import { useJobs, useTransitionJob, useJobEvents } from '@/features/jobs/hooks/useJobs'
import { toUserMessage } from '@/lib/api/errors'
import { jobPendingQty } from '@/data/computations'
import { fmtDate, fmtDateTime, qty } from '@/lib/format'
import { PageHeader } from '@/components/common/PageHeader'
import { Card, EmptyState, Field, Input, Textarea } from '@/components/ui/primitives'
import {
  CompanyFilter,
  DateRangeFilter,
  FilterBar,
  SearchBox,
  inRange,
} from '@/components/common/Filters'
import { JobStatusBadge, PriorityBadge } from '@/components/common/status'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useCompanyName } from '@/features/shared/lookups'

const ACTIVE_STATUSES: JobStatus[] = ['Pending', 'In Progress', 'On Hold']

export function ProductionPage() {
  const { data: jobs = [] } = useJobs()
  const companyName = useCompanyName()
  const [search, setSearch] = useState('')
  const [company, setCompany] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [showClosed, setShowClosed] = useState(false)
  const [transition, setTransition] = useState<{ job: JobOrder; to: JobStatus } | null>(null)
  const [historyJob, setHistoryJob] = useState<JobOrder | null>(null)

  const queue = useMemo(() => {
    const s = search.toLowerCase()
    const priorityRank = { Urgent: 0, High: 1, Normal: 2, Low: 3 }
    return jobs
      .filter((j) => {
        if (company && j.companyId !== company) return false
        if (!inRange(j.orderDate, from, to)) return false
        if (!showClosed && !ACTIVE_STATUSES.includes(j.status)) return false
        if (showClosed && j.status === 'Draft') return false
        if (s) {
          const hay = `${j.jobNo} ${j.partName}`.toLowerCase()
          if (!hay.includes(s)) return false
        }
        return true
      })
      .sort((a, b) => {
        const pr = priorityRank[a.priority] - priorityRank[b.priority]
        if (pr !== 0) return pr
        return (a.dueDate ?? '9999') < (b.dueDate ?? '9999') ? -1 : 1
      })
  }, [jobs, company, from, to, search, showClosed])

  return (
    <div>
      <PageHeader title="Production Floor" subtitle="Job queue and progress tracking" />

      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search job or part…" />
        <CompanyFilter value={company} onChange={setCompany} />
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Show completed / delivered
        </label>
      </FilterBar>

      {queue.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Factory size={40} />}
            title="Nothing in the queue"
            description="Jobs that are pending, in progress or on hold will appear here."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {queue.map((job) => {
            const pending = jobPendingQty(job.orderedQty, job.completedQty)
            const pct = job.orderedQty
              ? Math.min(100, (job.completedQty / job.orderedQty) * 100)
              : 0
            return (
              <Card key={job.id} className="flex flex-col p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-semibold text-slate-500">{job.jobNo}</p>
                    <p className="text-sm font-semibold text-slate-800">{job.partName}</p>
                    <p className="text-xs text-slate-500">{companyName(job.companyId)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <JobStatusBadge status={job.status} />
                    <PriorityBadge priority={job.priority} />
                  </div>
                </div>

                <div className="mb-2">
                  <div className="mb-1 flex justify-between text-2xs text-slate-500">
                    <span>
                      {qty(job.completedQty)} / {qty(job.orderedQty)} done
                    </span>
                    <span>{qty(pending)} pending</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {job.rejectedQty ? (
                  <p className="mb-2 text-2xs font-medium text-red-600">
                    QC rejected {qty(job.rejectedQty)} · accepted{' '}
                    {qty(Math.max(0, job.completedQty - job.rejectedQty))}
                  </p>
                ) : null}

                <p className="mb-3 text-2xs text-slate-500">Due {fmtDate(job.dueDate)}</p>

                <div className="mt-auto flex flex-wrap gap-1.5">
                  {(job.status === 'Pending' || job.status === 'On Hold') && (
                    <button
                      className="btn-primary btn-sm"
                      onClick={() => setTransition({ job, to: 'In Progress' })}
                    >
                      <Play size={14} /> Start
                    </button>
                  )}
                  {job.status === 'In Progress' && (
                    <>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => setTransition({ job, to: 'In Progress' })}
                      >
                        Update qty
                      </button>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => setTransition({ job, to: 'On Hold' })}
                      >
                        <Pause size={14} /> Hold
                      </button>
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => setTransition({ job, to: 'Completed' })}
                      >
                        <CheckCircle2 size={14} /> Complete
                      </button>
                    </>
                  )}
                  {job.status === 'Completed' && (
                    <button
                      className="btn-primary btn-sm"
                      onClick={() => setTransition({ job, to: 'Delivered' })}
                    >
                      <Truck size={14} /> Deliver
                    </button>
                  )}
                  <button className="btn-ghost btn-sm" onClick={() => setHistoryJob(job)}>
                    <History size={14} /> History
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {transition && (
        <TransitionModal
          job={transition.job}
          to={transition.to}
          onClose={() => setTransition(null)}
        />
      )}
      {historyJob && <HistoryModal job={historyJob} onClose={() => setHistoryJob(null)} />}
    </div>
  )
}

function TransitionModal({
  job,
  to,
  onClose,
}: {
  job: JobOrder
  to: JobStatus
  onClose: () => void
}) {
  const toast = useToast()
  const transitionJob = useTransitionJob()
  const [completedQty, setCompletedQty] = useState(String(job.completedQty))
  const [rejectedQty, setRejectedQty] = useState(String(job.rejectedQty ?? 0))
  const [operator, setOperator] = useState(job.operator ?? '')
  const [note, setNote] = useState('')

  const wantsQty = to === 'In Progress' || to === 'Completed'
  const isComplete = to === 'Completed'
  const accepted = Math.max(0, Number(completedQty || 0) - Number(rejectedQty || 0))
  const title =
    to === 'In Progress'
      ? job.status === 'In Progress'
        ? 'Update progress'
        : 'Start job'
      : to === 'On Hold'
        ? 'Put job on hold'
        : to === 'Completed'
          ? 'Complete job'
          : 'Mark delivered'

  async function submit() {
    try {
      await transitionJob.mutateAsync({
        id: job.id,
        to,
        opts: {
          completedQty: wantsQty ? Number(completedQty) : undefined,
          rejectedQty: isComplete ? Number(rejectedQty || 0) : undefined,
          operator: operator || undefined,
          note: note || undefined,
        },
      })
      toast.success(`${job.jobNo}: ${to}`)
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Update failed'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`${title} — ${job.jobNo}`}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={transitionJob.isPending}>
            {transitionJob.isPending ? 'Saving…' : 'Confirm'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          {job.partName} · ordered {qty(job.orderedQty)}
        </p>
        {wantsQty && (
          <Field
            label="Completed quantity"
            hint={`Pending will be ${qty(Math.max(0, job.orderedQty - Number(completedQty || 0)))}`}
          >
            <Input
              type="number"
              step="0.001"
              min={0}
              value={completedQty}
              onChange={(e) => setCompletedQty(e.target.value)}
              autoFocus
            />
          </Field>
        )}
        {isComplete && (
          <Field
            label="QC rejected quantity"
            hint={`Accepted (deliverable) will be ${qty(accepted)}`}
          >
            <Input
              type="number"
              step="0.001"
              min={0}
              value={rejectedQty}
              onChange={(e) => setRejectedQty(e.target.value)}
            />
          </Field>
        )}
        {(to === 'In Progress' || to === 'Completed') && (
          <Field label="Operator (optional)">
            <Input value={operator} onChange={(e) => setOperator(e.target.value)} />
          </Field>
        )}
        <Field label={to === 'On Hold' ? 'Reason' : 'Note (optional)'}>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function HistoryModal({ job, onClose }: { job: JobOrder; onClose: () => void }) {
  const { data: events = [] } = useJobEvents(job.id)
  return (
    <Modal open onClose={onClose} title={`History — ${job.jobNo}`} size="md">
      {events.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No events recorded yet.</p>
      ) : (
        <ol className="relative space-y-4 border-l border-slate-200 pl-4">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-white" />
              <div className="flex items-center gap-2">
                {e.toStatus && <JobStatusBadge status={e.toStatus} />}
                <span className="text-2xs text-slate-500">{fmtDateTime(e.at)}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {e.fromStatus && e.toStatus ? `${e.fromStatus} → ${e.toStatus}` : e.type}
                {e.completedQty !== undefined && ` · completed ${qty(e.completedQty)}`}
                {e.operator && ` · ${e.operator}`}
              </p>
              {e.note && <p className="text-xs text-slate-500">“{e.note}”</p>}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  )
}
