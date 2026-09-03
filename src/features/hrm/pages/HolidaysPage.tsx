import { CalendarDays } from 'lucide-react'
import { MasterManager } from '../components/MasterManager'
import { useDepartments, useHolidays } from '../hooks/useHrm'
import { usePermissions } from '../permissions'
import type { Holiday } from '../types'
import type { DataTableColumn } from '@/components/common/DataTable'
import { Badge, Field, Input, Select } from '@/components/ui/primitives'
import { fmtDate } from '@/lib/format'

const TYPE_TONE: Record<string, string> = { company: 'blue', regional: 'violet', optional: 'amber' }

export function HolidaysPage() {
  const { list, create, update, remove } = useHolidays()
  const departments = useDepartments()
  const perms = usePermissions()
  const canWrite = perms.can('HOLIDAY_MANAGE')
  const rows = [...(list.data ?? [])].sort((a, b) => a.holidayDate.localeCompare(b.holidayDate))

  const columns: DataTableColumn<Holiday>[] = [
    {
      key: 'date',
      header: 'Date',
      cellClassName: 'whitespace-nowrap tnum',
      render: (h) => fmtDate(h.holidayDate),
    },
    { key: 'name', header: 'Holiday', cellClassName: 'font-semibold', render: (h) => h.name },
    {
      key: 'type',
      header: 'Type',
      render: (h) => <Badge tone={TYPE_TONE[h.type] ?? 'slate'}>{h.type}</Badge>,
    },
    { key: 'location', header: 'Location', render: (h) => h.location || 'All' },
  ]

  return (
    <MasterManager<Holiday>
      title="Holidays"
      subtitle="Company, regional and optional holidays used by attendance and payroll"
      addLabel="Add Holiday"
      emptyIcon={<CalendarDays size={40} />}
      emptyTitle="No holidays added"
      rows={rows}
      loading={list.isLoading}
      columns={columns}
      canWrite={canWrite}
      search={(h, q) => h.name.toLowerCase().includes(q)}
      emptyDraft={() => ({ name: '', holidayDate: '', type: 'company', active: true })}
      toDraft={(h) => ({ ...h })}
      validate={(d) =>
        !String(d.name).trim() ? 'Name is required' : !d.holidayDate ? 'Date is required' : null
      }
      onCreate={(d) => create.mutateAsync(d as Partial<Holiday>)}
      onUpdate={(id, d) => update.mutateAsync({ id, patch: d as Partial<Holiday> })}
      onDelete={(h) => remove.mutateAsync(h.id)}
      deleteLabel={(h) => `Delete holiday "${h.name}"`}
      renderForm={(draft, patch) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" required className="sm:col-span-2">
            <Input
              value={String(draft.name ?? '')}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Independence Day"
            />
          </Field>
          <Field label="Date" required>
            <Input
              type="date"
              value={String(draft.holidayDate ?? '')}
              onChange={(e) => patch({ holidayDate: e.target.value })}
            />
          </Field>
          <Field label="Type">
            <Select
              value={String(draft.type ?? 'company')}
              onChange={(e) => patch({ type: e.target.value })}
            >
              <option value="company">Company</option>
              <option value="regional">Regional</option>
              <option value="optional">Optional</option>
            </Select>
          </Field>
          <Field label="Location / Branch">
            <Input
              value={String(draft.location ?? '')}
              onChange={(e) => patch({ location: e.target.value })}
              placeholder="All"
            />
          </Field>
          <Field label="Department (optional)">
            <Select
              value={String(draft.departmentId ?? '')}
              onChange={(e) => patch({ departmentId: e.target.value || undefined })}
            >
              <option value="">All departments</option>
              {(departments.list.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
    />
  )
}
