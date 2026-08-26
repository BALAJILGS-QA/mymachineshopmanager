import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, Printer } from 'lucide-react'
import { fmtDate, qty } from '@/lib/format'
import { Badge } from '@/components/ui/primitives'
import { downloadChallanPdf } from './challanPdf'
import { DC_STATUS_TONE as STATUS_TONE } from '@/constants/domain'
import { useChallans } from './hooks/useDeliveries'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useSettings } from '@/features/settings/hooks/useSettings'
import { DEFAULT_SETTINGS } from '@/data/seed'

export function ChallanPrintPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: challans = [] } = useChallans()
  const dc = challans.find((d) => d.id === id)
  const { data: companies = [] } = useCompanies()
  const company = companies.find((c) => c.id === dc?.companyId)
  const shop = useSettings().data?.company ?? DEFAULT_SETTINGS.company

  if (!dc) {
    return (
      <div className="py-16 text-center text-slate-500">
        Delivery challan not found.{' '}
        <button className="text-brand-600 underline" onClick={() => navigate('/app/deliveries')}>
          Back to challans
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <button className="btn-secondary" onClick={() => navigate('/app/deliveries')}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => window.print()}>
            <Printer size={16} /> Print
          </button>
          <button className="btn-primary" onClick={() => downloadChallanPdf(dc.id)}>
            <Download size={16} /> Download PDF
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm print:border-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{shop.name || 'Machine Shop'}</h1>
            {shop.address && (
              <p className="mt-1 whitespace-pre-line text-xs text-slate-500">{shop.address}</p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              {[shop.phone, shop.email].filter(Boolean).join(' · ')}
            </p>
            {shop.gstin && <p className="text-xs text-slate-500">GSTIN: {shop.gstin}</p>}
          </div>
          <div className="text-right">
            <p className="text-lg font-bold uppercase tracking-wide text-slate-500">
              Delivery Challan
            </p>
            <p className="font-mono text-sm font-semibold text-slate-800">{dc.dcNo}</p>
            <p className="text-xs text-slate-500">{fmtDate(dc.date)}</p>
            <div className="mt-1 flex justify-end">
              <Badge tone={STATUS_TONE[dc.status]}>{dc.status}</Badge>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 py-5">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wide text-slate-500">Ship To</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">{company?.name}</p>
            {company?.billingAddress && (
              <p className="whitespace-pre-line text-xs text-slate-500">{company.billingAddress}</p>
            )}
            {company?.gstin && <p className="text-xs text-slate-500">GSTIN: {company.gstin}</p>}
          </div>
          <div className="text-right">
            {dc.reference && (
              <>
                <p className="text-2xs font-semibold uppercase tracking-wide text-slate-500">
                  Reference
                </p>
                <p className="mt-1 text-sm text-slate-700">{dc.reference}</p>
              </>
            )}
            {dc.vehicleNo && (
              <>
                <p className="mt-2 text-2xs font-semibold uppercase tracking-wide text-slate-500">
                  Vehicle No.
                </p>
                <p className="mt-1 text-sm text-slate-700">{dc.vehicleNo}</p>
              </>
            )}
          </div>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-slate-200 bg-slate-50 text-left text-2xs uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">Description</th>
              <th className="px-2 py-2 text-right">Qty</th>
              <th className="px-2 py-2 text-right">Unit</th>
            </tr>
          </thead>
          <tbody>
            {dc.lines.map((l, i) => (
              <tr key={l.id} className="border-b border-slate-100">
                <td className="px-2 py-2 text-slate-500">{i + 1}</td>
                <td className="px-2 py-2 text-slate-700">{l.description}</td>
                <td className="px-2 py-2 text-right">{qty(l.quantity)}</td>
                <td className="px-2 py-2 text-right text-slate-600">{l.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {dc.notes && (
          <div className="mt-6 border-t border-slate-100 pt-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-slate-500">Notes</p>
            <p className="mt-1 whitespace-pre-line text-xs text-slate-500">{dc.notes}</p>
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
      </div>
    </div>
  )
}
