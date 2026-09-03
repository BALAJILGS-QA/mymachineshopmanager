import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Download, FileJson, Save } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { Card, Field, Input } from '@/components/ui/primitives'
import { StatTile } from '@/components/common/StatTile'
import { useToast } from '@/components/ui/Toast'
import { toUserMessage } from '@/lib/api/errors'
import { currency, thisMonthPrefix } from '@/lib/format'
import { computeInvoice } from '@/data/computations'
import { useInvoices } from '@/features/invoices/hooks/useInvoices'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useGstRegistrations, useGstReturns } from '../hooks/useFinance'
import { useFinanceAccess } from '../access'

interface Row {
  invoiceNo: string
  date: string
  gstin?: string
  customer: string
  taxable: number
  cgst: number
  sgst: number
  total: number
}

export function GstReturnsPage() {
  const invoices = useInvoices().data ?? []
  const companies = useCompanies().data ?? []
  const regs = useGstRegistrations().list.data ?? []
  const savedReturns = useGstReturns()
  const perms = useFinanceAccess()
  const canManage = perms.can('GST_MANAGE')
  const toast = useToast()
  const [period, setPeriod] = useState(thisMonthPrefix())
  const [tab, setTab] = useState<'gstr1' | 'gstr3b'>('gstr1')
  const supplierGstin = (regs.find((r) => r.isDefault) ?? regs[0])?.gstin

  const rows: Row[] = useMemo(() => {
    return invoices
      .filter(
        (inv) =>
          (inv.date ?? '').startsWith(period) &&
          inv.status !== 'Cancelled' &&
          inv.status !== 'Draft',
      )
      .map((inv) => {
        const c = computeInvoice(inv, [])
        const taxable = c.subtotal - (inv.discount || 0)
        const cgstPct = inv.cgstPercent ?? (inv.taxPercent || 0) / 2
        const sgstPct = inv.sgstPercent ?? (inv.taxPercent || 0) / 2
        const comp = companies.find((x) => x.id === inv.companyId)
        return {
          invoiceNo: inv.invoiceNo,
          date: inv.date,
          gstin: comp?.gstin,
          customer: comp?.name ?? '—',
          taxable: Math.round(taxable * 100) / 100,
          cgst: Math.round(((taxable * cgstPct) / 100) * 100) / 100,
          sgst: Math.round(((taxable * sgstPct) / 100) * 100) / 100,
          total: c.total,
        }
      })
  }, [invoices, companies, period])

  const b2b = rows.filter((r) => r.gstin)
  const b2c = rows.filter((r) => !r.gstin)
  const sum = (rs: Row[], k: keyof Row) => rs.reduce((s, r) => s + (Number(r[k]) || 0), 0)
  const totals = {
    taxable: sum(rows, 'taxable'),
    cgst: sum(rows, 'cgst'),
    sgst: sum(rows, 'sgst'),
    total: sum(rows, 'total'),
    tax: sum(rows, 'cgst') + sum(rows, 'sgst'),
  }

  function downloadJson() {
    // Indicative GSTR-1-shaped JSON (preparation only — NOT a portal upload).
    const payload = {
      gstin: supplierGstin ?? '',
      fp: period.replace('-', ''),
      b2b: Object.values(
        b2b.reduce<Record<string, { ctin: string; inv: unknown[] }>>((acc, r) => {
          const k = r.gstin!
          acc[k] ??= { ctin: k, inv: [] }
          acc[k].inv.push({
            inum: r.invoiceNo,
            idt: r.date,
            val: r.total,
            itms: [{ txval: r.taxable, camt: r.cgst, samt: r.sgst }],
          })
          return acc
        }, {}),
      ),
      b2cs: b2c.map((r) => ({ inum: r.invoiceNo, txval: r.taxable, camt: r.cgst, samt: r.sgst })),
      _note: 'Prepared by MSM — preparation/export only, not filed to the GST portal.',
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `GSTR1-${period}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function savePrepared(returnType: 'GSTR1' | 'GSTR3B') {
    try {
      await savedReturns.create.mutateAsync({
        period,
        returnType,
        gstin: supplierGstin,
        status: 'prepared',
        summary: { ...totals, b2b: b2b.length, b2c: b2c.length },
      })
      toast.success(`${returnType} prepared for ${period}`)
    } catch (e) {
      toast.error(toUserMessage(e, 'Could not save return'))
    }
  }

  const SectionTable = ({ title, data }: { title: string; data: Row[] }) => (
    <Card className="mb-4">
      <div className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
        {title} ({data.length})
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="text-left text-2xs uppercase text-slate-500">
              <th className="px-3 py-1.5">Invoice</th>
              <th className="px-3 py-1.5">GSTIN</th>
              <th className="px-3 py-1.5">Customer</th>
              <th className="px-3 py-1.5 text-right">Taxable</th>
              <th className="px-3 py-1.5 text-right">CGST</th>
              <th className="px-3 py-1.5 text-right">SGST</th>
              <th className="px-3 py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-3 text-center text-xs text-slate-400">
                  No records
                </td>
              </tr>
            ) : (
              data.map((r) => (
                <tr key={r.invoiceNo} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 font-mono text-xs">{r.invoiceNo}</td>
                  <td className="px-3 py-1.5 font-mono text-2xs">{r.gstin || 'B2C'}</td>
                  <td className="px-3 py-1.5">{r.customer}</td>
                  <td className="px-3 py-1.5 text-right tnum">{currency(r.taxable)}</td>
                  <td className="px-3 py-1.5 text-right tnum">{currency(r.cgst)}</td>
                  <td className="px-3 py-1.5 text-right tnum">{currency(r.sgst)}</td>
                  <td className="px-3 py-1.5 text-right tnum font-semibold">{currency(r.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )

  return (
    <div>
      <PageHeader
        title="GST Returns"
        subtitle="GSTR-1 (B2B/B2C) and GSTR-3B preparation + JSON export. Preparation only — not portal filing."
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary btn-sm" onClick={downloadJson}>
              <FileJson size={16} /> GSTR-1 JSON
            </button>
            {canManage && (
              <button
                className="btn-primary btn-sm"
                onClick={() => savePrepared(tab === 'gstr1' ? 'GSTR1' : 'GSTR3B')}
              >
                <Save size={16} /> Save prepared
              </button>
            )}
          </div>
        }
      />

      <Card className="mb-4 p-3">
        <Field label="Period (month)" className="w-44">
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </Field>
      </Card>

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {(['gstr1', 'gstr3b'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'border-b-2 px-3 py-2 text-sm font-medium',
              tab === t
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {t === 'gstr1' ? 'GSTR-1' : 'GSTR-3B'}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          icon={<Download size={20} />}
          label="Taxable"
          value={currency(totals.taxable)}
          tone="violet"
        />
        <StatTile
          icon={<Download size={20} />}
          label="CGST"
          value={currency(totals.cgst)}
          tone="green"
        />
        <StatTile
          icon={<Download size={20} />}
          label="SGST"
          value={currency(totals.sgst)}
          tone="green"
        />
        <StatTile
          icon={<Download size={20} />}
          label="Total Tax"
          value={currency(totals.tax)}
          tone="orange"
        />
      </div>

      {tab === 'gstr1' ? (
        <>
          <SectionTable title="B2B — Registered customers" data={b2b} />
          <SectionTable title="B2C — Unregistered" data={b2c} />
        </>
      ) : (
        <Card className="p-5">
          <h4 className="mb-3 text-sm font-bold text-slate-800">
            3.1 Outward taxable supplies (other than zero-rated, nil, exempted)
          </h4>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-2 text-slate-600">Total taxable value</td>
                <td className="py-2 text-right tnum font-semibold">{currency(totals.taxable)}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 text-slate-600">Central Tax (CGST)</td>
                <td className="py-2 text-right tnum">{currency(totals.cgst)}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 text-slate-600">State/UT Tax (SGST)</td>
                <td className="py-2 text-right tnum">{currency(totals.sgst)}</td>
              </tr>
              <tr>
                <td className="py-2 font-semibold text-slate-800">Total tax liability</td>
                <td className="py-2 text-right tnum font-bold">{currency(totals.tax)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-2xs text-slate-400">
            ITC and inward-supply sections are auto-populated in real filings from GSTR-2B; wire a
            GSP integration to fetch them.
          </p>
        </Card>
      )}
    </div>
  )
}
