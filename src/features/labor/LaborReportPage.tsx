'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Clock, Cpu, Timer, Users } from 'lucide-react'
import type { Employee } from '@/features/hrm/types'
import { useAllLabor } from './hooks/useLabor'
import { useEmployees, useDepartments } from '@/features/hrm/hooks/useHrm'
import { useMachines } from '@/features/masters/hooks/useMasters'
import { PageHeader } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { Card, EmptyState, Field, Input } from '@/components/ui/primitives'
import { summarizeLabor } from '@/data/computations'

function hrs(min: number): string {
  const h = min / 60
  return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`
}
function empName(e?: Employee): string {
  if (!e) return '—'
  return e.displayName || [e.firstName, e.lastName].filter(Boolean).join(' ') || e.employeeCode
}
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export function LaborReportPage() {
  const [from, setFrom] = useState(daysAgo(7))
  const [to, setTo] = useState(daysAgo(0))
  const { data: logs = [], isLoading } = useAllLabor(from, to)
  const { data: employees = [] } = useEmployees()
  const { data: machines = [] } = useMachines()
  const { data: departments = [] } = useDepartments().list

  const now = Date.now()
  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees])
  const machineName = (id: string) => machines.find((m) => m.id === id)?.name ?? id
  const deptName = (id?: string) => departments.find((d) => d.id === id)?.name ?? 'Unassigned'

  const summary = useMemo(() => summarizeLabor(logs, now), [logs, now])

  // Sessions-per-employee (for the operator table) + department rollup.
  const sessionsByEmp = useMemo(() => {
    const m: Record<string, number> = {}
    for (const l of logs) m[l.employeeId] = (m[l.employeeId] ?? 0) + 1
    return m
  }, [logs])

  const byDept = useMemo(() => {
    const m: Record<string, number> = {}
    for (const [empId, min] of Object.entries(summary.byEmployee)) {
      const dept = deptName(empById.get(empId)?.departmentId)
      m[dept] = (m[dept] ?? 0) + min
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, empById, departments])

  const byEmp = Object.entries(summary.byEmployee).sort((a, b) => b[1] - a[1])
  const byMachine = Object.entries(summary.byMachine).sort((a, b) => b[1] - a[1])
  const byActivity = Object.entries(summary.byActivity).sort((a, b) => b[1] - a[1])
  const byDowntime = Object.entries(summary.byDowntimeReason).sort((a, b) => b[1] - a[1])

  return (
    <div>
      <PageHeader
        title="Labor & Utilization Report"
        subtitle="Worked hours by operator, machine, department and activity"
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="From" className="w-40">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" className="w-40">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<Clock size={18} />}
          tone="blue"
          label="Total hours"
          value={hrs(summary.totalMin)}
        />
        <StatTile
          icon={<Timer size={18} />}
          tone="green"
          label="Run hours"
          value={hrs(summary.runMin)}
          hint={`setup ${hrs(summary.setupMin)}`}
        />
        <StatTile
          icon={<AlertTriangle size={18} />}
          tone={summary.downtimeMin > 0 ? 'red' : 'slate'}
          label="Downtime"
          value={hrs(summary.downtimeMin)}
        />
        <StatTile
          icon={<Users size={18} />}
          tone="purple"
          label="Sessions"
          value={summary.sessions}
          hint={`${summary.openSessions} open`}
        />
      </div>

      {isLoading ? (
        <p className="p-4 text-sm text-slate-500">Loading…</p>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<Timer className="h-6 w-6" />}
          title="No labor recorded in this period"
          description="Clock operators in on the Shop Floor to build the report."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RollupCard title="Hours by operator" icon={<Users size={16} />}>
            {byEmp.map(([id, min]) => {
              const e = empById.get(id)
              return (
                <Row
                  key={id}
                  label={empName(e)}
                  sub={`${deptName(e?.departmentId)} · ${sessionsByEmp[id] ?? 0} session(s)`}
                  value={hrs(min)}
                />
              )
            })}
          </RollupCard>

          <RollupCard title="Hours by department" icon={<Users size={16} />}>
            {byDept.map(([dept, min]) => (
              <Row key={dept} label={dept} value={hrs(min)} />
            ))}
          </RollupCard>

          <RollupCard title="Hours by machine" icon={<Cpu size={16} />}>
            {byMachine.length === 0 ? (
              <p className="text-2xs text-slate-400">No machine assigned on these sessions.</p>
            ) : (
              byMachine.map(([id, min]) => (
                <Row key={id} label={machineName(id)} value={hrs(min)} />
              ))
            )}
          </RollupCard>

          <RollupCard title="Hours by activity" icon={<Clock size={16} />}>
            {byActivity.map(([a, min]) => (
              <Row key={a} label={a} value={hrs(min)} />
            ))}
            {byDowntime.length > 0 && (
              <div className="mt-2 border-t border-slate-100 pt-2">
                <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-slate-400">
                  Downtime reasons
                </p>
                {byDowntime.map(([r, min]) => (
                  <Row key={r} label={r} value={hrs(min)} tone="red" />
                ))}
              </div>
            )}
          </RollupCard>
        </div>
      )}
    </div>
  )
}

function RollupCard({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <span className="text-slate-400">{icon}</span>
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </Card>
  )
}

function Row({
  label,
  sub,
  value,
  tone,
}: {
  label: string
  sub?: string
  value: string
  tone?: 'red'
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-50 py-1 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-sm text-slate-700">{label}</p>
        {sub && <p className="truncate text-2xs text-slate-400">{sub}</p>}
      </div>
      <span
        className={`tabular-nums text-sm font-semibold ${tone === 'red' ? 'text-red-600' : 'text-slate-800'}`}
      >
        {value}
      </span>
    </div>
  )
}
