import { useMemo, useState } from 'react'
import { BarChart3, Download } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Card, Select } from '@/components/ui/primitives'
import { downloadXlsx, type XlsxColumn } from '@/lib/xlsx'
import { fmtDate } from '@/lib/format'
import {
  useAttendance,
  useDepartments,
  useDesignations,
  useEmployees,
  useLeaveApplications,
} from '../hooks/useHrm'
import { usePermissions } from '../permissions'
import { employeeName } from '../components/employeeUi'

type ReportKey = 'employees' | 'headcount' | 'leave' | 'attendance'

const REPORTS: { key: ReportKey; label: string }[] = [
  { key: 'employees', label: 'Employee Master' },
  { key: 'headcount', label: 'Headcount by Department' },
  { key: 'leave', label: 'Leave Report' },
  { key: 'attendance', label: 'Attendance Report' },
]

export function HrReportsPage() {
  const employees = useEmployees().data ?? []
  const departments = useDepartments().list.data ?? []
  const designations = useDesignations().list.data ?? []
  const applications = useLeaveApplications().data ?? []
  const attendance = useAttendance().list.data ?? []
  const perms = usePermissions()
  const canExport = perms.can('REPORT_EXPORT')

  const [report, setReport] = useState<ReportKey>('employees')

  const deptName = (id?: string) => departments.find((d) => d.id === id)?.name ?? '—'
  const desgName = (id?: string) => designations.find((d) => d.id === id)?.name ?? '—'
  const empName = (id: string) => {
    const e = employees.find((x) => x.id === id)
    return e ? employeeName(e) : id
  }

  const { rows, columns } = useMemo(() => {
    switch (report) {
      case 'headcount': {
        const counts = new Map<string, number>()
        for (const e of employees) {
          const k = e.departmentId ?? 'none'
          counts.set(k, (counts.get(k) ?? 0) + 1)
        }
        const data = Array.from(counts.entries()).map(([id, count]) => ({
          department: id === 'none' ? 'Unassigned' : deptName(id),
          count,
        }))
        const cols: (DataTableColumn<(typeof data)[number]> & XlsxColumn<(typeof data)[number]>)[] =
          [
            {
              key: 'department',
              header: 'Department',
              render: (r) => r.department,
              value: (r) => r.department,
            },
            {
              key: 'count',
              header: 'Headcount',
              render: (r) => r.count,
              value: (r) => r.count,
              cellClassName: 'tnum',
            },
          ]
        return { rows: data, columns: cols }
      }
      case 'leave': {
        const data = applications.map((a) => ({
          employee: empName(a.employeeId),
          start: a.startDate,
          end: a.endDate,
          days: a.days,
          status: a.status,
        }))
        const cols: (DataTableColumn<(typeof data)[number]> & XlsxColumn<(typeof data)[number]>)[] =
          [
            {
              key: 'employee',
              header: 'Employee',
              render: (r) => r.employee,
              value: (r) => r.employee,
            },
            {
              key: 'start',
              header: 'From',
              render: (r) => fmtDate(r.start),
              value: (r) => r.start,
            },
            { key: 'end', header: 'To', render: (r) => fmtDate(r.end), value: (r) => r.end },
            {
              key: 'days',
              header: 'Days',
              render: (r) => r.days,
              value: (r) => r.days,
              cellClassName: 'tnum',
            },
            { key: 'status', header: 'Status', render: (r) => r.status, value: (r) => r.status },
          ]
        return { rows: data, columns: cols }
      }
      case 'attendance': {
        const data = attendance.map((a) => ({
          employee: empName(a.employeeId),
          date: a.attendanceDate,
          status: a.status,
          hours: a.totalMinutes ? (a.totalMinutes / 60).toFixed(1) : '',
        }))
        const cols: (DataTableColumn<(typeof data)[number]> & XlsxColumn<(typeof data)[number]>)[] =
          [
            {
              key: 'employee',
              header: 'Employee',
              render: (r) => r.employee,
              value: (r) => r.employee,
            },
            { key: 'date', header: 'Date', render: (r) => fmtDate(r.date), value: (r) => r.date },
            { key: 'status', header: 'Status', render: (r) => r.status, value: (r) => r.status },
            {
              key: 'hours',
              header: 'Hours',
              render: (r) => r.hours,
              value: (r) => r.hours,
              cellClassName: 'tnum',
            },
          ]
        return { rows: data, columns: cols }
      }
      default: {
        const data = employees.map((e) => ({
          code: e.employeeCode,
          name: employeeName(e),
          department: deptName(e.departmentId),
          designation: desgName(e.designationId),
          type: e.employmentType ?? '',
          joined: e.dateOfJoining ?? '',
          status: e.status,
        }))
        const cols: (DataTableColumn<(typeof data)[number]> & XlsxColumn<(typeof data)[number]>)[] =
          [
            {
              key: 'code',
              header: 'Code',
              render: (r) => r.code,
              value: (r) => r.code,
              cellClassName: 'font-mono text-xs',
            },
            { key: 'name', header: 'Name', render: (r) => r.name, value: (r) => r.name },
            {
              key: 'department',
              header: 'Department',
              render: (r) => r.department,
              value: (r) => r.department,
            },
            {
              key: 'designation',
              header: 'Designation',
              render: (r) => r.designation,
              value: (r) => r.designation,
            },
            { key: 'type', header: 'Type', render: (r) => r.type, value: (r) => r.type },
            {
              key: 'joined',
              header: 'Joined',
              render: (r) => (r.joined ? fmtDate(r.joined) : '—'),
              value: (r) => r.joined,
            },
            { key: 'status', header: 'Status', render: (r) => r.status, value: (r) => r.status },
          ]
        return { rows: data, columns: cols }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, employees, departments, designations, applications, attendance])

  const label = REPORTS.find((r) => r.key === report)!.label

  return (
    <div>
      <PageHeader
        title="HR Reports"
        subtitle="Workforce, attendance and leave reporting with Excel export"
        actions={
          canExport && (
            <button
              className="btn-primary btn-sm"
              onClick={() =>
                downloadXlsx(
                  label.replace(/\s+/g, '-').toLowerCase(),
                  rows as never[],
                  columns as XlsxColumn<never>[],
                  label,
                )
              }
            >
              <Download size={16} /> Export Excel
            </button>
          )
        }
      />

      <Card className="mb-3 p-3">
        <Select
          className="w-64"
          value={report}
          onChange={(e) => setReport(e.target.value as ReportKey)}
          aria-label="Report"
        >
          {REPORTS.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </Select>
      </Card>

      <Card>
        <DataTable
          columns={columns as DataTableColumn<never>[]}
          rows={rows as never[]}
          rowKey={(r) => JSON.stringify(r)}
          empty={{
            icon: <BarChart3 size={40} />,
            title: 'No data',
            description: 'Nothing to report for the current selection.',
          }}
        />
      </Card>
    </div>
  )
}
