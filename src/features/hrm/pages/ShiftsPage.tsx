import { Clock } from 'lucide-react'
import { MasterManager } from '../components/MasterManager'
import { useShifts } from '../hooks/useHrm'
import { usePermissions } from '../permissions'
import type { Shift } from '../types'
import type { DataTableColumn } from '@/components/common/DataTable'
import { Badge, Field, Input, Select } from '@/components/ui/primitives'

const DOW = [
  { n: 1, label: 'Mon' },
  { n: 2, label: 'Tue' },
  { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' },
  { n: 6, label: 'Sat' },
  { n: 7, label: 'Sun' },
]

export function ShiftsPage() {
  const { list, create, update, remove } = useShifts()
  const perms = usePermissions()
  const canWrite = perms.can('SHIFT_MANAGE')
  const rows = list.data ?? []

  const columns: DataTableColumn<Shift>[] = [
    { key: 'code', header: 'Code', cellClassName: 'font-mono text-xs', render: (s) => s.code },
    { key: 'name', header: 'Shift', cellClassName: 'font-semibold', render: (s) => s.name },
    {
      key: 'time',
      header: 'Timing',
      render: (s) => (
        <span className="tnum">
          {s.startTime?.slice(0, 5)} – {s.endTime?.slice(0, 5)}
          {s.isOvernight && <Badge tone="violet">Overnight</Badge>}
        </span>
      ),
    },
    { key: 'grace', header: 'Grace', render: (s) => `${s.graceMinutes}m` },
    {
      key: 'days',
      header: 'Working days',
      render: (s) =>
        DOW.filter((d) => (s.workingDays ?? []).includes(d.n))
          .map((d) => d.label)
          .join(', '),
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => (
        <Badge tone={s.active ? 'green' : 'slate'}>{s.active ? 'Active' : 'Inactive'}</Badge>
      ),
    },
  ]

  function toggleDay(
    draft: Record<string, unknown>,
    patch: (p: Record<string, unknown>) => void,
    n: number,
  ) {
    const days = new Set<number>((draft.workingDays as number[]) ?? [])
    if (days.has(n)) days.delete(n)
    else days.add(n)
    patch({ workingDays: Array.from(days).sort() })
  }

  return (
    <MasterManager<Shift>
      title="Shifts"
      subtitle="Define working shifts, grace periods and overtime rules (overnight-aware)"
      addLabel="Add Shift"
      emptyIcon={<Clock size={40} />}
      emptyTitle="No shifts configured"
      rows={rows}
      loading={list.isLoading}
      columns={columns}
      canWrite={canWrite}
      modalSize="lg"
      search={(s, q) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)}
      emptyDraft={() => ({
        code: '',
        name: '',
        startTime: '09:00',
        endTime: '18:00',
        breakMinutes: 60,
        graceMinutes: 10,
        lateAfterMinutes: 15,
        earlyExitMinutes: 15,
        workingDays: [1, 2, 3, 4, 5, 6],
        isOvernight: false,
        active: true,
      })}
      toDraft={(s) => ({ ...s })}
      validate={(d) => {
        if (!String(d.name).trim()) return 'Name is required'
        if (!String(d.code).trim()) return 'Code is required'
        if (!d.startTime || !d.endTime) return 'Start and end time are required'
        return null
      }}
      onCreate={(d) => create.mutateAsync(d as Partial<Shift>)}
      onUpdate={(id, d) => update.mutateAsync({ id, patch: d as Partial<Shift> })}
      onDelete={(s) => remove.mutateAsync(s.id)}
      deleteLabel={(s) => `Delete shift "${s.name}"`}
      renderForm={(draft, patch) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Code" required>
            <Input
              value={String(draft.code ?? '')}
              onChange={(e) => patch({ code: e.target.value })}
              placeholder="GEN"
            />
          </Field>
          <Field label="Name" required>
            <Input
              value={String(draft.name ?? '')}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="General Shift"
            />
          </Field>
          <Field label="Start time" required>
            <Input
              type="time"
              value={String(draft.startTime ?? '')}
              onChange={(e) => patch({ startTime: e.target.value })}
            />
          </Field>
          <Field label="End time" required>
            <Input
              type="time"
              value={String(draft.endTime ?? '')}
              onChange={(e) => patch({ endTime: e.target.value })}
            />
          </Field>
          <Field label="Break (minutes)">
            <Input
              type="number"
              value={String(draft.breakMinutes ?? 0)}
              onChange={(e) => patch({ breakMinutes: Number(e.target.value) })}
            />
          </Field>
          <Field label="Grace (minutes)">
            <Input
              type="number"
              value={String(draft.graceMinutes ?? 0)}
              onChange={(e) => patch({ graceMinutes: Number(e.target.value) })}
            />
          </Field>
          <Field label="Late after (minutes)">
            <Input
              type="number"
              value={String(draft.lateAfterMinutes ?? 0)}
              onChange={(e) => patch({ lateAfterMinutes: Number(e.target.value) })}
            />
          </Field>
          <Field label="Early exit (minutes)">
            <Input
              type="number"
              value={String(draft.earlyExitMinutes ?? 0)}
              onChange={(e) => patch({ earlyExitMinutes: Number(e.target.value) })}
            />
          </Field>
          <Field label="Overtime after (minutes worked)">
            <Input
              type="number"
              value={String(draft.otAfterMinutes ?? '')}
              onChange={(e) =>
                patch({ otAfterMinutes: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </Field>
          <Field label="Overnight shift">
            <Select
              value={draft.isOvernight ? 'yes' : 'no'}
              onChange={(e) => patch({ isOvernight: e.target.value === 'yes' })}
            >
              <option value="no">No</option>
              <option value="yes">Yes (crosses midnight)</option>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <span className="label">Working days</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {DOW.map((d) => {
                const on = ((draft.workingDays as number[]) ?? []).includes(d.n)
                return (
                  <button
                    key={d.n}
                    type="button"
                    onClick={() => toggleDay(draft, patch, d.n)}
                    className={
                      'rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ' +
                      (on
                        ? 'bg-brand-100 text-brand-800 ring-brand-300'
                        : 'bg-slate-50 text-slate-500 ring-slate-200')
                    }
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>
          </div>
          <Field label="Status">
            <Select
              value={draft.active === false ? 'inactive' : 'active'}
              onChange={(e) => patch({ active: e.target.value === 'active' })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        </div>
      )}
    />
  )
}
