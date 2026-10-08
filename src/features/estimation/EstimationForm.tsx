'use client'

import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type {
  Estimation,
  EstimationOperation,
  MaterialShapeDims,
  PricingMethod,
  RawMaterialForm,
} from '@/types'
import { computeEstimation, MATERIAL_DENSITY } from '@/data/computations'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useMaterials } from '@/features/materials/hooks/useMaterials'
import { useCreateEstimation, useUpdateEstimation } from './hooks/useEstimations'
import type { EstimationInput } from './api/estimationApi'
import { toUserMessage } from '@/lib/api/errors'
import { currency, qty as fmtQty } from '@/lib/format'
import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { DateInput } from '@/components/ui/DateInput'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'

const FORMS: RawMaterialForm[] = [
  'Round Bar',
  'Square Bar',
  'Flat Bar',
  'Plate',
  'Casting',
  'Custom',
]
const GRADES = Object.keys(MATERIAL_DENSITY)
const STEPS = ['Customer & Part', 'Material', 'Operations', 'Costs & Pricing', 'Review'] as const

type OpRow = Omit<EstimationOperation, 'estimationId'>

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </div>
  )
}

function num(v: string | number | undefined): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

export function EstimationForm({
  estimation,
  operations,
  onClose,
}: {
  estimation: Estimation | null
  operations?: EstimationOperation[]
  onClose: () => void
}) {
  const toast = useToast()
  const isEdit = !!estimation?.id
  const create = useCreateEstimation()
  const update = useUpdateEstimation()
  const saving = create.isPending || update.isPending
  const { data: companies = [] } = useCompanies()
  const { data: materials = [] } = useMaterials()

  const [step, setStep] = useState(0)
  const [f, setF] = useState(() => ({
    estimationDate: estimation?.estimationDate ?? new Date().toISOString().slice(0, 10),
    companyId: estimation?.companyId ?? '',
    customerPartNumber: estimation?.customerPartNumber ?? '',
    partName: estimation?.partName ?? '',
    partDescription: estimation?.partDescription ?? '',
    drawingNumber: estimation?.drawingNumber ?? '',
    drawingRevision: estimation?.drawingRevision ?? '',
    materialId: estimation?.materialId ?? '',
    materialGrade: estimation?.materialGrade ?? '',
    rawMaterialForm: (estimation?.rawMaterialForm ?? 'Round Bar') as RawMaterialForm,
    diameter: estimation?.materialShapeDims?.diameter ?? ('' as number | ''),
    length: estimation?.materialShapeDims?.length ?? ('' as number | ''),
    width: estimation?.materialShapeDims?.width ?? ('' as number | ''),
    thickness: estimation?.materialShapeDims?.thickness ?? ('' as number | ''),
    finishedDims: estimation?.finishedDims ?? '',
    materialDensity: estimation?.materialDensity ?? ('' as number | ''),
    materialRate: estimation?.materialRate ?? ('' as number | ''),
    cuttingAllowance: estimation?.cuttingAllowance ?? 0,
    machiningAllowance: estimation?.machiningAllowance ?? 0,
    wastagePercent: estimation?.wastagePercent ?? 0,
    scrapRecoveryPc: estimation?.scrapRecoveryPc ?? 0,
    quantity: estimation?.quantity ?? 1,
    expectedDeliveryDate: estimation?.expectedDeliveryDate ?? '',
    manufacturingNotes: estimation?.manufacturingNotes ?? '',
    fixturesToolingCost: estimation?.fixturesToolingCost ?? 0,
    inspectionCostPc: estimation?.inspectionCostPc ?? 0,
    overheadCostPc: estimation?.overheadCostPc ?? 0,
    labourCostPc: estimation?.labourCostPc ?? 0,
    packingCostPc: estimation?.packingCostPc ?? 0,
    transportCostPc: estimation?.transportCostPc ?? 0,
    outsourceCostPc: estimation?.outsourceCostPc ?? 0,
    rejectionPercent: estimation?.rejectionPercent ?? 0,
    otherCostPc: estimation?.otherCostPc ?? 0,
    pricingMethod: (estimation?.pricingMethod ?? 'margin') as PricingMethod,
    markupPercent: estimation?.markupPercent ?? 0,
    marginPercent: estimation?.marginPercent ?? 25,
  }))
  const [ops, setOps] = useState<OpRow[]>(
    () =>
      operations?.map((o) => ({ ...o })) ?? [
        {
          id: '',
          seq: 1,
          operationName: 'Turning',
          machineType: 'CNC Lathe',
          setupTimeMin: 0,
          cycleTimeMin: 0,
          batchQty: 1,
          machineHourRate: 0,
          operatorCostHour: 0,
          toolingCost: 0,
          subcontractCostPc: 0,
        },
      ],
  )

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((p) => ({ ...p, [k]: v }))
  }

  const companyMaterials = useMemo(
    () =>
      materials.filter(
        (m) => m.active && (!m.companyId || m.companyId === f.companyId || m.id === f.materialId),
      ),
    [materials, f.companyId, f.materialId],
  )

  function onPickMaterial(id: string) {
    const m = materials.find((x) => x.id === id)
    setF((p) => ({
      ...p,
      materialId: id,
      materialGrade: p.materialGrade || m?.type || '',
      materialRate:
        p.materialRate === '' && m?.defaultRate != null ? m.defaultRate : p.materialRate,
      materialDensity:
        p.materialDensity === '' && m?.type && MATERIAL_DENSITY[m.type] != null
          ? MATERIAL_DENSITY[m.type]
          : p.materialDensity,
    }))
  }

  function onPickGrade(grade: string) {
    setF((p) => ({
      ...p,
      materialGrade: grade,
      materialDensity:
        MATERIAL_DENSITY[grade] != null ? MATERIAL_DENSITY[grade] : p.materialDensity,
    }))
  }

  // Build an estimation-shaped object for the live cost engine + save.
  const draft: Estimation = useMemo(() => {
    const dims: MaterialShapeDims = {
      diameter: num(f.diameter) || undefined,
      length: num(f.length) || undefined,
      width: num(f.width) || undefined,
      thickness: num(f.thickness) || undefined,
    }
    return {
      id: estimation?.id ?? 'preview',
      estimationNo: estimation?.estimationNo ?? '(auto)',
      estimationDate: f.estimationDate,
      companyId: f.companyId,
      customerPartNumber: f.customerPartNumber,
      partName: f.partName,
      partDescription: f.partDescription,
      drawingNumber: f.drawingNumber,
      drawingRevision: f.drawingRevision,
      materialId: f.materialId || undefined,
      materialGrade: f.materialGrade,
      rawMaterialForm: f.rawMaterialForm,
      materialShapeDims: dims,
      finishedDims: f.finishedDims,
      materialDensity: num(f.materialDensity) || undefined,
      materialRate: num(f.materialRate) || undefined,
      cuttingAllowance: num(f.cuttingAllowance),
      machiningAllowance: num(f.machiningAllowance),
      wastagePercent: num(f.wastagePercent),
      scrapRecoveryPc: num(f.scrapRecoveryPc),
      quantity: num(f.quantity),
      expectedDeliveryDate: f.expectedDeliveryDate || undefined,
      manufacturingNotes: f.manufacturingNotes,
      fixturesToolingCost: num(f.fixturesToolingCost),
      inspectionCostPc: num(f.inspectionCostPc),
      overheadCostPc: num(f.overheadCostPc),
      labourCostPc: num(f.labourCostPc),
      packingCostPc: num(f.packingCostPc),
      transportCostPc: num(f.transportCostPc),
      outsourceCostPc: num(f.outsourceCostPc),
      rejectionPercent: num(f.rejectionPercent),
      otherCostPc: num(f.otherCostPc),
      pricingMethod: f.pricingMethod,
      markupPercent: num(f.markupPercent),
      marginPercent: num(f.marginPercent),
      materialCostPc: 0,
      machiningCostPc: 0,
      totalCostPc: 0,
      sellingPricePc: 0,
      totalCost: 0,
      totalSelling: 0,
      marginPctEffective: 0,
      status: estimation?.status ?? 'Draft',
      createdAt: estimation?.createdAt ?? '',
      updatedAt: estimation?.updatedAt ?? '',
    }
  }, [f, estimation])

  const opRows: EstimationOperation[] = useMemo(
    () => ops.map((o, i) => ({ ...o, estimationId: estimation?.id ?? 'preview', seq: i + 1 })),
    [ops, estimation],
  )
  const c = useMemo(() => computeEstimation(draft, opRows), [draft, opRows])

  function validate(): string | null {
    if (!f.companyId) return 'Select a customer (Step 1).'
    if (!f.partName.trim()) return 'Part name is required (Step 1).'
    if (!(num(f.quantity) > 0)) return 'Quantity must be greater than zero (Step 1).'
    if (f.pricingMethod === 'margin' && num(f.marginPercent) >= 100)
      return 'Profit margin must be below 100%.'
    for (const o of ops) {
      if (num(o.setupTimeMin) < 0 || num(o.cycleTimeMin) < 0)
        return 'Operation times cannot be negative.'
    }
    return null
  }

  async function save() {
    const err = validate()
    if (err) {
      toast.error(err)
      return
    }
    const input: EstimationInput = {
      ...draft,
      // snapshot the computed summary
      materialCostPc: c.materialCostPc,
      machiningCostPc: c.machiningCostPc,
      totalCostPc: c.totalCostPc,
      sellingPricePc: c.sellingPricePc,
      totalCost: c.totalCost,
      totalSelling: c.totalSelling,
      marginPctEffective: c.marginPctEffective,
      operations: opRows,
    } as EstimationInput
    try {
      if (isEdit) {
        await update.mutateAsync({ id: estimation!.id, input })
        toast.success('Estimation updated')
      } else {
        await create.mutateAsync(input)
        toast.success('Estimation created')
      }
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Save failed'))
    }
  }

  const unit = 'pc'
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={isEdit ? `Edit ${estimation!.estimationNo}` : 'New Estimation'}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex gap-2">
            {step > 0 && (
              <button
                className="btn-secondary"
                onClick={() => setStep((s) => s - 1)}
                disabled={saving}
              >
                Back
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            {step < STEPS.length - 1 ? (
              <button className="btn-primary" onClick={() => setStep((s) => s + 1)}>
                Next
              </button>
            ) : (
              <button className="btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create estimation'}
              </button>
            )}
          </div>
        </div>
      }
    >
      {/* Stepper */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => setStep(i)}
            className={`rounded-full px-3 py-1 text-2xs font-semibold ${
              i === step
                ? 'bg-brand-600 text-white'
                : i < step
                  ? 'bg-brand-50 text-brand-700'
                  : 'bg-slate-100 text-slate-500'
            }`}
          >
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {/* Live cost summary — always visible */}
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-brand-200 bg-brand-50/60 p-3 sm:grid-cols-4">
        <Stat label="Material / pc" value={currency(c.materialCostPc)} />
        <Stat label="Machining / pc" value={currency(c.machiningCostPc)} />
        <Stat label="Total cost / pc" value={currency(c.totalCostPc)} />
        <Stat label="Selling / pc" value={currency(c.sellingPricePc)} strong />
        <Stat label="Weight / pc" value={`${fmtQty(c.materialWeightKg)} kg`} />
        <Stat label={`Qty`} value={`${fmtQty(num(f.quantity))} ${unit}`} />
        <Stat label="Margin %" value={`${fmtQty(c.marginPctEffective)}%`} />
        <Stat label="Total selling" value={currency(c.totalSelling)} strong />
      </div>

      {step === 0 && (
        <Section title="Customer & Part Details">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Customer" required>
              <Select value={f.companyId} onChange={(e) => set('companyId', e.target.value)}>
                <option value="">Select customer…</option>
                {companies
                  .filter((x) => x.active || x.id === f.companyId)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Customer Part Number">
              <Input
                value={f.customerPartNumber}
                onChange={(e) => set('customerPartNumber', e.target.value)}
              />
            </Field>
            <Field label="Part / Component Name" required>
              <Input value={f.partName} onChange={(e) => set('partName', e.target.value)} />
            </Field>
            <Field label="Part Description">
              <Input
                value={f.partDescription}
                onChange={(e) => set('partDescription', e.target.value)}
              />
            </Field>
            <Field label="Drawing Number">
              <Input
                value={f.drawingNumber}
                onChange={(e) => set('drawingNumber', e.target.value)}
              />
            </Field>
            <Field label="Drawing Revision">
              <Input
                value={f.drawingRevision}
                onChange={(e) => set('drawingRevision', e.target.value)}
              />
            </Field>
            <Field label="Required Quantity" required>
              <Input
                type="number"
                min={0}
                step="1"
                value={f.quantity}
                onChange={(e) => set('quantity', e.target.value as never)}
              />
            </Field>
            <Field label="Expected Delivery Date">
              <DateInput
                value={f.expectedDeliveryDate}
                onChange={(v) => set('expectedDeliveryDate', v)}
              />
            </Field>
            <Field label="Estimation Date">
              <DateInput value={f.estimationDate} onChange={(v) => set('estimationDate', v)} />
            </Field>
          </div>
        </Section>
      )}

      {step === 1 && (
        <Section title="Material Specification & Cost">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Raw Material (master)" hint="Pre-fills grade, rate, density">
              <Select
                value={f.materialId}
                onChange={(e) => onPickMaterial(e.target.value)}
                disabled={!f.companyId}
              >
                <option value="">— none / manual —</option>
                {companyMaterials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.companyId ? '' : ' (own/shop)'}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Material Grade">
              <Select value={f.materialGrade} onChange={(e) => onPickGrade(e.target.value)}>
                <option value="">Select / type…</option>
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Raw Material Form">
              <Select
                value={f.rawMaterialForm}
                onChange={(e) => set('rawMaterialForm', e.target.value as RawMaterialForm)}
              >
                {FORMS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </Select>
            </Field>
            <Field label="Density (g/cc)" hint="Configurable; from grade">
              <Input
                type="number"
                step="0.01"
                value={f.materialDensity}
                onChange={(e) => set('materialDensity', e.target.value as never)}
              />
            </Field>
            {f.rawMaterialForm === 'Round Bar' ? (
              <Field label="Diameter (mm)">
                <Input
                  type="number"
                  step="0.1"
                  value={f.diameter}
                  onChange={(e) => set('diameter', e.target.value as never)}
                />
              </Field>
            ) : (
              <Field label="Width / Side (mm)">
                <Input
                  type="number"
                  step="0.1"
                  value={f.width}
                  onChange={(e) => set('width', e.target.value as never)}
                />
              </Field>
            )}
            {f.rawMaterialForm !== 'Round Bar' && f.rawMaterialForm !== 'Square Bar' && (
              <Field label="Thickness (mm)">
                <Input
                  type="number"
                  step="0.1"
                  value={f.thickness}
                  onChange={(e) => set('thickness', e.target.value as never)}
                />
              </Field>
            )}
            <Field label="Length / Blank (mm)">
              <Input
                type="number"
                step="0.1"
                value={f.length}
                onChange={(e) => set('length', e.target.value as never)}
              />
            </Field>
            <Field label="Material Rate (₹/kg)">
              <Input
                type="number"
                step="0.01"
                value={f.materialRate}
                onChange={(e) => set('materialRate', e.target.value as never)}
              />
            </Field>
            <Field label="Cutting Allowance (mm)" hint="Added to length">
              <Input
                type="number"
                step="0.1"
                value={f.cuttingAllowance}
                onChange={(e) => set('cuttingAllowance', e.target.value as never)}
              />
            </Field>
            <Field label="Machining Allowance (mm)" hint="Added to section">
              <Input
                type="number"
                step="0.1"
                value={f.machiningAllowance}
                onChange={(e) => set('machiningAllowance', e.target.value as never)}
              />
            </Field>
            <Field label="Wastage %">
              <Input
                type="number"
                step="0.1"
                value={f.wastagePercent}
                onChange={(e) => set('wastagePercent', e.target.value as never)}
              />
            </Field>
            <Field label="Scrap Recovery (₹/pc)">
              <Input
                type="number"
                step="0.01"
                value={f.scrapRecoveryPc}
                onChange={(e) => set('scrapRecoveryPc', e.target.value as never)}
              />
            </Field>
            <Field label="Finished Part Dimensions">
              <Input value={f.finishedDims} onChange={(e) => set('finishedDims', e.target.value)} />
            </Field>
          </div>
          <p className="mt-2 text-2xs text-slate-500">
            Theoretical blank weight = {fmtQty(c.materialWeightKg)} kg → material cost{' '}
            {currency(c.materialCostPc)}/pc.
          </p>
        </Section>
      )}

      {step === 2 && (
        <Section title="Machining Operations">
          <div className="space-y-2">
            {ops.map((o, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-2">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-2xs font-bold uppercase text-slate-500">Op {i + 1}</span>
                  <button
                    className="btn-ghost btn-sm text-red-500"
                    onClick={() => setOps((p) => p.filter((_, j) => j !== i))}
                    disabled={ops.length <= 1}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Field label="Operation">
                    <Input
                      value={o.operationName}
                      onChange={(e) => editOp(i, 'operationName', e.target.value)}
                    />
                  </Field>
                  <Field label="Machine">
                    <Input
                      value={o.machineType ?? ''}
                      onChange={(e) => editOp(i, 'machineType', e.target.value)}
                    />
                  </Field>
                  <Field label="Setup (min)">
                    <Input
                      type="number"
                      step="1"
                      value={o.setupTimeMin}
                      onChange={(e) => editOp(i, 'setupTimeMin', num(e.target.value))}
                    />
                  </Field>
                  <Field label="Cycle (min/pc)">
                    <Input
                      type="number"
                      step="0.1"
                      value={o.cycleTimeMin}
                      onChange={(e) => editOp(i, 'cycleTimeMin', num(e.target.value))}
                    />
                  </Field>
                  <Field label="Batch Qty">
                    <Input
                      type="number"
                      step="1"
                      value={o.batchQty}
                      onChange={(e) => editOp(i, 'batchQty', num(e.target.value))}
                    />
                  </Field>
                  <Field label="Machine ₹/hr">
                    <Input
                      type="number"
                      step="1"
                      value={o.machineHourRate}
                      onChange={(e) => editOp(i, 'machineHourRate', num(e.target.value))}
                    />
                  </Field>
                  <Field label="Operator ₹/hr">
                    <Input
                      type="number"
                      step="1"
                      value={o.operatorCostHour}
                      onChange={(e) => editOp(i, 'operatorCostHour', num(e.target.value))}
                    />
                  </Field>
                  <Field label="Tooling ₹/batch">
                    <Input
                      type="number"
                      step="1"
                      value={o.toolingCost}
                      onChange={(e) => editOp(i, 'toolingCost', num(e.target.value))}
                    />
                  </Field>
                  <Field label="Subcontract ₹/pc">
                    <Input
                      type="number"
                      step="1"
                      value={o.subcontractCostPc}
                      onChange={(e) => editOp(i, 'subcontractCostPc', num(e.target.value))}
                    />
                  </Field>
                </div>
              </div>
            ))}
            <button
              className="btn-secondary btn-sm"
              onClick={() =>
                setOps((p) => [
                  ...p,
                  {
                    id: '',
                    seq: p.length + 1,
                    operationName: '',
                    machineType: '',
                    setupTimeMin: 0,
                    cycleTimeMin: 0,
                    batchQty: 1,
                    machineHourRate: 0,
                    operatorCostHour: 0,
                    toolingCost: 0,
                    subcontractCostPc: 0,
                  },
                ])
              }
            >
              <Plus size={14} /> Add operation
            </button>
          </div>
          <p className="mt-2 text-2xs text-slate-500">
            Machining cost {currency(c.machiningCostPc)}/pc.
          </p>
        </Section>
      )}

      {step === 3 && (
        <>
          <Section title="Other Manufacturing Costs">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Fixtures/Tooling (₹ total)">
                <Input
                  type="number"
                  step="1"
                  value={f.fixturesToolingCost}
                  onChange={(e) => set('fixturesToolingCost', e.target.value as never)}
                />
              </Field>
              <Field label="Inspection ₹/pc">
                <Input
                  type="number"
                  step="0.01"
                  value={f.inspectionCostPc}
                  onChange={(e) => set('inspectionCostPc', e.target.value as never)}
                />
              </Field>
              <Field label="Overheads ₹/pc">
                <Input
                  type="number"
                  step="0.01"
                  value={f.overheadCostPc}
                  onChange={(e) => set('overheadCostPc', e.target.value as never)}
                />
              </Field>
              <Field label="Labour ₹/pc">
                <Input
                  type="number"
                  step="0.01"
                  value={f.labourCostPc}
                  onChange={(e) => set('labourCostPc', e.target.value as never)}
                />
              </Field>
              <Field label="Packing ₹/pc">
                <Input
                  type="number"
                  step="0.01"
                  value={f.packingCostPc}
                  onChange={(e) => set('packingCostPc', e.target.value as never)}
                />
              </Field>
              <Field label="Transport ₹/pc">
                <Input
                  type="number"
                  step="0.01"
                  value={f.transportCostPc}
                  onChange={(e) => set('transportCostPc', e.target.value as never)}
                />
              </Field>
              <Field label="Outsourced ₹/pc">
                <Input
                  type="number"
                  step="0.01"
                  value={f.outsourceCostPc}
                  onChange={(e) => set('outsourceCostPc', e.target.value as never)}
                />
              </Field>
              <Field label="Other ₹/pc">
                <Input
                  type="number"
                  step="0.01"
                  value={f.otherCostPc}
                  onChange={(e) => set('otherCostPc', e.target.value as never)}
                />
              </Field>
              <Field label="Rejection Allowance %">
                <Input
                  type="number"
                  step="0.1"
                  value={f.rejectionPercent}
                  onChange={(e) => set('rejectionPercent', e.target.value as never)}
                />
              </Field>
            </div>
            <p className="mt-2 text-2xs text-slate-500">
              Avoid double-counting labour/overheads already built into the machine rates above.
            </p>
          </Section>
          <Section title="Profit & Selling Price">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Pricing Method">
                <Select
                  value={f.pricingMethod}
                  onChange={(e) => set('pricingMethod', e.target.value as PricingMethod)}
                >
                  <option value="margin">Margin (price = cost / (1 − m%))</option>
                  <option value="markup">Markup (price = cost × (1 + m%))</option>
                </Select>
              </Field>
              {f.pricingMethod === 'markup' ? (
                <Field label="Markup %">
                  <Input
                    type="number"
                    step="0.1"
                    value={f.markupPercent}
                    onChange={(e) => set('markupPercent', e.target.value as never)}
                  />
                </Field>
              ) : (
                <Field
                  label="Target Margin %"
                  error={num(f.marginPercent) >= 100 ? 'Must be below 100%' : undefined}
                >
                  <Input
                    type="number"
                    step="0.1"
                    value={f.marginPercent}
                    onChange={(e) => set('marginPercent', e.target.value as never)}
                  />
                </Field>
              )}
              <Field label="Effective Margin">
                <Input readOnly value={`${fmtQty(c.marginPctEffective)}%`} />
              </Field>
            </div>
          </Section>
        </>
      )}

      {step === 4 && (
        <Section title="Review">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <Row
              label="Customer"
              value={companies.find((x) => x.id === f.companyId)?.name ?? '—'}
            />
            <Row label="Part" value={f.partName || '—'} />
            <Row label="Quantity" value={`${fmtQty(num(f.quantity))} ${unit}`} />
            <Row label="Material cost/pc" value={currency(c.materialCostPc)} />
            <Row label="Machining cost/pc" value={currency(c.machiningCostPc)} />
            <Row label="Other cost/pc" value={currency(c.otherCostPc)} />
            <Row label="Rejection allowance/pc" value={currency(c.rejectionCostPc)} />
            <Row label="Total cost/pc" value={currency(c.totalCostPc)} />
            <Row label="Selling price/pc" value={currency(c.sellingPricePc)} />
            <Row label="Profit/pc" value={currency(c.profitPc)} />
            <Row label="Effective margin" value={`${fmtQty(c.marginPctEffective)}%`} />
            <Row label="Total selling value" value={currency(c.totalSelling)} />
          </dl>
          <Field label="Manufacturing Notes" className="mt-3">
            <Textarea
              rows={2}
              value={f.manufacturingNotes}
              onChange={(e) => set('manufacturingNotes', e.target.value)}
            />
          </Field>
        </Section>
      )}
    </Modal>
  )

  function editOp<K extends keyof OpRow>(i: number, k: K, v: OpRow[K]) {
    setOps((p) => p.map((o, j) => (j === i ? { ...o, [k]: v } : o)))
  }
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={`tabular-nums ${strong ? 'text-base font-bold text-brand-700' : 'text-sm font-semibold text-slate-800'}`}
      >
        {value}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xs text-slate-400">{label}</div>
      <div className="font-semibold text-slate-800">{value}</div>
    </div>
  )
}
