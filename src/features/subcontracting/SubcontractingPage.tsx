import { useMemo, useState } from 'react'
import { ArrowLeftRight, Factory, History, Plus, Send, Trash2, Truck } from 'lucide-react'
import type { MaterialOwnerType, PaymentMethod, SubcontractOrder } from '@/types'
import {
  useSubcontracts,
  useSubcontractDocs,
  useCreateSubcontract,
  useDeleteSubcontract,
  useDispatchSubcontract,
  useReceiveSubcontract,
} from './hooks/useSubcontracts'
import { useVendors } from '@/features/vendors/hooks/useVendors'
import { useMaterials } from '@/features/materials/hooks/useMaterials'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useCompanyName, useMaterialName } from '@/features/shared/lookups'
import { toUserMessage } from '@/lib/api/errors'
import { currency, fmtDate, qty } from '@/lib/format'
import { PAYMENT_METHODS as METHODS } from '@/constants/domain'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { TableSkeleton } from '@/components/common/Skeleton'
import { StatTile } from '@/components/common/StatTile'
import { Badge, Card, EmptyState, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { DateInput } from '@/components/ui/DateInput'
import { Modal } from '@/components/ui/Modal'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { SearchBox } from '@/components/common/Filters'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

const atVendor = (o: SubcontractOrder) => o.sentQty - o.receivedQty - o.rejectedQty
const statusTone = (s: SubcontractOrder['status']) =>
  s === 'Received' ? 'green' : s === 'Partially Received' ? 'amber' : s === 'Sent' ? 'blue' : 'gray'

export function SubcontractingPage() {
  const { data: orders = [], isLoading } = useSubcontracts()
  const { data: vendors = [] } = useVendors()
  const companyName = useCompanyName()
  const materialName = useMaterialName()
  const deleteOrder = useDeleteSubcontract()
  const toast = useToast()
  const confirm = useConfirm()

  const [creating, setCreating] = useState(false)
  const [dispatchFor, setDispatchFor] = useState<SubcontractOrder | null>(null)
  const [receiveFor, setReceiveFor] = useState<SubcontractOrder | null>(null)
  const [historyFor, setHistoryFor] = useState<SubcontractOrder | null>(null)
  const [search, setSearch] = useState('')

  const vendorName = useMemo(() => {
    const m = new Map(vendors.map((v) => [v.id, v.name]))
    return (id: string) => m.get(id) ?? '—'
  }, [vendors])

  const rows = useMemo(() => {
    const s = search.toLowerCase()
    return orders
      .filter((o) =>
        s
          ? `${o.scNo} ${vendorName(o.vendorId)} ${materialName(o.materialId)}`
              .toLowerCase()
              .includes(s)
          : true,
      )
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [orders, search, vendorName, materialName])

  const pg = usePagination(rows)

  const totals = useMemo(() => {
    let out = 0
    let open = 0
    for (const o of orders) {
      out += atVendor(o)
      if (o.status !== 'Received') open++
    }
    return { atVendor: out, open }
  }, [orders])

  async function onDelete(o: SubcontractOrder) {
    if (o.sentQty > 0) {
      toast.error('This order has dispatched stock — it cannot be deleted.')
      return
    }
    const ok = await confirm({
      title: 'Delete subcontract',
      message: `Delete ${o.scNo}?`,
      danger: true,
    })
    if (!ok) return
    try {
      await deleteOrder.mutateAsync(o.id)
      toast.success('Subcontract deleted')
    } catch (e) {
      toast.error(toUserMessage(e, 'Delete failed'))
    }
  }

  return (
    <div>
      <PageHeader
        title="Subcontracting"
        subtitle="Send material to a vendor for job work and track it back to stock"
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> New Subcontract
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile
          icon={<Factory size={18} />}
          label="Subcontracts"
          value={orders.length}
          tone="brand"
        />
        <StatTile
          icon={<Truck size={18} />}
          label="Open / in progress"
          value={totals.open}
          tone="amber"
        />
        <StatTile
          icon={<ArrowLeftRight size={18} />}
          label="Qty at vendors"
          value={qty(totals.atVendor)}
        />
      </div>

      <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search SC no, vendor, material…"
        />
      </div>

      <Card>
        {isLoading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Factory size={40} />}
            title="No subcontracts"
            description="Create a subcontract: pick a material (customer or own), a vendor and the job work."
          />
        ) : (
          <ResponsiveTable className="min-w-[60rem]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">SC No</th>
                <th className="th">Vendor</th>
                <th className="th">Material</th>
                <th className="th">Owner</th>
                <th className="th text-right">Sent</th>
                <th className="th text-right">At Vendor</th>
                <th className="th text-right">Received</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pg.pageItems.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/60">
                  <td className="td font-mono text-xs font-semibold text-slate-700">{o.scNo}</td>
                  <td className="td font-medium text-slate-800">{vendorName(o.vendorId)}</td>
                  <td className="td">{materialName(o.materialId)}</td>
                  <td className="td text-2xs text-slate-500">
                    {o.ownerType === 'Shop' ? 'Own' : companyName(o.companyId ?? '')}
                  </td>
                  <td className="td text-right">{qty(o.sentQty)}</td>
                  <td className="td text-right font-semibold text-brand-700">{qty(atVendor(o))}</td>
                  <td className="td text-right">{qty(o.receivedQty)}</td>
                  <td className="td">
                    <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <button
                        className="btn-ghost btn-sm text-brand-600"
                        title="Dispatch to vendor"
                        onClick={() => setDispatchFor(o)}
                      >
                        <Send size={15} />
                      </button>
                      <button
                        className="btn-ghost btn-sm text-emerald-600"
                        title="Receive from vendor"
                        disabled={o.sentQty <= 0}
                        onClick={() => setReceiveFor(o)}
                      >
                        <Truck size={15} />
                      </button>
                      <button
                        className="btn-ghost btn-sm"
                        title="History"
                        onClick={() => setHistoryFor(o)}
                      >
                        <History size={15} />
                      </button>
                      <button
                        className="btn-ghost btn-sm text-red-500"
                        title="Delete"
                        onClick={() => onDelete(o)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        )}
        <Pagination pg={pg} />
      </Card>

      {creating && <NewSubcontractForm onClose={() => setCreating(false)} />}
      {dispatchFor && <DispatchForm order={dispatchFor} onClose={() => setDispatchFor(null)} />}
      {receiveFor && <ReceiveForm order={receiveFor} onClose={() => setReceiveFor(null)} />}
      {historyFor && <HistoryModal order={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  )
}

function NewSubcontractForm({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const createOrder = useCreateSubcontract()
  const { data: allVendors = [] } = useVendors()
  const vendors = allVendors.filter((v) => v.active)
  const { data: allCompanies = [] } = useCompanies()
  const companies = allCompanies.filter((c) => c.active)
  const { data: allMaterials = [] } = useMaterials()

  const [ownerType, setOwnerType] = useState<MaterialOwnerType>('Shop')
  const [companyId, setCompanyId] = useState('')
  const [materialId, setMaterialId] = useState('')
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? '')
  const [date, setDate] = useState('')
  const [process, setProcess] = useState('')
  const [notes, setNotes] = useState('')

  // Materials in scope: own → shared/own; customer → that company + shared.
  const materials = allMaterials.filter((m) => {
    if (!m.active) return false
    return ownerType === 'Shop' ? !m.companyId : !m.companyId || m.companyId === companyId
  })
  const material = materials.find((m) => m.id === materialId)

  async function submit() {
    if (ownerType === 'Company' && !companyId) return toast.error('Select the customer')
    if (!materialId) return toast.error('Select a material')
    if (!vendorId) return toast.error('Select a vendor')
    try {
      await createOrder.mutateAsync({
        date,
        vendorId,
        materialId,
        ownerType,
        companyId: ownerType === 'Company' ? companyId : undefined,
        unit: material?.unit ?? 'Nos',
        process: process.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      toast.success('Subcontract created — dispatch material to the vendor next')
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Save failed'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New Subcontract"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={createOrder.isPending}>
            {createOrder.isPending ? 'Saving…' : 'Create subcontract'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Material Type" required>
          <Select
            value={ownerType}
            onChange={(e) => {
              setOwnerType(e.target.value as MaterialOwnerType)
              setMaterialId('')
            }}
          >
            <option value="Shop">Own material</option>
            <option value="Company">Customer material</option>
          </Select>
        </Field>
        {ownerType === 'Company' ? (
          <Field label="Customer" required>
            <Select
              value={companyId}
              onChange={(e) => {
                setCompanyId(e.target.value)
                setMaterialId('')
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
        ) : (
          <Field label="Date" required>
            <DateInput value={date} onChange={setDate} />
          </Field>
        )}
        <Field label="Material" required>
          <Select value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
            <option value="">Select material…</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.unit})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Vendor / Subcontractor" required>
          <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            <option value="">Select vendor…</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </Field>
        {ownerType === 'Company' && (
          <Field label="Date" required>
            <DateInput value={date} onChange={setDate} />
          </Field>
        )}
        <Field label="Job Work / Process" className="sm:col-span-2">
          <Input
            value={process}
            placeholder="e.g. Heat treatment, grinding, plating…"
            onChange={(e) => setProcess(e.target.value)}
          />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function DispatchForm({ order, onClose }: { order: SubcontractOrder; onClose: () => void }) {
  const toast = useToast()
  const dispatch = useDispatchSubcontract()
  const materialName = useMaterialName()
  const [date, setDate] = useState('')
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')

  async function submit() {
    const q = Number(quantity)
    if (!(q > 0)) return toast.error('Enter a quantity greater than zero')
    try {
      await dispatch.mutateAsync({
        id: order.id,
        input: { date, quantity: q, notes: notes || undefined },
      })
      toast.success('Material dispatched to vendor — stock reduced')
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Dispatch failed'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Dispatch to vendor — ${order.scNo}`}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={dispatch.isPending}>
            {dispatch.isPending ? 'Saving…' : 'Dispatch & reduce stock'}
          </button>
        </>
      }
    >
      <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
        Sends <b>{materialName(order.materialId)}</b> on our delivery challan. Stock is reduced now
        and comes back when the vendor returns the processed material.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Date" required>
          <DateInput value={date} onChange={setDate} />
        </Field>
        <Field label={`Quantity (${order.unit})`} required>
          <Input
            type="number"
            step="0.001"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function ReceiveForm({ order, onClose }: { order: SubcontractOrder; onClose: () => void }) {
  const toast = useToast()
  const receive = useReceiveSubcontract()
  const outstanding = atVendor(order)
  const [date, setDate] = useState('')
  const [docKind, setDocKind] = useState<'DC' | 'INVOICE'>('DC')
  const [vendorRef, setVendorRef] = useState('')
  const [quantity, setQuantity] = useState(String(outstanding > 0 ? outstanding : ''))
  const [rejected, setRejected] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('Cash')
  const [notes, setNotes] = useState('')

  async function submit() {
    const q = Number(quantity)
    if (!(q > 0)) return toast.error('Enter the good quantity returned')
    try {
      await receive.mutateAsync({
        id: order.id,
        input: {
          date,
          docKind,
          vendorRef: vendorRef.trim() || undefined,
          quantity: q,
          rejected: Number(rejected) || 0,
          amount: docKind === 'INVOICE' ? Number(amount) || 0 : undefined,
          method,
          notes: notes.trim() || undefined,
        },
      })
      toast.success(
        docKind === 'INVOICE'
          ? 'Return recorded — stock added back and job-work expense logged'
          : 'Return recorded — stock added back',
      )
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Save failed'))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Receive from vendor — ${order.scNo}`}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={receive.isPending}>
            {receive.isPending ? 'Saving…' : 'Record return'}
          </button>
        </>
      }
    >
      <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
        Currently at vendor:{' '}
        <b>
          {qty(outstanding)} {order.unit}
        </b>
        . Record the vendor's return challan or job-work invoice against our dispatch.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Document" required>
          <Select value={docKind} onChange={(e) => setDocKind(e.target.value as 'DC' | 'INVOICE')}>
            <option value="DC">Vendor delivery challan</option>
            <option value="INVOICE">Vendor job-work invoice</option>
          </Select>
        </Field>
        <Field label="Vendor Doc No.">
          <Input value={vendorRef} onChange={(e) => setVendorRef(e.target.value)} />
        </Field>
        <Field label="Date" required>
          <DateInput value={date} onChange={setDate} />
        </Field>
        <Field label={`Good Qty (${order.unit})`} required>
          <Input
            type="number"
            step="0.001"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        <Field label={`Rejected / Scrap (${order.unit})`}>
          <Input
            type="number"
            step="0.001"
            min={0}
            value={rejected}
            onChange={(e) => setRejected(e.target.value)}
          />
        </Field>
        {docKind === 'INVOICE' && (
          <>
            <Field label="Job-work Amount (₹)" required>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Payment Method">
              <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
          </>
        )}
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function HistoryModal({ order, onClose }: { order: SubcontractOrder; onClose: () => void }) {
  const { data: docs = [], isLoading } = useSubcontractDocs(order.id)
  return (
    <Modal open onClose={onClose} size="lg" title={`${order.scNo} — movement history`}>
      {isLoading ? (
        <div className="p-8 text-center text-sm text-slate-500">Loading…</div>
      ) : docs.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          No movements yet. Dispatch material to the vendor to start.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-2xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Direction</th>
                <th className="px-2 py-2">Doc</th>
                <th className="px-2 py-2">Vendor Ref</th>
                <th className="px-2 py-2 text-right">Qty</th>
                <th className="px-2 py-2 text-right">Rejected</th>
                <th className="px-2 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {docs.map((d) => (
                <tr key={d.id}>
                  <td className="px-2 py-1.5 text-slate-600">{fmtDate(d.date)}</td>
                  <td className="px-2 py-1.5">
                    <Badge tone={d.direction === 'OUT' ? 'blue' : 'green'}>
                      {d.direction === 'OUT' ? 'Sent' : `Received (${d.docKind})`}
                    </Badge>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-2xs text-slate-500">{d.docNo}</td>
                  <td className="px-2 py-1.5 text-2xs text-slate-500">{d.vendorRef ?? '—'}</td>
                  <td className="px-2 py-1.5 text-right">{qty(d.quantity)}</td>
                  <td className="px-2 py-1.5 text-right text-red-500">
                    {d.rejected ? qty(d.rejected) : ''}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {d.amount != null ? currency(d.amount) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
