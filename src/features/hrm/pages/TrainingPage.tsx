import { GraduationCap } from 'lucide-react'
import { MasterManager } from '../components/MasterManager'
import { useTrainingPrograms } from '../hooks/useHrm'
import { usePermissions } from '../permissions'
import type { TrainingProgram } from '../types'
import type { DataTableColumn } from '@/components/common/DataTable'
import { Badge, Field, Input, Select, Textarea } from '@/components/ui/primitives'

export function TrainingPage() {
  const { list, create, update, remove } = useTrainingPrograms()
  const perms = usePermissions()
  const canManage = perms.can('TRAINING_MANAGE')

  const columns: DataTableColumn<TrainingProgram>[] = [
    { key: 'name', header: 'Program', cellClassName: 'font-semibold', render: (p) => p.name },
    { key: 'category', header: 'Category', render: (p) => p.category || '—' },
    {
      key: 'code',
      header: 'Code',
      cellClassName: 'font-mono text-xs',
      render: (p) => p.code || '—',
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <Badge tone={p.active ? 'green' : 'slate'}>{p.active ? 'Active' : 'Inactive'}</Badge>
      ),
    },
  ]

  return (
    <MasterManager<TrainingProgram>
      title="Training"
      subtitle="Training programs, sessions and employee enrolment"
      addLabel="Add Program"
      emptyIcon={<GraduationCap size={40} />}
      emptyTitle="No training programs"
      rows={list.data ?? []}
      loading={list.isLoading}
      columns={columns}
      canWrite={canManage}
      search={(p, q) => p.name.toLowerCase().includes(q)}
      emptyDraft={() => ({ name: '', active: true })}
      toDraft={(p) => ({ ...p })}
      validate={(d) => (!String(d.name).trim() ? 'Name is required' : null)}
      onCreate={(d) => create.mutateAsync(d as Partial<TrainingProgram>)}
      onUpdate={(id, d) => update.mutateAsync({ id, patch: d as Partial<TrainingProgram> })}
      onDelete={(p) => remove.mutateAsync(p.id)}
      renderForm={(draft, patch) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" required className="sm:col-span-2">
            <Input
              value={String(draft.name ?? '')}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>
          <Field label="Code">
            <Input
              value={String(draft.code ?? '')}
              onChange={(e) => patch({ code: e.target.value })}
            />
          </Field>
          <Field label="Category">
            <Input
              value={String(draft.category ?? '')}
              onChange={(e) => patch({ category: e.target.value })}
              placeholder="Safety, Technical…"
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea
              rows={2}
              value={String(draft.description ?? '')}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </Field>
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
