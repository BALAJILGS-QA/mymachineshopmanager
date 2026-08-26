import { useMemo, useState } from 'react'
import type { Invoice, PaymentMethod } from '@/types'
import { previewNextNo } from '@/data/repo'
import { useDb } from '@/data/store'
import { useCreatePayment } from './hooks/usePayments'
import { toUserMessage } from '@/lib/api/errors'
import { computeInvoice } from '@/data/computations'
import { currency, todayISO } from '@/lib/format'
import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { PAYMENT_METHODS as METHODS } from '@/constants/domain'

export function PaymentForm({
  invoice,
  onClose,
}: {
  invoice?: Invoice | null
  onClose: () => void
}) {
  const toast = useToast()
  const createPayment = useCreatePayment()
  const companies = useDb((db) => db.companies.filter((c) => c.active))
  const invoices = useDb((db) => db.invoices)
  const payments = useDb((db) => db.payments)
  const settings = useDb((db) => db.settings)

  const [companyId, setCompanyId] = useState(invoice?.companyId ?? companies[0]?.id ?? '')
  const [invoiceId, setInvoiceId] = useState(invoice?.id ?? '')
  const [date, setDate] = useState(todayISO())
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('Bank Transfer')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [isAdvance, setIsAdvance] = useState(false)

  const openInvoices = useMemo(
    () =>
      invoices.filter(
        (inv) => inv.companyId === companyId && ['Unpaid', 'Partially Paid'].includes(inv.status),
      ),
    [invoices, companyId],
  )

  const selectedInvoice = invoices.find((i) => i.id === invoiceId)
  const outstanding = selectedInvoice ? computeInvoice(selectedInvoice, payments).outstanding : 0

  async function submit() {
    try {
      await createPayment.mutateAsync({
        date,
        companyId,
        invoiceId: isAdvance || !invoiceId ? undefined : invoiceId,
        amount: Number(amount),
        method,
        reference: reference || undefined,
        notes: notes || undefined,
        isAdvance: isAdvance || !invoiceId,
      })
      toast.success('Payment recorded')
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Save failed'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record Payment"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={createPayment.isPending}>
            {createPayment.isPending ? 'Saving…' : 'Record payment'}
          </button>
        </>
      }
    >
      <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
        Payment ID will be <b>{previewNextNo('payment', settings.numbering.payment)}</b>
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Company" required>
          <Select
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value)
              setInvoiceId('')
            }}
            disabled={!!invoice}
          >
            <option value="">Select…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Payment Date" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field
          label="Allocate to Invoice"
          className="sm:col-span-2"
          hint={
            selectedInvoice && !isAdvance
              ? `Outstanding on ${selectedInvoice.invoiceNo}: ${currency(outstanding)}`
              : 'Leave empty or tick advance for an unallocated payment'
          }
        >
          <Select
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
            disabled={isAdvance || !!invoice}
          >
            <option value="">— advance / unallocated —</option>
            {openInvoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.invoiceNo} · outstanding {currency(computeInvoice(inv, payments).outstanding)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount" required>
          <Input
            type="number"
            step="0.01"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Method" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Reference No.">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Advance payment">
          <label className="flex items-center gap-2 py-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={isAdvance}
              onChange={(e) => setIsAdvance(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Treat as advance / unallocated
          </label>
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
