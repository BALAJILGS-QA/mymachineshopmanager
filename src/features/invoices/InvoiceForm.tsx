import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Invoice, InvoiceLine } from '@/types'
import { invoiceRepo, previewNextNo, BusinessRuleError } from '@/data/repo'
import { useDb } from '@/data/store'
import { invoiceSubtotal, roundMoney } from '@/data/computations'
import { currency, todayISO } from '@/lib/format'
import { uid } from '@/lib/id'
import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'

export function InvoiceForm({
  invoice,
  onClose,
}: {
  invoice: Invoice | null
  onClose: () => void
}) {
  const toast = useToast()
  const companies = useDb((db) => db.companies.filter((c) => c.active || c.id === invoice?.companyId))
  const jobs = useDb((db) => db.jobs)
  const settings = useDb((db) => db.settings)

  const [companyId, setCompanyId] = useState(invoice?.companyId ?? companies[0]?.id ?? '')
  const [date, setDate] = useState(invoice?.date ?? todayISO())
  const [reference, setReference] = useState(invoice?.reference ?? '')
  const [discount, setDiscount] = useState(String(invoice?.discount ?? 0))
  const [taxPercent, setTaxPercent] = useState(
    String(invoice?.taxPercent ?? settings.defaultTaxPercent),
  )
  const [notes, setNotes] = useState(invoice?.notes ?? '')
  const [lines, setLines] = useState<InvoiceLine[]>(
    invoice?.lines ?? [{ id: uid('l_'), description: '', quantity: 1, rate: 0 }],
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

  const draft: Invoice = {
    id: invoice?.id ?? 'draft',
    invoiceNo: invoice?.invoiceNo ?? '',
    date,
    companyId,
    reference,
    lines,
    discount: Number(discount) || 0,
    taxPercent: Number(taxPercent) || 0,
    status: invoice?.status ?? 'Unpaid',
    notes,
    createdAt: '',
    updatedAt: '',
  }
  const subtotal = invoiceSubtotal(draft)
  const taxable = Math.max(0, subtotal - draft.discount)
  const taxAmount = roundMoney((taxable * draft.taxPercent) / 100)
  const total = roundMoney(taxable + taxAmount)

  function submit(asDraft: boolean) {
    try {
      const payload = {
        date,
        companyId,
        reference: reference || undefined,
        lines: lines
          .filter((l) => l.description.trim() || l.rate > 0)
          .map((l) => ({ ...l, quantity: Number(l.quantity), rate: Number(l.rate) })),
        discount: Number(discount) || 0,
        taxPercent: Number(taxPercent) || 0,
        status: (asDraft ? 'Draft' : 'Unpaid') as Invoice['status'],
        notes: notes || undefined,
        billingAddress: undefined,
      }
      if (invoice) {
        invoiceRepo.update(invoice.id, payload)
        toast.success('Invoice updated')
      } else {
        invoiceRepo.create(payload)
        toast.success('Invoice created')
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
      {!invoice && (
        <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
          Invoice number will be <b>{previewNextNo('invoice', settings.numbering.invoice)}</b>
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
        <Field label="Reference / PO">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
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
        <div className="mb-1 flex items-center justify-between">
          <label className="label mb-0">Line Items</label>
          <button className="btn-ghost btn-sm text-brand-600" onClick={addLine}>
            <Plus size={14} /> Add line
          </button>
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
            <span className="text-slate-500">Subtotal</span>
            <span className="font-medium">{currency(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-slate-500">Discount</span>
            <input
              type="number"
              step="0.01"
              className="input w-28 text-right"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-slate-500">Tax %</span>
            <input
              type="number"
              step="0.01"
              className="input w-28 text-right"
              value={taxPercent}
              onChange={(e) => setTaxPercent(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Tax amount</span>
            <span className="font-medium">{currency(taxAmount)}</span>
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
