import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import {
  Boxes,
  Building2,
  Download,
  Eye,
  History,
  Pencil,
  Plus,
  Search,
  Send,
  Settings2,
  Sliders,
  Trash2,
  Warehouse,
} from 'lucide-react'
import type { Material, MaterialReceipt, MaterialReceiptStock } from '@/types'
import {
  useMaterials,
  useReceipts,
  useAdjustments,
  useOwnPurchases,
  useSourceStock,
  useDeleteMaterial,
  useRemoveReceipt,
} from './hooks/useMaterials'
import { useChallans } from '@/features/deliveries/hooks/useDeliveries'
import { useInvoices } from '@/features/invoices/hooks/useInvoices'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useCompanyName, useMaterialName } from '@/features/shared/lookups'
import { roundMoney } from '@/data/computations'
import { toUserMessage } from '@/lib/api/errors'
import { currency, fmtDate, inRange, qty } from '@/lib/format'
import { downloadXlsx } from '@/lib/xlsx'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { Badge, Card, EmptyState } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { DateRangeFilter } from '@/components/common/Filters'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { AddMaterialForm, AdjustmentForm, MaterialForm } from './MaterialForms'

type View = 'customer' | 'own'
type Dialog = 'add' | 'adjust' | 'materials' | null

// One received stock (source) with its per-source dispatch position, joined to
// the material master and the underlying receipt (for edit/delete actions).
interface SourceRow {
  rs: MaterialReceiptStock
  material?: Material
  receipt?: MaterialReceipt
}

// Master + receipt collections the per-source grid derives from.
function useStockData() {
  const { data: materials = [] } = useMaterials()
  const { data: receipts = [] } = useReceipts()
  return { materials, receipts }
}

