import { useMemo, useState } from 'react'
import { Download, History } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { Card } from '@/components/ui/primitives'
import { Badge } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/Toast'
import { fmtDate, qty } from '@/lib/format'
import { downloadXlsx } from '@/lib/xlsx'
import { useMaterialName } from '@/features/shared/lookups'
import { useLedger, useMaterials } from '../hooks/useInventory'
import type { InventoryLedgerRow } from '@/types'

const TYPE_TONE: Record<string, string> = { Receipt: 'green', Issue: 'amber', Adjustment: 'blue' }

function txnLabel(r: InventoryLedgerRow): string {
  if (r.txnType === 'Issue') {
    if (r.referenceType === 'DELIVERY_CHALLAN' || r.referenceType === 'INVOICE') return 'Dispatch'
    if (r.referenceType === 'JOB_ORDER') return 'Consumption'
  }
  return r.txnType
}

export function StockHistoryPage() {
  const { data: materials = [] } = useMaterials()
  const [materialId, setMaterialId] = useState('')
  const { data: ledger = [], isLoading } = useLedger(materialId ? { materialId } : {})
  const materialName = useMaterialName()
  const toast = useToast()

  // Oldest → newest with a running balance; then present newest first.
  const withBalance = useMemo(() => {
    if (!materialId) return []
    const asc = [...ledger].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    let bal = 0
    const out = asc.map((r) => {
      bal += (r.qtyIn || 0) - (r.qtyOut || 0)
      return { ...r, balance: bal }
    })
    return out.reverse()
  }, [ledger, materialId])

  const totals = useMemo(() => {
    let receipts = 0
    let issues = 0
    let adjPlus = 0
    let adjMinus = 0
    for (const r of ledger) {
      if (r.txnType === 'Receipt') receipts += r.qtyIn
      else if (r.txnType === 'Issue') issues += r.qtyOut
      else {
        adjPlus += r.qtyIn
        adjMinus += r.qtyOut
      }
    }
    const closing = receipts + adjPlus - issues - adjMinus
    return { receipts, issues, adjPlus, adjMinus, closing }
  }, [ledger])

  function exportRows() {
    if (withBalance.length === 0) return toast.info('Nothing to export')
    downloadXlsx(
      `stock-history-${materialName(materialId)}`,
      [...withBalance].reverse(),
      [
        { header: 'Date', value: (r) => fmtDate(r.date), width: 14 },
        { header: 'Txn No', value: (r) => r.docNo, width: 16 },
        { header: 'Type', value: (r) => txnLabel(r), width: 14 },
        { header: 'In', value: (r) => r.qtyIn || '', width: 10 },
        { header: 'Out', value: (r) => r.qtyOut || '', width: 10 },
        { header: 'Balance', value: (r) => r.balance, width: 12 },
        { header: 'Note', value: (r) => r.note ?? '', width: 28 },
      ],
      'Stock History',
    )
  }

  const cards = [
    { label: 'Opening', value: 0, cls: 'text-slate-700', chip: 'border-slate-200 bg-slate-50' },
    {
      label: 'Receipts + Adj In',
      value: totals.receipts + totals.adjPlus,
      cls: 'text-blue-700',
      chip: 'border-blue-200 bg-blue-50',
    },
    {
      label: 'Issues + Adj Out',
      value: totals.issues + totals.adjMinus,
      cls: 'text-red-700',
      chip: 'border-red-200 bg-red-50',
    },
    {
      label: 'Closing Stock',
      value: totals.closing,
      cls: totals.closing > 0 ? 'text-emerald-700' : 'text-red-700',
      chip: totals.closing > 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50',
    },
  ]

  return (
    <div>
      <PageHeader
        title="Stock History"
        subtitle="Material-level inventory ledger: Opening + Receipts + Adjustments − Issues − Dispatch = Closing"
        actions={
          materialId ? (
            <button className="btn-ghost btn-sm" onClick={exportRows}>
              <Download size={15} /> Export Excel
            </button>
          ) : undefined
        }
      />

      <Card className="mb-3 p-3">
        <div className="max-w-md">
          <label className="label">Material</label>
          <select
            className="input"
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
          >
            <option value="">Select a material to view its ledger…</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code ? `${m.code} · ` : ''}
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {!materialId ? (
        <Card className="p-10 text-center">
          <History size={40} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm text-slate-500">
            Choose a material to see its complete stock ledger.
          </p>
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className={`rounded-xl border px-4 py-3 ${c.chip}`}>
                <p className="text-2xs font-semibold uppercase tracking-wide text-slate-500">
                  {c.label}
                </p>
                <p className={`tnum mt-0.5 text-xl font-bold ${c.cls}`}>{qty(c.value)}</p>
              </div>
            ))}
          </div>

          <Card>
            {isLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
            ) : withBalance.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No transactions for this material.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-2xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2.5">Date</th>
                      <th className="px-3 py-2.5">Txn No.</th>
                      <th className="px-3 py-2.5">Type</th>
                      <th className="px-3 py-2.5 text-right">In</th>
                      <th className="px-3 py-2.5 text-right">Out</th>
                      <th className="px-3 py-2.5 text-right">Balance</th>
                      <th className="px-3 py-2.5">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {withBalance.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2 text-slate-600">{fmtDate(r.date)}</td>
                        <td className="px-3 py-2 font-mono text-2xs text-slate-500">{r.docNo}</td>
                        <td className="px-3 py-2">
                          <Badge tone={TYPE_TONE[r.txnType] ?? 'slate'}>{txnLabel(r)}</Badge>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-600">
                          {r.qtyIn ? qty(r.qtyIn) : ''}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-red-500">
                          {r.qtyOut ? qty(r.qtyOut) : ''}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900">
                          {qty(r.balance)}
                        </td>
                        <td className="px-3 py-2 text-2xs text-slate-500">{r.note ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
