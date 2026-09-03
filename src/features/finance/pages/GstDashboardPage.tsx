import { useMemo, useState } from 'react'
import { Download, FileText, IndianRupee, Percent, Receipt } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Card, Field, Input } from '@/components/ui/primitives'
import { StatTile } from '@/components/common/StatTile'
import { useToast } from '@/components/ui/Toast'
import { toUserMessage } from '@/lib/api/errors'
import { downloadXlsx, type XlsxColumn } from '@/lib/xlsx'
import { currency, fmtDate, thisMonthPrefix } from '@/lib/format'
import { computeInvoice } from '@/data/computations'
import { useInvoices } from '@/features/invoices/hooks/useInvoices'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useGstReturns } from '../hooks/useFinance'
import { useFinanceAccess } from '../access'

interface GstRow {
  id: string
  invoiceNo: string
  date: string
  customer: string
  gstin: string
  taxable: number
  cgst: number
  sgst: number
  total: number
}

export function GstDashboardPage() {
  const invoices = useInvoices().data ?? []
  const companies = useCompanies().data ?? []
  const returns = useGstReturns()
  const perms = useFinanceAccess()
  const canManage = perms.can('GST_MANAGE')
  const toast = useToast()
  const [period, setPeriod] = useState(thisMonthPrefix()) // 'YYYY-MM'

  const company = (id: string) => companies.find((c) => c.id === id)

  const rows: GstRow[] = useMemo(() => {
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
        return {
          id: inv.id,
          invoiceNo: inv.invoiceNo,
          date: inv.date,
          customer: company(inv.companyId)?.name ?? '—',
          gstin: company(inv.companyId)?.gstin ?? '',
          taxable: Math.round(taxable * 100) / 100,
          cgst: Math.round(((taxable * cgstPct) / 100) * 100) / 100,
          sgst: Math.round(((taxable * sgstPct) / 100) * 100) / 100,
          total: c.total,
        }
      })
  }, [invoices, companies, period])

  const totals = useMemo(
    () => ({
      count: rows.length,
      taxable: rows.reduce((s, r) => s + r.taxable, 0),
      cgst: rows.reduce((s, r) => s + r.cgst, 0),
      sgst: rows.reduce((s, r) => s + r.sgst, 0),
      total: rows.reduce((s, r) => s + r.total, 0),
    }),
    [rows],
  )

  const columns: DataTableColumn<GstRow>[] = [
    {
      key: 'no',
      header: 'Invoice',
      cellClassName: 'font-mono text-xs',
      render: (r) => r.invoiceNo,
    },
    { key: 'date', header: 'Date', cellClassName: 'tnum text-xs', render: (r) => fmtDate(r.date) },
    { key: 'cust', header: 'Customer', cellClassName: 'font-semibold', render: (r) => r.customer },
    {
      key: 'gstin',
      header: 'GSTIN',
      cellClassName: 'font-mono text-2xs',
      render: (r) => r.gstin || 'B2C',
    },
    {
      key: 'taxable',
      header: 'Taxable',
      cellClassName: 'tnum text-right',
      headerClassName: 'text-right',
      render: (r) => currency(r.taxable),
    },
    {
      key: 'cgst',
      header: 'CGST',
      cellClassName: 'tnum text-right',
      headerClassName: 'text-right',
      render: (r) => currency(r.cgst),
    },
    {
      key: 'sgst',
      header: 'SGST',
      cellClassName: 'tnum text-right',
      headerClassName: 'text-right',
      render: (r) => currency(r.sgst),
    },
    {
      key: 'total',
      header: 'Total',
      cellClassName: 'tnum text-right font-semibold',
      headerClassName: 'text-right',
      render: (r) => currency(r.total),
    },
  ]

  function exportRows(kind: string) {
    const cols: XlsxColumn<GstRow>[] = [
      { header: 'Invoice', value: (r) => r.invoiceNo },
      { header: 'Date', value: (r) => r.date },
      { header: 'Customer', value: (r) => r.customer },
      { header: 'GSTIN', value: (r) => r.gstin },
      { header: 'Taxable', value: (r) => r.taxable },
      { header: 'CGST', value: (r) => r.cgst },
      { header: 'SGST', value: (r) => r.sgst },
      { header: 'Invoice Value', value: (r) => r.total },
    ]
    downloadXlsx(`${kind}-${period}`, rows, cols, kind)
  }

  async function prepare(returnType: 'GSTR1' | 'GSTR3B') {
    try {
      await returns.create.mutateAsync({
        period,
        returnType,
        status: 'prepared',
        summary: {
          count: totals.count,
          taxable: totals.taxable,
          cgst: totals.cgst,
          sgst: totals.sgst,
          total: totals.total,
        },
      })
      toast.success(`${returnType} prepared for ${period}`)
    } catch (e) {
      toast.error(toUserMessage(e, 'Could not prepare return'))
    }
  }

  return (
    <div>
      <PageHeader
        title="GST Dashboard"
        subtitle="Outward supply summary + GSTR-1 / GSTR-3B preparation (preparation and export — not portal filing)"
        actions={
          <button className="btn-secondary btn-sm" onClick={() => exportRows('GSTR1')}>
            <Download size={16} /> Export
          </button>
        }
      />

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Period (month)" className="w-44">
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </Field>
          {canManage && (
            <>
              <button className="btn-secondary btn-sm" onClick={() => prepare('GSTR1')}>
                Prepare GSTR-1
              </button>
              <button className="btn-secondary btn-sm" onClick={() => prepare('GSTR3B')}>
                Prepare GSTR-3B
              </button>
            </>
          )}
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile icon={<Receipt size={20} />} label="Invoices" value={totals.count} tone="blue" />
        <StatTile
          icon={<IndianRupee size={20} />}
          label="Taxable Value"
          value={currency(totals.taxable)}
          tone="violet"
        />
        <StatTile
          icon={<Percent size={20} />}
          label="CGST"
          value={currency(totals.cgst)}
          tone="green"
        />
        <StatTile
          icon={<Percent size={20} />}
          label="SGST"
          value={currency(totals.sgst)}
          tone="green"
        />
        <StatTile
          icon={<IndianRupee size={20} />}
          label="Total Output Tax"
          value={currency(totals.cgst + totals.sgst)}
          tone="orange"
        />
      </div>

      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          minWidthClassName="min-w-[60rem]"
          empty={{
            icon: <FileText size={40} />,
            title: 'No outward supplies',
            description: 'No posted invoices in this period.',
          }}
        />
        {rows.length > 0 && (
          <div className="flex flex-wrap justify-end gap-6 border-t border-slate-200 px-4 py-2 text-sm font-semibold">
            <span className="tnum">Taxable {currency(totals.taxable)}</span>
            <span className="tnum">CGST {currency(totals.cgst)}</span>
            <span className="tnum">SGST {currency(totals.sgst)}</span>
            <span className="tnum">Total {currency(totals.total)}</span>
          </div>
        )}
      </Card>
    </div>
  )
}
