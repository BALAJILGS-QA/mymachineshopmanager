'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, Cpu, Play, Square, Timer, Users } from 'lucide-react'
import type { Employee } from '@/features/hrm/types'
import type { JobOperation, LaborActivity } from '@/types'
import { useEmployees } from '@/features/hrm/hooks/useHrm'
import { useMachines } from '@/features/masters/hooks/useMasters'
import { useJobs } from '@/features/jobs/hooks/useJobs'
import { useAllJobOperations } from '@/features/jobs/hooks/useJobOperations'
import { useOpenLabor, useClockIn, useClockOut } from './hooks/useLabor'
import { usePermissions } from '@/features/hrm/permissions'
import { PageHeader } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { Card, EmptyState, Field, Select, Input, Badge } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { AppLink } from '@/components/nav/app-link'
import { toUserMessage } from '@/lib/api/errors'

const ACTIVITIES: LaborActivity[] = ['Run', 'Setup', 'Idle', 'Downtime', 'QC', 'Rework']

function empName(e?: Employee): string {
  if (!e) return '—'
  return e.displayName || [e.firstName, e.lastName].filter(Boolean).join(' ') || e.employeeCode
}

function activityTone(a: string): string {
  return a === 'Run'
    ? 'green'
    : a === 'Downtime'
      ? 'red'
      : a === 'Idle'
        ? 'slate'
        : a === 'QC'
          ? 'blue'
          : 'amber'
}

// Live elapsed ticker, refreshed every second.
function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

function elapsed(startIso: string, now: number): string {
  const secs = Math.max(0, Math.floor((now - new Date(startIso).getTime()) / 1000))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function ShopFloorPage() {
  const perms = usePermissions()
  const canLog = perms.can('LABOR_LOG')
  const { data: open = [], isLoading } = useOpenLabor()
  const { data: employees = [] } = useEmployees()
  const { data: machines = [] } = useMachines()
  const { data: jobs = [] } = useJobs()
  const clockOut = useClockOut()
  const toast = useToast()
  const now = useNow()
  const [clocking, setClocking] = useState(false)

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees])
  const machineName = (id?: string) => machines.find((m) => m.id === id)?.name
  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])

  const kpis = useMemo(() => {
    const operators = new Set(open.map((l) => l.employeeId)).size
    const running = open.filter((l) => l.activity === 'Run').length
    const down = open.filter((l) => l.activity === 'Downtime').length
    return { sessions: open.length, operators, running, down }
  }, [open])

  return (
    <div>
      <PageHeader
        title="Shop Floor"
        subtitle="Live view of who is working — operators, machines and elapsed time"
        actions={
          canLog ? (
            <button className="btn-primary btn-sm" onClick={() => setClocking(true)}>
              <Play className="mr-1 h-4 w-4" /> Clock in
            </button>
          ) : undefined
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<Users size={18} />}
          tone="blue"
          label="Active operators"
          value={kpis.operators}
        />
        <StatTile icon={<Activity size={18} />} tone="green" label="Running" value={kpis.running} />
        <StatTile
          icon={<Timer size={18} />}
          tone="orange"
          label="Open sessions"
          value={kpis.sessions}
        />
        <StatTile
          icon={<Cpu size={18} />}
          tone={kpis.down > 0 ? 'red' : 'slate'}
          label="Downtime"
          value={kpis.down}
        />
      </div>

      {isLoading ? (
        <p className="p-4 text-sm text-slate-500">Loading shop floor…</p>
      ) : open.length === 0 ? (
        <EmptyState
          icon={<Timer className="h-6 w-6" />}
          title="No one clocked in"
          description={
            canLog
              ? 'Clock an operator onto an operation to start tracking time.'
              : 'Active work sessions will appear here in real time.'
          }
        />
      ) : (
        <div className="space-y-2">
          {open.map((l) => {
            const job = l.jobId ? jobById.get(l.jobId) : undefined
            return (
              <Card key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-[10rem] flex-1">
                  <p className="font-semibold text-slate-800">
                    {empName(empById.get(l.employeeId))}
                  </p>
                  <p className="text-2xs text-slate-500">
                    {job ? (
                      <AppLink
                        to={`/app/jobs/${job.id}`}
                        className="text-brand-600 hover:underline"
                      >
                        {job.jobNo}
                      </AppLink>
                    ) : (
                      '—'
                    )}
                    {machineName(l.machineId) ? ` · ${machineName(l.machineId)}` : ''}
                  </p>
                </div>
                <Badge tone={activityTone(l.activity)}>{l.activity}</Badge>
                <span className="tabular-nums font-mono text-sm font-semibold text-slate-700">
                  {elapsed(l.startedAt, now)}
                </span>
                {canLog && (
                  <button
                    className="btn-secondary btn-sm"
                    onClick={async () => {
                      try {
                        await clockOut.mutateAsync({ id: l.id })
                        toast.success('Clocked out')
                      } catch (e) {
                        toast.error(toUserMessage(e, 'Clock-out failed'))
                      }
                    }}
                  >
                    <Square className="mr-1 h-3.5 w-3.5" /> Clock out
                  </button>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {clocking && <ClockInModal employees={employees} onClose={() => setClocking(false)} />}
    </div>
  )
}

function ClockInModal({ employees, onClose }: { employees: Employee[]; onClose: () => void }) {
  const { data: allOps = [] } = useAllJobOperations()
  const { data: jobs = [] } = useJobs()
  const { data: machines = [] } = useMachines()
  const clockIn = useClockIn()
  const toast = useToast()
  const [employeeId, setEmployeeId] = useState('')
  const [jobOperationId, setOp] = useState('')
  const [machineId, setMachine] = useState('')
  const [activity, setActivity] = useState<LaborActivity>('Run')
  const [note, setNote] = useState('')

  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])
  // Operations on active orders that are being worked (not completed/skipped).
  const ops = useMemo(
    () =>
      allOps
        .filter((o) => o.status !== 'Completed' && o.status !== 'Skipped')
        .filter((o) => {
          const j = jobById.get(o.jobId)
          return j && !['Delivered', 'Cancelled', 'Draft'].includes(j.status)
        }),
    [allOps, jobById],
  )

  const opLabel = (o: JobOperation) => {
    const j = jobById.get(o.jobId)
    return `${j?.jobNo ?? o.jobId} · ${o.seq} ${o.operationName ?? ''}`.trim()
  }

  async function save() {
    if (!employeeId) return toast.error('Pick an operator')
    const op = ops.find((o) => o.id === jobOperationId)
    try {
      await clockIn.mutateAsync({
        employeeId,
        jobOperationId: jobOperationId || undefined,
        jobId: op?.jobId,
        machineId: machineId || op?.machineId || undefined,
        activity,
        note: note.trim() || undefined,
      })
      toast.success('Clocked in')
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Clock-in failed'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Clock in"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={clockIn.isPending}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={clockIn.isPending}>
            {clockIn.isPending ? 'Starting…' : 'Clock in'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3">
        <Field label="Operator" required>
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">— select operator —</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {empName(e)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Operation" hint="Optional — sets the order & machine">
          <Select value={jobOperationId} onChange={(e) => setOp(e.target.value)}>
            <option value="">— none —</option>
            {ops.map((o) => (
              <option key={o.id} value={o.id}>
                {opLabel(o)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Activity">
            <Select value={activity} onChange={(e) => setActivity(e.target.value as LaborActivity)}>
              {ACTIVITIES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Machine" hint="Optional">
            <Select value={machineId} onChange={(e) => setMachine(e.target.value)}>
              <option value="">— default —</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
