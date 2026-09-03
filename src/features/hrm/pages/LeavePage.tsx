import { useMemo, useState } from 'react'
import { CalendarClock, Check, Plane, Plus, X } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { Badge, Card, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { StatTile } from '@/components/common/StatTile'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { toUserMessage } from '@/lib/api/errors'
import { fmtDate } from '@/lib/format'
import { useEmployees, useLeaveActions, useLeaveApplications, useLeaveTypes } from '../hooks/useHrm'
import { usePermissions } from '../permissions'
import { employeeName } from '../components/employeeUi'
import type { LeaveApplication, LeaveStatus } from '../types'

const STATUS_TONE: Record<LeaveStatus, string> = {
  draft: 'slate',
  submitted: 'amber',
  manager_approved: 'blue',
  approved: 'green',
  rejected: 'red',
  cancelled: 'slate',
}

export function LeavePage() {
  const applications = useLeaveApplications().data ?? []
  const employees = useEmployees().data ?? []
  const leaveTypes = (useLeaveTypes().list.data ?? []).filter((t) => t.active)
  const { apply, decide } = useLeaveActions()
  const perms = usePermissions()
  const toast = useToast()
  const confirm = useConfirm()

  const canApprove = perms.can('LEAVE_APPROVE')
  const canApply = perms.can('LEAVE_APPLY') || canApprove

  const [status, setStatus] = useState<'all' | LeaveStatus>('all')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)

  const empName = (id: string) => {
    const e = employees.find((x) => x.id === id)
    return e ? employeeName(e) : id
  }
  const ltName = (id: string) => leaveTypes.find((t) => t.id === id)?.name ?? id

  const filtered = useMemo(
    () => applications.filter((a) => status === 'all' || a.status === status),
    [applications, status],
  )
  const pg = usePagination(filtered)

  const pending = applications.filter(
    (a) => a.status === 'submitted' || a.status === 'manager_approved',
  ).length
  const approved = applications.filter((a) => a.status === 'approved').length

  function openApply() {
    setDraft({ startDate: '', endDate: '', isHalfDay: false })
    setOpen(true)
  }

  async function submitApply() {
    const empId = String(draft.employeeId ?? '')
    if (!empId) return toast.error('Select an employee')
    if (!draft.leaveTypeId) return toast.error('Select a leave type')
    if (!draft.startDate || !draft.endDate) return toast.error('Select the dates')
    setSaving(true)
    try {
      await apply.mutateAsync({
        employeeId: empId,
        leaveTypeId: String(draft.leaveTypeId),
        startDate: String(draft.startDate),
        endDate: String(draft.endDate),
        isHalfDay: !!draft.isHalfDay,
        halfDayPart: draft.isHalfDay ? String(draft.halfDayPart ?? 'first') : null,
        reason: (draft.reason as string) ?? null,
      })
      toast.success('Leave applied')
      setOpen(false)
    } catch (e) {
      toast.error(toUserMessage(e, 'Could not apply for leave'))
    } finally {
      setSaving(false)
    }
  }

  async function act(a: LeaveApplication, decision: 'approve' | 'reject' | 'cancel') {
    const verb = decision === 'approve' ? 'Approve' : decision === 'reject' ? 'Reject' : 'Cancel'
    const ok = await confirm({
      title: `${verb} leave`,
      message: `${verb} ${empName(a.employeeId)}'s ${a.days}-day ${ltName(a.leaveTypeId)} request?`,
      danger: decision !== 'approve',
      confirmLabel: verb,
    })
    if (!ok) return
    try {
      await decide.mutateAsync({ appId: a.id, decision })
      toast.success(`Leave ${decision}d`)
    } catch (e) {
      toast.error(toUserMessage(e, `Could not ${decision} leave`))
    }
  }

  const columns: DataTableColumn<LeaveApplication>[] = [
    {
      key: 'emp',
      header: 'Employee',
      cellClassName: 'font-semibold',
      render: (a) => empName(a.employeeId),
    },
    { key: 'type', header: 'Type', render: (a) => ltName(a.leaveTypeId) },
    {
      key: 'dates',
      header: 'Dates',
      cellClassName: 'whitespace-nowrap text-xs',
      render: (a) => (
        <span className="tnum">
          {fmtDate(a.startDate)} → {fmtDate(a.endDate)}
          {a.isHalfDay && <span className="ml-1 text-slate-400">(½)</span>}
        </span>
      ),
    },
    { key: 'days', header: 'Days', cellClassName: 'tnum', render: (a) => a.days },
    {
      key: 'reason',
      header: 'Reason',
      cellClassName: 'max-w-xs',
      render: (a) => <span className="line-clamp-1 text-xs text-slate-600">{a.reason || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => <Badge tone={STATUS_TONE[a.status]}>{a.status.replace('_', ' ')}</Badge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      render: (a) => {
        const pendingRow = a.status === 'submitted' || a.status === 'manager_approved'
        return (
          <div className="flex justify-end gap-1">
            {canApprove && pendingRow && (
              <>
                <button
                  className="btn-ghost btn-sm text-emerald-600"
                  onClick={() => act(a, 'approve')}
                  title="Approve"
                >
                  <Check size={15} />
                </button>
                <button
                  className="btn-ghost btn-sm text-red-500"
                  onClick={() => act(a, 'reject')}
                  title="Reject"
                >
                  <X size={15} />
                </button>
              </>
            )}
            {pendingRow && (
              <button
                className="btn-ghost btn-sm text-slate-500"
                onClick={() => act(a, 'cancel')}
                title="Cancel"
              >
                Cancel
              </button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div>
      <PageHeader
        title="Leave Management"
        subtitle="Apply, review and approve employee leave. Balances update automatically."
        actions={
          canApply && (
            <button className="btn-primary btn-sm" onClick={openApply}>
              <Plus size={16} /> Apply Leave
            </button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          icon={<CalendarClock size={20} />}
          label="Pending"
          value={pending}
          tone="orange"
        />
        <StatTile icon={<Check size={20} />} label="Approved" value={approved} tone="green" />
        <StatTile
          icon={<Plane size={20} />}
          label="Total requests"
          value={applications.length}
          tone="blue"
        />
        <StatTile
          icon={<Plane size={20} />}
          label="Leave types"
          value={leaveTypes.length}
          tone="violet"
        />
      </div>

      <Card className="mb-3 p-3">
        <Select
          className="w-48"
          value={status}
          onChange={(e) => setStatus(e.target.value as 'all' | LeaveStatus)}
          aria-label="Filter status"
        >
          <option value="all">All statuses</option>
          <option value="submitted">Submitted</option>
          <option value="manager_approved">Manager approved</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          rows={pg.pageItems}
          rowKey={(a) => a.id}
          minWidthClassName="min-w-[56rem]"
          empty={{
            icon: <Plane size={40} />,
            title: 'No leave requests',
            description: 'Leave applications will appear here.',
          }}
        />
        <Pagination pg={pg} />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Apply for Leave"
        footer={
          <>
            <button className="btn-secondary btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary btn-sm" onClick={submitApply} disabled={saving}>
              {saving ? 'Submitting…' : 'Submit'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Employee" required className="sm:col-span-2">
            <Select
              value={String(draft.employeeId ?? '')}
              onChange={(e) => setDraft((d) => ({ ...d, employeeId: e.target.value }))}
            >
              <option value="">— Select —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {employeeName(e)} ({e.employeeCode})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Leave type" required>
            <Select
              value={String(draft.leaveTypeId ?? '')}
              onChange={(e) => setDraft((d) => ({ ...d, leaveTypeId: e.target.value }))}
            >
              <option value="">— Select —</option>
              {leaveTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Half day">
            <Select
              value={draft.isHalfDay ? 'yes' : 'no'}
              onChange={(e) => setDraft((d) => ({ ...d, isHalfDay: e.target.value === 'yes' }))}
            >
              <option value="no">Full day(s)</option>
              <option value="yes">Half day</option>
            </Select>
          </Field>
          <Field label="Start date" required>
            <Input
              type="date"
              value={String(draft.startDate ?? '')}
              onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
            />
          </Field>
          <Field label="End date" required>
            <Input
              type="date"
              value={String(draft.endDate ?? '')}
              onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
            />
          </Field>
          <Field label="Reason" className="sm:col-span-2">
            <Textarea
              rows={2}
              value={String(draft.reason ?? '')}
              onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
