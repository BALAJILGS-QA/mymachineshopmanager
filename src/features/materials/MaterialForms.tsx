import { useState } from 'react'
import { clsx } from 'clsx'
import type { Material, MaterialOwnerType, MaterialReceipt } from '@/types'
import {
  useCreateMaterial,
  useUpdateMaterial,
  useCreateReceipt,
  useUpdateReceipt,
  useCreateIssue,
  useCreateAdjustment,
  useCreateOwnPurchase,
  useMaterials,
  useMaterialBalance,
} from './hooks/useMaterials'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useJobs } from '@/features/jobs/hooks/useJobs'
import { useSettings } from '@/features/settings/hooks/useSettings'
import { DEFAULT_SETTINGS } from '@/data/seed'
import { toUserMessage } from '@/lib/api/errors'
import { todayISO, qty, currency } from '@/lib/format'
import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { PAYMENT_METHODS } from '@/constants/domain'
import type { PaymentMethod } from '@/types'

// ------------------------------------------------------------- Material master
export function MaterialForm({
  material,
  presetCompanyId,
  onClose,
}: {
  material: Material | null
  presetCompanyId?: string // pre-scope a new material to a customer (or '' for shared)
  onClose: () => void
}) {
  const toast = useToast()
  const createMaterial = useCreateMaterial()
  const updateMaterial = useUpdateMaterial()
  const saving = createMaterial.isPending || updateMaterial.isPending
  const settings = useSettings().data ?? DEFAULT_SETTINGS
  const { data: allCompanies = [] } = useCompanies()
  const companies = allCompanies.filter((c) => c.active || c.id === material?.companyId)
  const [form, setForm] = useState({
    name: material?.name ?? '',
    code: material?.code ?? '',
    companyId: material?.companyId ?? presetCompanyId ?? '',
    type: material?.type ?? '',
    unit: material?.unit ?? settings.units[0] ?? 'Nos',
    description: material?.description ?? '',
    defaultRate: material?.defaultRate ?? '',
    reorderLevel: material?.reorderLevel ?? '',
    active: material?.active ?? true,
  })

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit() {
    try {
      const payload = {
        name: form.name,
        code: form.code || undefined,
        companyId: form.companyId || undefined,
        type: form.type || undefined,
        unit: form.unit,
        description: form.description || undefined,
        defaultRate: form.defaultRate === '' ? undefined : Number(form.defaultRate),
        reorderLevel: form.reorderLevel === '' ? undefined : Number(form.reorderLevel),
        active: form.active,
      }
      if (material) {
        await updateMaterial.mutateAsync({ id: material.id, patch: payload })
        toast.success('Material updated')
      } else {
        await createMaterial.mutateAsync(payload)
        toast.success('Material added')
      }
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Save failed'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={material ? 'Edit Material' : 'Add Material'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : material ? 'Save changes' : 'Add material'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Material Name" required className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        </Field>
        <Field label="Belongs to" hint="A customer's part, or shared / own material">
          <Select value={form.companyId} onChange={(e) => set('companyId', e.target.value)}>
            <option value="">Shared / Own (Sree Balaji)</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Material Code" hint="Blank to auto-generate">
          <Input value={form.code} onChange={(e) => set('code', e.target.value)} />
        </Field>
        <Field label="Type / Grade">
          <Select value={form.type} onChange={(e) => set('type', e.target.value)}>
            <option value="">—</option>
            {settings.materialTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Unit" required>
          <Select value={form.unit} onChange={(e) => set('unit', e.target.value)}>
            {settings.units.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </Field>
        <Field label="Default Rate">
          <Input
            type="number"
            step="0.01"
            value={form.defaultRate}
            onChange={(e) => set('defaultRate', e.target.value as never)}
          />
        </Field>
        <Field label="Reorder Level" hint="Low-stock alert threshold">
          <Input
            type="number"
            step="0.001"
            value={form.reorderLevel}
            onChange={(e) => set('reorderLevel', e.target.value as never)}
          />
        </Field>
        <Field label="Active">
          <label className="flex items-center gap-2 py-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set('active', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Active
          </label>
        </Field>
        <Field label="Description / Dimensions" className="sm:col-span-2">
          <Textarea
            rows={2}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- Receipt form
export function ReceiptForm({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const createReceipt = useCreateReceipt()
  const { data: allMaterials = [] } = useMaterials()
  const materials = allMaterials.filter((m) => m.active)
  const { data: allCompanies = [] } = useCompanies()
  const companies = allCompanies.filter((c) => c.active)
  const [form, setForm] = useState({
    date: todayISO(),
    materialId: materials[0]?.id ?? '',
    ownerType: 'Shop' as MaterialOwnerType,
    companyId: companies[0]?.id ?? '',
    supplier: '',
    quantity: '',
    rate: '',
    batchNo: '',
    reference: '',
    notes: '',
  })
  const material = materials.find((m) => m.id === form.materialId)

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit() {
    try {
      await createReceipt.mutateAsync({
        date: form.date,
        materialId: form.materialId,
        ownerType: form.ownerType,
        companyId: form.ownerType === 'Company' ? form.companyId : undefined,
        supplier: form.supplier || undefined,
        quantity: Number(form.quantity),
        unit: material?.unit ?? 'Nos',
        rate: form.rate === '' ? undefined : Number(form.rate),
        batchNo: form.batchNo || undefined,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
      })
      toast.success('Material received into stock')
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Save failed'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Receive Material"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={createReceipt.isPending}>
            {createReceipt.isPending ? 'Saving…' : 'Receive'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Date" required>
          <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="Material" required>
          <Select value={form.materialId} onChange={(e) => set('materialId', e.target.value)}>
            <option value="">Select…</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.unit})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Material belongs to" required>
          <Select
            value={form.ownerType}
            onChange={(e) => set('ownerType', e.target.value as MaterialOwnerType)}
          >
            <option value="Shop">Own material (shop stock)</option>
            <option value="Company">Customer material</option>
          </Select>
        </Field>
        {form.ownerType === 'Company' && (
          <Field label="Customer (owning company)" required>
            <Select value={form.companyId} onChange={(e) => set('companyId', e.target.value)}>
              <option value="">Select…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={`Quantity ${material ? `(${material.unit})` : ''}`} required>
          <Input
            type="number"
            step="0.001"
            min={0}
            value={form.quantity}
            onChange={(e) => set('quantity', e.target.value)}
          />
        </Field>
        <Field label="Rate / Value per unit">
          <Input
            type="number"
            step="0.01"
            value={form.rate}
            onChange={(e) => set('rate', e.target.value)}
          />
        </Field>
        <Field
          label="Received from (source)"
          hint="Where the material came to your shop floor from"
        >
          <Input
            value={form.supplier}
            placeholder="Supplier / customer / branch…"
            onChange={(e) => set('supplier', e.target.value)}
          />
        </Field>
        <Field label="Heat / Batch No.">
          <Input value={form.batchNo} onChange={(e) => set('batchNo', e.target.value)} />
        </Field>
        <Field label="Reference">
          <Input value={form.reference} onChange={(e) => set('reference', e.target.value)} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------------ Issue form
export function IssueForm({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const createIssue = useCreateIssue()
  const { data: allMaterials = [] } = useMaterials()
  const materials = allMaterials.filter((m) => m.active)
  const { data: allJobs = [] } = useJobs()
  const jobs = allJobs.filter((j) => !['Cancelled', 'Delivered'].includes(j.status))
  const [form, setForm] = useState({
    date: todayISO(),
    materialId: materials[0]?.id ?? '',
    jobId: jobs[0]?.id ?? '',
    quantity: '',
    note: '',
  })
  const [override, setOverride] = useState(false)

  const material = materials.find((m) => m.id === form.materialId)
  // Issues draw from own (shop) stock; show that balance.
  const { data: balance = 0 } = useMaterialBalance(form.materialId)

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit() {
    try {
      await createIssue.mutateAsync({
        input: {
          date: form.date,
          materialId: form.materialId,
          jobId: form.jobId,
          quantity: Number(form.quantity),
          unit: material?.unit ?? 'Nos',
          note: form.note || undefined,
        },
        override,
      })
      toast.success('Material issued to job')
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Save failed'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Issue Material to Job"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={createIssue.isPending}>
            {createIssue.isPending ? 'Saving…' : 'Issue'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Date" required>
          <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="Job Order" required>
          <Select value={form.jobId} onChange={(e) => set('jobId', e.target.value)}>
            <option value="">Select…</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.jobNo} — {j.partName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Material" required>
          <Select value={form.materialId} onChange={(e) => set('materialId', e.target.value)}>
            <option value="">Select…</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.unit})
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={`Quantity ${material ? `(${material.unit})` : ''}`}
          required
          hint={material ? `In stock: ${qty(balance)} ${material.unit}` : undefined}
        >
          <Input
            type="number"
            step="0.001"
            min={0}
            value={form.quantity}
            onChange={(e) => set('quantity', e.target.value)}
          />
        </Field>
        <Field label="Note" className="sm:col-span-2">
          <Textarea rows={2} value={form.note} onChange={(e) => set('note', e.target.value)} />
        </Field>
        {Number(form.quantity) > balance && (
          <label className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 sm:col-span-2">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
              className="h-4 w-4 rounded border-amber-300"
            />
            Quantity exceeds available stock — authorise override to issue anyway
          </label>
        )}
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------- Adjustment form
export function AdjustmentForm({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const createAdjustment = useCreateAdjustment()
  const { data: allMaterials = [] } = useMaterials()
  const materials = allMaterials.filter((m) => m.active)
  const { data: companies = [] } = useCompanies()
  const [form, setForm] = useState({
    date: todayISO(),
    materialId: materials[0]?.id ?? '',
    companyId: '',
    direction: 'increase' as 'increase' | 'decrease',
    quantity: '',
    reason: '',
  })
  const material = materials.find((m) => m.id === form.materialId)

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit() {
    try {
      const signed = (form.direction === 'decrease' ? -1 : 1) * Math.abs(Number(form.quantity))
      await createAdjustment.mutateAsync({
        date: form.date,
        materialId: form.materialId,
        companyId: form.companyId || undefined,
        quantity: signed,
        unit: material?.unit ?? 'Nos',
        reason: form.reason,
      })
      toast.success('Stock adjusted')
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Save failed'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Stock Adjustment"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={createAdjustment.isPending}>
            {createAdjustment.isPending ? 'Saving…' : 'Apply adjustment'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Date" required>
          <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="Material" required>
          <Select value={form.materialId} onChange={(e) => set('materialId', e.target.value)}>
            <option value="">Select…</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.unit})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Company scope (optional)">
          <Select value={form.companyId} onChange={(e) => set('companyId', e.target.value)}>
            <option value="">Overall / shop</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Direction" required>
            <Select
              value={form.direction}
              onChange={(e) => set('direction', e.target.value as 'increase' | 'decrease')}
            >
              <option value="increase">Increase (+)</option>
              <option value="decrease">Decrease (−)</option>
            </Select>
          </Field>
          <Field label={`Quantity ${material ? `(${material.unit})` : ''}`} required>
            <Input
              type="number"
              step="0.001"
              min={0}
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Reason" required>
          <Textarea rows={2} value={form.reason} onChange={(e) => set('reason', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

// ------------------------------------------ Add material (customer intake or own purchase)
// A single form: pick the stock type, then the relevant fields show dynamically.
// Passing `receipt` edits an existing customer intake (stock type is then fixed).
export function AddMaterialForm({
  receipt,
  onClose,
}: {
  receipt?: MaterialReceipt
  onClose: () => void
}) {
  const toast = useToast()
  const createReceipt = useCreateReceipt()
  const updateReceipt = useUpdateReceipt()
  const createPurchase = useCreateOwnPurchase()
  const isEdit = !!receipt
  const saving = createReceipt.isPending || updateReceipt.isPending || createPurchase.isPending
  const { data: allCompanies = [] } = useCompanies()
  const companies = allCompanies.filter((c) => c.active || c.id === receipt?.companyId)
  const { data: allMaterials = [] } = useMaterials()
  const [addingMaterial, setAddingMaterial] = useState(false)
  const [kind, setKind] = useState<'customer' | 'own'>('customer')

  const [form, setForm] = useState({
    companyId: receipt?.companyId ?? companies[0]?.id ?? '',
    supplier: receipt?.supplier ?? '',
    date: receipt?.date ?? todayISO(),
    materialId: receipt?.materialId ?? '',
    quantity: receipt ? String(receipt.quantity) : '',
    challanNo: receipt?.reference ?? '',
    totalCost: '',
    totalGst: '',
    method: 'Bank Transfer' as PaymentMethod,
    notes: receipt?.notes ?? '',
  })
  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  // Customer intake: this customer's materials + shared/own. Own purchase: shared/own only.
  const materials = allMaterials.filter((m) => {
    if (!(m.active || m.id === receipt?.materialId)) return false
    if (kind === 'own') return !m.companyId
    return !m.companyId || m.companyId === form.companyId
  })
  const material = materials.find((m) => m.id === form.materialId)
  const total = (Number(form.totalCost) || 0) + (Number(form.totalGst) || 0)

  async function submit() {
    try {
      if (!form.materialId) return toast.error('Select a material')
      const q = Number(form.quantity)
      if (!(q > 0)) return toast.error('Quantity must be greater than zero')
      if (kind === 'customer') {
        if (!form.companyId) return toast.error('Select a company')
        const payload = {
          date: form.date,
          materialId: form.materialId,
          ownerType: 'Company' as MaterialOwnerType,
          companyId: form.companyId,
          supplier: form.supplier.trim() || undefined,
          quantity: q,
          unit: material?.unit ?? 'Nos',
          reference: form.challanNo.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }
        if (isEdit) {
          await updateReceipt.mutateAsync({ id: receipt!.id, patch: payload })
          toast.success('Intake updated')
        } else {
          await createReceipt.mutateAsync(payload)
          toast.success('Customer material received into stock')
        }
      } else {
        await createPurchase.mutateAsync({
          supplier: form.supplier.trim() || undefined,
          materialId: form.materialId,
          purchaseDate: form.date,
          quantity: q,
          unit: material?.unit ?? 'Nos',
          totalCost: Number(form.totalCost) || 0,
          totalGst: Number(form.totalGst) || 0,
          method: form.method,
          notes: form.notes.trim() || undefined,
        })
        toast.success('Own material purchased — stock + expense recorded')
      }
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Save failed'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Edit Customer Material' : 'Add Material'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving
              ? 'Saving…'
              : isEdit
                ? 'Save changes'
                : kind === 'customer'
                  ? 'Receive material'
                  : 'Record purchase'}
          </button>
        </>
      }
    >
      {!isEdit && (
        <div className="mb-3">
          <label className="label">Stock Type</label>
          <div className="inline-flex rounded-lg bg-slate-200/60 p-1">
            {(
              [
                { k: 'customer', label: 'Customer material' },
                { k: 'own', label: 'Own material' },
              ] as const
            ).map((t) => (
              <button
                key={t.k}
                type="button"
                onClick={() => {
                  setKind(t.k)
                  set('materialId', '') // material lists differ per stock type
                }}
                className={clsx(
                  'rounded-md px-4 py-1.5 text-sm font-medium transition',
                  kind === t.k
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {kind === 'own' && !isEdit && (
        <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
          Adds to own (shop) stock and records a linked expense automatically.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {kind === 'customer' && (
          <Field label="Company" required>
            <Select value={form.companyId} onChange={(e) => set('companyId', e.target.value)}>
              <option value="">Select…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field
          label={kind === 'customer' ? 'Where From' : 'Where Purchased'}
          hint={kind === 'customer' ? 'e.g. Customer supplied / Flowra Stores' : 'Supplier'}
        >
          <Input value={form.supplier} onChange={(e) => set('supplier', e.target.value)} />
        </Field>
        <Field label={kind === 'customer' ? 'From Date' : 'Date of Purchase'} required>
          <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="Material" required>
          <div className="flex gap-1.5">
            <Select
              value={form.materialId}
              onChange={(e) => set('materialId', e.target.value)}
              className="flex-1"
            >
              <option value="">Select…</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.unit})
                </option>
              ))}
            </Select>
            <button
              type="button"
              className="btn-secondary btn-sm shrink-0"
              onClick={() => setAddingMaterial(true)}
              disabled={kind === 'customer' && !form.companyId}
              title="Add a new material"
            >
              + New
            </button>
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity" required>
            <Input
              type="number"
              step="0.001"
              min={0}
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value)}
            />
          </Field>
          <Field label="Unit">
            <div className="input flex items-center bg-slate-50 text-slate-700">
              {material?.unit ?? '—'}
            </div>
          </Field>
        </div>

        {kind === 'customer' && (
          <Field label="Challan No">
            <Input value={form.challanNo} onChange={(e) => set('challanNo', e.target.value)} />
          </Field>
        )}

        {kind === 'own' && (
          <>
            <Field label="Material Cost (excl. GST)">
              <Input
                type="number"
                step="0.01"
                min={0}
                value={form.totalCost}
                onChange={(e) => set('totalCost', e.target.value)}
              />
            </Field>
            <Field label="Total GST">
              <Input
                type="number"
                step="0.01"
                min={0}
                value={form.totalGst}
                onChange={(e) => set('totalGst', e.target.value)}
              />
            </Field>
            <Field label="Payment Method">
              <Select
                value={form.method}
                onChange={(e) => set('method', e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
            <Field label="Total (cost + GST)">
              <div className="input flex items-center bg-slate-50 font-semibold text-slate-800">
                {currency(total)}
              </div>
            </Field>
          </>
        )}

        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
      {addingMaterial && (
        <MaterialForm
          material={null}
          presetCompanyId={kind === 'customer' ? form.companyId : ''}
          onClose={() => setAddingMaterial(false)}
        />
      )}
    </Modal>
  )
}
