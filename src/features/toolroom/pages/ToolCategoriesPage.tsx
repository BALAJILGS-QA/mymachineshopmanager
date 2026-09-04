import { FolderTree } from 'lucide-react'
import { MasterManager } from '@/features/hrm/components/MasterManager'
import { usePermissions } from '@/features/hrm/permissions'
import type { DataTableColumn } from '@/components/common/DataTable'
import { Badge, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { useToolCategories } from '../hooks/useToolroom'
import type { ToolCategory } from '../types'

export function ToolCategoriesPage() {
  const { list, create, update, remove } = useToolCategories()
  const rows = list.data ?? []
  const canManage = usePermissions().can('TOOLROOM_TOOL_MANAGE')
  const byId = new Map(rows.map((c) => [c.id, c]))

  const columns: DataTableColumn<ToolCategory>[] = [
    {
      key: 'code',
      header: 'Code',
      cellClassName: 'font-mono text-xs',
      render: (c) => c.code || '—',
    },
    { key: 'name', header: 'Category', cellClassName: 'font-semibold', render: (c) => c.name },
    {
      key: 'parent',
      header: 'Parent',
      render: (c) => (c.parentId ? (byId.get(c.parentId)?.name ?? '—') : '—'),
    },
    { key: 'desc', header: 'Description', render: (c) => c.description || '—' },
    {
      key: 'active',
      header: 'Status',
      render: (c) => (
        <Badge tone={c.active === false ? 'slate' : 'green'}>
          {c.active === false ? 'Inactive' : 'Active'}
        </Badge>
      ),
    },
  ]

  return (
    <MasterManager<ToolCategory>
      title="Tool Categories"
      subtitle="Organise tools into a hierarchy (Cutting → Drills, End Mills…)"
      addLabel="Add Category"
      emptyIcon={<FolderTree size={40} />}
      emptyTitle="No categories"
      rows={rows}
      loading={list.isLoading}
      columns={columns}
      canWrite={canManage}
      search={(c, q) =>
        c.name.toLowerCase().includes(q) || (c.code ?? '').toLowerCase().includes(q)
      }
      emptyDraft={() => ({ name: '', active: true })}
      toDraft={(c) => ({ ...c })}
      validate={(d) => (!String(d.name).trim() ? 'Name is required' : null)}
      onCreate={(d) => create.mutateAsync(d as Partial<ToolCategory>)}
      onUpdate={(id, d) => update.mutateAsync({ id, patch: d as Partial<ToolCategory> })}
      onDelete={(c) => remove.mutateAsync(c.id)}
      deleteLabel={(c) => `Delete category "${c.name}"`}
      renderForm={(draft, patch) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" required className="sm:col-span-2">
            <Input
              value={String(draft.name ?? '')}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Drills"
            />
          </Field>
          <Field label="Code">
            <Input
              value={String(draft.code ?? '')}
              onChange={(e) => patch({ code: e.target.value })}
              placeholder="Auto if blank"
            />
          </Field>
          <Field label="Parent category">
            <Select
              value={String(draft.parentId ?? '')}
              onChange={(e) => patch({ parentId: e.target.value || undefined })}
            >
              <option value="">— None (top level) —</option>
              {rows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea
              value={String(draft.description ?? '')}
              onChange={(e) => patch({ description: e.target.value })}
              rows={2}
            />
          </Field>
          <Field label="Status">
            <Select
              value={draft.active === false ? 'false' : 'true'}
              onChange={(e) => patch({ active: e.target.value === 'true' })}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </Field>
        </div>
      )}
    />
  )
}
