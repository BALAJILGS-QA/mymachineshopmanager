import { useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import type { DeliveryChallan, Invoice, InvoiceLine } from '@/types'
import { useCreateInvoice, useUpdateInvoice } from './hooks/useInvoices'
import { useChallans, useSetChallanStatus } from '@/features/deliveries/hooks/useDeliveries'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useJobs } from '@/features/jobs/hooks/useJobs'
import { useMaterials } from '@/features/materials/hooks/useMaterials'
import { useProducts, useSettings } from '@/features/settings/hooks/useSettings'
import { usePreviewNo } from '@/features/shared/usePreviewNo'
import { toUserMessage } from '@/lib/api/errors'
import { invoiceSubtotal, roundMoney } from '@/data/computations'
import { currency, fmtDate, fmtDateTime, qty, todayISO } from '@/lib/format'
import { DEFAULT_SETTINGS } from '@/data/seed'
import { uid } from '@/lib/id'
import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { MultiSelectDropdown } from '@/components/ui/MultiSelectDropdown'
import { useToast } from '@/components/ui/Toast'

export function InvoiceForm({
  invoice,
  onClose,
  prefill,
  onCreated,
}: {
  invoice: Invoice | null
  onClose: () => void
  prefill?: { companyId?: string; reference?: string; dcReference?: string; lines?: InvoiceLine[] }
  onCreated?: (invoiceId: string) => void
}) {
  const toast = useToast()
  const createInvoice = useCreateInvoice()
  const updateInvoice = useUpdateInvoice()
  const saving = createInvoice.isPending || updateInvoice.isPending
  const { data: allCompanies = [] } = useCompanies()
  const companies = allCompanies.filter((c) => c.active || c.id === invoice?.companyId)
  const { data: jobs = [] } = useJobs()
  const { data: allMaterials = [] } = useMaterials()
  const materials = allMaterials.filter((m) => m.active)
  const { data: allProducts = [] } = useProducts()
  const products = allProducts.filter((p) => p.active)
  const settings = useSettings().data ?? DEFAULT_SETTINGS
  const invoiceNoPreview = usePreviewNo('invoice')

  const defCgst = settings.defaultCgstPercent ?? (settings.defaultTaxPercent || 0) / 2
  const defSgst = settings.defaultSgstPercent ?? (settings.defaultTaxPercent || 0) / 2

  const [invoiceNo, setInvoiceNo] = useState(invoice?.invoiceNo ?? '')
  const [companyId, setCompanyId] = useState(
    invoice?.companyId ?? prefill?.companyId ?? companies[0]?.id ?? '',
  )
  const [date, setDate] = useState(invoice?.date ?? todayISO())
  const [reference, setReference] = useState(invoice?.reference ?? prefill?.reference ?? '')
  const [dcReference, setDcReference] = useState(invoice?.dcReference ?? prefill?.dcReference ?? '')
  // Ship-to defaults to the billing address; toggle off to enter a different one.
  const [sameAsBilling, setSameAsBilling] = useState(invoice ? !invoice.shippingAddress : true)
  const [shippingAddress, setShippingAddress] = useState(invoice?.shippingAddress ?? '')
  const [discount, setDiscount] = useState(String(invoice?.discount ?? 0))
  // CGST / SGST default to half of the configured tax rate; both editable.
  const [cgst, setCgst] = useState(
    String(invoice?.cgstPercent ?? (invoice ? (invoice.taxPercent || 0) / 2 : defCgst)),
  )
  const [sgst, setSgst] = useState(
    String(invoice?.sgstPercent ?? (invoice ? (invoice.taxPercent || 0) / 2 : defSgst)),
  )
  const [notes, setNotes] = useState(invoice?.notes ?? '')
  const [lines, setLines] = useState<InvoiceLine[]>(
    invoice?.lines ?? prefill?.lines ?? [{ id: uid('l_'), description: '', quantity: 1, rate: 0 }],
  )

  // --- Delivery-challan picker (new invoices only) ---
  const setChallanStatus = useSetChallanStatus()
  const { data: allChallans = [] } = useChallans()
  const [selectedDcIds, setSelectedDcIds] = useState<Set<string>>(new Set())
  const [dcMatFilter, setDcMatFilter] = useState('')
  // Tracks which invoice lines came from which challan, so deselecting removes them.
  const dcLineMap = useRef<Map<string, string[]>>(new Map())
  // Lines that arrived pre-filled from a challan (DeliveriesPage → invoice). The
  // challan already deducted their stock, so they must not be re-linked here.
  const prefillLineIds = useRef<Set<string>>(new Set((prefill?.lines ?? []).map((l) => l.id)))
  const companyChanged = useRef(false)
  // Only offer the picker for brand-new invoices not already prefilled from a DC.
  const showDcPicker = !invoice && !prefill?.dcReference

  // Un-invoiced (Open) challans for the selected company.
  const openDcs = useMemo(
    () => allChallans.filter((d) => d.companyId === companyId && d.status === 'Open'),
    [allChallans, companyId],
  )
  // Distinct materials across those challans — used to narrow the picker.
  const dcMaterials = useMemo(() => {
    const seen = new Map<string, string>()
    for (const d of openDcs)
      for (const l of d.lines)
        if (l.materialId && !seen.has(l.materialId))
          seen.set(l.materialId, l.description || l.materialId)
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [openDcs])
  const filteredDcs = useMemo(
    () =>
      dcMatFilter
        ? openDcs.filter((d) => d.lines.some((l) => l.materialId === dcMatFilter))
        : openDcs,
    [openDcs, dcMatFilter],
  )

  function toggleDc(dc: DeliveryChallan) {
    const next = new Set(selectedDcIds)
    if (next.has(dc.id)) {
      next.delete(dc.id)
      const ids = dcLineMap.current.get(dc.id) ?? []
      dcLineMap.current.delete(dc.id)
      setLines((ls) => ls.filter((l) => !ids.includes(l.id)))
    } else {
      next.add(dc.id)
      const added: InvoiceLine[] = dc.lines.map((l) => ({
        id: uid('l_'),
        jobId: l.jobId,
        description: l.description,
        quantity: l.quantity,
        rate: 0,
      }))
      dcLineMap.current.set(
        dc.id,
        added.map((l) => l.id),
      )
      setLines((ls) => [...ls.filter((l) => l.description.trim() || l.rate), ...added])
    }
    setSelectedDcIds(next)
    setDcReference(
      allChallans
        .filter((c) => next.has(c.id))
        .map((c) => c.dcNo)
        .join(', '),
    )
  }

  // If the user switches company, drop any challan-derived lines (they belong to
  // the previous company). Skips the initial mount so prefill survives.
  useEffect(() => {
    if (!companyChanged.current) {
      companyChanged.current = true
      return
    }
    setDcMatFilter('')
    if (selectedDcIds.size) {
      const ids = [...dcLineMap.current.values()].flat()
      dcLineMap.current.clear()
      setLines((ls) => ls.filter((l) => !ids.includes(l.id)))
      setSelectedDcIds(new Set())
      setDcReference('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  // Eligible jobs: completed/delivered for the selected company, not fully invoiced.
  const eligibleJobs = useMemo(
    () =>
      jobs.filter(
        (j) =>
          j.companyId === companyId &&
          ['Completed', 'Delivered'].includes(j.status) &&
          !lines.some((l) => l.jobId === j.id),
      ),
    [jobs, companyId, lines],
  )

  function updateLine(id: string, patch: Partial<InvoiceLine>) {
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }
  // Link a line to a stock material (new invoices only). Picking a material makes
  // this line deduct stock on save; it also fills the unit, a default owner and
  // the description (when still blank). Clearing it makes the line description-only.
  function pickMaterial(id: string, materialId: string) {
    const m = materials.find((x) => x.id === materialId)
    setLines((ls) =>
      ls.map((l) =>
        l.id === id
          ? {
              ...l,
              materialId: materialId || undefined,
              unit: m?.unit,
              ownerType: materialId ? (l.ownerType ?? 'Company') : undefined,
              description: !l.description.trim() && m ? m.name : l.description,
            }
          : l,
      ),
    )
  }
  function addLine() {
    setLines((ls) => [...ls, { id: uid('l_'), description: '', quantity: 1, rate: 0 }])
  }
  // Materials currently billed directly from stock (drives the multi-select
  // ticks). Challan-derived lines carry no materialId, so they're excluded.
  const selectedMaterialIds = useMemo(
    () => new Set(lines.map((l) => l.materialId).filter(Boolean) as string[]),
    [lines],
  )
  // Toggle a stock material on/off — ticking adds a stock-deducting line,
  // unticking removes it. Each material maps to a single line here.
  function toggleMaterial(materialId: string) {
    const m = materials.find((x) => x.id === materialId)
    setLines((ls) => {
      if (ls.some((l) => l.materialId === materialId))
        return ls.filter((l) => l.materialId !== materialId)
      return [
        ...ls.filter((l) => l.description.trim() || l.rate || l.materialId),
        {
          id: uid('l_'),
          description: m?.name ?? '',
          quantity: 1,
          rate: 0,
          materialId,
          ownerType: 'Company',
          unit: m?.unit,
        },
      ]
    })
  }
  function removeLine(id: string) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls))
  }
  function addJobLine(jobId: string) {
    const job = jobs.find((j) => j.id === jobId)
    if (!job) return
    setLines((ls) => [
      ...ls.filter((l) => l.description || l.rate),
      {
        id: uid('l_'),
        jobId: job.id,
        description: `${job.partName}${job.partNumber ? ` (${job.partNumber})` : ''} — ${job.jobNo}`,
        quantity: job.completedQty || job.orderedQty,
        rate: job.rate ?? 0,
      },
    ])
  }
  function addProductLine(productId: string) {
    const p = products.find((x) => x.id === productId)
    if (!p) return
    setLines((ls) => [
      ...ls.filter((l) => l.description || l.rate),
      { id: uid('l_'), description: p.name, quantity: 1, rate: p.rate },
    ])
  }

  const subtotal = invoiceSubtotal({ lines } as Invoice)
  const discountNum = Number(discount) || 0
  const cgstNum = Number(cgst) || 0
  const sgstNum = Number(sgst) || 0
  const taxable = Math.max(0, subtotal - discountNum)
  const cgstAmount = roundMoney((taxable * cgstNum) / 100)
  const sgstAmount = roundMoney((taxable * sgstNum) / 100)
  const total = roundMoney(taxable + cgstAmount + sgstAmount)

  async function submit(asDraft: boolean) {
    try {
      const payload = {
        invoiceNo: invoiceNo.trim() || undefined,
        date,
        companyId,
        reference: reference || undefined,
        dcReference: dcReference || undefined,
        lines: lines
          .filter((l) => l.description.trim() || l.rate > 0 || l.materialId)
          .map((l) => ({ ...l, quantity: Number(l.quantity), rate: Number(l.rate) })),
        discount: discountNum,
        cgstPercent: cgstNum,
        sgstPercent: sgstNum,
        taxPercent: cgstNum + sgstNum,
        status: (asDraft ? 'Draft' : 'Unpaid') as Invoice['status'],
        notes: notes || undefined,
        billingAddress: undefined,
        shippingAddress: sameAsBilling ? undefined : shippingAddress.trim() || undefined,
      }
      if (invoice) {
        await updateInvoice.mutateAsync({ id: invoice.id, patch: payload })
        toast.success('Invoice updated')
      } else {
        const created = await createInvoice.mutateAsync(payload)
        // Mark any challans picked inside this form as Invoiced against it.
        if (selectedDcIds.size) {
          await Promise.all(
            [...selectedDcIds].map((id) =>
              setChallanStatus.mutateAsync({ id, status: 'Invoiced', invoiceId: created.id }),
            ),
          )
        }
        toast.success('Invoice created')
        onCreated?.(created.id)
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
      title={invoice ? `Edit ${invoice.invoiceNo}` : 'New Invoice'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          {!invoice && (
            <button className="btn-secondary" onClick={() => submit(true)} disabled={saving}>
              Save as draft
            </button>
          )}
          <button className="btn-primary" onClick={() => submit(false)} disabled={saving}>
            {saving ? 'Saving…' : invoice ? 'Save changes' : 'Create invoice'}
          </button>
        </>
      }
    >
      {invoice && (
        <p className="mb-3 text-right text-2xs text-slate-500">
          Last updated {fmtDateTime(invoice.updatedAt)}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Invoice Number" hint="Leave blank to auto-number">
          <Input
            value={invoiceNo}
            placeholder={invoiceNoPreview}
            onChange={(e) => setInvoiceNo(e.target.value)}
          />
        </Field>
        <Field label="Company" required>
          <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">Select…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Invoice Date" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Reference / PO">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Delivery Challan Ref" hint="DC number(s) this invoice covers">
          <Input
            value={dcReference}
            placeholder="e.g. DC-2026-27-0001, DC-2026-27-0002"
            onChange={(e) => setDcReference(e.target.value)}
          />
        </Field>
      </div>

      {/* Pick un-invoiced delivery challans for the selected company (+ optional
          material filter) — their items are imported and the DCs marked Invoiced. */}
      {showDcPicker && (
        <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50/40 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label className="label mb-0">Add from delivery challans</label>
            {dcMaterials.length > 0 && (
              <select
                className="input h-8 w-auto py-1 text-xs"
                value={dcMatFilter}
                onChange={(e) => setDcMatFilter(e.target.value)}
                aria-label="Filter challans by material"
              >
                <option value="">All materials</option>
                {dcMaterials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {!companyId ? (
            <p className="text-2xs text-slate-500">
              Select a company above to list its un-invoiced challans.
            </p>
          ) : (
            <details className="group">
              <summary className="input flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
                <span className={selectedDcIds.size ? 'text-slate-800' : 'text-slate-500'}>
                  {selectedDcIds.size
                    ? `${selectedDcIds.size} challan(s) selected`
                    : 'Select un-invoiced challans…'}
                </span>
                <ChevronDown
                  size={16}
                  className="text-slate-500 transition group-open:rotate-180"
                />
              </summary>
              <div className="mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white p-1">
                {filteredDcs.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-slate-500">
                    No un-invoiced challans{dcMatFilter ? ' for this material' : ''}.
                  </div>
                ) : (
                  filteredDcs.map((d) => (
                    <label
                      key={d.id}
                      className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-brand-600"
                        checked={selectedDcIds.has(d.id)}
                        onChange={() => toggleDc(d)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-mono text-xs font-semibold text-slate-700">
                            {d.dcNo}
                          </span>
                          <span className="text-2xs text-slate-500">{fmtDate(d.date)}</span>
                        </span>
                        {/* Show each material + its exact dispatched quantity so the
                            right challan can be picked at a glance. */}
                        <span className="mt-0.5 flex flex-wrap gap-1">
                          {d.lines.map((l) => (
                            <span
                              key={l.id}
                              className="inline-flex items-baseline gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-2xs text-slate-600"
                            >
                              <span className="font-medium text-slate-700">
                                {l.description || '—'}
                              </span>
                              <span className="font-semibold text-brand-700">
                                {qty(l.quantity)}
                              </span>
                              <span className="text-slate-500">{l.unit}</span>
                            </span>
                          ))}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </details>
          )}
          {selectedDcIds.size > 0 && (
            <p className="mt-2 text-2xs text-slate-500">
              Their items are added to the invoice below — fill in the rates. These challans will be
              marked <b>Invoiced</b> when you save.
            </p>
          )}
        </div>
      )}

      {/* Shipping address — same as billing by default. */}
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="text-sm font-medium text-slate-700">
            Shipping address same as billing (Bill To)
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={sameAsBilling}
            aria-label="Shipping address same as billing"
            onClick={() => setSameAsBilling((v) => !v)}
            className={clsx(
              'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition',
              sameAsBilling ? 'bg-brand-600' : 'bg-slate-300',
            )}
          >
            <span
              className={clsx(
                'inline-block h-5 w-5 transform rounded-full bg-white shadow transition',
                sameAsBilling ? 'translate-x-5' : 'translate-x-0.5',
              )}
            />
          </button>
        </label>
        {!sameAsBilling && (
          <div className="mt-3">
            <Field label="Shipping Address (Ship To)">
              <Textarea
                rows={2}
                value={shippingAddress}
                placeholder="Delivery address if different from billing"
                onChange={(e) => setShippingAddress(e.target.value)}
              />
            </Field>
          </div>
        )}
      </div>

      {eligibleJobs.length > 0 && (
        <div className="mt-3">
          <label className="label">Add from completed job</label>
          <div className="flex flex-wrap gap-1.5">
            {eligibleJobs.map((j) => (
              <button key={j.id} className="btn-secondary btn-sm" onClick={() => addJobLine(j.id)}>
                <Plus size={13} /> {j.jobNo} · {j.partName}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        {!invoice && (
          <>
            <div className="mb-2">
              <label className="label">Add stock materials (deducts stock)</label>
              <MultiSelectDropdown
                options={materials.map((m) => ({ id: m.id, label: m.name, hint: m.unit }))}
                selectedIds={selectedMaterialIds}
                onToggle={toggleMaterial}
                placeholder="Select materials to bill from stock…"
                emptyText="No active materials"
              />
            </div>
            <p className="mb-1 text-2xs text-slate-500">
              Pick one or more <b>materials</b> above (or a <b>Stock item</b> on a line) to bill
              directly against stock — saving reduces that material's balance. Leave blank for
              service/labour lines, or when the line came from a delivery challan (already
              deducted).
            </p>
          </>
        )}
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="label mb-0">Line Items</label>
          <div className="flex items-center gap-2">
            {products.length > 0 && (
              <Select
                value=""
                onChange={(e) => {
                  if (e.target.value) addProductLine(e.target.value)
                  e.target.value = ''
                }}
                className="h-8 py-1 text-xs"
                aria-label="Add from rate list"
              >
                <option value="">+ Add from rate list…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.rate}
                  </option>
                ))}
              </Select>
            )}
            <button className="btn-ghost btn-sm text-brand-600" onClick={addLine}>
              <Plus size={14} /> Add line
            </button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[36rem]">
            <thead>
              <tr className="bg-slate-50">
                <th className="th">Description</th>
                <th className="th w-56">Stock item (deducts)</th>
                <th className="th w-24 text-right">Qty</th>
                <th className="th w-28 text-right">Rate</th>
                <th className="th w-28 text-right">Amount</th>
                <th className="th w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => {
                // Stock-affecting fields (material, owner, qty) are locked once
                // the invoice exists — the deduction was posted at create time.
                const stockLocked = !!invoice && !!l.materialId
                // A line sourced from a challan already deducted stock there, so
                // it can't be linked to a material again (would double count).
                const fromChallan =
                  prefillLineIds.current.has(l.id) ||
                  [...dcLineMap.current.values()].some((ids) => ids.includes(l.id))
                return (
                  <tr key={l.id}>
                    <td className="px-2 py-1.5">
                      <input
                        className="input"
                        placeholder="Item / service"
                        value={l.description}
                        onChange={(e) => updateLine(l.id, { description: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      {invoice ? (
                        // Edit mode: show the linked material read-only (its stock
                        // was already deducted); no new links on an existing invoice.
                        <span className="text-2xs text-slate-500">
                          {l.materialId
                            ? `${materials.find((m) => m.id === l.materialId)?.name ?? 'Material'} · ${
                                l.ownerType === 'Shop' ? 'Own' : 'Customer'
                              }`
                            : '—'}
                        </span>
                      ) : fromChallan ? (
                        <span className="text-2xs text-slate-400">
                          From challan (already deducted)
                        </span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <select
                            className="input h-8 py-1 text-xs"
                            aria-label="Stock material to deduct"
                            value={l.materialId ?? ''}
                            onChange={(e) => pickMaterial(l.id, e.target.value)}
                          >
                            <option value="">No stock deduction</option>
                            {materials.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.unit})
                              </option>
                            ))}
                          </select>
                          {l.materialId && (
                            <select
                              className="input h-8 py-1 text-2xs"
                              aria-label="Stock owner"
                              value={l.ownerType ?? 'Company'}
                              onChange={(e) =>
                                updateLine(l.id, {
                                  ownerType: e.target.value as InvoiceLine['ownerType'],
                                })
                              }
                            >
                              <option value="Company">This customer's stock</option>
                              <option value="Shop">Own (shop) stock</option>
                            </select>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        step="0.001"
                        className="input text-right"
                        value={l.quantity}
                        disabled={stockLocked}
                        title={stockLocked ? 'Quantity is locked — it already reduced stock' : ''}
                        onChange={(e) => updateLine(l.id, { quantity: Number(e.target.value) })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        step="0.01"
                        className="input text-right"
                        value={l.rate}
                        onChange={(e) => updateLine(l.id, { rate: Number(e.target.value) })}
                      />
                    </td>
                    <td className="td text-right font-medium">{currency(l.quantity * l.rate)}</td>
                    <td className="px-2 py-1.5 text-right">
                      {!stockLocked && (
                        <button
                          className="btn-ghost btn-sm text-red-500"
                          onClick={() => removeLine(l.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Notes">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="space-y-2 rounded-lg bg-slate-50 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Subtotal</span>
            <span className="font-medium">{currency(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-slate-600">Discount</span>
            <input
              type="number"
              step="0.01"
              className="input w-28 text-right"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-slate-600">CGST %</span>
            <input
              type="number"
              step="0.01"
              className="input w-28 text-right"
              value={cgst}
              onChange={(e) => setCgst(e.target.value)}
              aria-label="CGST %"
            />
          </div>
          <div className="flex items-center justify-between text-2xs text-slate-500">
            <span>CGST amount</span>
            <span>{currency(cgstAmount)}</span>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-slate-600">SGST %</span>
            <input
              type="number"
              step="0.01"
              className="input w-28 text-right"
              value={sgst}
              onChange={(e) => setSgst(e.target.value)}
              aria-label="SGST %"
            />
          </div>
          <div className="flex items-center justify-between text-2xs text-slate-500">
            <span>SGST amount</span>
            <span>{currency(sgstAmount)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
            <span>Total</span>
            <span>{currency(total)}</span>
          </div>
        </div>
      </div>
    </Modal>
  )
}
