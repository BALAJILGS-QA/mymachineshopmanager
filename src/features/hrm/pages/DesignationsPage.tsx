import { BadgeCheck } from 'lucide-react'
import { MasterManager } from '../components/MasterManager'
import { useDepartments, useDesignations } from '../hooks/useHrm'
import { usePermissions } from '../permissions'
import type { Designation } from '../types'
import type { DataTableColumn } from '@/components/common/DataTable'
import { Badge, Field, Input, Select, Textarea } from '@/components/ui/primitives'

export function DesignationsPage() {
  const { list, create, update, remove } = useDesignations()
  const departments = useDepartments()
  const perms = usePermissions()
  const canWrite = perms.can('DESIGNATION_MANAGE')
  const rows = list.data ?? []
  const deptName = (id?: string) => departments.list.data?.find((d) => d.id === id)?.name ?? '—'

  const columns: DataTableColumn<Designation>[] = [
    { key: 'code', header: 'Code', cellClassName: 'font-mono text-xs', render: (d) => d.code },
    { key: 'name', header: 'Designation', cellClassName: 'font-semibold', render: (d) => d.name },
    { key: 'dept', header: 'Department', render: (d) => deptName(d.departmentId) },
    { key: 'grade', header: 'Grade', render: (d) => d.grade || '—' },
    {
      key: 'status',
      header: 'Status',
      render: (d) => (
        <Badge tone={d.active ? 'green' : 'slate'}>{d.active ? 'Active' : 'Inactive'}</Badge>
      ),
    },
  ]

  return (
    <MasterManager<Designation>
      title="Designations"
      subtitle="Job titles and grades within each department"
      addLabel="Add Designation"
      emptyIcon={<BadgeCheck size={40} />}
      emptyTitle="No designations yet"
      rows={rows}
      loading={list.isLoading}
      columns={columns}
      canWrite={canWrite}
      search={(d, q) => d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q)}
      emptyDraft={() => ({ code: '', name: '', active: true })}
      toDraft={(d) => ({ ...d })}
      validate={(d) =>
        !String(d.name).trim()
          ? 'Name is required'
          : !String(d.code).trim()
            ? 'Code is required'
            : null
      }
      onCreate={(d) => create.mutateAsync(d as Partial<Designation>)}
      onUpdate={(id, d) => update.mutateAsync({ id, patch: d as Partial<Designation> })}
      onDelete={(d) => remove.mutateAsync(d.id)}
      deleteLabel={(d) => `Delete designation "${d.name}"`}
      renderForm={(draft, patch) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Code" required>
            <Input
              value={String(draft.code ?? '')}
              onChange={(e) => patch({ code: e.target.value })}
              placeholder="CNC-OP"
            />
          </Field>
          <Field label="Name" required>
            <Input
              value={String(draft.name ?? '')}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="CNC Operator"
            />
          </Field>
          <Field label="Department">
            <Select
              value={String(draft.departmentId ?? '')}
              onChange={(e) => patch({ departmentId: e.target.value || undefined })}
            >
              <option value="">— None —</option>
              {(departments.list.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Grade / Level">
            <Input
              value={String(draft.grade ?? '')}
              onChange={(e) => patch({ grade: e.target.value })}
              placeholder="L2"
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
