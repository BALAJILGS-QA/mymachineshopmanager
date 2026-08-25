import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Plus, Trash2 } from 'lucide-react'
import type { Invoice, InvoiceLine } from '@/types'
import { invoiceRepo, BusinessRuleError } from '@/data/repo'
import { useDb } from '@/data/store'
import { invoiceSubtotal, roundMoney } from '@/data/computations'
import { currency, fmtDateTime, todayISO } from '@/lib/format'
import { previewNextNo } from '@/data/repo'
import { uid } from '@/lib/id'
import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
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
  const companies = useDb((db) => db.companies.filter((c) => c.active || c.id === invoice?.companyId))
  const jobs = useDb((db) => db.jobs)
  const products = useDb((db) => db.products.filter((p) => p.active))
  const settings = useDb((db) => db.settings)

  const defCgst = settings.defaultCgstPercent ?? (settings.defaultTaxPercent || 0) / 2
  const defSgst = settings.defaultSgstPercent ?? (settings.defaultTaxPercent || 0) / 2

  const [invoiceNo, setInvoiceNo] = useState(
    invoice?.invoiceNo ?? previewNextNo('invoice', settings.numbering.invoice),
  )
  const [companyId, setCompanyId] = useState(invoice?.companyId ?? prefill?.companyId ?? companies[0]?.id ?? '')
  const [date, setDate] = useState(invoice?.date ?? todayISO())
  const [reference, setReference] = useState(invoice?.reference ?? prefill?.reference ?? '')
  const [dcReference, setDcReference] = useState(invoice?.dcReference ?? prefill?.dcReference ?? '')
  // Ship-to defaults to the billing address; toggle off to enter a different one.
  const [sameAsBilling, setSameAsBilling] = useState(invoice ? !invoice.shippingAddress : true)
  const [shippingAddress, setShippingAddress] = useState(invoice?.shippingAddress ?? '')
  const [discount, setDiscount] = useState(String(invoice?.discount ?? 0))
  // CGST / SGST default to half of the configured tax rate; both editable.
  const [cgst, setCgst] = useState(String(invoice?.cgstPercent ?? (invoice ? (invoice.taxPercent || 0) / 2 : defCgst)))
  const [sgst, setSgst] = useState(String(invoice?.sgstPercent ?? (invoice ? (invoice.taxPercent || 0) / 2 : defSgst)))
  const [notes, setNotes] = useState(invoice?.notes ?? '')
  const [lines, setLines] = useState<InvoiceLine[]>(
    invoice?.lines ??
      prefill?.lines ?? [{ id: uid('l_'), description: '', quantity: 1, rate: 0 }],
  )

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
  function addLine() {
    setLines((ls) => [...ls, { id: uid('l_'), description: '', quantity: 1, rate: 0 }])
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

  function submit(asDraft: boolean) {
    try {
      const payload = {
        invoiceNo: invoiceNo.trim() || undefined,
        date,
        companyId,
        reference: reference || undefined,
        dcReference: dcReference || undefined,
        lines: lines
          .filter((l) => l.description.trim() || l.rate > 0)
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
        invoiceRepo.update(invoice.id, payload)
        toast.success('Invoice updated')
      } else {
        const created = invoiceRepo.create(payload)
        toast.success('Invoice created')
        onCreated?.(created.id)
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
      size="xl"
      title={invoice ? `Edit ${invoice.invoiceNo}` : 'New Invoice'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          {!invoice && (
            <button className="btn-secondary" onClick={() => submit(true)}>
              Save as draft
            </button>
          )}
          <button className="btn-primary" onClick={() => submit(false)}>
            {invoice ? 'Save changes' : 'Create invoice'}
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
        <Field label="Invoice Number" required hint="Auto-sequenced; editable">
          <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
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
              <button
                key={j.id}
                className="btn-secondary btn-sm"
                onClick={() => addJobLine(j.id)}
              >
                <Plus size={13} /> {j.jobNo} · {j.partName}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
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
                <th className="th w-24 text-right">Qty</th>
                <th className="th w-28 text-right">Rate</th>
                <th className="th w-28 text-right">Amount</th>
                <th className="th w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => (
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
                    <input
                      type="number"
                      step="0.001"
                      className="input text-right"
                      value={l.quantity}
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
                  <td className="td text-right font-medium">
                    {currency(l.quantity * l.rate)}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      className="btn-ghost btn-sm text-red-500"
                      onClick={() => removeLine(l.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
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