export function MaterialsPage() {
  const [view, setView] = useState<View>('customer')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [historyFor, setHistoryFor] = useState<MaterialReceiptStock | null>(null)
  const [editReceipt, setEditReceipt] = useState<MaterialReceipt | null>(null)
  const [fCompany, setFCompany] = useState('')
  const [fMaterial, setFMaterial] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const toast = useToast()
  const confirm = useConfirm()
  const removeReceipt = useRemoveReceipt()
  const { materials, receipts } = useStockData()
  // Per-source stock — the source of truth for Received / DC / Invoice / Available.
  // Derived client-side so it renders with or without the DB view (migration 0015).
  const receiptStockRows = useSourceStock()
  const { data: companies = [] } = useCompanies()
  const { data: ownPurchases = [] } = useOwnPurchases()
  const companyName = useCompanyName()

  const materialById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials])
  const receiptById = useMemo(() => new Map(receipts.map((r) => [r.id, r])), [receipts])

  // Customer stock: one row per received stock (source), each tracked + reduced
  // independently — MC-ESVA-001 and MC-ESVA-002 never merge.
  const customerRows = useMemo<SourceRow[]>(() => {
    return receiptStockRows
      .filter((r) => r.ownership === 'Company')
      .map((rs) => ({
        rs,
        material: materialById.get(rs.materialId),
        receipt: receiptById.get(rs.receiptId),
      }))
      .sort((a, b) => (a.rs.date < b.rs.date ? 1 : -1))
  }, [receiptStockRows, materialById, receiptById])

  const customerFiltered = useMemo(() => {
    const s = search.toLowerCase()
    return customerRows.filter(({ rs, material }) => {
      if (fCompany && rs.companyId !== fCompany) return false
      if (fMaterial && rs.materialId !== fMaterial) return false
      if (!inRange(rs.date, from, to)) return false
      if (s) {
        const hay =
          `${material?.name ?? ''} ${companyName(rs.companyId ?? '')} ${rs.supplier ?? ''} ${rs.sourceDocNo ?? ''}`.toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [customerRows, fCompany, fMaterial, from, to, search, companyName])

  // Own stock: one row per purchase receipt (source), with its landed cost.
  const ownRows = useMemo(() => {
    return receiptStockRows
      .filter((r) => r.ownership === 'Shop')
      .map((rs) => {
        const purchase = ownPurchases.find((p) => p.receiptId === rs.receiptId)
        return {
          rs,
          material: materialById.get(rs.materialId),
          receipt: receiptById.get(rs.receiptId),
          cost: purchase?.totalCost ?? 0,
          gst: purchase?.totalGst ?? 0,
          supplier: purchase?.supplier ?? rs.supplier,
        }
      })
      .sort((a, b) => (a.rs.date < b.rs.date ? 1 : -1))
  }, [receiptStockRows, ownPurchases, materialById, receiptById])

  const ownFiltered = useMemo(() => {
    const s = search.toLowerCase()
    return ownRows.filter(({ rs, material }) => {
      if (fMaterial && rs.materialId !== fMaterial) return false
      if (!inRange(rs.date, from, to)) return false
      if (s && !(material?.name ?? '').toLowerCase().includes(s)) return false
      return true
    })
  }, [ownRows, fMaterial, from, to, search])

  const custPg = usePagination(customerFiltered)
  const ownPg = usePagination(ownFiltered)

  // Headline totals for the active view + filters: total on-hand stock vs total
  // dispatched (Nos). Reflects the company / material / date-range / search
  // filters because it sums the already-filtered rows.
  const totals = useMemo(() => {
    const rows = view === 'customer' ? customerFiltered : ownFiltered
    let stock = 0
    let dispatched = 0
    for (const { rs } of rows) {
      stock += rs.available
      dispatched += rs.totalDispatched
    }
    return { stock: roundMoney(stock), dispatched: roundMoney(dispatched) }
  }, [view, customerFiltered, ownFiltered])

  async function onDeleteReceipt(rc: MaterialReceipt) {
    const ok = await confirm({
      title: 'Delete intake',
      message: `Delete receipt ${rc.receiptNo}? Stock balances will be recalculated.`,
      danger: true,
    })
    if (!ok) return
    try {
      await removeReceipt.mutateAsync(rc.id)
      toast.success('Intake deleted')
    } catch (e) {
      toast.error(toUserMessage(e, 'Delete failed'))
    }
  }

  // Download the current view as an Excel (.xlsx) stock report.
  function exportReport() {
    if (view === 'customer') {
      if (customerFiltered.length === 0) return toast.info('Nothing to export')
      downloadXlsx(
        'materials-stock-report',
        customerFiltered,
        [
          { header: 'Company', value: ({ rs }) => companyName(rs.companyId ?? ''), width: 24 },
          { header: 'Material', value: ({ material }) => material?.name ?? '—', width: 24 },
          { header: 'Material From', value: ({ rs }) => rs.supplier || '—', width: 20 },
          { header: 'Source Doc No', value: ({ rs }) => rs.sourceDocNo || rs.receiptNo, width: 20 },
          { header: 'From Date', value: ({ rs }) => fmtDate(rs.date), width: 14 },
          { header: 'Received', value: ({ rs }) => rs.received, width: 12 },
          { header: 'Unit', value: ({ rs }) => rs.unit, width: 10 },
          { header: 'DC Qty', value: ({ rs }) => rs.dcQty, width: 12 },
          { header: 'Invoice Qty', value: ({ rs }) => rs.invoiceQty, width: 12 },
          { header: 'Total Dispatched', value: ({ rs }) => rs.totalDispatched, width: 16 },
          { header: 'Available', value: ({ rs }) => rs.available, width: 12 },
          { header: 'Status', value: ({ rs }) => rs.status, width: 16 },
        ],
        'Customer Stock',
      )
    } else {
      if (ownFiltered.length === 0) return toast.info('Nothing to export')
      downloadXlsx(
        'materials-own-stock-report',
        ownFiltered,
        [
          { header: 'Material', value: ({ material }) => material?.name ?? '—', width: 24 },
          { header: 'Source Doc No', value: ({ rs }) => rs.sourceDocNo || rs.receiptNo, width: 20 },
          { header: 'Date', value: ({ rs }) => fmtDate(rs.date), width: 14 },
          { header: 'Unit', value: ({ rs }) => rs.unit, width: 10 },
          { header: 'Purchased', value: ({ rs }) => rs.received, width: 12 },
          { header: 'DC Qty', value: ({ rs }) => rs.dcQty, width: 12 },
          { header: 'Invoice Qty', value: ({ rs }) => rs.invoiceQty, width: 12 },
          { header: 'Total Dispatched', value: ({ rs }) => rs.totalDispatched, width: 16 },
          { header: 'Available', value: ({ rs }) => rs.available, width: 12 },
          { header: 'Cost', value: (r) => r.cost, width: 14 },
          { header: 'GST', value: (r) => r.gst, width: 14 },
          { header: 'Supplier', value: (r) => r.supplier ?? '—', width: 20 },
          { header: 'Status', value: ({ rs }) => rs.status, width: 16 },
        ],
        'Own Stock',
      )
    }
  }

  return (
    <div>
      <PageHeader
        title="Materials & Stock"
        subtitle="Manage customer materials, own materials, stock movements and stock history"
        actions={
          <>
            <button className="btn-ghost btn-sm" onClick={exportReport}>
              <Download size={15} /> Export Excel
            </button>
            <button className="btn-ghost btn-sm" onClick={() => setDialog('materials')}>
              <Settings2 size={15} /> Materials
            </button>
            <button className="btn-ghost btn-sm" onClick={() => setDialog('adjust')}>
              <Sliders size={15} /> Adjust
            </button>
            <button className="btn-primary" onClick={() => setDialog('add')}>
              <Plus size={16} /> Add Material
            </button>
          </>
        }
      />

      {/* Summary — total on-hand stock vs total dispatched for the current
          view + company + date-range filters (updates dynamically). */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatTile
          icon={<Boxes size={18} />}
          label={`Total material stock${view === 'customer' && fCompany ? ` — ${companyName(fCompany)}` : ''}`}
          value={`${qty(totals.stock)} Nos`}
        />
        <StatTile
          icon={<Send size={18} />}
          label="Total materials dispatched"
          value={`${qty(totals.dispatched)} Nos`}
          tone="blue"
        />
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <label className="label">Stock Type</label>
          <select
            className="input min-w-[11rem]"
            aria-label="Stock type"
            name="stockType"
            value={view}
            onChange={(e) => setView(e.target.value as View)}
          >
            <option value="customer">Customer Stock</option>
            <option value="own">Own Stock</option>
          </select>
        </div>
        <div className="relative min-w-[12rem] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-9"
            aria-label="Search material or company"
            name="materialSearch"
            placeholder="Search material or company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {view === 'customer' && (
          <div>
            <label className="label">Company</label>
            <select
              className="input min-w-[11rem]"
              aria-label="Company"
              name="materialCompanyFilter"
              value={fCompany}
              onChange={(e) => setFCompany(e.target.value)}
            >
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label">Material</label>
          <select
            className="input min-w-[12rem]"
            aria-label="Material"
            name="materialFilter"
            value={fMaterial}
            onChange={(e) => setFMaterial(e.target.value)}
          >
            <option value="">All materials</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
        {(fCompany || fMaterial || search || from || to) && (
          <button
            className="btn-ghost btn-sm mb-0.5"
            onClick={() => {
              setFCompany('')
              setFMaterial('')
              setSearch('')
              setFrom('')
              setTo('')
            }}
          >
            Clear
          </button>
        )}
      </div>

      {view === 'customer' ? (
        <Card>
          {customerFiltered.length === 0 ? (
            <EmptyState
              icon={<Building2 size={40} />}
              title="No customer stock"
              description="Use “Add Material” (Customer material) to receive customer-supplied material into stock."
            />
          ) : (
            <ResponsiveTable className="min-w-[80rem]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="th">Company</th>
                  <th className="th">Item</th>
                  <th className="th">Challan/Inv No</th>
                  <th className="th">From Date</th>
                  <th className="th text-right">Received</th>
                  <th className="th text-right">DC Qty</th>
                  <th className="th text-right">Invoice Qty</th>
                  <th className="th text-right">Total Dispatched</th>
                  <th className="th text-right">Available</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {custPg.pageItems.map(({ rs, material, receipt }) => {
                  const fullyOut = rs.available <= 0
                  return (
                    <tr key={rs.receiptId} className="hover:bg-slate-50/60">
                      <td className="td font-medium text-slate-800">
                        {companyName(rs.companyId ?? '')}
                      </td>
                      <td className="td">{material?.name ?? rs.materialId}</td>
                      <td className="td">
                        <div className="font-mono text-2xs text-slate-600">
                          {rs.sourceDocNo || rs.receiptNo}
                        </div>
                        {rs.supplier && (
                          <div className="text-2xs text-slate-400">{rs.supplier}</div>
                        )}
                      </td>
                      <td className="td text-slate-600">{fmtDate(rs.date)}</td>
                      <td className="td text-right">
                        {qty(rs.received)}
                        <span className="ml-1 text-2xs text-slate-500">{rs.unit}</span>
                      </td>
                      <td className="td text-right text-slate-600">{qty(rs.dcQty)}</td>
                      <td className="td text-right text-slate-600">{qty(rs.invoiceQty)}</td>
                      <td className="td text-right text-slate-600">{qty(rs.totalDispatched)}</td>
                      <td className="td text-right">
                        <span
                          className={clsx(
                            'font-semibold',
                            fullyOut ? 'text-red-600' : 'text-slate-900',
                          )}
                        >
                          {qty(rs.available)}
                        </span>
                        <span className="ml-1 text-2xs text-slate-500">{rs.unit}</span>
                      </td>
                      <td className="td">
                        <Badge tone={fullyOut ? 'red' : 'green'}>{rs.status}</Badge>
                      </td>
                      <td className="td">
                        <div className="flex justify-end gap-1">
                          <button
                            className="btn-ghost btn-sm"
                            title="View source history"
                            onClick={() => setHistoryFor(rs)}
                          >
                            <Eye size={15} />
                          </button>
                          {receipt && (
                            <>
                              <button
                                className="btn-ghost btn-sm"
                                title="Edit intake"
                                onClick={() => setEditReceipt(receipt)}
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                className="btn-ghost btn-sm text-red-500"
                                title="Delete intake"
                                onClick={() => onDeleteReceipt(receipt)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </ResponsiveTable>
          )}
          <Pagination pg={custPg} />
        </Card>
      ) : (
        <Card>
          {ownFiltered.length === 0 ? (
            <EmptyState
              icon={<Warehouse size={40} />}
              title="No own stock"
              description="Use “Add Material” (Own material) to record a purchase — it adds stock and an expense."
            />
          ) : (
            <ResponsiveTable className="min-w-[72rem]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="th">Item</th>
                  <th className="th">Challan/Inv No</th>
                  <th className="th text-right">Purchased</th>
                  <th className="th text-right">DC Qty</th>
                  <th className="th text-right">Invoice Qty</th>
                  <th className="th text-right">Total Dispatched</th>
                  <th className="th text-right">Available</th>
                  <th className="th text-right">Cost</th>
                  <th className="th text-right">GST</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {ownPg.pageItems.map(({ rs, material, cost, gst, supplier }) => {
                  const fullyOut = rs.available <= 0
                  return (
                    <tr key={rs.receiptId} className="hover:bg-slate-50/60">
                      <td className="td">
                        <div className="font-semibold text-slate-800">
                          {material?.name ?? rs.materialId}
                        </div>
                        <div className="text-2xs text-slate-500">
                          {material?.code} · {rs.unit}
                        </div>
                      </td>
                      <td className="td">
                        <div className="font-mono text-2xs text-slate-600">
                          {rs.sourceDocNo || rs.receiptNo}
                        </div>
                        <div className="text-2xs text-slate-400">
                          {fmtDate(rs.date)}
                          {supplier ? ` · ${supplier}` : ''}
                        </div>
                      </td>
                      <td className="td text-right">{qty(rs.received)}</td>
                      <td className="td text-right text-slate-600">{qty(rs.dcQty)}</td>
                      <td className="td text-right text-slate-600">{qty(rs.invoiceQty)}</td>
                      <td className="td text-right text-slate-600">{qty(rs.totalDispatched)}</td>
                      <td className="td text-right">
                        <span
                          className={clsx(
                            'font-semibold',
                            fullyOut ? 'text-red-600' : 'text-slate-900',
                          )}
                        >
                          {qty(rs.available)}
                        </span>
                        <span className="ml-1 text-2xs text-slate-500">{rs.unit}</span>
                      </td>
                      <td className="td text-right">{currency(cost)}</td>
                      <td className="td text-right text-slate-500">{currency(gst)}</td>
                      <td className="td">
                        <Badge tone={fullyOut ? 'red' : 'green'}>{rs.status}</Badge>
                      </td>
                      <td className="td text-right">
                        <button className="btn-ghost btn-sm" onClick={() => setHistoryFor(rs)}>
                          <History size={14} /> History
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </ResponsiveTable>
          )}
          <Pagination pg={ownPg} />
        </Card>
      )}

      {dialog === 'add' && <AddMaterialForm onClose={() => setDialog(null)} />}
      {editReceipt && (
        <AddMaterialForm receipt={editReceipt} onClose={() => setEditReceipt(null)} />
      )}
      {dialog === 'adjust' && <AdjustmentForm onClose={() => setDialog(null)} />}
      {dialog === 'materials' && <MaterialsManager onClose={() => setDialog(null)} />}
      {historyFor && <SourceHistoryModal row={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  )
}

// History of ONE received stock (source): the intake, then every delivery
// challan / invoice that consumed THIS specific source, plus any adjustment
// booked against it — with a running balance. Derived from the documents' own
// source tags (challan.lines / invoice.lines), so it is accurate per source.
interface SourceMovement {
  id: string
  date: string
  txnType: 'Receipt' | 'Delivery Challan' | 'Invoice' | 'Adjustment'
  docNo: string
  qtyIn: number
  qtyOut: number
  note?: string
}

function SourceHistoryModal({ row, onClose }: { row: MaterialReceiptStock; onClose: () => void }) {
  const materialName = useMaterialName()
  const companyName = useCompanyName()
  const { data: challans = [] } = useChallans()
  const { data: invoices = [] } = useInvoices()
  const { data: adjustments = [] } = useAdjustments()

  const withBalance = useMemo(() => {
    const moves: SourceMovement[] = []
    // The intake itself.
    moves.push({
      id: `rcpt_${row.receiptId}`,
      date: row.date,
      txnType: 'Receipt',
      docNo: row.sourceDocNo || row.receiptNo,
      qtyIn: row.received,
      qtyOut: 0,
      note: row.supplier ? `Received from ${row.supplier}` : 'Received into stock',
    })
    // Delivery challans that dispatched this source (skip cancelled).
    for (const c of challans) {
      if (c.status === 'Cancelled') continue
      for (const l of c.lines) {
        if (l.sourceReceiptId === row.receiptId && l.quantity > 0)
          moves.push({
            id: `dc_${c.id}_${l.id}`,
            date: c.date,
            txnType: 'Delivery Challan',
            docNo: c.dcNo,
            qtyIn: 0,
            qtyOut: l.quantity,
            note: `Dispatched via challan ${c.dcNo}`,
          })
      }
    }
    // Invoices that billed this source directly (skip cancelled).
    for (const iv of invoices) {
      if (iv.status === 'Cancelled') continue
      for (const l of iv.lines) {
        if (l.sourceReceiptId === row.receiptId && l.quantity > 0)
          moves.push({
            id: `inv_${iv.id}_${l.id}`,
            date: iv.date,
            txnType: 'Invoice',
            docNo: iv.invoiceNo,
            qtyIn: 0,
            qtyOut: l.quantity,
            note: `Billed via invoice ${iv.invoiceNo}`,
          })
      }
    }
    // Adjustments booked against this source (e.g. dispatch reversals).
    for (const a of adjustments) {
      if (a.sourceReceiptId === row.receiptId)
        moves.push({
          id: `adj_${a.id}`,
          date: a.date,
          txnType: 'Adjustment',
          docNo: a.adjNo,
          qtyIn: a.quantity > 0 ? a.quantity : 0,
          qtyOut: a.quantity < 0 ? -a.quantity : 0,
          note: a.reason,
        })
    }
    // Oldest → newest for the running balance, then show newest first.
    const asc = moves.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
    let bal = 0
    const out = asc.map((r) => {
      bal += r.qtyIn - r.qtyOut
      return { ...r, balance: bal }
    })
    return out.reverse()
  }, [row, challans, invoices, adjustments])

  const scopeLabel = row.ownership === 'Shop' ? 'Own (shop)' : companyName(row.companyId ?? '')
  const source = row.sourceDocNo || row.receiptNo

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${materialName(row.materialId)} — ${source} · ${scopeLabel}`}
    >
      <div className="mb-3 flex flex-wrap gap-4 rounded-lg bg-slate-50 px-3 py-2 text-2xs text-slate-600">
        <span>
          Received <b className="tnum text-slate-900">{qty(row.received)}</b> {row.unit}
        </span>
        <span>
          Dispatched <b className="tnum text-slate-900">{qty(row.totalDispatched)}</b> {row.unit}
        </span>
        <span>
          Available <b className="tnum text-slate-900">{qty(row.available)}</b> {row.unit}
        </span>
      </div>
      {withBalance.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">No transactions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-2xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Transaction</th>
                <th className="px-2 py-2">Doc</th>
                <th className="px-2 py-2 text-right">In</th>
                <th className="px-2 py-2 text-right">Out</th>
                <th className="px-2 py-2 text-right">Balance</th>
                <th className="px-2 py-2">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {withBalance.map((r) => (
                <tr key={r.id}>
                  <td className="px-2 py-1.5 text-slate-600">{fmtDate(r.date)}</td>
                  <td className="px-2 py-1.5">
                    <Badge
                      tone={
                        r.txnType === 'Receipt'
                          ? 'green'
                          : r.txnType === 'Adjustment'
                            ? 'amber'
                            : 'blue'
                      }
                    >
                      {r.txnType}
                    </Badge>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-2xs text-slate-500">{r.docNo}</td>
                  <td className="px-2 py-1.5 text-right text-emerald-600">
                    {r.qtyIn ? qty(r.qtyIn) : ''}
                  </td>
                  <td className="px-2 py-1.5 text-right text-red-500">
                    {r.qtyOut ? qty(r.qtyOut) : ''}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold">{qty(r.balance)}</td>
                  <td className="px-2 py-1.5 text-2xs text-slate-500">{r.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

// Material master management: list + add/edit/deactivate, scoped by company.
function MaterialsManager({ onClose }: { onClose: () => void }) {
  const { data: allMaterials = [] } = useMaterials()
  const { data: companies = [] } = useCompanies()
  const companyName = useCompanyName()
  const deleteMaterial = useDeleteMaterial()
  const toast = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Material | null | undefined>(undefined)
  const [fCompany, setFCompany] = useState('')
  const materials = allMaterials.filter((m) =>
    !fCompany ? true : fCompany === 'shared' ? !m.companyId : m.companyId === fCompany,
  )

  async function onDelete(m: Material) {
    const ok = await confirm({
      title: 'Delete material',
      message: `Delete "${m.name}"?`,
      danger: true,
    })
    if (!ok) return
    try {
      await deleteMaterial.mutateAsync(m.id)
      toast.success('Material deleted')
    } catch (e) {
      toast.error(toUserMessage(e, 'Delete failed'))
    }
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title="Materials"
        footer={
          <>
            <button className="btn-secondary" onClick={onClose}>
              Close
            </button>
            <button className="btn-primary" onClick={() => setEditing(null)}>
              <Plus size={16} /> Add Material
            </button>
          </>
        }
      >
        <div className="mb-3">
          <label className="label">Belongs to</label>
          <select
            className="input max-w-xs"
            aria-label="Belongs to"
            name="materialBelongsTo"
            value={fCompany}
            onChange={(e) => setFCompany(e.target.value)}
          >
            <option value="">All materials</option>
            <option value="shared">Shared / Own</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {materials.length === 0 ? (
          <EmptyState
            icon={<Boxes size={40} />}
            title="No materials"
            description="Add a material — pick a customer under “Belongs to”, or leave it shared/own."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-2xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Belongs to</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2">Reorder</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {materials.map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{m.code}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-800">{m.name}</td>
                    <td className="px-3 py-1.5 text-slate-600">
                      {m.companyId ? companyName(m.companyId) : 'Shared / Own'}
                    </td>
                    <td className="px-3 py-1.5">{m.unit}</td>
                    <td className="px-3 py-1.5 text-slate-500">{m.reorderLevel ?? '—'}</td>
                    <td className="px-3 py-1.5">
                      {m.active ? (
                        <Badge tone="green">Active</Badge>
                      ) : (
                        <Badge tone="gray">Inactive</Badge>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost btn-sm" onClick={() => setEditing(m)}>
                          <Pencil size={15} />
                        </button>
                        <button
                          className="btn-ghost btn-sm text-red-500"
                          onClick={() => onDelete(m)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
      {editing !== undefined && (
        <MaterialForm material={editing} onClose={() => setEditing(undefined)} />
      )}
    </>
  )
}
