import { Target } from 'lucide-react'
import { MasterManager } from '../components/MasterManager'
import { usePerformanceCycles } from '../hooks/useHrm'
import { usePermissions } from '../permissions'
import type { PerformanceCycle } from '../types'
import type { DataTableColumn } from '@/components/common/DataTable'
import { Badge, Field, Input, Select } from '@/components/ui/primitives'
import { fmtDate } from '@/lib/format'

export function PerformancePage() {
  const { list, create, update, remove } = usePerformanceCycles()
  const perms = usePermissions()
  const canManage = perms.can('PERFORMANCE_MANAGE')

  const columns: DataTableColumn<PerformanceCycle>[] = [
    { key: 'name', header: 'Cycle', cellClassName: 'font-semibold', render: (c) => c.name },
    {
      key: 'period',
      header: 'Period',
      cellClassName: 'text-xs',
      render: (c) =>
        `${c.startDate ? fmtDate(c.startDate) : '—'} → ${c.endDate ? fmtDate(c.endDate) : '—'}`,
    },
    {
      key: 'scale',
      header: 'Rating scale',
      cellClassName: 'tnum',
      render: (c) => `1–${c.ratingScale}`,
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <Badge tone={c.status === 'active' ? 'green' : c.status === 'closed' ? 'slate' : 'amber'}>
          {c.status}
        </Badge>
      ),
    },
  ]

  return (
    <MasterManager<PerformanceCycle>
      title="Performance"
      subtitle="Review cycles, goals and ratings (configurable rating scale)"
      addLabel="Add Cycle"
      emptyIcon={<Target size={40} />}
      emptyTitle="No performance cycles"
      rows={list.data ?? []}
      loading={list.isLoading}
      columns={columns}
      canWrite={canManage}
      search={(c, q) => c.name.toLowerCase().includes(q)}
      emptyDraft={() => ({ name: '', ratingScale: 5, status: 'active' })}
      toDraft={(c) => ({ ...c })}
      validate={(d) => (!String(d.name).trim() ? 'Name is required' : null)}
      onCreate={(d) => create.mutateAsync(d as Partial<PerformanceCycle>)}
      onUpdate={(id, d) => update.mutateAsync({ id, patch: d as Partial<PerformanceCycle> })}
      onDelete={(c) => remove.mutateAsync(c.id)}
      renderForm={(draft, patch) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" required className="sm:col-span-2">
            <Input
              value={String(draft.name ?? '')}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="2026 Annual Review"
            />
          </Field>
          <Field label="Start date">
            <Input
              type="date"
              value={String(draft.startDate ?? '')}
              onChange={(e) => patch({ startDate: e.target.value || undefined })}
            />
          </Field>
          <Field label="End date">
            <Input
              type="date"
              value={String(draft.endDate ?? '')}
              onChange={(e) => patch({ endDate: e.target.value || undefined })}
            />
          </Field>
          <Field label="Rating scale (1–N)">
            <Input
              type="number"
              value={String(draft.ratingScale ?? 5)}
              onChange={(e) => patch({ ratingScale: Number(e.target.value) })}
            />
          </Field>
          <Field label="Status">
            <Select
              value={String(draft.status ?? 'active')}
              onChange={(e) => patch({ status: e.target.value })}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </Select>
          </Field>
        </div>
      )}
    />
  )
}
