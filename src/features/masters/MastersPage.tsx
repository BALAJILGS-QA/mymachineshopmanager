import { useMemo, useState } from 'react'
import { Cog, Factory, Pencil, Plus, Route, Trash2, Wrench } from 'lucide-react'
import type { Machine, Operation, Routing, RoutingStep, WorkCenter } from '@/types'
import { usePermissions } from '@/features/hrm/permissions'
import { useMaterials } from '@/features/materials/hooks/useMaterials'
import {
  workCenters as wcHooks,
  machines as mcHooks,
  operations as opHooks,
  routings as rtHooks,
  useWorkCenters,
  useMachines,
  useOperations,
  useRoutingSteps,
  useCreateRoutingStep,
  useDeleteRoutingStep,
} from './hooks/useMasters'
import { toUserMessage } from '@/lib/api/errors'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Badge, Card, EmptyState, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/shadcn/tabs'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

export function MastersPage() {
  const perms = usePermissions()
  const canManage = perms.can('MASTERS_MANAGE')

  if (perms.isLoading) return <p className="p-6 text-sm text-slate-500">Loading…</p>
  if (!perms.can('MASTERS_VIEW'))
    return (
      <EmptyState
        icon={<Cog size={40} />}
        title="Access denied"
        description="You do not have permission to view production masters."
      />
    )

  return (
    <div>
      <PageHeader
        title="Masters"
        subtitle="Work centres, machines, operations and routings — the building blocks for production routing."
      />
      <Tabs defaultValue="workCenters">
        <TabsList className="flex-wrap">
          <TabsTrigger value="workCenters">Work Centres</TabsTrigger>
          <TabsTrigger value="machines">Machines</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="routings">Routings</TabsTrigger>
        </TabsList>
        <TabsContent value="workCenters">
          <WorkCentersTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="machines">
          <MachinesTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="operations">
          <OperationsTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="routings">
          <RoutingsTab canManage={canManage} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Small shared row-actions cell.
function RowActions({
  onEdit,
  onDelete,
  canManage,
}: {
  onEdit: () => void
  onDelete: () => void
  canManage: boolean
}) {
  if (!canManage) return <span className="text-slate-300">—</span>
  return (
    <div className="flex justify-end gap-1">
      <button className="btn-ghost btn-sm" onClick={onEdit} title="Edit">
        <Pencil size={15} />
      </button>
      <button className="btn-ghost btn-sm text-red-500" onClick={onDelete} title="Delete">
        <Trash2 size={15} />
      </button>
    </div>
  )
}

function ActiveField({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Field label="Status">
      <label className="flex items-center gap-2 py-2 text-sm text-slate-600">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        Active
      </label>
    </Field>
  )
}

// ---- Work Centres ----------------------------------------------------------
function WorkCentersTab({ canManage }: { canManage: boolean }) {
  const { data: rows = [], isLoading } = useWorkCenters()
  const create = wcHooks.useCreate()
  const update = wcHooks.useUpdate()
  const remove = wcHooks.useRemove()
  const toast = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<WorkCenter | null | undefined>(undefined)

  const columns: DataTableColumn<WorkCenter>[] = [
    {
      key: 'code',
      header: 'Code',
      cellClassName: 'font-mono text-xs text-slate-500',
      render: (r) => r.code || '—',
    },
    {
      key: 'name',
      header: 'Name',
      cellClassName: 'font-semibold text-slate-800',
      render: (r) => r.name,
    },
    { key: 'description', header: 'Description', render: (r) => r.description || '—' },
    {
      key: 'status',
      header: 'Status',
      render: (r) =>
        r.active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      render: (r) => (
        <RowActions
          canManage={canManage}
          onEdit={() => setEditing(r)}
          onDelete={async () => {
            if (
              !(await confirm({
                title: 'Delete work centre',
                message: `Delete "${r.name}"?`,
                danger: true,
                confirmLabel: 'Delete',
              }))
            )
              return
            try {
              await remove.mutateAsync(r.id)
              toast.success('Work centre deleted')
            } catch (e) {
              toast.error(toUserMessage(e, 'Delete failed'))
            }
          }}
        />
      ),
    },
  ]

  return (
    <Card>
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button className="btn-primary btn-sm" onClick={() => setEditing(null)}>
            <Plus size={16} /> Add Work Centre
          </button>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={isLoading}
        empty={{
          icon: <Factory size={36} />,
          title: 'No work centres',
          description: 'Add a production cell / cost-centre.',
        }}
      />
      {editing !== undefined && (
        <SimpleMasterModal
          title={editing ? 'Edit Work Centre' : 'Add Work Centre'}
          initial={editing ?? null}
          onClose={() => setEditing(undefined)}
          onSave={async (vals) => {
            if (editing) await update.mutateAsync({ id: editing.id, patch: vals })
            else await create.mutateAsync(vals)
          }}
          fields="basic"
        />
      )}
    </Card>
  )
}

// ---- Machines --------------------------------------------------------------
function MachinesTab({ canManage }: { canManage: boolean }) {
  const { data: rows = [], isLoading } = useMachines()
  const { data: centres = [] } = useWorkCenters()
  const create = mcHooks.useCreate()
  const update = mcHooks.useUpdate()
  const remove = mcHooks.useRemove()
  const toast = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Machine | null | undefined>(undefined)
  const wcName = (id?: string) => centres.find((c) => c.id === id)?.name ?? '—'

  const columns: DataTableColumn<Machine>[] = [
    {
      key: 'code',
      header: 'Code',
      cellClassName: 'font-mono text-xs text-slate-500',
      render: (r) => r.code || '—',
    },
    {
      key: 'name',
      header: 'Name',
      cellClassName: 'font-semibold text-slate-800',
      render: (r) => r.name,
    },
    { key: 'type', header: 'Type', render: (r) => r.machineType || '—' },
    { key: 'wc', header: 'Work Centre', render: (r) => wcName(r.workCenterId) },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge
          tone={r.status === 'Active' ? 'green' : r.status === 'Maintenance' ? 'amber' : 'gray'}
        >
          {r.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      render: (r) => (
        <RowActions
          canManage={canManage}
          onEdit={() => setEditing(r)}
          onDelete={async () => {
            if (
              !(await confirm({
                title: 'Delete machine',
                message: `Delete "${r.name}"?`,
                danger: true,
                confirmLabel: 'Delete',
              }))
            )
              return
            try {
              await remove.mutateAsync(r.id)
              toast.success('Machine deleted')
            } catch (e) {
              toast.error(toUserMessage(e, 'Delete failed'))
            }
          }}
        />
      ),
    },
  ]

  return (
    <Card>
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button className="btn-primary btn-sm" onClick={() => setEditing(null)}>
            <Plus size={16} /> Add Machine
          </button>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={isLoading}
        empty={{
          icon: <Wrench size={36} />,
          title: 'No machines',
          description: 'Add a machine and assign it to a work centre.',
        }}
      />
      {editing !== undefined && (
        <MachineModal
          machine={editing}
          centres={centres}
          onClose={() => setEditing(undefined)}
          onSave={async (vals) => {
            if (editing) await update.mutateAsync({ id: editing.id, patch: vals })
            else await create.mutateAsync(vals)
          }}
        />
      )}
    </Card>
  )
}

// ---- Operations ------------------------------------------------------------
function OperationsTab({ canManage }: { canManage: boolean }) {
  const { data: rows = [], isLoading } = useOperations()
  const { data: centres = [] } = useWorkCenters()
  const create = opHooks.useCreate()
  const update = opHooks.useUpdate()
  const remove = opHooks.useRemove()
  const toast = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Operation | null | undefined>(undefined)
  const wcName = (id?: string) => centres.find((c) => c.id === id)?.name ?? '—'

  const columns: DataTableColumn<Operation>[] = [
    {
      key: 'code',
      header: 'Code',
      cellClassName: 'font-mono text-xs text-slate-500',
      render: (r) => r.code || '—',
    },
    {
      key: 'name',
      header: 'Name',
      cellClassName: 'font-semibold text-slate-800',
      render: (r) => r.name,
    },
    { key: 'wc', header: 'Default Work Centre', render: (r) => wcName(r.defaultWorkCenterId) },
    {
      key: 'status',
      header: 'Status',
      render: (r) =>
        r.active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      render: (r) => (
        <RowActions
          canManage={canManage}
          onEdit={() => setEditing(r)}
          onDelete={async () => {
            if (
              !(await confirm({
                title: 'Delete operation',
                message: `Delete "${r.name}"?`,
                danger: true,
                confirmLabel: 'Delete',
              }))
            )
              return
            try {
              await remove.mutateAsync(r.id)
              toast.success('Operation deleted')
            } catch (e) {
              toast.error(toUserMessage(e, 'Delete failed'))
            }
          }}
        />
      ),
    },
  ]

  return (
    <Card>
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button className="btn-primary btn-sm" onClick={() => setEditing(null)}>
            <Plus size={16} /> Add Operation
          </button>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={isLoading}
        empty={{
          icon: <Cog size={36} />,
          title: 'No operations',
          description: 'Add standard operations (Turning, Milling, …).',
        }}
      />
      {editing !== undefined && (
        <OperationModal
          operation={editing}
          centres={centres}
          onClose={() => setEditing(undefined)}
          onSave={async (vals) => {
            if (editing) await update.mutateAsync({ id: editing.id, patch: vals })
            else await create.mutateAsync(vals)
          }}
        />
      )}
    </Card>
  )
}

// ---- Routings --------------------------------------------------------------
function RoutingsTab({ canManage }: { canManage: boolean }) {
  const { data: rows = [], isLoading } = rtHooks.useList()
  const { data: materials = [] } = useMaterials()
  const create = rtHooks.useCreate()
  const update = rtHooks.useUpdate()
  const remove = rtHooks.useRemove()
  const toast = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Routing | null | undefined>(undefined)
  const [stepsFor, setStepsFor] = useState<Routing | null>(null)
  const matName = (id?: string) => materials.find((m) => m.id === id)?.name ?? '—'

  const columns: DataTableColumn<Routing>[] = [
    {
      key: 'code',
      header: 'Code',
      cellClassName: 'font-mono text-xs text-slate-500',
      render: (r) => r.code || '—',
    },
    {
      key: 'name',
      header: 'Name',
      cellClassName: 'font-semibold text-slate-800',
      render: (r) => r.name,
    },
    {
      key: 'material',
      header: 'Material',
      render: (r) => (r.materialId ? matName(r.materialId) : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) =>
        r.active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <button className="btn-ghost btn-sm" onClick={() => setStepsFor(r)} title="Edit steps">
            <Route size={15} />
          </button>
          <RowActions
            canManage={canManage}
            onEdit={() => setEditing(r)}
            onDelete={async () => {
              if (
                !(await confirm({
                  title: 'Delete routing',
                  message: `Delete "${r.name}" and its steps?`,
                  danger: true,
                  confirmLabel: 'Delete',
                }))
              )
                return
              try {
                await remove.mutateAsync(r.id)
                toast.success('Routing deleted')
              } catch (e) {
                toast.error(toUserMessage(e, 'Delete failed'))
              }
            }}
          />
        </div>
      ),
    },
  ]

  return (
    <Card>
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button className="btn-primary btn-sm" onClick={() => setEditing(null)}>
            <Plus size={16} /> Add Routing
          </button>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={isLoading}
        empty={{
          icon: <Route size={36} />,
          title: 'No routings',
          description: 'Create a reusable process plan, then add its operation steps.',
        }}
      />
      {editing !== undefined && (
        <RoutingModal
          routing={editing}
          materials={materials.map((m) => ({ id: m.id, name: m.name }))}
          onClose={() => setEditing(undefined)}
          onSave={async (vals) => {
            if (editing) await update.mutateAsync({ id: editing.id, patch: vals })
            else await create.mutateAsync(vals)
          }}
        />
      )}
      {stepsFor && (
        <RoutingStepsModal
          routing={stepsFor}
          canManage={canManage}
          onClose={() => setStepsFor(null)}
        />
      )}
    </Card>
  )
}

// ---- Modals ----------------------------------------------------------------
function ModalShell({
  title,
  onClose,
  onSave,
  saving,
  children,
}: {
  title: string
  onClose: () => void
  onSave: () => void
  saving: boolean
  children: React.ReactNode
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  )
}

// Basic (code/name/description/active) modal used for Work Centres.
function SimpleMasterModal({
  title,
  initial,
  onClose,
  onSave,
}: {
  title: string
  initial: { code?: string; name?: string; description?: string; active?: boolean } | null
  onClose: () => void
  onSave: (vals: {
    code?: string
    name: string
    description?: string
    active: boolean
  }) => Promise<void>
  fields: 'basic'
}) {
  const toast = useToast()
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [active, setActive] = useState(initial?.active ?? true)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return toast.error('Name is required')
    setSaving(true)
    try {
      await onSave({
        code: code.trim() || undefined,
        name: name.trim(),
        description: description.trim() || undefined,
        active,
      })
      toast.success('Saved')
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title={title} onClose={onClose} onSave={save} saving={saving}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Code" hint="Optional">
          <Input value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label="Name" required>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <ActiveField checked={active} onChange={setActive} />
        <Field label="Description" className="sm:col-span-2">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
    </ModalShell>
  )
}

function MachineModal({
  machine,
  centres,
  onClose,
  onSave,
}: {
  machine: Machine | null
  centres: WorkCenter[]
  onClose: () => void
  onSave: (vals: Partial<Machine>) => Promise<void>
}) {
  const toast = useToast()
  const [code, setCode] = useState(machine?.code ?? '')
  const [name, setName] = useState(machine?.name ?? '')
  const [machineType, setType] = useState(machine?.machineType ?? '')
  const [workCenterId, setWc] = useState(machine?.workCenterId ?? '')
  const [status, setStatus] = useState<Machine['status']>(machine?.status ?? 'Active')
  const [hourlyRate, setRate] = useState(
    machine?.hourlyRate != null ? String(machine.hourlyRate) : '',
  )
  const [active, setActive] = useState(machine?.active ?? true)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return toast.error('Name is required')
    setSaving(true)
    try {
      await onSave({
        code: code.trim() || undefined,
        name: name.trim(),
        machineType: machineType.trim() || undefined,
        workCenterId: workCenterId || undefined,
        status,
        hourlyRate: hourlyRate === '' ? undefined : Number(hourlyRate),
        active,
      })
      toast.success('Saved')
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      title={machine ? 'Edit Machine' : 'Add Machine'}
      onClose={onClose}
      onSave={save}
      saving={saving}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Code" hint="Optional">
          <Input value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label="Name" required>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Type">
          <Input
            value={machineType}
            onChange={(e) => setType(e.target.value)}
            placeholder="VMC / Lathe / …"
          />
        </Field>
        <Field label="Work Centre">
          <Select value={workCenterId} onChange={(e) => setWc(e.target.value)}>
            <option value="">— none —</option>
            {centres.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as Machine['status'])}>
            <option value="Active">Active</option>
            <option value="Maintenance">Maintenance</option>
            <option value="Inactive">Inactive</option>
          </Select>
        </Field>
        <Field label="Hourly Rate" hint="Optional">
          <Input
            type="number"
            step="0.01"
            value={hourlyRate}
            onChange={(e) => setRate(e.target.value)}
          />
        </Field>
        <ActiveField checked={active} onChange={setActive} />
      </div>
    </ModalShell>
  )
}

