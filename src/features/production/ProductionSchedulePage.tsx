'use client'

import { useMemo } from 'react'
import { CalendarClock, Clock, Cpu, Factory, Layers } from 'lucide-react'
import type { JobOperation, JobOrder } from '@/types'
import { useJobs } from '@/features/jobs/hooks/useJobs'
import { useAllJobOperations } from '@/features/jobs/hooks/useJobOperations'
import { useWorkCenters } from '@/features/masters/hooks/useMasters'
import { useCompanyName } from '@/features/shared/lookups'
import { PageHeader } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { Card, EmptyState, Badge } from '@/components/ui/primitives'
import { AppLink } from '@/components/nav/app-link'
import { toUserMessage } from '@/lib/api/errors'
import { fmtDate } from '@/lib/format'

// Scheduled work = operations that are not yet finished, on orders that are
// still active. Estimated load = setup + cycle × planned quantity.
const DONE_OPS = ['Completed', 'Skipped']
const INACTIVE_JOBS = ['Delivered', 'Cancelled', 'Draft']

interface ScheduledOp {
  op: JobOperation
  job: JobOrder
  estMin: number
}

function estimateMinutes(op: JobOperation, job: JobOrder): number {
  const planned = job.plannedQty ?? job.orderedQty ?? 0
  return (op.setupMin ?? 0) + (op.cycleMin ?? 0) * planned
}

function fmtHours(min: number): string {
  if (min <= 0) return '0h'
  const h = min / 60
  return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`
}

function opTone(status: string): string {
  return status === 'In Progress' ? 'blue' : status === 'Planned' ? 'slate' : 'gray'
}

export function ProductionSchedulePage() {
  const { data: jobs = [], isLoading: lj, isError, error } = useJobs()
  const { data: allOps = [], isLoading: lo } = useAllJobOperations()
  const { data: workCenters = [] } = useWorkCenters()
  const companyName = useCompanyName()

  const jobById = useMemo(() => {
    const m = new Map<string, JobOrder>()
    for (const j of jobs) m.set(j.id, j)
    return m
  }, [jobs])

  // Pending/in-progress operations on active orders.
  const scheduled = useMemo<ScheduledOp[]>(() => {
    return allOps
      .filter((op) => !DONE_OPS.includes(op.status))
      .map((op) => ({ op, job: jobById.get(op.jobId) }))
      .filter((x): x is { op: JobOperation; job: JobOrder } => !!x.job)
      .filter((x) => !INACTIVE_JOBS.includes(x.job.status))
      .map((x) => ({ ...x, estMin: estimateMinutes(x.op, x.job) }))
  }, [allOps, jobById])

  // Group by work centre (snapshot name on the op; fallback for unassigned).
  const groups = useMemo(() => {
    const byWc = new Map<string, ScheduledOp[]>()
    for (const s of scheduled) {
      const key = s.op.workCenterName || 'Unassigned'
      const arr = byWc.get(key) ?? []
      arr.push(s)
      byWc.set(key, arr)
    }
    // Sort each group's ops by job due date (soonest first), then seq.
    for (const arr of byWc.values()) {
      arr.sort((a, b) => {
        const da = a.job.dueDate ?? '9999'
        const db = b.job.dueDate ?? '9999'
        if (da !== db) return da < db ? -1 : 1
        return a.op.seq - b.op.seq
      })
    }
    // Known work centres first (even if empty is skipped), then Unassigned last.
    return [...byWc.entries()].sort((a, b) => {
      if (a[0] === 'Unassigned') return 1
      if (b[0] === 'Unassigned') return -1
      return a[0].localeCompare(b[0])
    })
  }, [scheduled])

  const kpis = useMemo(() => {
    const totalMin = scheduled.reduce((sum, s) => sum + s.estMin, 0)
    const inProgress = scheduled.filter((s) => s.op.status === 'In Progress').length
    const loadedWcs = new Set(scheduled.map((s) => s.op.workCenterName || 'Unassigned')).size
    return { ops: scheduled.length, totalMin, inProgress, loadedWcs }
  }, [scheduled])

  const isLoading = lj || lo

  return (
    <div>
      <PageHeader
        title="Production Schedule"
        subtitle="Pending and in-progress operations grouped by work centre, with estimated load"
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<Layers size={18} />}
          tone="blue"
          label="Scheduled operations"
          value={kpis.ops}
        />
        <StatTile
          icon={<Clock size={18} />}
          tone="orange"
          label="Estimated load"
          value={fmtHours(kpis.totalMin)}
          hint="setup + cycle × planned qty"
        />
        <StatTile
          icon={<Cpu size={18} />}
          tone="purple"
          label="In progress"
          value={kpis.inProgress}
        />
        <StatTile
          icon={<Factory size={18} />}
          tone="green"
          label="Work centres loaded"
          value={kpis.loadedWcs}
        />
      </div>

      {isError && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <p className="text-sm font-medium text-red-700">{toUserMessage(error)}</p>
        </Card>
      )}

      {isLoading ? (
        <p className="p-4 text-sm text-slate-500">Loading schedule…</p>
      ) : scheduled.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-6 w-6" />}
          title="Nothing scheduled"
          description="Operations appear here once they are attached to active orders (via a routing or ad-hoc) and not yet completed. Define routings under Masters and attach them to a production order."
        />
      ) : (
        <div className="space-y-4">
          {groups.map(([wcName, ops]) => {
            const load = ops.reduce((sum, s) => sum + s.estMin, 0)
            return (
              <Card key={wcName}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Factory className="h-4 w-4 text-slate-400" />
                    {wcName}
                    <span className="text-2xs font-normal text-slate-400">
                      {ops.length} op{ops.length === 1 ? '' : 's'}
                    </span>
                  </h3>
                  <span className="text-xs font-semibold text-slate-600">{fmtHours(load)}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-2xs uppercase tracking-wide text-slate-400">
                        <th className="py-1 pr-3">Due</th>
                        <th className="py-1 pr-3">Order</th>
                        <th className="py-1 pr-3">Customer</th>
                        <th className="py-1 pr-3">Operation</th>
                        <th className="py-1 pr-3">Machine</th>
                        <th className="py-1 pr-3 text-right">Est.</th>
                        <th className="py-1 pr-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ops.map(({ op, job, estMin }) => (
                        <tr key={op.id} className="border-t border-slate-100">
                          <td className="py-1.5 pr-3 whitespace-nowrap text-slate-600">
                            {job.dueDate ? fmtDate(job.dueDate) : '—'}
                          </td>
                          <td className="py-1.5 pr-3">
                            <AppLink
                              to={`/app/jobs/${job.id}`}
                              className="font-mono text-xs text-brand-600 hover:underline"
                            >
                              {job.jobNo}
                            </AppLink>
                          </td>
                          <td className="py-1.5 pr-3 text-slate-600">
                            {companyName(job.companyId)}
                          </td>
                          <td className="py-1.5 pr-3 font-medium text-slate-800">
                            <span className="mr-1 font-mono text-2xs text-slate-400">{op.seq}</span>
                            {op.operationName || '—'}
                          </td>
                          <td className="py-1.5 pr-3 text-slate-600">{op.machineName || '—'}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">
                            {fmtHours(estMin)}
                          </td>
                          <td className="py-1.5 pr-3">
                            <Badge tone={opTone(op.status)}>{op.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {workCenters.length === 0 && !isLoading && (
        <p className="mt-4 text-2xs text-slate-400">
          Tip: create Work Centres and Machines under Masters so operations group by cell.
        </p>
      )}
    </div>
  )
}
