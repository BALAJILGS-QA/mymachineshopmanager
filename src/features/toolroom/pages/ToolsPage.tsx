import { Wrench } from 'lucide-react'
import { MasterManager } from '@/features/hrm/components/MasterManager'
import { usePermissions } from '@/features/hrm/permissions'
import type { DataTableColumn } from '@/components/common/DataTable'
import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { AppLink } from '@/components/nav/app-link'
import { useToolCategories, useTools } from '../hooks/useToolroom'
import { CLASSIFICATIONS, ToolStatusBadge, titleCase } from '../toolroomUi'
import type { Tool } from '../types'

// Checkbox row bound to a boolean draft flag.
function Flag({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}

export function ToolsPage() {
  const { list, create, update, remove } = useTools()
  const categories = useToolCategories().list.data ?? []
  const canManage = usePermissions().can('TOOLROOM_TOOL_MANAGE')
  const catName = (id?: string) => categories.find((c) => c.id === id)?.name ?? '—'

  const columns: DataTableColumn<Tool>[] = [
    {
      key: 'code',
      header: 'Code',
      cellClassName: 'font-mono text-xs',
      render: (t) => t.code || '—',
    },
    {
      key: 'name',
      header: 'Tool',
      cellClassName: 'font-semibold',
      render: (t) => (
        <AppLink to={`/app/tool-room/tools/${t.id}`} className="text-brand-700 hover:underline">
          {t.name}
        </AppLink>
      ),
    },
    { key: 'category', header: 'Category', render: (t) => catName(t.categoryId) },
    { key: 'class', header: 'Type', render: (t) => titleCase(t.classification) },
    { key: 'brand', header: 'Brand', render: (t) => t.brand || '—' },
    { key: 'uom', header: 'UOM', render: (t) => t.uom || 'nos' },
    { key: 'kind', header: 'Kind', render: (t) => (t.isConsumable ? 'Consumable' : 'Reusable') },
    { key: 'status', header: 'Status', render: (t) => <ToolStatusBadge status={t.status} /> },
  ]

  return (
    <MasterManager<Tool>
      title="Tool Master"
      subtitle="All tools, machine accessories and consumables"
      addLabel="Add Tool"
      emptyIcon={<Wrench size={40} />}
      emptyTitle="No tools yet"
      emptyDescription="Create your first tool to start tracking inventory."
      rows={list.data ?? []}
      loading={list.isLoading}
      columns={columns}
      canWrite={canManage}
      modalSize="xl"
      search={(t, q) =>
        t.name.toLowerCase().includes(q) ||
        (t.code ?? '').toLowerCase().includes(q) ||
        (t.partNumber ?? '').toLowerCase().includes(q) ||
        (t.brand ?? '').toLowerCase().includes(q)
      }
      emptyDraft={() => ({ name: '', uom: 'nos', status: 'active', returnRequired: true })}
      toDraft={(t) => ({ ...t })}
      validate={(d) => (!String(d.name).trim() ? 'Tool name is required' : null)}
      onCreate={(d) => create.mutateAsync(d as Partial<Tool>)}
      onUpdate={(id, d) => update.mutateAsync({ id, patch: d as Partial<Tool> })}
      onDelete={(t) => remove.mutateAsync(t.id)}
      deleteLabel={(t) => `Delete tool "${t.name}"`}
      renderForm={(draft, patch) => (
        <div className="space-y-4">
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Basic information
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Tool name" required className="sm:col-span-2">
                <Input
                  value={String(draft.name ?? '')}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder="10mm Carbide End Mill"
                />
              </Field>
              <Field label="Tool code">
                <Input
                  value={String(draft.code ?? '')}
                  onChange={(e) => patch({ code: e.target.value })}
                  placeholder="Auto if blank"
                />
              </Field>
              <Field label="Category">
                <Select
                  value={String(draft.categoryId ?? '')}
                  onChange={(e) => patch({ categoryId: e.target.value || undefined })}
                >
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Classification">
                <Select
                  value={String(draft.classification ?? '')}
                  onChange={(e) => patch({ classification: e.target.value || undefined })}
                >
                  <option value="">—</option>
                  {CLASSIFICATIONS.map((c) => (
                    <option key={c} value={c}>
                      {titleCase(c)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="UOM">
                <Input
                  value={String(draft.uom ?? 'nos')}
                  onChange={(e) => patch({ uom: e.target.value })}
                />
              </Field>
              <Field label="Brand">
                <Input
                  value={String(draft.brand ?? '')}
                  onChange={(e) => patch({ brand: e.target.value })}
                />
              </Field>
              <Field label="Manufacturer">
                <Input
                  value={String(draft.manufacturer ?? '')}
                  onChange={(e) => patch({ manufacturer: e.target.value })}
                />
              </Field>
              <Field label="Part number">
                <Input
                  value={String(draft.partNumber ?? '')}
                  onChange={(e) => patch({ partNumber: e.target.value })}
                />
              </Field>
              <Field label="Model number">
                <Input
                  value={String(draft.modelNumber ?? '')}
                  onChange={(e) => patch({ modelNumber: e.target.value })}
                />
              </Field>
              <Field label="Serial number">
                <Input
                  value={String(draft.serialNumber ?? '')}
                  onChange={(e) => patch({ serialNumber: e.target.value })}
                />
              </Field>
              <Field label="Specification">
                <Input
                  value={String(draft.specification ?? '')}
                  onChange={(e) => patch({ specification: e.target.value })}
                />
              </Field>
              <Field label="Size">
                <Input
                  value={String(draft.size ?? '')}
                  onChange={(e) => patch({ size: e.target.value })}
                />
              </Field>
              <Field label="Material / Grade">
                <Input
                  value={String(draft.material ?? '')}
                  onChange={(e) => patch({ material: e.target.value })}
                />
              </Field>
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Inventory configuration
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Min stock">
                <Input
                  type="number"
                  value={String(draft.minStock ?? '')}
                  onChange={(e) =>
                    patch({ minStock: e.target.value === '' ? undefined : Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Reorder level">
                <Input
                  type="number"
                  value={String(draft.reorderLevel ?? '')}
                  onChange={(e) =>
                    patch({
                      reorderLevel: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Reorder qty">
                <Input
                  type="number"
                  value={String(draft.reorderQty ?? '')}
                  onChange={(e) =>
                    patch({
                      reorderQty: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Max stock">
                <Input
                  type="number"
                  value={String(draft.maxStock ?? '')}
                  onChange={(e) =>
                    patch({ maxStock: e.target.value === '' ? undefined : Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Store / warehouse">
                <Input
                  value={String(draft.storeLocation ?? '')}
                  onChange={(e) => patch({ storeLocation: e.target.value })}
                />
              </Field>
              <Field label="Tool room location">
                <Input
                  value={String(draft.toolRoomLocation ?? '')}
                  onChange={(e) => patch({ toolRoomLocation: e.target.value })}
                />
              </Field>
              <Field label="Bin / rack">
                <Input
                  value={String(draft.binLocation ?? '')}
                  onChange={(e) => patch({ binLocation: e.target.value })}
                />
              </Field>
              <Field label="Unit cost">
                <Input
                  type="number"
                  value={String(draft.unitCost ?? '')}
                  onChange={(e) =>
                    patch({ unitCost: e.target.value === '' ? undefined : Number(e.target.value) })
                  }
                />
              </Field>
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Lifecycle
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Expected life">
                <Input
                  type="number"
                  value={String(draft.expectedLife ?? '')}
                  onChange={(e) =>
                    patch({
                      expectedLife: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Life unit">
                <Select
                  value={String(draft.lifeUnit ?? '')}
                  onChange={(e) => patch({ lifeUnit: e.target.value || undefined })}
                >
                  <option value="">—</option>
                  <option value="days">Days</option>
                  <option value="cycles">Cycles</option>
                  <option value="parts">Parts</option>
                  <option value="machine_hours">Machine hours</option>
                </Select>
              </Field>
              <Field label="Calibration freq (days)">
                <Input
                  type="number"
                  value={String(draft.calibrationFrequencyDays ?? '')}
                  onChange={(e) =>
                    patch({
                      calibrationFrequencyDays:
                        e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Maintenance freq (days)">
                <Input
                  type="number"
                  value={String(draft.maintenanceFrequencyDays ?? '')}
                  onChange={(e) =>
                    patch({
                      maintenanceFrequencyDays:
                        e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Status">
                <Select
                  value={String(draft.status ?? 'active')}
                  onChange={(e) => patch({ status: e.target.value })}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">Archived</option>
                </Select>
              </Field>
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Control parameters
            </h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Flag
                label="Serialized"
                checked={!!draft.isSerialized}
                onChange={(v) => patch({ isSerialized: v })}
              />
              <Flag
                label="Batch controlled"
                checked={!!draft.isBatchControlled}
                onChange={(v) => patch({ isBatchControlled: v })}
              />
              <Flag
                label="Consumable"
                checked={!!draft.isConsumable}
                onChange={(v) => patch({ isConsumable: v })}
              />
              <Flag
                label="Calibration required"
                checked={!!draft.calibrationRequired}
                onChange={(v) => patch({ calibrationRequired: v })}
              />
              <Flag
                label="Maintenance required"
                checked={!!draft.maintenanceRequired}
                onChange={(v) => patch({ maintenanceRequired: v })}
              />
              <Flag
                label="Inspection required"
                checked={!!draft.inspectionRequired}
                onChange={(v) => patch({ inspectionRequired: v })}
              />
              <Flag
                label="Return required"
                checked={draft.returnRequired !== false}
                onChange={(v) => patch({ returnRequired: v })}
              />
            </div>
          </section>

          <Field label="Notes">
            <Textarea
              value={String(draft.notes ?? '')}
              onChange={(e) => patch({ notes: e.target.value })}
              rows={2}
            />
          </Field>
        </div>
      )}
    />
  )
}
