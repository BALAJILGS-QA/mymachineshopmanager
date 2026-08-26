import { useMemo, useState, type ReactNode } from 'react'
import { clsx } from 'clsx'
import {
  Boxes,
  Building2,
  History,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sliders,
  Trash2,
  Warehouse,
} from 'lucide-react'
import type { Material } from '@/types'
import {
  useMaterials,
  useReceipts,
  useIssues,
  useAdjustments,
  useOwnPurchases,
  useLedger,
  useDeleteMaterial,
} from './hooks/useMaterials'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useCompanyName, useMaterialName } from '@/features/shared/lookups'
import { materialStock, SHOP_SCOPE, type StockDb } from '@/data/computations'
import { toUserMessage } from '@/lib/api/errors'
import { currency, fmtDate, qty } from '@/lib/format'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { Badge, Card, EmptyState } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import {
  AddCustomerMaterialForm,
  AddOwnMaterialForm,
  AdjustmentForm,
  MaterialForm,
} from './MaterialForms'

type View = 'customer' | 'own'
type Dialog = 'customer' | 'own' | 'adjust' | 'materials' | null

function stockStatus(balance: number, reorder?: number): { label: string; tone: string } {
  if (balance <= 0) return { label: 'Out of Stock', tone: 'red' }
  if (reorder != null && balance <= reorder) return { label: 'Low Stock', tone: 'amber' }
  return { label: 'In Stock', tone: 'green' }
}

// Assemble the collections the stock derivations read, from Supabase queries.
function useStockData() {
  const { data: materials = [] } = useMaterials()
  const { data: receipts = [] } = useReceipts()
  const { data: issues = [] } = useIssues()
  const { data: adjustments = [] } = useAdjustments()
  const db: StockDb = { materials, receipts, issues, adjustments }
  return { materials, receipts, issues, adjustments, db }
}

