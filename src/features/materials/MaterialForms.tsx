import { useState } from 'react'
import type { Material, MaterialOwnerType } from '@/types'
import { materialRepo, stockRepo, BusinessRuleError } from '@/data/repo'
import { useDb } from '@/data/store'
import { todayISO, qty } from '@/lib/format'
import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'

// ------------------------------------------------------------- Material master
export function MaterialForm({
  material,
  onClose,
}: {
  material: Material | null
  onClose: () => void
}) {
  const toast = useToast()
  const settings = useDb((db) => db.settings)
  const [form, setForm] = useState({
    name: material?.name ?? '',
    code: material?.code ?? '',
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

  function submit() {
    try {
      const payload = {
        name: form.name,
        code: form.code || undefined,
        type: form.type || undefined,
        unit: form.unit,
        description: form.description || undefined,
        defaultRate: form.defaultRate === '' ? undefined : Number(form.defaultRate),
        reorderLevel: form.reorderLevel === '' ? undefined : Number(form.reorderLevel),
        active: form.active,
      }
      if (material) {
        materialRepo.update(material.id, payload)
        toast.success('Material updated')
      } else {
        materialRepo.create(payload)
        toast.success('Material added')
      }
      onClose()
    } catch (e) {
      toast.error(e instanceof BusinessRuleError ? e.message : 'Save failed')
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
          <button className="btn-primary" onClick={submit}>
            {material ? 'Save changes' : 'Add material'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Material Name" required className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
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
  const materials = useDb((db) => db.materials.filter((m) => m.active))
  const companies = useDb((db) => db.companies.filter((c) => c.active))
  const [form, setForm] = useState({
    date: todayISO(),
    materialId: materials[0]?.id ?? '',
    ownerType: 'Company' as MaterialOwnerType,
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

  function submit() {
    try {
      stockRepo.receipt({
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
      toast.error(e instanceof BusinessRuleError ? e.message : 'Save failed')
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
          <button className="btn-primary" onClick={submit}>
            Receive
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
        <Field label="Ownership" required>
          <Select
            value={form.ownerType}
            onChange={(e) => set('ownerType', e.target.value as MaterialOwnerType)}
          >
            <option value="Company">Company-owned</option>
            <option value="Shop">Shop-owned</option>
          </Select>
        </Field>
        <Field label="Owning Company" required={form.ownerType === 'Company'}>
          <Select
            value={form.companyId}
            onChange={(e) => set('companyId', e.target.value)}
            disabled={form.ownerType === 'Shop'}
          >
            <option value="">Select…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
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
        <Field label="Rate / Value per unit">
          <Input
            type="number"
            step="0.01"
            value={form.rate}
            onChange={(e) => set('rate', e.target.value)}
          />
        </Field>
        <Field label="Supplier / Source">
          <Input value={form.supplier} onChange={(e) => set('supplier', e.target.value)} />
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
  const materials = useDb((db) => db.materials.filter((m) => m.active))
  const jobs = useDb((db) =>
    db.jobs.filter((j) => !['Cancelled', 'Delivered'].includes(j.status)),
  )
  const [form, setForm] = useState({
    date: todayISO(),
    materialId: materials[0]?.id ?? '',
    jobId: jobs[0]?.id ?? '',
    quantity: '',
    note: '',
  })
  const [override, setOverride] = useState(false)

  const material = materials.find((m) => m.id === form.materialId)
  const balance = form.materialId ? stockRepo.balance(form.materialId).balance : 0

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function submit() {
    try {
      stockRepo.issue(
        {
          date: form.date,
          materialId: form.materialId,
          jobId: form.jobId,
          quantity: Number(form.quantity),
          unit: material?.unit ?? 'Nos',
          note: form.note || undefined,
        },
        override,
      )
      toast.success('Material issued to job')
      onClose()
    } catch (e) {
      toast.error(e instanceof BusinessRuleError ? e.message : 'Save failed')
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
          <button className="btn-primary" onClick={submit}>
            Issue
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
  const materials = useDb((db) => db.materials.filter((m) => m.active))
  const companies = useDb((db) => db.companies)
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

  function submit() {
    try {
      const signed =
        (form.direction === 'decrease' ? -1 : 1) * Math.abs(Number(form.quantity))
      stockRepo.adjust({
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
      toast.error(e instanceof BusinessRuleError ? e.message : 'Save failed')
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
          <button className="btn-primary" onClick={submit}>
            Apply adjustment
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
