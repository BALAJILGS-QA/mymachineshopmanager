import { Building2 } from 'lucide-react'
import { MasterManager } from '../components/MasterManager'
import { useDepartments, useEmployees } from '../hooks/useHrm'
import { usePermissions } from '../permissions'
import type { Department } from '../types'
import type { DataTableColumn } from '@/components/common/DataTable'
import { Badge, Field, Input, Select, Textarea } from '@/components/ui/primitives'

export function DepartmentsPage() {
  const { list, create, update, remove } = useDepartments()
  const employees = useEmployees()
  const perms = usePermissions()
  const canWrite = perms.can('DEPARTMENT_MANAGE')
  const depts = list.data ?? []

  const nameById = new Map(depts.map((d) => [d.id, d.name]))
  const empName = (id?: string) => {
    const e = employees.data?.find((x) => x.id === id)
    return e ? e.displayName || `${e.firstName} ${e.lastName ?? ''}`.trim() : '—'
  }

  const columns: DataTableColumn<Department>[] = [
    { key: 'code', header: 'Code', cellClassName: 'font-mono text-xs', render: (d) => d.code },
    { key: 'name', header: 'Department', cellClassName: 'font-semibold', render: (d) => d.name },
    {
      key: 'parent',
      header: 'Parent',
      render: (d) => (d.parentId ? nameById.get(d.parentId) : '—'),
    },
    { key: 'head', header: 'Head', render: (d) => empName(d.headEmployeeId) },
    {
      key: 'status',
      header: 'Status',
      render: (d) => (
        <Badge tone={d.active ? 'green' : 'slate'}>{d.active ? 'Active' : 'Inactive'}</Badge>
      ),
    },
  ]

  return (
    <MasterManager<Department>
      title="Departments"
      subtitle="Organise your workforce into departments and sub-departments"
      addLabel="Add Department"
      emptyIcon={<Building2 size={40} />}
      emptyTitle="No departments yet"
      emptyDescription="Create your first department to start structuring the organisation."
      rows={depts}
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
      onCreate={(d) => create.mutateAsync(d as Partial<Department>)}
      onUpdate={(id, d) => update.mutateAsync({ id, patch: d as Partial<Department> })}
      onDelete={(d) => remove.mutateAsync(d.id)}
      deleteLabel={(d) => `Delete department "${d.name}"`}
      renderForm={(draft, patch) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Code" required>
            <Input
              value={String(draft.code ?? '')}
              onChange={(e) => patch({ code: e.target.value })}
              placeholder="PROD"
            />
          </Field>
          <Field label="Name" required>
            <Input
              value={String(draft.name ?? '')}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Production"
            />
          </Field>
          <Field label="Parent department">
            <Select
              value={String(draft.parentId ?? '')}
              onChange={(e) => patch({ parentId: e.target.value || undefined })}
            >
              <option value="">— None —</option>
              {depts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Department head">
            <Select
              value={String(draft.headEmployeeId ?? '')}
              onChange={(e) => patch({ headEmployeeId: e.target.value || undefined })}
            >
              <option value="">— None —</option>
              {(employees.data ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.displayName || `${e.firstName} ${e.lastName ?? ''}`}
                </option>
              ))}
            </Select>
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
