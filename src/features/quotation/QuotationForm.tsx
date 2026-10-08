'use client'

import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Estimation, Quotation, QuotationLine } from '@/types'
import { computeQuotation, stateCodeFromGstin } from '@/data/computations'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useSettings } from '@/features/settings/hooks/useSettings'
import { useCreateQuotation, useUpdateQuotation } from './hooks/useQuotations'
import type { QuotationInput } from './api/quotationApi'
import { toUserMessage } from '@/lib/api/errors'
import { currency } from '@/lib/format'
import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { DateInput } from '@/components/ui/DateInput'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'

type LineRow = Omit<QuotationLine, 'quotationId'>

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

function plusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function QuotationForm({
  quotation,
  fromEstimation,
  lines: initialLines,
  onClose,
}: {
  quotation: Quotation | null
  fromEstimation?: Estimation | null
  lines?: QuotationLine[]
  onClose: () => void
}) {
  const toast = useToast()
  const isEdit = !!quotation?.id
  const create = useCreateQuotation()
  const update = useUpdateQuotation()
  const saving = create.isPending || update.isPending
  const { data: companies = [] } = useCompanies()
  const { data: settings } = useSettings()
  const defaultTax = settings?.defaultTaxPercent ?? 18
  const shopStateCode = stateCodeFromGstin(settings?.company?.gstin)

  const seedCompanyId = quotation?.companyId ?? fromEstimation?.companyId ?? ''

  const [f, setF] = useState(() => {
    const cust = companies.find((c) => c.id === seedCompanyId)
    const custState = stateCodeFromGstin(quotation?.customerGstin ?? cust?.gstin)
    const inter = !!shopStateCode && !!custState && shopStateCode !== custState
    return {
      companyId: seedCompanyId,
      quotationDate: quotation?.quotationDate ?? new Date().toISOString().slice(0, 10),
      expiryDate: quotation?.expiryDate ?? plusDays(30),
      billingAddress: quotation?.billingAddress ?? cust?.billingAddress ?? '',
      shippingAddress: quotation?.shippingAddress ?? '',
      customerGstin: quotation?.customerGstin ?? cust?.gstin ?? '',
      contactPerson: quotation?.contactPerson ?? cust?.contactPerson ?? '',
      contactPhone: quotation?.contactPhone ?? cust?.phone ?? '',
      contactEmail: quotation?.contactEmail ?? cust?.email ?? '',
      placeOfSupplyStateCode: quotation?.placeOfSupplyStateCode ?? custState ?? '',
      advancePercent: quotation?.advancePercent ?? 0,
      paymentTerms: quotation?.paymentTerms ?? '50% advance, balance before dispatch',
      deliveryLeadTime: quotation?.deliveryLeadTime ?? '',
      packingCharge: quotation?.packingCharge ?? 0,
      freightCharge: quotation?.freightCharge ?? 0,
      cgstPercent: quotation?.cgstPercent ?? (inter ? 0 : defaultTax / 2),
      sgstPercent: quotation?.sgstPercent ?? (inter ? 0 : defaultTax / 2),
      igstPercent: quotation?.igstPercent ?? (inter ? defaultTax : 0),
      notes: quotation?.notes ?? '',
      termsConditions:
        quotation?.termsConditions ??
        'Prices in INR. Taxes extra as applicable. Validity as stated above. Subject to our standard terms.',
    }
  })

  const [lines, setLines] = useState<LineRow[]>(() => {
    const existing = initialLines ?? quotation?.lines
    if (existing && existing.length) return existing.map((l) => ({ ...l }))
    if (fromEstimation) {
      return [
        {
          id: '',
          lineNo: 1,
          partNumber: fromEstimation.customerPartNumber ?? fromEstimation.drawingNumber ?? '',
          description: fromEstimation.partName,
          hsn: '',
          quantity: fromEstimation.quantity,
          unit: 'Nos',
          unitPrice: fromEstimation.sellingPricePc,
          discountPercent: 0,
          gstPercent: defaultTax,
          lineTotal: 0,
        },
      ]
    }
    return [
      {
        id: '',
        lineNo: 1,
        partNumber: '',
        description: '',
        hsn: '',
        quantity: 1,
        unit: 'Nos',
        unitPrice: 0,
        discountPercent: 0,
        gstPercent: defaultTax,
        lineTotal: 0,
      },
    ]
  })

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((p) => ({ ...p, [k]: v }))
  }

  function onCustomer(id: string) {
    const cust = companies.find((c) => c.id === id)
    const custState = stateCodeFromGstin(cust?.gstin)
    const inter = !!shopStateCode && !!custState && shopStateCode !== custState
    setF((p) => ({
      ...p,
      companyId: id,
      billingAddress: cust?.billingAddress ?? p.billingAddress,
      customerGstin: cust?.gstin ?? '',
      contactPerson: cust?.contactPerson ?? '',
      contactPhone: cust?.phone ?? '',
      contactEmail: cust?.email ?? '',
      placeOfSupplyStateCode: custState ?? '',
      cgstPercent: inter ? 0 : defaultTax / 2,
      sgstPercent: inter ? 0 : defaultTax / 2,
      igstPercent: inter ? defaultTax : 0,
    }))
  }

  function editLine<K extends keyof LineRow>(i: number, k: K, v: LineRow[K]) {
    setLines((p) => p.map((l, j) => (j === i ? { ...l, [k]: v } : l)))
  }

  const linesForCalc: QuotationLine[] = useMemo(
    () =>
      lines.map((l, i) => ({
        ...l,
        quotationId: quotation?.id ?? 'preview',
        lineNo: i + 1,
        lineTotal: 0,
      })),
    [lines, quotation],
  )
  const c = useMemo(
    () =>
      computeQuotation(
        {
          packingCharge: num(f.packingCharge),
          freightCharge: num(f.freightCharge),
          cgstPercent: num(f.cgstPercent),
          sgstPercent: num(f.sgstPercent),
          igstPercent: num(f.igstPercent),
        },
        linesForCalc,
      ),
    [f, linesForCalc],
  )
  const interState = num(f.igstPercent) > 0

  function validate(): string | null {
    if (!f.companyId) return 'Select a customer.'
    if (!lines.some((l) => l.description.trim())) return 'Add at least one quotation line.'
    for (const l of lines) {
      if (l.description.trim() && !(num(l.quantity) > 0))
        return 'Line quantity must be greater than zero.'
      if (num(l.discountPercent) < 0 || num(l.discountPercent) > 100)
        return 'Discount must be between 0 and 100%.'
    }
    return null
  }

  async function save() {
    const err = validate()
    if (err) {
      toast.error(err)
      return
    }
    const outLines: QuotationLine[] = lines
      .filter((l) => l.description.trim())
      .map((l, i) => ({
        ...l,
        quotationId: quotation?.id ?? '',
        lineNo: i + 1,
        quantity: num(l.quantity),
        unitPrice: num(l.unitPrice),
        discountPercent: num(l.discountPercent),
        gstPercent: num(l.gstPercent),
        lineTotal:
          Math.round(
            (num(l.quantity) * num(l.unitPrice) * (1 - num(l.discountPercent) / 100) +
              Number.EPSILON) *
              100,
          ) / 100,
      }))
    const input: QuotationInput = {
      companyId: f.companyId,
      estimationId: quotation?.estimationId ?? fromEstimation?.id,
      quotationDate: f.quotationDate,
      expiryDate: f.expiryDate || undefined,
      billingAddress: f.billingAddress,
      shippingAddress: f.shippingAddress,
      customerGstin: f.customerGstin,
      contactPerson: f.contactPerson,
      contactPhone: f.contactPhone,
      contactEmail: f.contactEmail,
      placeOfSupplyStateCode: f.placeOfSupplyStateCode,
      advancePercent: num(f.advancePercent),
      paymentTerms: f.paymentTerms,
      deliveryLeadTime: f.deliveryLeadTime,
      packingCharge: num(f.packingCharge),
      freightCharge: num(f.freightCharge),
      cgstPercent: num(f.cgstPercent),
      sgstPercent: num(f.sgstPercent),
      igstPercent: num(f.igstPercent),
      subtotal: c.subtotal,
      discountTotal: c.discountTotal,
      taxableValue: c.taxableValue,
      cgstAmount: c.cgstAmount,
      sgstAmount: c.sgstAmount,
      igstAmount: c.igstAmount,
      grandTotal: c.grandTotal,
      notes: f.notes,
      termsConditions: f.termsConditions,
      status: quotation?.status ?? 'Draft',
      revisionNo: quotation?.revisionNo ?? 1,
      revisesQuotationId: quotation?.revisesQuotationId,
      lines: outLines,
    }
    try {
      if (isEdit) {
        await update.mutateAsync({ id: quotation!.id, input })
        toast.success('Quotation updated')
      } else {
        await create.mutateAsync(input)
        toast.success('Quotation created')
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
      size="xl"
      title={isEdit ? `Edit ${quotation!.quotationNo}` : 'New Quotation'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create quotation'}
          </button>
        </>
      }
    >
      {fromEstimation && !isEdit && (
        <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
          From estimation <b>{fromEstimation.estimationNo}</b> — unit price pre-filled from the
          approved selling price.
        </p>
      )}

      {/* Live totals */}
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-brand-200 bg-brand-50/60 p-3 sm:grid-cols-4">
        <Stat label="Taxable" value={currency(c.taxableValue)} />
        <Stat
          label={interState ? 'IGST' : 'CGST+SGST'}
          value={currency(interState ? c.igstAmount : c.cgstAmount + c.sgstAmount)}
        />
        <Stat label="Total Tax" value={currency(c.totalTax)} />
        <Stat label="Grand Total" value={currency(c.grandTotal)} strong />
      </div>

      <div className="space-y-4">
        <Section title="Customer & Validity">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Customer" required>
              <Select value={f.companyId} onChange={(e) => onCustomer(e.target.value)}>
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
            <Field label="Customer GSTIN">
              <Input
                value={f.customerGstin}
                onChange={(e) => set('customerGstin', e.target.value)}
              />
            </Field>
            <Field label="Quotation Date">
              <DateInput value={f.quotationDate} onChange={(v) => set('quotationDate', v)} />
            </Field>
            <Field label="Valid Until">
              <DateInput value={f.expiryDate} onChange={(v) => set('expiryDate', v)} />
            </Field>
            <Field label="Billing Address" className="sm:col-span-2">
              <Textarea
                rows={2}
                value={f.billingAddress}
                onChange={(e) => set('billingAddress', e.target.value)}
              />
            </Field>
            <Field label="Shipping Address" className="sm:col-span-2">
              <Textarea
                rows={2}
                value={f.shippingAddress}
                onChange={(e) => set('shippingAddress', e.target.value)}
              />
            </Field>
            <Field label="Contact Person">
              <Input
                value={f.contactPerson}
                onChange={(e) => set('contactPerson', e.target.value)}
              />
            </Field>
            <Field label="Contact Phone">
              <Input value={f.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Line Items">
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-2">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-2xs font-bold uppercase text-slate-500">Line {i + 1}</span>
                  <button
                    className="btn-ghost btn-sm text-red-500"
                    onClick={() => setLines((p) => p.filter((_, j) => j !== i))}
                    disabled={lines.length <= 1}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                  <Field label="Part #">
                    <Input
                      value={l.partNumber ?? ''}
                      onChange={(e) => editLine(i, 'partNumber', e.target.value)}
                    />
                  </Field>
                  <Field label="Description" className="sm:col-span-2">
                    <Input
                      value={l.description}
                      onChange={(e) => editLine(i, 'description', e.target.value)}
                    />
                  </Field>
                  <Field label="HSN">
                    <Input
                      value={l.hsn ?? ''}
                      onChange={(e) => editLine(i, 'hsn', e.target.value)}
                    />
                  </Field>
                  <Field label="Qty">
                    <Input
                      type="number"
                      step="1"
                      value={l.quantity}
                      onChange={(e) => editLine(i, 'quantity', num(e.target.value))}
                    />
                  </Field>
                  <Field label="Unit">
                    <Input
                      value={l.unit ?? ''}
                      onChange={(e) => editLine(i, 'unit', e.target.value)}
                    />
                  </Field>
                  <Field label="Unit Price ₹">
                    <Input
                      type="number"
                      step="0.01"
                      value={l.unitPrice}
                      onChange={(e) => editLine(i, 'unitPrice', num(e.target.value))}
                    />
                  </Field>
                  <Field label="Disc %">
                    <Input
                      type="number"
                      step="0.1"
                      value={l.discountPercent}
                      onChange={(e) => editLine(i, 'discountPercent', num(e.target.value))}
                    />
                  </Field>
                  <Field label="GST %">
                    <Input
                      type="number"
                      step="0.1"
                      value={l.gstPercent}
                      onChange={(e) => editLine(i, 'gstPercent', num(e.target.value))}
                    />
                  </Field>
                  <Field label="Line Total">
                    <Input
                      readOnly
                      value={currency(
                        num(l.quantity) * num(l.unitPrice) * (1 - num(l.discountPercent) / 100),
                      )}
                    />
                  </Field>
                </div>
              </div>
            ))}
            <button
              className="btn-secondary btn-sm"
              onClick={() =>
                setLines((p) => [
                  ...p,
                  {
                    id: '',
                    lineNo: p.length + 1,
                    partNumber: '',
                    description: '',
                    hsn: '',
                    quantity: 1,
                    unit: 'Nos',
                    unitPrice: 0,
                    discountPercent: 0,
                    gstPercent: defaultTax,
                    lineTotal: 0,
                  },
                ])
              }
            >
              <Plus size={14} /> Add line
            </button>
          </div>
        </Section>

        <Section title="Taxes, Charges & Terms">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Packing ₹">
              <Input
                type="number"
                step="0.01"
                value={f.packingCharge}
                onChange={(e) => set('packingCharge', e.target.value as never)}
              />
            </Field>
            <Field label="Freight ₹">
              <Input
                type="number"
                step="0.01"
                value={f.freightCharge}
                onChange={(e) => set('freightCharge', e.target.value as never)}
              />
            </Field>
            <Field label="CGST %" hint={interState ? 'intra-state only' : undefined}>
              <Input
                type="number"
                step="0.1"
                value={f.cgstPercent}
                onChange={(e) => set('cgstPercent', e.target.value as never)}
              />
            </Field>
            <Field label="SGST %" hint={interState ? 'intra-state only' : undefined}>
              <Input
                type="number"
                step="0.1"
                value={f.sgstPercent}
                onChange={(e) => set('sgstPercent', e.target.value as never)}
              />
            </Field>
            <Field label="IGST %" hint="inter-state">
              <Input
                type="number"
                step="0.1"
                value={f.igstPercent}
                onChange={(e) => set('igstPercent', e.target.value as never)}
              />
            </Field>
            <Field label="Advance %">
              <Input
                type="number"
                step="1"
                value={f.advancePercent}
                onChange={(e) => set('advancePercent', e.target.value as never)}
              />
            </Field>
            <Field label="Delivery Lead Time">
              <Input
                value={f.deliveryLeadTime}
                onChange={(e) => set('deliveryLeadTime', e.target.value)}
                placeholder="e.g. 3-4 weeks"
              />
            </Field>
            <Field label="Place of Supply (state code)">
              <Input
                value={f.placeOfSupplyStateCode}
                onChange={(e) => set('placeOfSupplyStateCode', e.target.value)}
              />
            </Field>
          </div>
          <Field label="Payment Terms" className="mt-3">
            <Input value={f.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} />
          </Field>
          <Field label="Notes" className="mt-3">
            <Textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
          <Field label="Terms & Conditions" className="mt-3">
            <Textarea
              rows={3}
              value={f.termsConditions}
              onChange={(e) => set('termsConditions', e.target.value)}
            />
          </Field>
        </Section>
      </div>
    </Modal>
  )
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
