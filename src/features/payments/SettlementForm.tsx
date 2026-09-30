import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { DeductionType, PaymentMethod } from '@/types'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useInvoices } from '@/features/invoices/hooks/useInvoices'
import { usePayments } from './hooks/usePayments'
import { useAllocations, useDeductions, useCreateSettlement } from './hooks/useSettlements'
import type { SettlementDeductionInput } from './api/settlementsApi'
import { usePreviewNo } from '@/features/shared/usePreviewNo'
import { toUserMessage } from '@/lib/api/errors'
import { computeInvoice, roundMoney } from '@/data/computations'
import { currency, fmtDate } from '@/lib/format'
import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { DateInput } from '@/components/ui/DateInput'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { PAYMENT_METHODS as METHODS } from '@/constants/domain'

// User-selectable deduction types. 'Unidentified' is system-only (recorded via
// the "customer didn't provide details" toggle), so it is excluded here.
const KNOWN_DEDUCTION_TYPES: DeductionType[] = [
  'TDS',
  'Transportation',
  'Freight',
  'Commission',
  'Retention',
  'Discount',
  'Other',
]

interface DedLine {
  key: string
  invoiceId: string
  deductionType: DeductionType
  calcType: 'percent' | 'fixed'
  rateStr: string
  amountStr: string
  remarks: string
}

let dedKeySeq = 0

