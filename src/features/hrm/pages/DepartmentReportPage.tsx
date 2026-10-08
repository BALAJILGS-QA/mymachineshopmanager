'use client'

import { useMemo } from 'react'
import { Building2, ClipboardCheck, Clock, Factory, Users } from 'lucide-react'
import { useDepartments, useEmployees } from '../hooks/useHrm'
import { useAllLabor } from '@/features/labor/hooks/useLabor'
import { useAllJobOperations } from '@/features/jobs/hooks/useJobOperations'
import { useAllInspections } from '@/features/qc/hooks/useQc'
import { PageHeader } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { summarizeLabor } from '@/data/computations'
import { qty } from '@/lib/format'

const UNASSIGNED = 'Unassigned'

interface DeptRow {
  id: string
  name: string
  headcount: number
  laborMin: number
  opsDone: number
  producedQty: number
  qcAccepted: number
  qcRejected: number
  qcRework: number
}

function hrs(min: number): string {
  const h = min / 60
  return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`
}

// Cross-module rollup by HRM department. Everything is attributed through the
// employee link: labor via the session's employee, production via an operation's
// operator, QC via the inspection's inspector. Headcount = active employees.
export function DepartmentReportPage() {
  const { data: departments = [] } = useDepartments().list
  const { data: employees = [] } = useEmployees()
  const { data: logs = [] } = useAllLabor()
  const { data: ops = [] } = useAllJobOperations()
  const { data: inspections = [] } = useAllInspections()

  const now = Date.now()
  const deptOfEmp = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of employees) m.set(e.id, e.departmentId || UNASSIGNED)
    return m
  }, [employees])
  const deptName = (id: string) =>
    id === UNASSIGNED ? UNASSIGNED : (departments.find((d) => d.id === id)?.name ?? id)

  const rows = useMemo<DeptRow[]>(() => {
    const acc = new Map<string, DeptRow>()
    const ensure = (deptId: string): DeptRow => {
      let r = acc.get(deptId)
      if (!r) {
        r = {
          id: deptId,
          name: deptName(deptId),
          headcount: 0,
          laborMin: 0,
          opsDone: 0,
          producedQty: 0,
          qcAccepted: 0,
          qcRejected: 0,
          qcRework: 0,
        }
        acc.set(deptId, r)
      }
      return r
    }

    // Headcount (active employees)
    for (const e of employees) {
      if (String(e.status).toLowerCase() !== 'active') continue
      ensure(e.departmentId || UNASSIGNED).headcount += 1
    }

    // Labor hours via the session's employee department
    const summary = summarizeLabor(logs, now)
    for (const [empId, min] of Object.entries(summary.byEmployee)) {
      ensure(deptOfEmp.get(empId) ?? UNASSIGNED).laborMin += min
    }

    // Production: completed operations attributed to the operator's department
    for (const o of ops) {
      if (o.status !== 'Completed' || !o.operatorEmployeeId) continue
      const r = ensure(deptOfEmp.get(o.operatorEmployeeId) ?? UNASSIGNED)
      r.opsDone += 1
      r.producedQty += o.qtyCompleted ?? 0
    }

    // QC results attributed to the inspector's department
    for (const i of inspections) {
      if (!i.inspectorEmployeeId) continue
      const r = ensure(deptOfEmp.get(i.inspectorEmployeeId) ?? UNASSIGNED)
      r.qcAccepted += i.acceptedQty ?? 0
      r.qcRejected += i.rejectedQty ?? 0
      r.qcRework += i.reworkQty ?? 0
    }

    return [...acc.values()].sort((a, b) => b.laborMin - a.laborMin || b.headcount - a.headcount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, logs, ops, inspections, departments, deptOfEmp, now])

  const totals = useMemo(
    () => ({
      depts: rows.filter((r) => r.id !== UNASSIGNED).length,
      headcount: rows.reduce((s, r) => s + r.headcount, 0),
      laborMin: rows.reduce((s, r) => s + r.laborMin, 0),
      produced: rows.reduce((s, r) => s + r.producedQty, 0),
    }),
    [rows],
  )

  const columns: DataTableColumn<DeptRow>[] = [
    {
      key: 'name',
      header: 'Department',
      cellClassName: 'font-semibold text-slate-800',
      render: (r) => r.name,
    },
    {
      key: 'headcount',
      header: 'Headcount',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      render: (r) => r.headcount,
    },
    {
      key: 'labor',
      header: 'Labor hrs',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      render: (r) => hrs(r.laborMin),
    },
    {
      key: 'ops',
      header: 'Ops done',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      hideBelow: 'md',
      render: (r) => r.opsDone,
    },
    {
      key: 'produced',
      header: 'Produced',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      hideBelow: 'md',
      render: (r) => qty(r.producedQty),
    },
    {
      key: 'qc',
      header: 'QC acc / rej / rwk',
      headerClassName: 'text-right',
      cellClassName: 'text-right tabular-nums',
      render: (r) => `${qty(r.qcAccepted)} / ${qty(r.qcRejected)} / ${qty(r.qcRework)}`,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Department Overview"
        subtitle="Cross-module rollup by HRM department — headcount, labor, production and QC"
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<Building2 size={18} />}
          tone="cyan"
          label="Departments"
          value={totals.depts}
        />
        <StatTile
          icon={<Users size={18} />}
          tone="blue"
          label="Active headcount"
          value={totals.headcount}
        />
        <StatTile
          icon={<Clock size={18} />}
          tone="green"
          label="Labor hours"
          value={hrs(totals.laborMin)}
        />
        <StatTile
          icon={<Factory size={18} />}
          tone="purple"
          label="Produced (ops)"
          value={qty(totals.produced)}
        />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={{
          icon: <ClipboardCheck className="h-6 w-6" />,
          title: 'No department activity yet',
          description:
            'Assign employees to departments and record labor, production or QC to populate this view.',
        }}
      />
      <p className="mt-3 text-2xs text-slate-400">
        Attribution: labor via the session operator, production via the operation operator, QC via
        the inspector — all through the employee&rsquo;s department. Rows without a department show
        as Unassigned.
      </p>
    </div>
  )
}
