import { useState } from 'react'
import type { JobOrder, JobPriority, JobStatus, MaterialOwnerType } from '@/types'
import { stockRepo, previewNextNo } from '@/data/repo'
import { SHOP_SCOPE } from '@/data/computations'
import { useDb } from '@/data/store'
import { useCreateJob, useUpdateJob } from './hooks/useJobs'
import { toUserMessage } from '@/lib/api/errors'
import { todayISO, qty } from '@/lib/format'
import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { JOB_PRIORITIES as PRIORITIES, JOB_STATUSES as STATUSES } from '@/constants/domain'

export function JobForm({ job, onClose }: { job: JobOrder | null; onClose: () => void }) {
  const toast = useToast()
  const createJob = useCreateJob()
  const updateJob = useUpdateJob()
  const saving = createJob.isPending || updateJob.isPending
  const companies = useDb((db) => db.companies.filter((c) => c.active || c.id === job?.companyId))
  const materials = useDb((db) => db.materials.filter((m) => m.active))
  const settings = useDb((db) => db.settings)

  const [form, setForm] = useState({
    companyId: job?.companyId ?? companies[0]?.id ?? '',
    partName: job?.partName ?? '',
    partNumber: job?.partNumber ?? '',
    customerPo: job?.customerPo ?? '',
    materialId: job?.materialId ?? '',
    materialQty: '',
    materialOwner: 'Shop' as MaterialOwnerType,
    orderedQty: job?.orderedQty ?? 1,
    completedQty: job?.completedQty ?? 0,
    rate: job?.rate ?? '',
    orderDate: job?.orderDate ?? todayISO(),
    dueDate: job?.dueDate ?? '',
    priority: job?.priority ?? ('Normal' as JobPriority),
    status: job?.status ?? ('Pending' as JobStatus),
    notes: job?.notes ?? '',
  })

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit() {
    try {
      const payload = {
        companyId: form.companyId,
        partName: form.partName,
        partNumber: form.partNumber || undefined,
        customerPo: form.customerPo || undefined,
        materialId: form.materialId || undefined,
        orderedQty: Number(form.orderedQty),
        completedQty: Number(form.completedQty),
        rate: form.rate === '' ? undefined : Number(form.rate),
        orderDate: form.orderDate,
        dueDate: form.dueDate || undefined,
        priority: form.priority,
        status: form.status,
        notes: form.notes || undefined,
      }
      if (job) {
        await updateJob.mutateAsync({ id: job.id, patch: payload })
        toast.success('Job order updated')
      } else {
        const consume = form.materialQty === '' ? undefined : Number(form.materialQty)
        await createJob.mutateAsync({
          ...payload,
          materialQty: consume,
          materialOwner: form.materialOwner,
        })
        toast.success(
          consume ? 'Job order created — material issued from stock' : 'Job order created',
        )
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
      size="lg"
      title={job ? `Edit ${job.jobNo}` : 'New Job Order'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : job ? 'Save changes' : 'Create job order'}
          </button>
        </>
      }
    >
      {!job && (
        <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
          Job number will be <b>{previewNextNo('job', settings.numbering.job)}</b>
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Company" required>
          <Select value={form.companyId} onChange={(e) => set('companyId', e.target.value)}>
            <option value="">Select company…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Customer PO / Reference">
          <Input value={form.customerPo} onChange={(e) => set('customerPo', e.target.value)} />
        </Field>
        <Field label="Part / Product Name" required>
          <Input value={form.partName} onChange={(e) => set('partName', e.target.value)} />
        </Field>
        <Field label="Part / Drawing No.">
          <Input value={form.partNumber} onChange={(e) => set('partNumber', e.target.value)} />
        </Field>
        <Field label="Material">
          <Select value={form.materialId} onChange={(e) => set('materialId', e.target.value)}>
            <option value="">— none —</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        {!job && form.materialId && (
          <>
            <Field label="Consume from stock">
              <Select
                value={form.materialOwner}
                onChange={(e) => set('materialOwner', e.target.value as MaterialOwnerType)}
              >
                <option value="Shop">Own (shop) stock</option>
                <option value="Company">This customer's stock</option>
              </Select>
            </Field>
            <Field
              label="Material Qty to Consume"
              hint={(() => {
                const m = materials.find((x) => x.id === form.materialId)
                const scope = form.materialOwner === 'Company' ? form.companyId : SHOP_SCOPE
                const bal =
                  form.materialId && (form.materialOwner === 'Shop' || form.companyId)
                    ? stockRepo.balance(form.materialId, scope).balance
                    : 0
                return m
                  ? `In ${form.materialOwner === 'Company' ? 'customer' : 'own'} stock: ${qty(bal)} ${m.unit} — issued on create`
                  : undefined
              })()}
            >
              <Input
                type="number"
                step="0.001"
                min={0}
                value={form.materialQty}
                placeholder="0"
                onChange={(e) => set('materialQty', e.target.value as never)}
              />
            </Field>
          </>
        )}
        <Field label="Rate (per unit)" hint="Optional; used to prefill invoices">
          <Input
            type="number"
            step="0.01"
            value={form.rate}
            onChange={(e) => set('rate', e.target.value as never)}
          />
        </Field>
        <Field label="Ordered Quantity" required>
          <Input
            type="number"
            step="0.001"
            min={0}
            value={form.orderedQty}
            onChange={(e) => set('orderedQty', e.target.value as never)}
          />
        </Field>
        <Field label="Completed Quantity">
          <Input
            type="number"
            step="0.001"
            min={0}
            value={form.completedQty}
            onChange={(e) => set('completedQty', e.target.value as never)}
          />
        </Field>
        <Field label="Order Date" required>
          <Input
            type="date"
            value={form.orderDate}
            onChange={(e) => set('orderDate', e.target.value)}
          />
        </Field>
        <Field label="Due Date">
          <Input
            type="date"
            value={form.dueDate}
            onChange={(e) => set('dueDate', e.target.value)}
          />
        </Field>
        <Field label="Priority">
          <Select
            value={form.priority}
            onChange={(e) => set('priority', e.target.value as JobPriority)}
          >
            {PRIORITIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={(e) => set('status', e.target.value as JobStatus)}>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
