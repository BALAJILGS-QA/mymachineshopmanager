import { ArrowLeft, Download, Printer } from 'lucide-react'
import { useAppNavigate } from '@/components/nav/app-link'
import { computeInvoice } from '@/data/computations'
import { currency, fmtDate, qty } from '@/lib/format'
import { InvoiceStatusBadge } from '@/components/common/status'
import { downloadInvoicePdf } from './invoicePdf'
import { useInvoices } from './hooks/useInvoices'
import { usePayments } from '@/features/payments/hooks/usePayments'
import { useAllocations, useDeductions } from '@/features/payments/hooks/useSettlements'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useSettings } from '@/features/settings/hooks/useSettings'
import { DEFAULT_SETTINGS } from '@/data/seed'

// `id` comes from the route param, injected by each framework's route wrapper
// (TanStack `Route.useParams()` / Next `useParams()`), keeping this page
// router-agnostic.
export function InvoicePrintPage({ id }: { id?: string }) {
  const navigate = useAppNavigate()
  const { data: invoices = [] } = useInvoices()
  const invoice = invoices.find((i) => i.id === id)
  const { data: companies = [] } = useCompanies()
  const company = companies.find((c) => c.id === invoice?.companyId)
  const shop = useSettings().data?.company ?? DEFAULT_SETTINGS.company
  const { data: payments = [] } = usePayments()
  const { data: allocations = [] } = useAllocations()
  const { data: deductions = [] } = useDeductions()

  if (!invoice) {
    return (
      <div className="py-16 text-center text-slate-500">
        Invoice not found.{' '}
        <button className="text-brand-600 underline" onClick={() => navigate('/app/invoices')}>
          Back to invoices
        </button>
      </div>
    )
  }

  const c = computeInvoice(invoice, payments, allocations, deductions)

  // Payment history for this invoice: allocations (with their payment) + any
  // legacy direct-link payments that predate the allocation layer.
  const allocatedPaymentIds = new Set(allocations.map((a) => a.paymentId))
  const history = [
    ...allocations
      .filter((a) => a.invoiceId === invoice.id)
      .map((a) => {
        const p = payments.find((pp) => pp.id === a.paymentId)
        return {
          key: a.id,
          no: p?.paymentNo ?? '—',
          date: p?.date,
          method: p?.method,
          amount: a.amount,
        }
      }),
    ...payments
      .filter((p) => p.invoiceId === invoice.id && !allocatedPaymentIds.has(p.id))
      .map((p) => ({
        key: p.id,
        no: p.paymentNo,
        date: p.date,
        method: p.method,
        amount: p.amount,
      })),
  ].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const invoiceDeductions = deductions.filter((d) => d.invoiceId === invoice.id)

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <button className="btn-secondary" onClick={() => navigate('/app/invoices')}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => window.print()}>
            <Printer size={16} /> Print
          </button>
          <button className="btn-primary" onClick={() => downloadInvoicePdf(invoice.id)}>
            <Download size={16} /> Download PDF
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:border-0 print:shadow-none sm:p-8">
        <div className="flex items-start justify-between border-b border-slate-200 pb-5">
          <div className="flex items-start gap-3">
            <img
              src={shop.logoUrl || '/sbi-logo.svg'}
              alt=""
              className="h-14 w-14 shrink-0 rounded-lg object-contain"
            />
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {shop.name || 'CNC Machine Shop'}
              </h1>
              {shop.address && (
                <p className="mt-1 whitespace-pre-line text-xs text-slate-500">{shop.address}</p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                {[shop.phone, shop.email].filter(Boolean).join(' · ')}
              </p>
              {shop.gstin && <p className="text-xs text-slate-500">GSTIN: {shop.gstin}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold uppercase tracking-wide text-slate-500">Invoice</p>
            <p className="font-mono text-sm font-semibold text-slate-800">{invoice.invoiceNo}</p>
            <p className="text-xs text-slate-500">{fmtDate(invoice.date)}</p>
            <div className="mt-1 flex justify-end">
              <InvoiceStatusBadge status={invoice.status} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 py-5">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wide text-slate-500">Bill To</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">{company?.name}</p>
            {(invoice.billingAddress || company?.billingAddress) && (
              <p className="whitespace-pre-line text-xs text-slate-500">
                {invoice.billingAddress || company?.billingAddress}
              </p>
            )}
            {company?.gstin && <p className="text-xs text-slate-500">GSTIN: {company.gstin}</p>}
          </div>
          {invoice.reference && (
            <div className="text-right">
              <p className="text-2xs font-semibold uppercase tracking-wide text-slate-500">
                Reference
              </p>
              <p className="mt-1 text-sm text-slate-700">{invoice.reference}</p>
            </div>
          )}
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-slate-200 bg-slate-50 text-left text-2xs uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">Description</th>
              <th className="px-2 py-2 text-right">Qty</th>
              <th className="px-2 py-2 text-right">Rate</th>
              <th className="px-2 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l, i) => (
              <tr key={l.id} className="border-b border-slate-100">
                <td className="px-2 py-2 text-slate-500">{i + 1}</td>
                <td className="px-2 py-2 text-slate-700">{l.description}</td>
                <td className="px-2 py-2 text-right">{qty(l.quantity)}</td>
                <td className="px-2 py-2 text-right">{currency(l.rate)}</td>
                <td className="px-2 py-2 text-right font-medium">
                  {currency(l.quantity * l.rate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <div className="w-64 space-y-1.5 text-sm">
            <Row label="Subtotal" value={currency(c.subtotal)} />
            {invoice.discount > 0 && (
              <Row label="Discount" value={`- ${currency(invoice.discount)}`} />
            )}
            {(() => {
              const taxable = Math.max(0, c.subtotal - (invoice.discount || 0))
              const cg = invoice.cgstPercent
              const sg = invoice.sgstPercent
              if (cg != null || sg != null) {
                return (
                  <>
                    {!!cg && <Row label={`CGST (${cg}%)`} value={currency((taxable * cg) / 100)} />}
                    {!!sg && <Row label={`SGST (${sg}%)`} value={currency((taxable * sg) / 100)} />}
                  </>
                )
              }
              return invoice.taxPercent > 0 ? (
                <Row label={`Tax (${invoice.taxPercent}%)`} value={currency(c.taxAmount)} />
              ) : null
            })()}
            <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-bold text-slate-900">
              <span>Total</span>
              <span>{currency(c.total)}</span>
            </div>
            {c.settled > 0 && (
              <>
                <Row label="Paid" value={currency(c.paid)} />
                {c.knownDeductions > 0 && (
                  <Row label="Known deductions" value={`- ${currency(c.knownDeductions)}`} />
                )}
                {c.unknownDeduction > 0 && (
                  <Row label="Unknown difference" value={`- ${currency(c.unknownDeduction)}`} />
                )}
                {(c.knownDeductions > 0 || c.unknownDeduction > 0) && (
                  <Row label="Total settled" value={currency(c.settled)} />
                )}
                <div
                  className={`flex justify-between font-semibold ${c.outstanding > 0.005 ? 'text-amber-600' : 'text-green-600'}`}
                >
                  <span>Outstanding</span>
                  <span>{currency(c.outstanding)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Payment history + deductions — settlement transparency on the invoice. */}
        {(history.length > 0 || invoiceDeductions.length > 0) && (
          <div className="mt-6 border-t border-slate-100 pt-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-slate-500">
              Payment history
            </p>
            <table className="mt-2 w-full text-sm">
              <tbody>
                {history.map((h) => (
                  <tr key={h.key} className="border-b border-slate-100">
                    <td className="py-1 font-mono text-xs text-slate-600">{h.no}</td>
                    <td className="py-1 text-xs text-slate-500">{h.date ? fmtDate(h.date) : ''}</td>
                    <td className="py-1 text-xs text-slate-500">{h.method}</td>
                    <td className="py-1 text-right tabular-nums">{currency(h.amount)}</td>
                  </tr>
                ))}
                {invoiceDeductions.map((d) => (
                  <tr key={d.id} className="border-b border-slate-100 text-slate-500">
                    <td className="py-1 text-xs" colSpan={3}>
                      {d.deductionType === 'Unidentified' ? 'Unknown difference' : d.deductionType}
                      {d.remarks ? ` — ${d.remarks}` : ''}
                    </td>
                    <td className="py-1 text-right text-xs tabular-nums">- {currency(d.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Note — the delivery challan number(s) this invoice covers, highlighted. */}
        <div className="mt-6 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
          <p className="text-2xs font-semibold uppercase tracking-wide text-brand-700">Note</p>
          <p className="mt-1 font-mono text-sm font-semibold text-brand-700">
            {invoice.dcReference || '—'}
          </p>
        </div>

        {invoice.notes && (
          <div className="mt-6 border-t border-slate-100 pt-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-slate-500">Notes</p>
            <p className="mt-1 whitespace-pre-line text-xs text-slate-500">{invoice.notes}</p>
          </div>
        )}

        <div className="mt-12 flex justify-end">
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-800">For {shop.name}</p>
            <p className="mt-10 text-xs font-medium text-slate-600">
              {shop.isProprietor ? 'Proprietor' : 'Partner / Authorised Signatory'}
            </p>
          </div>
        </div>

        <p className="mt-8 text-center text-2xs text-slate-500">
          This is a computer-generated invoice.
        </p>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