function OperationModal({
  operation,
  centres,
  onClose,
  onSave,
}: {
  operation: Operation | null
  centres: WorkCenter[]
  onClose: () => void
  onSave: (vals: Partial<Operation>) => Promise<void>
}) {
  const toast = useToast()
  const [code, setCode] = useState(operation?.code ?? '')
  const [name, setName] = useState(operation?.name ?? '')
  const [description, setDescription] = useState(operation?.description ?? '')
  const [defaultWorkCenterId, setWc] = useState(operation?.defaultWorkCenterId ?? '')
  const [active, setActive] = useState(operation?.active ?? true)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return toast.error('Name is required')
    setSaving(true)
    try {
      await onSave({
        code: code.trim() || undefined,
        name: name.trim(),
        description: description.trim() || undefined,
        defaultWorkCenterId: defaultWorkCenterId || undefined,
        active,
      })
      toast.success('Saved')
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      title={operation ? 'Edit Operation' : 'Add Operation'}
      onClose={onClose}
      onSave={save}
      saving={saving}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Code" hint="Optional">
          <Input value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label="Name" required>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Default Work Centre">
          <Select value={defaultWorkCenterId} onChange={(e) => setWc(e.target.value)}>
            <option value="">— none —</option>
            {centres.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <ActiveField checked={active} onChange={setActive} />
        <Field label="Description" className="sm:col-span-2">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
    </ModalShell>
  )
}

function RoutingModal({
  routing,
  materials,
  onClose,
  onSave,
}: {
  routing: Routing | null
  materials: { id: string; name: string }[]
  onClose: () => void
  onSave: (vals: Partial<Routing>) => Promise<void>
}) {
  const toast = useToast()
  const [code, setCode] = useState(routing?.code ?? '')
  const [name, setName] = useState(routing?.name ?? '')
  const [materialId, setMaterialId] = useState(routing?.materialId ?? '')
  const [description, setDescription] = useState(routing?.description ?? '')
  const [active, setActive] = useState(routing?.active ?? true)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return toast.error('Name is required')
    setSaving(true)
    try {
      await onSave({
        code: code.trim() || undefined,
        name: name.trim(),
        materialId: materialId || undefined,
        description: description.trim() || undefined,
        active,
      })
      toast.success('Saved')
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      title={routing ? 'Edit Routing' : 'Add Routing'}
      onClose={onClose}
      onSave={save}
      saving={saving}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Code" hint="Optional">
          <Input value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label="Name" required>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Material" hint="Optional — ties this routing to a part">
          <Select value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
            <option value="">— none —</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <ActiveField checked={active} onChange={setActive} />
        <Field label="Description" className="sm:col-span-2">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
      {!routing && (
        <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
          Save the routing, then use the route icon in the list to add its operation steps.
        </p>
      )}
    </ModalShell>
  )
}

// Routing steps editor — add/remove operation steps on a routing.
function RoutingStepsModal({
  routing,
  canManage,
  onClose,
}: {
  routing: Routing
  canManage: boolean
  onClose: () => void
}) {
  const { data: steps = [], isLoading } = useRoutingSteps(routing.id)
  const { data: ops = [] } = useOperations()
  const { data: centres = [] } = useWorkCenters()
  const { data: machines = [] } = useMachines()
  const createStep = useCreateRoutingStep()
  const removeStep = useDeleteRoutingStep(routing.id)
  const toast = useToast()

  const nextSeq = useMemo(
    () => (steps.length ? Math.max(...steps.map((s) => s.seq)) + 10 : 10),
    [steps],
  )
  const [operationId, setOp] = useState('')
  const [workCenterId, setWc] = useState('')
  const [machineId, setMc] = useState('')
  const [setupMin, setSetup] = useState('')
  const [cycleMin, setCycle] = useState('')

  const opName = (id?: string) => ops.find((o) => o.id === id)?.name ?? '—'
  const wcName = (id?: string) => centres.find((c) => c.id === id)?.name ?? '—'
  const mcName = (id?: string) => machines.find((m) => m.id === id)?.name ?? '—'

  async function addStep() {
    if (!operationId) return toast.error('Pick an operation')
    try {
      await createStep.mutateAsync({
        routingId: routing.id,
        seq: nextSeq,
        operationId,
        workCenterId: workCenterId || undefined,
        machineId: machineId || undefined,
        setupMin: setupMin === '' ? undefined : Number(setupMin),
        cycleMin: cycleMin === '' ? undefined : Number(cycleMin),
      } as Partial<RoutingStep> & { routingId: string })
      setOp('')
      setWc('')
      setMc('')
      setSetup('')
      setCycle('')
    } catch (e) {
      toast.error(toUserMessage(e, 'Could not add step'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`Routing steps — ${routing.name}`}
      footer={
        <button className="btn-primary" onClick={onClose}>
          Done
        </button>
      }
    >
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : steps.length === 0 ? (
        <p className="text-sm text-slate-500">No steps yet. Add operations below in sequence.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-2xs uppercase tracking-wide text-slate-400">
                <th className="py-1 pr-3">Seq</th>
                <th className="py-1 pr-3">Operation</th>
                <th className="py-1 pr-3">Work Centre</th>
                <th className="py-1 pr-3">Machine</th>
                <th className="py-1 pr-3 text-right">Setup</th>
                <th className="py-1 pr-3 text-right">Cycle</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {steps.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="py-1.5 pr-3 font-mono text-xs text-slate-500">{s.seq}</td>
                  <td className="py-1.5 pr-3 font-medium">{opName(s.operationId)}</td>
                  <td className="py-1.5 pr-3 text-slate-600">{wcName(s.workCenterId)}</td>
                  <td className="py-1.5 pr-3 text-slate-600">{mcName(s.machineId)}</td>
                  <td className="py-1.5 pr-3 text-right">{s.setupMin ?? '—'}</td>
                  <td className="py-1.5 pr-3 text-right">{s.cycleMin ?? '—'}</td>
                  <td className="py-1.5 text-right">
                    {canManage && (
                      <button
                        className="btn-ghost btn-sm text-red-500"
                        title="Remove"
                        onClick={async () => {
                          try {
                            await removeStep.mutateAsync(s.id)
                          } catch (e) {
                            toast.error(toUserMessage(e, 'Delete failed'))
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <div className="mt-4 rounded-xl border border-slate-200 p-3">
          <p className="mb-2 text-2xs font-bold uppercase tracking-wide text-slate-500">
            Add step (seq {nextSeq})
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Field label="Operation" required>
              <Select value={operationId} onChange={(e) => setOp(e.target.value)}>
                <option value="">— select —</option>
                {ops.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Work Centre">
              <Select value={workCenterId} onChange={(e) => setWc(e.target.value)}>
                <option value="">— none —</option>
                {centres.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Machine">
              <Select value={machineId} onChange={(e) => setMc(e.target.value)}>
                <option value="">— none —</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Setup (min)">
              <Input
                type="number"
                step="0.1"
                value={setupMin}
                onChange={(e) => setSetup(e.target.value)}
              />
            </Field>
            <Field label="Cycle (min/pc)">
              <Input
                type="number"
                step="0.1"
                value={cycleMin}
                onChange={(e) => setCycle(e.target.value)}
              />
            </Field>
            <div className="flex items-end">
              <button
                className="btn-primary btn-sm w-full"
                onClick={addStep}
                disabled={createStep.isPending}
              >
                <Plus size={15} /> Add step
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
