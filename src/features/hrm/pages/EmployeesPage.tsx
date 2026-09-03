import { useMemo, useState } from 'react'
import { Download, Plus, Search, Users } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { Card, Select } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { toUserMessage } from '@/lib/api/errors'
import { fmtDate } from '@/lib/format'
import { AppLink } from '@/components/nav/app-link'
import { downloadXlsx, type XlsxColumn } from '@/lib/xlsx'
import {
  useDepartments,
  useDesignations,
  useEmployeeMutations,
  useEmployees,
  useShifts,
} from '../hooks/useHrm'
import { usePermissions } from '../permissions'
import { EmployeeForm, EMPLOYEE_STATUSES, EMPLOYMENT_TYPES } from '../components/EmployeeForm'
import { EmployeeAvatar, StatusBadge, employeeName } from '../components/employeeUi'
import type { Employee } from '../types'

export function EmployeesPage() {
  const { data: employees = [], isLoading } = useEmployees()
  const departments = useDepartments().list.data ?? []
  const designations = useDesignations().list.data ?? []
  const shifts = useShifts().list.data ?? []
  const { create, update } = useEmployeeMutations()
  const perms = usePermissions()
  const toast = useToast()

  const canCreate = perms.can('EMPLOYEE_CREATE')
  const canEdit = perms.can('EMPLOYEE_EDIT')
  const canExport = perms.can('REPORT_EXPORT') || perms.can('EMPLOYEE_VIEW')

  const [search, setSearch] = useState('')
  const [dept, setDept] = useState('all')
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)

  const deptName = (id?: string) => departments.find((d) => d.id === id)?.name ?? '—'
  const desgName = (id?: string) => designations.find((d) => d.id === id)?.name ?? '—'
  const mgrName = (id?: string) => {
    const m = employees.find((e) => e.id === id)
    return m ? employeeName(m) : '—'
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees.filter((e) => {
      if (dept !== 'all' && e.departmentId !== dept) return false
      if (status !== 'all' && e.status !== status) return false
      if (type !== 'all' && e.employmentType !== type) return false
      if (!q) return true
      return (
        employeeName(e).toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q) ||
        (e.workEmail ?? '').toLowerCase().includes(q) ||
        (e.mobile ?? '').toLowerCase().includes(q)
      )
    })
  }, [employees, search, dept, status, type])

  const pg = usePagination(filtered)

  function openCreate() {
    setEditing(null)
    setDraft({ status: 'active' })
    setOpen(true)
  }
  function openEdit(e: Employee) {
    setEditing(e)
    setDraft({ ...e })
    setOpen(true)
  }

  async function save() {
    if (!String(draft.firstName ?? '').trim()) {
      toast.error('First name is required')
      return
    }
    setSaving(true)
    try {
      if (editing) await update.mutateAsync({ id: editing.id, patch: draft as Partial<Employee> })
      else await create.mutateAsync(draft as Partial<Employee>)
      toast.success(editing ? 'Employee updated' : 'Employee created')
      setOpen(false)
    } catch (e) {
      toast.error(toUserMessage(e, 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  function onExport() {
    const cols: XlsxColumn<Employee>[] = [
      { header: 'Code', value: (e) => e.employeeCode },
      { header: 'Name', value: (e) => employeeName(e) },
      { header: 'Department', value: (e) => deptName(e.departmentId) },
      { header: 'Designation', value: (e) => desgName(e.designationId) },
      { header: 'Manager', value: (e) => mgrName(e.reportingManagerId) },
      { header: 'Type', value: (e) => e.employmentType ?? '' },
      { header: 'Joined', value: (e) => e.dateOfJoining ?? '' },
      { header: 'Status', value: (e) => e.status },
      { header: 'Work Email', value: (e) => e.workEmail ?? '' },
      { header: 'Mobile', value: (e) => e.mobile ?? '' },
    ]
    downloadXlsx('employees', filtered, cols, 'Employees')
  }

  const columns: DataTableColumn<Employee>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (e) => (
        <AppLink
          to={`/app/hrm/employees/${e.id}`}
          className="flex items-center gap-3 hover:opacity-80"
        >
          <EmployeeAvatar employee={e} />
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-800">{employeeName(e)}</div>
            <div className="font-mono text-2xs text-slate-500">{e.employeeCode}</div>
          </div>
        </AppLink>
      ),
    },
    { key: 'dept', header: 'Department', render: (e) => deptName(e.departmentId) },
    { key: 'desg', header: 'Designation', render: (e) => desgName(e.designationId) },
    { key: 'manager', header: 'Manager', render: (e) => mgrName(e.reportingManagerId) },
    {
      key: 'joined',
      header: 'Joined',
      cellClassName: 'whitespace-nowrap tnum text-xs',
      render: (e) => (e.dateOfJoining ? fmtDate(e.dateOfJoining) : '—'),
    },
    {
      key: 'type',
      header: 'Type',
      cellClassName: 'capitalize text-xs',
      render: (e) => (e.employmentType ?? '—').replace('_', ' '),
    },
    { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      render: (e) => (
        <div className="flex justify-end gap-1">
          <AppLink to={`/app/hrm/employees/${e.id}`} className="btn-ghost btn-sm">
            View
          </AppLink>
          {canEdit && (
            <button className="btn-ghost btn-sm" onClick={() => openEdit(e)}>
              Edit
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle="Manage employee records, employment details and HR information"
        actions={
          <div className="flex items-center gap-2">
            {canExport && (
              <button className="btn-secondary btn-sm" onClick={onExport}>
                <Download size={16} /> Export
              </button>
            )}
            {canCreate && (
              <button className="btn-primary btn-sm" onClick={openCreate}>
                <Plus size={16} /> Add Employee
              </button>
            )}
          </div>
        }
      />

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-xs flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9"
              placeholder="Search name, code, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            className="w-44"
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            aria-label="Department"
          >
            <option value="all">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select
            className="w-40"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Status"
          >
            <option value="all">All statuses</option>
            {EMPLOYEE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </Select>
          <Select
            className="w-40"
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Employment type"
          >
            <option value="all">All types</option>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace('_', ' ')}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          rows={pg.pageItems}
          rowKey={(e) => e.id}
          loading={isLoading}
          minWidthClassName="min-w-[64rem]"
          empty={{
            icon: <Users size={40} />,
            title: 'No employees found',
            description: 'Add your first employee or adjust the filters.',
          }}
        />
        <Pagination pg={pg} />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit — ${employeeName(editing)}` : 'Add Employee'}
        size="xl"
        footer={
          <>
            <button className="btn-secondary btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary btn-sm" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create employee'}
            </button>
          </>
        }
      >
        <EmployeeForm
          draft={draft}
          patch={(p) => setDraft((d) => ({ ...d, ...p }))}
          editing={!!editing}
          departments={departments}
          designations={designations}
          shifts={shifts}
          managers={employees.filter((e) => e.id !== editing?.id)}
          canSeeBanking={perms.can('PAYROLL_VIEW') || perms.can('EMPLOYEE_EDIT')}
        />
      </Modal>
    </div>
  )
}