export function SettlementForm({
  companyId: initialCompanyId,
  onClose,
}: {
  companyId?: string
  onClose: () => void
}) {
  const toast = useToast()
  const createSettlement = useCreateSettlement()
  const { data: allCompanies = [] } = useCompanies()
  const companies = allCompanies.filter((c) => c.active)
  const { data: invoices = [] } = useInvoices()
  const { data: payments = [] } = usePayments()
  const { data: allocations = [] } = useAllocations()
  const { data: deductions = [] } = useDeductions()
  const paymentNoPreview = usePreviewNo('payment')

  const [companyId, setCompanyId] = useState(initialCompanyId ?? companies[0]?.id ?? '')
  const [date, setDate] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('Bank Transfer')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [amountStr, setAmountStr] = useState('')
  // invoiceId -> allocation amount string
  const [alloc, setAlloc] = useState<Record<string, string>>({})
  const [dedLines, setDedLines] = useState<DedLine[]>([])
  const [autoUnknown, setAutoUnknown] = useState(false)

  // Open invoices for the customer with a real outstanding balance (current
  // figures include existing allocations + deductions).
  const openInvoices = useMemo(() => {
    return invoices
      .filter(
        (inv) =>
          inv.companyId === companyId && inv.status !== 'Draft' && inv.status !== 'Cancelled',
      )
      .map((inv) => ({ inv, c: computeInvoice(inv, payments, allocations, deductions) }))
      .filter(({ c }) => c.outstanding > 0.005)
      .sort((a, b) => a.inv.date.localeCompare(b.inv.date))
  }, [invoices, payments, allocations, deductions, companyId])

  const outstandingById = useMemo(() => {
    const m = new Map<string, number>()
    for (const { inv, c } of openInvoices) m.set(inv.id, c.outstanding)
    return m
  }, [openInvoices])
  const grossById = useMemo(() => {
    const m = new Map<string, number>()
    for (const { inv, c } of openInvoices) m.set(inv.id, c.total)
    return m
  }, [openInvoices])

  const amount = Number(amountStr) || 0
  const selectedInvoiceIds = openInvoices.map((o) => o.inv.id).filter((id) => alloc[id] != null)

  function toggleInvoice(id: string, on: boolean) {
    setAlloc((prev) => {
      const next = { ...prev }
      if (on) {
        // Default the allocation to whatever bank money is still unassigned,
        // capped at this invoice's outstanding.
        const assigned = Object.entries(next).reduce((s, [, v]) => s + (Number(v) || 0), 0)
        const remaining = Math.max(0, roundMoney(amount - assigned))
        const out = outstandingById.get(id) ?? 0
        next[id] = String(Math.min(remaining, out) || out)
      } else {
        delete next[id]
      }
      return next
    })
  }

  function knownDedForInvoice(invoiceId: string): number {
    return roundMoney(
      dedLines
        .filter((d) => d.invoiceId === invoiceId)
        .reduce((s, d) => s + (Number(d.amountStr) || 0), 0),
    )
  }

  // Reconciliation figures.
  const recon = useMemo(() => {
    const totalAllocated = roundMoney(
      selectedInvoiceIds.reduce((s, id) => s + (Number(alloc[id]) || 0), 0),
    )
    const advance = roundMoney(Math.max(0, amount - totalAllocated))
    const totalKnown = roundMoney(dedLines.reduce((s, d) => s + (Number(d.amountStr) || 0), 0))
    let totalUnknown = 0
    const perInvoiceUnknown: Record<string, number> = {}
    if (autoUnknown) {
      for (const id of selectedInvoiceIds) {
        const out = outstandingById.get(id) ?? 0
        const gap = roundMoney(out - (Number(alloc[id]) || 0) - knownDedForInvoice(id))
        if (gap > 0.005) {
          perInvoiceUnknown[id] = gap
          totalUnknown += gap
        }
      }
    }
    return {
      totalAllocated,
      advance,
      totalKnown,
      totalUnknown: roundMoney(totalUnknown),
      perInvoiceUnknown,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alloc, dedLines, amount, autoUnknown, selectedInvoiceIds.join(','), openInvoices])

  // Validation.
  const errors: string[] = []
  if (amount <= 0) errors.push('Enter the amount received (greater than zero).')
  if (recon.totalAllocated > amount + 0.001)
    errors.push(
      `Allocated ${currency(recon.totalAllocated)} exceeds amount received ${currency(amount)}.`,
    )
  for (const id of selectedInvoiceIds) {
    const out = outstandingById.get(id) ?? 0
    const settledForInv =
      (Number(alloc[id]) || 0) + knownDedForInvoice(id) + (recon.perInvoiceUnknown[id] ?? 0)
    if (settledForInv > out + 0.001) {
      const no = openInvoices.find((o) => o.inv.id === id)?.inv.invoiceNo ?? id
      errors.push(
        `${no}: allocation + deductions (${currency(settledForInv)}) exceed outstanding (${currency(out)}).`,
      )
    }
  }
  const canSubmit = errors.length === 0 && !!companyId && !!date && !createSettlement.isPending

  function addDeduction() {
    dedKeySeq += 1
    setDedLines((prev) => [
      ...prev,
      {
        key: `d${dedKeySeq}`,
        invoiceId: selectedInvoiceIds[0] ?? '',
        deductionType: 'TDS',
        calcType: 'fixed',
        rateStr: '',
        amountStr: '',
        remarks: '',
      },
    ])
  }

  function patchDed(key: string, patch: Partial<DedLine>) {
    setDedLines((prev) =>
      prev.map((d) => {
        if (d.key !== key) return d
        const next = { ...d, ...patch }
        // When a percentage rate is set, auto-fill the amount from the invoice
        // gross as a convenience; the amount stays editable (the source of truth).
        if (
          (patch.rateStr != null || patch.calcType === 'percent' || patch.invoiceId != null) &&
          next.calcType === 'percent'
        ) {
          const rate = Number(next.rateStr) || 0
          const base = grossById.get(next.invoiceId) ?? 0
          if (rate > 0 && base > 0) next.amountStr = String(roundMoney((base * rate) / 100))
        }
        return next
      }),
    )
  }

  async function submit() {
    try {
      const allocInputs = selectedInvoiceIds
        .map((id) => ({ invoiceId: id, amount: roundMoney(Number(alloc[id]) || 0) }))
        .filter((a) => a.amount > 0)
      const knownInputs: SettlementDeductionInput[] = dedLines
        .filter((d) => (Number(d.amountStr) || 0) > 0 && d.invoiceId)
        .map((d) => ({
          invoiceId: d.invoiceId,
          deductionType: d.deductionType,
          calcType: d.calcType,
          rate: d.rateStr ? Number(d.rateStr) : undefined,
          amount: roundMoney(Number(d.amountStr) || 0),
          remarks: d.remarks || undefined,
        }))
      const unknownInputs: SettlementDeductionInput[] = Object.entries(recon.perInvoiceUnknown).map(
        ([invoiceId, amt]) => ({ invoiceId, deductionType: 'Unidentified', amount: amt }),
      )
      await createSettlement.mutateAsync({
        date,
        companyId,
        amount,
        method,
        reference: reference || undefined,
        notes: notes || undefined,
        allocations: allocInputs,
        deductions: [...knownInputs, ...unknownInputs],
      })
      toast.success('Settlement recorded')
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Could not record settlement'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record Payment / Settlement"
      size="xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={!canSubmit}>
            {createSettlement.isPending ? 'Saving…' : 'Record settlement'}
          </button>
        </>
      }
    >
      <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
        Payment ID will be <b>{paymentNoPreview}</b>. Select the invoices this receipt settles,
        record any deductions, and any unexplained shortfall is tracked separately.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Customer" required>
          <Select
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value)
              setAlloc({})
              setDedLines([])
            }}
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
          <DateInput value={date} onChange={setDate} />
        </Field>
        <Field label="Amount Received" required>
          <Input
            type="number"
            step="0.01"
            min={0}
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
          />
        </Field>
        <Field label="Method" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="UTR / Reference">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Notes">
          <Textarea rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>

      {/* Invoice selection + allocation */}
      <div className="mt-4">
        <h4 className="mb-2 text-sm font-semibold text-slate-700">Outstanding invoices</h4>
        {!companyId ? (
          <p className="text-xs text-slate-500">Select a customer to see open invoices.</p>
        ) : openInvoices.length === 0 ? (
          <p className="text-xs text-slate-500">No outstanding invoices for this customer.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-2xs uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 text-left">Sel</th>
                  <th className="px-2 py-1.5 text-left">Invoice</th>
                  <th className="px-2 py-1.5 text-left">Date</th>
                  <th className="px-2 py-1.5 text-right">Outstanding</th>
                  <th className="px-2 py-1.5 text-right">Allocate</th>
                </tr>
              </thead>
              <tbody>
                {openInvoices.map(({ inv }) => {
                  const selected = alloc[inv.id] != null
                  return (
                    <tr key={inv.id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => toggleInvoice(inv.id, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                      </td>
                      <td className="px-2 py-1.5 font-medium text-slate-700">{inv.invoiceNo}</td>
                      <td className="px-2 py-1.5 text-slate-500">{fmtDate(inv.date)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {currency(outstandingById.get(inv.id) ?? 0)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          className="w-28 text-right"
                          value={selected ? alloc[inv.id] : ''}
                          disabled={!selected}
                          onChange={(e) => setAlloc((p) => ({ ...p, [inv.id]: e.target.value }))}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Deductions */}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-700">Deductions (optional)</h4>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={addDeduction}
            disabled={selectedInvoiceIds.length === 0}
          >
            <Plus size={14} /> Add deduction
          </button>
        </div>
        {dedLines.length > 0 && (
          <div className="space-y-2">
            {dedLines.map((d) => (
              <div
                key={d.key}
                className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-12"
              >
                <Select
                  className="sm:col-span-3"
                  value={d.invoiceId}
                  onChange={(e) => patchDed(d.key, { invoiceId: e.target.value })}
                >
                  {selectedInvoiceIds.map((id) => (
                    <option key={id} value={id}>
                      {openInvoices.find((o) => o.inv.id === id)?.inv.invoiceNo ?? id}
                    </option>
                  ))}
                </Select>
                <Select
                  className="sm:col-span-2"
                  value={d.deductionType}
                  onChange={(e) =>
                    patchDed(d.key, { deductionType: e.target.value as DeductionType })
                  }
                >
                  {KNOWN_DEDUCTION_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
                <Select
                  className="sm:col-span-2"
                  value={d.calcType}
                  onChange={(e) =>
                    patchDed(d.key, { calcType: e.target.value as 'percent' | 'fixed' })
                  }
                >
                  <option value="fixed">Fixed</option>
                  <option value="percent">Percent</option>
                </Select>
                <Input
                  className="sm:col-span-2"
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder={d.calcType === 'percent' ? 'Rate %' : '—'}
                  value={d.rateStr}
                  disabled={d.calcType !== 'percent'}
                  onChange={(e) => patchDed(d.key, { rateStr: e.target.value })}
                />
                <Input
                  className="sm:col-span-2"
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="Amount"
                  value={d.amountStr}
                  onChange={(e) => patchDed(d.key, { amountStr: e.target.value })}
                />
                <button
                  type="button"
                  className="text-slate-400 hover:text-red-600 sm:col-span-1"
                  onClick={() => setDedLines((prev) => prev.filter((x) => x.key !== d.key))}
                  aria-label="Remove deduction"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={autoUnknown}
            onChange={(e) => setAutoUnknown(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Customer did not provide deduction details — record the shortfall as an{' '}
          <b>unidentified difference</b>.
        </label>
      </div>

      {/* Reconciliation */}
      <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
        <div className="grid grid-cols-2 gap-y-1 sm:grid-cols-4">
          <ReconCell label="Amount received" value={amount} />
          <ReconCell label="Allocated" value={recon.totalAllocated} />
          <ReconCell label="Advance (on account)" value={recon.advance} tone="blue" />
          <ReconCell label="Known deductions" value={recon.totalKnown} />
          {recon.totalUnknown > 0 && (
            <ReconCell label="Unknown difference" value={recon.totalUnknown} tone="amber" />
          )}
        </div>
      </div>

      {errors.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg bg-red-50 p-3 text-xs text-red-700">
          {errors.map((e, i) => (
            <li key={i}>• {e}</li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

function ReconCell({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'blue' | 'amber'
}) {
  const color =
    tone === 'blue' ? 'text-blue-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-800'
  return (
    <div>
      <div className="text-2xs uppercase text-slate-500">{label}</div>
      <div className={`font-semibold tabular-nums ${color}`}>{currency(value)}</div>
    </div>
  )
}
