import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { useDb } from '@/data/store'
import { computeInvoice } from '@/data/computations'
import { currency, fmtDate, qty } from '@/lib/format'
import { InvoiceStatusBadge } from '@/components/common/status'

export function InvoicePrintPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const invoice = useDb((db) => db.invoices.find((i) => i.id === id))
  const company = useDb((db) => db.companies.find((c) => c.id === invoice?.companyId))
  const shop = useDb((db) => db.settings.company)
  const payments = useDb((db) => db.payments)

  if (!invoice) {
    return (
      <div className="py-16 text-center text-slate-500">
        Invoice not found.{' '}
        <button className="text-brand-600 underline" onClick={() => navigate('/invoices')}>
          Back to invoices
        </button>
      </div>
    )
  }

  const c = computeInvoice(invoice, payments)

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <button className="btn-secondary" onClick={() => navigate('/invoices')}>
          <ArrowLeft size={16} /> Back
        </button>
        <button className="btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> Print / Save PDF
        </button>
      </div>

      <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm print:border-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{shop.name || 'CNC Machine Shop'}</h1>
            {shop.address && <p className="mt-1 whitespace-pre-line text-xs text-slate-500">{shop.address}</p>}
            <p className="mt-1 text-xs text-slate-500">
              {[shop.phone, shop.email].filter(Boolean).join(' · ')}
            </p>
            {shop.gstin && <p className="text-xs text-slate-500">GSTIN: {shop.gstin}</p>}
          </div>
          <div className="text-right">
            <p className="text-lg font-bold uppercase tracking-wide text-slate-400">Invoice</p>
            <p className="font-mono text-sm font-semibold text-slate-800">{invoice.invoiceNo}</p>
            <p className="text-xs text-slate-500">{fmtDate(invoice.date)}</p>
            <div className="mt-1 flex justify-end">
              <InvoiceStatusBadge status={invoice.status} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 py-5">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wide text-slate-400">Bill To</p>
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
              <p className="text-2xs font-semibold uppercase tracking-wide text-slate-400">Reference</p>
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
                <td className="px-2 py-2 text-slate-400">{i + 1}</td>
                <td className="px-2 py-2 text-slate-700">{l.description}</td>
                <td className="px-2 py-2 text-right">{qty(l.quantity)}</td>
                <td className="px-2 py-2 text-right">{currency(l.rate)}</td>
                <td className="px-2 py-2 text-right font-medium">{currency(l.quantity * l.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <div className="w-64 space-y-1.5 text-sm">
            <Row label="Subtotal" value={currency(c.subtotal)} />
            {invoice.discount > 0 && <Row label="Discount" value={`- ${currency(invoice.discount)}`} />}
            {invoice.taxPercent > 0 && (
              <Row label={`Tax (${invoice.taxPercent}%)`} value={currency(c.taxAmount)} />
            )}
            <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-bold text-slate-900">
              <span>Total</span>
              <span>{currency(c.total)}</span>
            </div>
            {c.paid > 0 && (
              <>
                <Row label="Paid" value={currency(c.paid)} />
                <div className="flex justify-between font-semibold text-amber-600">
                  <span>Outstanding</span>
                  <span>{currency(c.outstanding)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {invoice.notes && (
          <div className="mt-6 border-t border-slate-100 pt-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-slate-400">Notes</p>
            <p className="mt-1 whitespace-pre-line text-xs text-slate-500">{invoice.notes}</p>
          </div>
        )}

        <p className="mt-8 text-center text-2xs text-slate-400">
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
