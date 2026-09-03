import { useState } from 'react'
import { ArrowLeft, Mail, Phone } from 'lucide-react'
import { clsx } from 'clsx'
import { AppLink } from '@/components/nav/app-link'
import { Card } from '@/components/ui/primitives'
import { fmtDate } from '@/lib/format'
import {
  useDepartments,
  useDesignations,
  useEmployee,
  useEmployees,
  useLeaveApplications,
  useLeaveBalances,
  useLeaveTypes,
} from '../hooks/useHrm'
import { usePermissions } from '../permissions'
import { EmployeeAvatar, StatusBadge, employeeName } from '../components/employeeUi'

const TABS = ['Overview', 'Personal', 'Employment', 'Leave', 'Banking', 'Activity'] as const
type Tab = (typeof TABS)[number]

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-right text-sm font-medium text-slate-800">{value || '—'}</span>
    </div>
  )
}

export function EmployeeProfile({ employeeId }: { employeeId: string }) {
  const { data: employee, isLoading } = useEmployee(employeeId)
  const employees = useEmployees().data ?? []
  const departments = useDepartments().list.data ?? []
  const designations = useDesignations().list.data ?? []
  const leaveTypes = useLeaveTypes().list.data ?? []
  const balances = useLeaveBalances(employeeId).data ?? []
  const applications = (useLeaveApplications().data ?? []).filter(
    (a) => a.employeeId === employeeId,
  )
  const perms = usePermissions()
  const [tab, setTab] = useState<Tab>('Overview')

  if (isLoading) return <Card className="p-8 text-center text-sm text-slate-500">Loading…</Card>
  if (!employee)
    return (
      <Card className="p-8 text-center">
        <p className="text-sm font-semibold text-slate-800">Employee not found</p>
        <AppLink to="/app/hrm/employees" className="btn-secondary btn-sm mt-3">
          Back to employees
        </AppLink>
      </Card>
    )

  const deptName = departments.find((d) => d.id === employee.departmentId)?.name ?? '—'
  const desgName = designations.find((d) => d.id === employee.designationId)?.name ?? '—'
  const mgr = employees.find((e) => e.id === employee.reportingManagerId)
  const canBanking = perms.can('PAYROLL_VIEW') || perms.can('EMPLOYEE_EDIT')
  const ltName = (id: string) => leaveTypes.find((t) => t.id === id)?.name ?? id

  const mask = (s?: string) => (s ? `••••${s.slice(-4)}` : '—')

  return (
    <div>
      <AppLink
        to="/app/hrm/employees"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft size={15} /> Employees
      </AppLink>

      {/* Header */}
      <Card className="mb-4 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <EmployeeAvatar employee={employee} size={72} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{employeeName(employee)}</h1>
              <StatusBadge status={employee.status} />
            </div>
            <p className="mt-0.5 font-mono text-xs text-slate-500">{employee.employeeCode}</p>
            <p className="mt-1 text-sm text-slate-600">
              {desgName} · {deptName}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
              {employee.workEmail && (
                <a
                  href={`mailto:${employee.workEmail}`}
                  className="inline-flex items-center gap-1 hover:text-brand-700"
                >
                  <Mail size={13} /> {employee.workEmail}
                </a>
              )}
              {employee.mobile && (
                <a
                  href={`tel:${employee.mobile}`}
                  className="inline-flex items-center gap-1 hover:text-brand-700"
                >
                  <Phone size={13} /> {employee.mobile}
                </a>
              )}
            </div>
          </div>
          {perms.can('EMPLOYEE_EDIT') && (
            <AppLink to="/app/hrm/employees" className="btn-secondary btn-sm self-start">
              Edit in list
            </AppLink>
          )}
        </div>
      </Card>

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.filter((t) => t !== 'Banking' || canBanking).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h3 className="mb-2 text-sm font-bold text-slate-800">Snapshot</h3>
            <Row
              label="Employee code"
              value={<span className="font-mono">{employee.employeeCode}</span>}
            />
            <Row label="Department" value={deptName} />
            <Row label="Designation" value={desgName} />
            <Row label="Reporting manager" value={mgr ? employeeName(mgr) : '—'} />
            <Row
              label="Employment type"
              value={(employee.employmentType ?? '—').replace('_', ' ')}
            />
            <Row
              label="Date of joining"
              value={employee.dateOfJoining ? fmtDate(employee.dateOfJoining) : '—'}
            />
          </Card>
          <Card className="p-5">
            <h3 className="mb-2 text-sm font-bold text-slate-800">Leave balances</h3>
            {balances.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-500">No balances recorded.</p>
            ) : (
              balances.map((b) => (
                <Row
                  key={b.id}
                  label={ltName(b.leaveTypeId)}
                  value={
                    <span className="tnum">
                      {(b.opening + b.accrued + b.adjusted - b.used - b.pending).toFixed(1)}{' '}
                      available
                    </span>
                  }
                />
              ))
            )}
          </Card>
        </div>
      )}

      {tab === 'Personal' && (
        <Card className="p-5">
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <div>
              <Row label="Gender" value={employee.gender} />
              <Row
                label="Date of birth"
                value={employee.dateOfBirth ? fmtDate(employee.dateOfBirth) : '—'}
              />
              <Row label="Marital status" value={employee.maritalStatus} />
              <Row label="Nationality" value={employee.nationality} />
              <Row label="Personal email" value={employee.personalEmail} />
              <Row label="Alternate mobile" value={employee.alternateMobile} />
            </div>
            <div>
              <Row label="Address" value={employee.addressLine} />
              <Row label="City" value={employee.city} />
              <Row label="State" value={employee.state} />
              <Row label="Country" value={employee.country} />
              <Row label="Postal code" value={employee.postalCode} />
              <Row
                label="Emergency contact"
                value={
                  employee.emergencyName
                    ? `${employee.emergencyName} (${employee.emergencyRelation ?? ''}) ${employee.emergencyPhone ?? ''}`
                    : '—'
                }
              />
            </div>
          </div>
        </Card>
      )}

      {tab === 'Employment' && (
        <Card className="p-5">
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <div>
              <Row label="Status" value={<StatusBadge status={employee.status} />} />
              <Row
                label="Date of joining"
                value={employee.dateOfJoining ? fmtDate(employee.dateOfJoining) : '—'}
              />
              <Row
                label="Confirmation date"
                value={employee.confirmationDate ? fmtDate(employee.confirmationDate) : '—'}
              />
              <Row label="Probation (months)" value={employee.probationMonths} />
              <Row label="Notice period (days)" value={employee.noticePeriodDays} />
            </div>
            <div>
              <Row label="Work location" value={employee.workLocation} />
              <Row label="Branch" value={employee.branch} />
              <Row
                label="Date of leaving"
                value={employee.dateOfLeaving ? fmtDate(employee.dateOfLeaving) : '—'}
              />
              <Row label="Reason for leaving" value={employee.reasonForLeaving} />
            </div>
          </div>
        </Card>
      )}

      {tab === 'Leave' && (
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-bold text-slate-800">Leave applications</h3>
          {applications.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">No leave applications.</p>
          ) : (
            <div className="space-y-2">
              {applications.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{ltName(a.leaveTypeId)}</p>
                    <p className="text-xs text-slate-500">
                      {fmtDate(a.startDate)} → {fmtDate(a.endDate)} · {a.days}d
                    </p>
                  </div>
                  <span className="chip bg-slate-100 text-xs capitalize text-slate-700">
                    {a.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'Banking' && canBanking && (
        <Card className="p-5">
          <Row label="Account holder" value={employee.bankAccountHolder} />
          <Row label="Bank name" value={employee.bankName} />
          <Row label="Account number" value={mask(employee.bankAccountNo)} />
          <Row label="IFSC / routing" value={employee.bankIfsc} />
          <Row label="Payment method" value={employee.paymentMethod} />
          <p className="mt-3 text-2xs text-slate-400">
            Account number is masked. Full details are visible only to authorised payroll roles via
            secure retrieval.
          </p>
        </Card>
      )}

      {tab === 'Activity' && (
        <Card className="p-5">
          <Row label="Created" value={employee.createdAt ? fmtDate(employee.createdAt) : '—'} />
          <Row
            label="Last updated"
            value={employee.updatedAt ? fmtDate(employee.updatedAt) : '—'}
          />
          <Row label="Created by" value={employee.createdBy} />
        </Card>
      )}
    </div>
  )
}