export function MaterialsPage() {
  const [view, setView] = useState<View>('customer')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [historyFor, setHistoryFor] = useState<{ materialId: string; scope?: string } | null>(null)
  const [fCompany, setFCompany] = useState('')
  const [fMaterial, setFMaterial] = useState('')
  const [search, setSearch] = useState('')

  const { materials, receipts, issues, adjustments, db } = useStockData()
  const { data: companies = [] } = useCompanies()
  const { data: ownPurchases = [] } = useOwnPurchases()
  const companyName = useCompanyName()
  const stamp = receipts.length + issues.length + adjustments.length

  // Customer stock: one row per (company, material) that has any movement.
  const customerRows = useMemo(() => {
    const keys = new Set<string>()
    for (const r of receipts) if (r.companyId) keys.add(`${r.companyId}|${r.materialId}`)
    for (const i of issues) if (i.companyId) keys.add(`${i.companyId}|${i.materialId}`)
    for (const a of adjustments) if (a.companyId) keys.add(`${a.companyId}|${a.materialId}`)
    return [...keys]
      .map((k) => {
        const [companyId, materialId] = k.split('|')
        const m = materials.find((x) => x.id === materialId)
        const s = materialStock(db, materialId, companyId)
        return { companyId, materialId, material: m, s }
      })
      .filter((r) => r.material)
      .sort((a, b) => (a.material!.name < b.material!.name ? -1 : 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials, stamp])

  const customerFiltered = useMemo(() => {
    const s = search.toLowerCase()
    return customerRows.filter((r) => {
      if (fCompany && r.companyId !== fCompany) return false
      if (fMaterial && r.materialId !== fMaterial) return false
      if (s && !`${r.material!.name} ${companyName(r.companyId)}`.toLowerCase().includes(s))
        return false
      return true
    })
  }, [customerRows, fCompany, fMaterial, search, companyName])

  // Own stock: one row per material (shop scope).
  const ownRows = useMemo(() => {
    return materials
      .map((m) => {
        const s = materialStock(db, m.id, SHOP_SCOPE)
        const buys = ownPurchases.filter((p) => p.materialId === m.id)
        const cost = buys.reduce((sum, p) => sum + p.totalCost, 0)
        const gst = buys.reduce((sum, p) => sum + p.totalGst, 0)
        const last = buys.sort((a, b) => (a.purchaseDate < b.purchaseDate ? 1 : -1))[0]
        return { material: m, s, cost, gst, last }
      })
      .filter((r) => r.s.received !== 0 || r.s.balance !== 0 || r.cost > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials, ownPurchases, stamp])

  const ownFiltered = useMemo(() => {
    const s = search.toLowerCase()
    return ownRows.filter((r) => {
      if (fMaterial && r.material.id !== fMaterial) return false
      if (s && !r.material.name.toLowerCase().includes(s)) return false
      return true
    })
  }, [ownRows, fMaterial, search])

  const custPg = usePagination(customerFiltered)
  const ownPg = usePagination(ownFiltered)

  // Summary metrics.
  const lowCount =
    customerRows.filter((r) => stockStatus(r.s.balance, r.material!.reorderLevel).tone !== 'green')
      .length +
    ownRows.filter((r) => stockStatus(r.s.balance, r.material.reorderLevel).tone !== 'green').length

  return (
    <div>
      <PageHeader
        title="Materials & Stock"
        subtitle="Manage customer materials, own materials, stock movements and inventory history"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-ghost btn-sm" onClick={() => setDialog('materials')}>
              <Settings2 size={15} /> Materials
            </button>
            <button className="btn-ghost btn-sm" onClick={() => setDialog('adjust')}>
              <Sliders size={15} /> Adjust
            </button>
            <button className="btn-secondary" onClick={() => setDialog('own')}>
              <Plus size={16} /> Add Own Material
            </button>
            <button className="btn-primary" onClick={() => setDialog('customer')}>
              <Plus size={16} /> Add Customer Material
            </button>
          </div>
        }
      />

      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          icon={<Building2 size={18} />}
          label="Customer stock lines"
          value={customerRows.length}
        />
        <SummaryCard
          icon={<Warehouse size={18} />}
          label="Own materials in stock"
          value={ownRows.length}
        />
        <SummaryCard
          icon={<Boxes size={18} />}
          label="Materials (master)"
          value={materials.length}
        />
        <SummaryCard
          icon={<Sliders size={18} />}
          label="Low / out of stock"
          value={lowCount}
          tone={lowCount > 0 ? 'amber' : undefined}
        />
      </div>

      {/* View toggle */}
      <div className="mb-3 inline-flex rounded-lg bg-slate-200/60 p-1">
        {(
          [
            { k: 'customer', label: 'Customer Stock' },
            { k: 'own', label: 'Own Stock' },
          ] as const
        ).map((t) => (
          <button
            key={t.k}
            onClick={() => setView(t.k)}
            className={clsx(
              'rounded-md px-4 py-1.5 text-sm font-medium transition',
              view === t.k
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="relative min-w-[12rem] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-9"
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
        {(fCompany || fMaterial || search) && (
          <button
            className="btn-ghost btn-sm mb-0.5"
            onClick={() => {
              setFCompany('')
              setFMaterial('')
              setSearch('')
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
              description="Use “Add Customer Material” to receive customer-supplied material into stock."
            />
          ) : (
            <ResponsiveTable>
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="th">Company</th>
                  <th className="th">Material</th>
                  <th className="th text-right">Received</th>
                  <th className="th text-right">Issued</th>
                  <th className="th text-right">Current</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {custPg.pageItems.map((r) => {
                  const st = stockStatus(r.s.balance, r.material!.reorderLevel)
                  return (
                    <tr key={`${r.companyId}|${r.materialId}`} className="hover:bg-slate-50/60">
                      <td className="td font-medium text-slate-800">{companyName(r.companyId)}</td>
                      <td className="td">
                        {r.material!.name}
                        <span className="ml-1 text-2xs text-slate-500">{r.material!.unit}</span>
                      </td>
                      <td className="td text-right">{qty(r.s.received)}</td>
                      <td className="td text-right">{qty(r.s.issued)}</td>
                      <td className="td text-right font-semibold">{qty(r.s.balance)}</td>
                      <td className="td">
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                      <td className="td text-right">
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() =>
                            setHistoryFor({ materialId: r.materialId, scope: r.companyId })
                          }
                        >
                          <History size={14} /> History
                        </button>
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
              description="Use “Add Own Material” to record a purchase — it adds stock and an expense."
            />
          ) : (
            <ResponsiveTable>
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="th">Material</th>
                  <th className="th text-right">Purchased</th>
                  <th className="th text-right">Used</th>
                  <th className="th text-right">Current</th>
                  <th className="th text-right">Cost</th>
                  <th className="th text-right">GST</th>
                  <th className="th">Last Purchase</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {ownPg.pageItems.map((r) => {
                  const st = stockStatus(r.s.balance, r.material.reorderLevel)
                  return (
                    <tr key={r.material.id} className="hover:bg-slate-50/60">
                      <td className="td">
                        <div className="font-semibold text-slate-800">{r.material.name}</div>
                        <div className="text-2xs text-slate-500">
                          {r.material.code} · {r.material.unit}
                        </div>
                      </td>
                      <td className="td text-right">{qty(r.s.received)}</td>
                      <td className="td text-right">{qty(r.s.issued)}</td>
                      <td className="td text-right font-semibold">{qty(r.s.balance)}</td>
                      <td className="td text-right">{currency(r.cost)}</td>
                      <td className="td text-right text-slate-500">{currency(r.gst)}</td>
                      <td className="td text-2xs text-slate-500">
                        {r.last
                          ? `${fmtDate(r.last.purchaseDate)} · ${r.last.supplier ?? '—'}`
                          : '—'}
                      </td>
                      <td className="td">
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                      <td className="td text-right">
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() =>
                            setHistoryFor({ materialId: r.material.id, scope: SHOP_SCOPE })
                          }
                        >
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

      {dialog === 'customer' && <AddCustomerMaterialForm onClose={() => setDialog(null)} />}
      {dialog === 'own' && <AddOwnMaterialForm onClose={() => setDialog(null)} />}
      {dialog === 'adjust' && <AdjustmentForm onClose={() => setDialog(null)} />}
      {dialog === 'materials' && <MaterialsManager onClose={() => setDialog(null)} />}
      {historyFor && (
        <HistoryModal
          materialId={historyFor.materialId}
          scope={historyFor.scope}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode
  label: string
  value: number
  tone?: string
}) {
  return (
    <Card className="flex items-center gap-3 p-3">
      <div
        className={clsx(
          'flex h-9 w-9 items-center justify-center rounded-lg',
          tone === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-brand-100 text-brand-700',
        )}
      >
        {icon}
      </div>
      <div>
        <div className="text-lg font-bold leading-none text-slate-900">{value}</div>
        <div className="text-2xs text-slate-500">{label}</div>
      </div>
    </Card>
  )
}

// Per-material transaction history (unified ledger), scoped to own or a customer.
function HistoryModal({
  materialId,
  scope,
  onClose,
}: {
  materialId: string
  scope?: string
  onClose: () => void
}) {
  const materialName = useMaterialName()
  const companyName = useCompanyName()
  const { data: rows = [], isLoading } = useLedger({ materialId, scope })
  // Running balance oldest -> newest.
  const withBalance = useMemo(() => {
    const asc = [...rows].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    let bal = 0
    const out = asc.map((r) => {
      bal += r.qtyIn - r.qtyOut
      return { ...r, balance: bal }
    })
    return out.reverse()
  }, [rows])

  const scopeLabel = !scope ? 'All' : scope === SHOP_SCOPE ? 'Own (shop)' : companyName(scope)

  return (
    <Modal open onClose={onClose} size="lg" title={`${materialName(materialId)} — ${scopeLabel}`}>
      {isLoading ? (
        <div className="p-8 text-center text-sm text-slate-500">Loading history…</div>
      ) : withBalance.length === 0 ? (
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
                        r.txnType === 'Receipt' ? 'green' : r.txnType === 'Issue' ? 'blue' : 'amber'
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
