import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import type { JobOrder, JobPriority, JobStatus, MaterialOwnerType } from '@/types'
import { SHOP_SCOPE } from '@/data/computations'
import { useCreateJob, useUpdateJob } from './hooks/useJobs'
import { useSetMaterialRequirement, useReserveMaterial } from './hooks/useReservations'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useMaterials, useMaterialBalance } from '@/features/materials/hooks/useMaterials'
import { usePreviewNo } from '@/features/shared/usePreviewNo'
import { toUserMessage } from '@/lib/api/errors'
import { currency, qty, fmtDateTime } from '@/lib/format'
import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { DateInput } from '@/components/ui/DateInput'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { JOB_PRIORITIES as PRIORITIES, JOB_FORM_STATUSES as STATUSES } from '@/constants/domain'

// Section wrapper — keeps the MSMS design language, just adds clear grouping.
function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h3>
        {hint && <span className="text-2xs text-slate-400">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

// A read-only "comes from master" value tile.
function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label text-slate-500">{label}</div>
      <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
        {value}
      </div>
    </div>
  )
}

export function JobForm({ job, onClose }: { job: JobOrder | null; onClose: () => void }) {
  const toast = useToast()
  const createJob = useCreateJob()
  const updateJob = useUpdateJob()
  const setRequirement = useSetMaterialRequirement()
  const reserveMaterial = useReserveMaterial()
  const saving =
    createJob.isPending ||
    updateJob.isPending ||
    setRequirement.isPending ||
    reserveMaterial.isPending
  const { data: allCompanies = [] } = useCompanies()
  const companies = allCompanies.filter((c) => c.active || c.id === job?.companyId)
  const {
    data: allMaterials = [],
    isLoading: materialsLoading,
    isError: materialsError,
  } = useMaterials()
  const jobNoPreview = usePreviewNo('job')

  const [form, setForm] = useState({
    companyId: job?.companyId ?? '',
    partName: job?.partName ?? '',
    partNumber: job?.partNumber ?? '',
    customerPo: job?.customerPo ?? '',
    materialId: job?.materialId ?? '',
    materialQty: '',
    materialOwner: 'Shop' as MaterialOwnerType,
    orderedQty: job?.orderedQty ?? 1,
    plannedQty: (job?.plannedQty ?? job?.orderedQty ?? 1) as number | '',
    completedQty: job?.completedQty ?? 0,
    rate: job?.rate ?? '',
    orderDate: job?.orderDate ?? '',
    dueDate: job?.dueDate ?? '',
    priority: job?.priority ?? ('Normal' as JobPriority),
    status: job?.status ?? ('Pending' as JobStatus),
    notes: job?.notes ?? '',
  })

  // Company → Material: only this customer's materials + own/shop (companyId null).
  // The job's current material is always kept so editing never loses it.
  const companyMaterials = useMemo(
    () =>
      allMaterials.filter(
        (m) =>
          m.active && (!m.companyId || m.companyId === form.companyId || m.id === form.materialId),
      ),
    [allMaterials, form.companyId, form.materialId],
  )
  const selectedMaterial = allMaterials.find((m) => m.id === form.materialId)

  const consumeScope = form.materialOwner === 'Company' ? form.companyId : SHOP_SCOPE
  const { data: available = 0 } = useMaterialBalance(form.materialId, consumeScope)

  const orderedNum = Number(form.orderedQty) || 0
  const plannedNum = form.plannedQty === '' ? orderedNum : Number(form.plannedQty)
  const reserveNum = form.materialQty === '' ? 0 : Number(form.materialQty) || 0
  // Business rule (confirmed with the codebase): MSMS has no finished-goods stock —
  // a job manufactures the full ordered quantity; raw material is consumed from
  // inventory. So Production Required = Ordered Quantity.
  const productionRequired = orderedNum
  const remainingToPlan = Math.max(0, orderedNum - plannedNum)

  const stockStatus: 'green' | 'orange' | 'red' | null = !form.materialId
    ? null
    : available <= 0
      ? 'red'
      : reserveNum > 0 && available < reserveNum
        ? 'orange'
        : 'green'

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  // Changing company clears the material-dependent fields (requirement 2).
  function onCompanyChange(companyId: string) {
    setForm((f) => ({ ...f, companyId, materialId: '', materialQty: '', materialOwner: 'Shop' }))
  }

  function validate(): string | null {
    if (!form.companyId) return 'Select a company.'
    if (!form.partName.trim()) return 'Part / Product name is required.'
    if (!form.orderDate) return 'Order date is required.'
    if (!(orderedNum > 0)) return 'Ordered quantity must be greater than zero.'
    if (plannedNum < 0) return 'Planned quantity cannot be negative.'
    if (plannedNum > orderedNum) return 'Planned quantity cannot exceed the production requirement.'
    return null
  }

  async function submit() {
    const err = validate()
    if (err) {
      toast.error(err)
      return
    }
    try {
      const payload = {
        companyId: form.companyId,
        partName: form.partName,
        partNumber: form.partNumber || undefined,
        customerPo: form.customerPo || undefined,
        materialId: form.materialId || undefined,
        orderedQty: orderedNum,
        completedQty: Number(form.completedQty) || 0,
        rate: form.rate === '' ? undefined : Number(form.rate),
        orderDate: form.orderDate,
        dueDate: form.dueDate || undefined,
        priority: form.priority,
        status: form.status,
        notes: form.notes || undefined,
      }
      if (job) {
        // Edit: planned qty persists via the normal (direct) job update path.
        await updateJob.mutateAsync({ id: job.id, patch: { ...payload, plannedQty: plannedNum } })
        toast.success('Job order updated')
      } else {
        // Create: reserve-then-consume. The order is created WITHOUT an auto-issue
        // (materialQty 0); raw material is RESERVED at planning and consumed on the
        // shop floor. Server derives scope from the order's chosen pool.
        const created = await createJob.mutateAsync({
          ...payload,
          completedQty: 0,
        })
        // Persist a non-default planned qty without touching the create_job RPC.
        if (plannedNum !== orderedNum) {
          await updateJob.mutateAsync({ id: created.id, patch: { plannedQty: plannedNum } })
        }
        // Record the material requirement + chosen pool, then try to reserve it.
        if (form.materialId && reserveNum > 0) {
          const ownerScope = form.materialOwner === 'Company' ? form.companyId : null
          await setRequirement.mutateAsync({
            jobId: created.id,
            requiredQty: reserveNum,
            ownerScope,
          })
          try {
            await reserveMaterial.mutateAsync({ jobId: created.id, quantity: reserveNum })
            toast.success('Production order created — material reserved from stock')
          } catch (re) {
            // Keep the order (requirement is set); surface the shortage so the user
            // can reserve later / override from the order's Materials tab.
            toast.error(
              toUserMessage(re, 'Order created, but material could not be fully reserved'),
            )
          }
        } else {
          toast.success('Production order created')
        }
      }
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Save failed'))
    }
  }

  const unit = selectedMaterial?.unit ?? ''
  const companyLabel = companies.find((c) => c.id === form.companyId)?.name ?? '—'
  const masterIncomplete = !!form.materialId && (!selectedMaterial?.type || !selectedMaterial?.unit)

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={job ? `Edit ${job.jobNo}` : 'New Production Order'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : job ? 'Save changes' : 'Create production order'}
          </button>
        </>
      }
    >
      {job ? (
        <p className="mb-3 text-right text-2xs text-slate-500">
          Last updated {fmtDateTime(job.updatedAt)}
        </p>
      ) : (
        <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
          Job number will be <b>{jobNoPreview}</b>
        </p>
      )}

      <div className="space-y-4">
        {/* A. CUSTOMER & ORDER */}
        <Section title="Customer & Order">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Company" required>
              <Select value={form.companyId} onChange={(e) => onCompanyChange(e.target.value)}>
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
            <Field label="Order Date" required>
              <DateInput value={form.orderDate} onChange={(v) => set('orderDate', v)} />
            </Field>
            <Field label="Due Date">
              <DateInput value={form.dueDate} onChange={(v) => set('dueDate', v)} />
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
              <Select
                value={form.status}
                onChange={(e) => set('status', e.target.value as JobStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
          </div>
        </Section>

        {/* B. PART & RAW MATERIAL */}
        <Section
          title="Part & Raw Material"
          hint={form.companyId ? undefined : 'Select a company first'}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Part / Product Name" required>
              <Input value={form.partName} onChange={(e) => set('partName', e.target.value)} />
            </Field>
            <Field label="Part / Drawing No.">
              <Input value={form.partNumber} onChange={(e) => set('partNumber', e.target.value)} />
            </Field>
            <Field
              label="Raw Material"
              hint={
                !form.companyId
                  ? 'Choose a company to list its materials'
                  : materialsError
                    ? 'Could not load materials'
                    : materialsLoading
                      ? 'Loading…'
                      : companyMaterials.length === 0
                        ? 'No materials for this company'
                        : undefined
              }
            >
              <Select
                value={form.materialId}
                onChange={(e) => set('materialId', e.target.value)}
                disabled={!form.companyId || materialsLoading}
              >
                <option value="">— none —</option>
                {companyMaterials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.companyId ? '' : ' (own/shop)'}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Rate (per unit)" hint="Optional; used to prefill invoices">
              <Input
                type="number"
                step="0.01"
                value={form.rate}
                onChange={(e) => set('rate', e.target.value as never)}
              />
            </Field>
          </div>

          {/* Auto-populated material master (read-only) */}
          {form.materialId && (
            <>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <ReadOnly label="Part Number" value={selectedMaterial?.partNumber || '—'} />
                <ReadOnly label="HSN Code" value={selectedMaterial?.hsn || '—'} />
                <ReadOnly label="Bin No" value={selectedMaterial?.binNo || '—'} />
                <ReadOnly label="Material Grade" value={selectedMaterial?.type || '—'} />
                <ReadOnly label="Unit" value={selectedMaterial?.unit || '—'} />
                <ReadOnly
                  label="Default Rate"
                  value={
                    selectedMaterial?.defaultRate != null
                      ? currency(selectedMaterial.defaultRate)
                      : '—'
                  }
                />
                <ReadOnly
                  label="Reorder Level"
                  value={
                    selectedMaterial?.reorderLevel != null
                      ? `${qty(selectedMaterial.reorderLevel)} ${unit}`
                      : '—'
                  }
                />
              </div>
              {masterIncomplete && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Material master information incomplete — add grade/unit in Materials & Stock.
                </p>
              )}

              {/* INVENTORY AVAILABILITY (raw material stock — reuses material_balance) */}
              <div className="mt-3 rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-2xs font-bold uppercase tracking-wide text-slate-500">
                    Inventory Availability
                  </span>
                  {stockStatus && (
                    <span
                      className={clsx(
                        'rounded-full px-2 py-0.5 text-2xs font-bold ring-1',
                        stockStatus === 'green'
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : stockStatus === 'orange'
                            ? 'bg-amber-50 text-amber-700 ring-amber-200'
                            : 'bg-red-50 text-red-700 ring-red-200',
                      )}
                    >
                      {stockStatus === 'green'
                        ? '🟢 Sufficient'
                        : stockStatus === 'orange'
                          ? '🟠 Partial'
                          : '🔴 Out of stock'}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                  <Field label="Reserve from stock">
                    <Select
                      value={form.materialOwner}
                      onChange={(e) => set('materialOwner', e.target.value as MaterialOwnerType)}
                    >
                      <option value="Shop">Own (shop) stock</option>
                      <option value="Company">This customer's stock</option>
                    </Select>
                  </Field>
                  <ReadOnly label="Available Stock" value={`${qty(available)} ${unit}`} />
                </div>
                {!job && (
                  <Field
                    label="Material Qty to Reserve"
                    hint="Held against stock at planning — issued later when consumed on the floor"
                    className="mt-3"
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
                )}
                {!job && reserveNum > available && (
                  <p className="mt-2 text-2xs text-amber-600">
                    Reserving more than available ({qty(available)} {unit}) needs a shortage
                    override.
                  </p>
                )}
              </div>
            </>
          )}
        </Section>

        {/* C. QUANTITIES & PLANNING */}
        <Section title="Quantities & Planning">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Ordered Quantity" required>
              <Input
                type="number"
                step="0.001"
                min={0}
                value={form.orderedQty}
                onChange={(e) => set('orderedQty', e.target.value as never)}
              />
            </Field>
            <ReadOnly label="Production Required" value={`${qty(productionRequired)} ${unit}`} />
            <Field
              label="Planned Production Qty"
              required
              hint={remainingToPlan > 0 ? `Remaining to plan: ${qty(remainingToPlan)}` : undefined}
            >
              <Input
                type="number"
                step="0.001"
                min={0}
                max={orderedNum}
                value={form.plannedQty}
                onChange={(e) => set('plannedQty', e.target.value as never)}
              />
            </Field>
            {job ? (
              <Field label="Completed Quantity" hint="Managed via Production">
                <Input
                  type="number"
                  step="0.001"
                  min={0}
                  value={form.completedQty}
                  onChange={(e) => set('completedQty', e.target.value as never)}
                />
              </Field>
            ) : (
              <ReadOnly label="Completed Quantity" value={`0 ${unit}`} />
            )}
          </div>
          <p className="mt-2 text-2xs text-slate-400">
            Production Required equals the ordered quantity — MSMS manufactures the full order
            (finished-goods stock is not tracked; raw material is consumed from inventory).
          </p>
        </Section>

        {/* D. ORDER SUMMARY */}
        <Section title="Order Summary">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <Summary label="Customer" value={companyLabel} />
            <Summary label="Product / Part" value={form.partName || '—'} />
            <Summary label="Raw Material" value={selectedMaterial?.name || '—'} />
            <Summary label="Ordered" value={`${qty(orderedNum)} ${unit}`} />
            <Summary
              label="Available (material)"
              value={form.materialId ? `${qty(available)} ${unit}` : '—'}
            />
            <Summary label="Production Required" value={`${qty(productionRequired)} ${unit}`} />
            <Summary label="Planned Production" value={`${qty(plannedNum)} ${unit}`} />
          </div>
        </Section>

        <Field label="Notes">
          <Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xs text-slate-400">{label}</div>
      <div className="font-semibold text-slate-800">{value}</div>
    </div>
  )
}
