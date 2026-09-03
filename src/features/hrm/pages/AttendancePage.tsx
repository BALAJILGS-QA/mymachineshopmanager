import { useMemo, useState } from 'react'
import { CalendarCheck, Plus } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { Badge, Card, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { toUserMessage } from '@/lib/api/errors'
import { fmtDate, todayISO } from '@/lib/format'
import { useAttendance, useEmployees, useShifts } from '../hooks/useHrm'
import { usePermissions } from '../permissions'
import { employeeName } from '../components/employeeUi'
import type { Attendance, AttendanceStatus } from '../types'

const STATUS_TONE: Record<string, string> = {
  present: 'green',
  absent: 'red',
  half_day: 'amber',
  late: 'amber',
  early_exit: 'amber',
  overtime: 'violet',
  wfh: 'blue',
  on_duty: 'blue',
  holiday: 'slate',
  weekly_off: 'slate',
  leave: 'blue',
}
const STATUSES: AttendanceStatus[] = [
  'present',
  'absent',
  'half_day',
  'late',
  'early_exit',
  'overtime',
  'wfh',
  'on_duty',
  'holiday',
  'weekly_off',
  'leave',
]

export function AttendancePage() {
  const { list, create } = useAttendance()
  const rows = list.data ?? []
  const employees = useEmployees().data ?? []
  const shifts = useShifts().list.data ?? []
  const perms = usePermissions()
  const toast = useToast()

  const canEdit = perms.can('ATTENDANCE_EDIT')
  const [date, setDate] = useState(todayISO())
  const [empFilter, setEmpFilter] = useState('all')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)

  const empName = (id: string) => {
    const e = employees.find((x) => x.id === id)
    return e ? employeeName(e) : id
  }

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!date || r.attendanceDate === date) &&
          (empFilter === 'all' || r.employeeId === empFilter),
      ),
    [rows, date, empFilter],
  )
  const pg = usePagination(filtered)

  function openMark() {
    setDraft({ attendanceDate: date, status: 'present', source: 'manual' })
    setOpen(true)
  }

  async function save() {
    if (!draft.employeeId) return toast.error('Select an employee')
    if (!draft.attendanceDate) return toast.error('Select a date')
    setSaving(true)
    try {
      // Derive worked minutes when both timestamps are present.
      let totalMinutes: number | undefined
      if (draft.checkIn && draft.checkOut) {
        const inMs = new Date(String(draft.checkIn)).getTime()
        let outMs = new Date(String(draft.checkOut)).getTime()
        if (outMs < inMs) outMs += 24 * 60 * 60 * 1000 // overnight
        totalMinutes = Math.round((outMs - inMs) / 60000)
      }
      await create.mutateAsync({ ...draft, totalMinutes } as Partial<Attendance>)
      toast.success('Attendance recorded')
      setOpen(false)
    } catch (e) {
      toast.error(toUserMessage(e, 'Could not save attendance'))
    } finally {
      setSaving(false)
    }
  }

  const columns: DataTableColumn<Attendance>[] = [
    {
      key: 'emp',
      header: 'Employee',
      cellClassName: 'font-semibold',
      render: (r) => empName(r.employeeId),
    },
    {
      key: 'date',
      header: 'Date',
      cellClassName: 'whitespace-nowrap tnum text-xs',
      render: (r) => fmtDate(r.attendanceDate),
    },
    {
      key: 'in',
      header: 'In',
      cellClassName: 'tnum text-xs',
      render: (r) =>
        r.checkIn
          ? new Date(r.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '—',
    },
    {
      key: 'out',
      header: 'Out',
      cellClassName: 'tnum text-xs',
      render: (r) =>
        r.checkOut
          ? new Date(r.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '—',
    },
    {
      key: 'hours',
      header: 'Hours',
      cellClassName: 'tnum text-xs',
      render: (r) => (r.totalMinutes ? (r.totalMinutes / 60).toFixed(1) : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge tone={STATUS_TONE[r.status] ?? 'slate'}>{r.status.replace('_', ' ')}</Badge>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      cellClassName: 'capitalize text-xs text-slate-500',
      render: (r) => r.source,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Attendance"
        subtitle="Daily attendance records — check-in/out, hours and status by employee"
        actions={
          canEdit && (
            <button className="btn-primary btn-sm" onClick={openMark}>
              <Plus size={16} /> Mark Attendance
            </button>
          )
        }
      />

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Field label="Date" className="w-40">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Employee" className="w-56">
            <Select value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
              <option value="all">All employees</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {employeeName(e)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          rows={pg.pageItems}
          rowKey={(r) => r.id}
          loading={list.isLoading}
          minWidthClassName="min-w-[52rem]"
          empty={{
            icon: <CalendarCheck size={40} />,
            title: 'No attendance for this day',
            description: 'Mark attendance or pick another date.',
          }}
        />
        <Pagination pg={pg} />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Mark Attendance"
        footer={
          <>
            <button className="btn-secondary btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary btn-sm" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
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
          <Field label="Date" required>
            <Input
              type="date"
              value={String(draft.attendanceDate ?? '')}
              onChange={(e) => setDraft((d) => ({ ...d, attendanceDate: e.target.value }))}
            />
          </Field>
          <Field label="Status">
            <Select
              value={String(draft.status ?? 'present')}
              onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Shift">
            <Select
              value={String(draft.shiftId ?? '')}
              onChange={(e) => setDraft((d) => ({ ...d, shiftId: e.target.value || undefined }))}
            >
              <option value="">—</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Check-in">
            <Input
              type="datetime-local"
              value={String(draft.checkIn ?? '')}
              onChange={(e) => setDraft((d) => ({ ...d, checkIn: e.target.value || undefined }))}
            />
          </Field>
          <Field label="Check-out">
            <Input
              type="datetime-local"
              value={String(draft.checkOut ?? '')}
              onChange={(e) => setDraft((d) => ({ ...d, checkOut: e.target.value || undefined }))}
            />
          </Field>
          <Field label="Remarks" className="sm:col-span-2">
            <Textarea
              rows={2}
              value={String(draft.remarks ?? '')}
              onChange={(e) => setDraft((d) => ({ ...d, remarks: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
