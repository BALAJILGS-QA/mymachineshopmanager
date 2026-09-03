import { Laptop } from 'lucide-react'
import { MasterManager } from '../components/MasterManager'
import { useEmployeeAssets } from '../hooks/useHrm'
import { usePermissions } from '../permissions'
import type { EmployeeAsset } from '../types'
import type { DataTableColumn } from '@/components/common/DataTable'
import { Badge, Field, Input, Select } from '@/components/ui/primitives'

const TONE: Record<string, string> = { available: 'green', assigned: 'blue', retired: 'slate' }

export function AssetsPage() {
  const { list, create, update, remove } = useEmployeeAssets()
  const perms = usePermissions()
  const canManage = perms.can('ASSET_MANAGE')

  const columns: DataTableColumn<EmployeeAsset>[] = [
    {
      key: 'code',
      header: 'Code',
      cellClassName: 'font-mono text-xs',
      render: (a) => a.code || '—',
    },
    { key: 'name', header: 'Asset', cellClassName: 'font-semibold', render: (a) => a.name },
    { key: 'category', header: 'Category', render: (a) => a.category || '—' },
    {
      key: 'serial',
      header: 'Serial',
      cellClassName: 'font-mono text-xs',
      render: (a) => a.serialNo || '—',
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => <Badge tone={TONE[a.status] ?? 'slate'}>{a.status}</Badge>,
    },
  ]

  return (
    <MasterManager<EmployeeAsset>
      title="Employee Assets"
      subtitle="Company assets available for assignment to employees"
      addLabel="Add Asset"
      emptyIcon={<Laptop size={40} />}
      emptyTitle="No assets"
      rows={list.data ?? []}
      loading={list.isLoading}
      columns={columns}
      canWrite={canManage}
      search={(a, q) =>
        a.name.toLowerCase().includes(q) || (a.serialNo ?? '').toLowerCase().includes(q)
      }
      emptyDraft={() => ({ name: '', status: 'available' })}
      toDraft={(a) => ({ ...a })}
      validate={(d) => (!String(d.name).trim() ? 'Name is required' : null)}
      onCreate={(d) => create.mutateAsync(d as Partial<EmployeeAsset>)}
      onUpdate={(id, d) => update.mutateAsync({ id, patch: d as Partial<EmployeeAsset> })}
      onDelete={(a) => remove.mutateAsync(a.id)}
      renderForm={(draft, patch) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" required className="sm:col-span-2">
            <Input
              value={String(draft.name ?? '')}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Dell Laptop"
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
              placeholder="Laptop, Tools…"
            />
          </Field>
          <Field label="Serial number">
            <Input
              value={String(draft.serialNo ?? '')}
              onChange={(e) => patch({ serialNo: e.target.value })}
            />
          </Field>
          <Field label="Status">
            <Select
              value={String(draft.status ?? 'available')}
              onChange={(e) => patch({ status: e.target.value })}
            >
              <option value="available">Available</option>
              <option value="assigned">Assigned</option>
              <option value="retired">Retired</option>
            </Select>
          </Field>
        </div>
      )}
    />
  )
}
