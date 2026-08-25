import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { Ban, FileDown, FileText, Layers, Pencil, Plus, Printer, RotateCcw, Trash2, Truck } from 'lucide-react'
import type { DeliveryChallan, DcLine, InvoiceLine } from '@/types'
import { dcRepo, previewNextNo, BusinessRuleError } from '@/data/repo'
import { downloadChallanPdf } from './challanPdf'
import { useDb } from '@/data/store'
import { fmtDate, todayISO } from '@/lib/format'
import { uid } from '@/lib/id'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { Badge, Card, EmptyState, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { CompanyFilter, FilterBar, SearchBox } from '@/components/common/Filters'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useCompanyName } from '@/features/shared/lookups'
import { InvoiceForm } from '@/features/invoices/InvoiceForm'

const STATUS_TONE: Record<string, string> = { Open: 'amber', Invoiced: 'green', Cancelled: 'red' }

export function DeliveriesPage() {
  const challans = useDb((db) => db.deliveryChallans)
  const invoices = useDb((db) => db.invoices)
  const companyName = useCompanyName()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()

  // A challan marked "Invoiced" whose invoice is gone or cancelled is stranded:
  // its dispatch was never actually billed, so let the user reopen it.
  const isStranded = (d: DeliveryChallan) => {
    if (d.status !== 'Invoiced') return false
    const inv = d.invoiceId ? invoices.find((i) => i.id === d.invoiceId) : undefined
    return !inv || inv.status === 'Cancelled'
  }

  const [editing, setEditing] = useState<DeliveryChallan | null | undefined>(undefined)
  // Challans queued for invoicing — one row, or several combined into one invoice.
  const [invoiceFor, setInvoiceFor] = useState<DeliveryChallan[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [company, setCompany] = useState('')

  // The live invoice a challan was billed on (undefined if none / cancelled).
  const linkedInvoice = (d: DeliveryChallan) =>
    d.status === 'Invoiced' && d.invoiceId
      ? invoices.find((i) => i.id === d.invoiceId && i.status !== 'Cancelled')
      : undefined

  const rows = useMemo(() => {
    const s = search.toLowerCase()
    return challans
      .filter((d) => {
        if (company && d.companyId !== company) return false
        if (s && !`${d.dcNo} ${d.reference ?? ''}`.toLowerCase().includes(s)) return false
        return true
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [challans, company, search])

  const pg = usePagination(rows)

  // Multi-select: only Open challans can be batched onto one invoice.
  const selectedDcs = useMemo(
    () => challans.filter((d) => selected.has(d.id) && d.status === 'Open'),
    [challans, selected],
  )
  const openOnPage = pg.pageItems.filter((d) => d.status === 'Open')
  const allOpenSelected = openOnPage.length > 0 && openOnPage.every((d) => selected.has(d.id))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allOpenSelected) openOnPage.forEach((d) => next.delete(d.id))
      else openOnPage.forEach((d) => next.add(d.id))
      return next
    })
  }

  // A single invoice is per-company, so refuse a batch that mixes companies.
  function startInvoice(dcs: DeliveryChallan[]) {
    if (!dcs.length) return
    if (new Set(dcs.map((d) => d.companyId)).size > 1) {
      toast.error('Select challans from a single company to combine them into one invoice')
      return
    }
    setInvoiceFor(dcs)
  }

  async function onDelete(d: DeliveryChallan) {
    const ok = await confirm({
      title: 'Delete challan',
      message: `Delete ${d.dcNo}?`,
      danger: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      dcRepo.remove(d.id)
      toast.success('Challan deleted')
    } catch (e) {
      toast.error(e instanceof BusinessRuleError ? e.message : 'Delete failed')
    }
  }

  async function onCancel(d: DeliveryChallan) {
    const ok = await confirm({ title: 'Cancel challan', message: `Cancel ${d.dcNo}?`, danger: true, confirmLabel: 'Cancel challan' })
    if (!ok) return
    dcRepo.setStatus(d.id, 'Cancelled')
    toast.success('Challan cancelled')
  }

  async function onReopen(d: DeliveryChallan) {
    const ok = await confirm({
      title: 'Reopen challan',
      message: `${d.dcNo}'s invoice was cancelled. Reopen it so it can be re-invoiced or removed?`,
      confirmLabel: 'Reopen',
    })
    if (!ok) return
    try {
      dcRepo.reopen(d.id)
      toast.success('Challan reopened')
    } catch (e) {
      toast.error(e instanceof BusinessRuleError ? e.message : 'Reopen failed')
    }
  }

  return (
    <div>
      <PageHeader
        title="Delivery Challans"
        subtitle={`${challans.length} total`}
        actions={
          <div className="flex items-center gap-2">
            {selectedDcs.length > 0 && (
              <button className="btn-secondary" onClick={() => startInvoice(selectedDcs)}>
                <Layers size={16} /> Invoice {selectedDcs.length} selected
              </button>
            )}
            <button className="btn-primary" onClick={() => setEditing(null)}>
              <Plus size={16} /> New Challan
            </button>
          </div>
        }
      />

      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search challan or ref…" />
        <CompanyFilter value={company} onChange={setCompany} />
      </FilterBar>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Truck size={40} />}
            title="No delivery challans"
            description="Create a challan for dispatched goods, then raise an invoice against it."
          />
        ) : (
          <ResponsiveTable>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th w-8">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-600"
                    checked={allOpenSelected}
                    onChange={toggleAllOnPage}
                    disabled={openOnPage.length === 0}
                    aria-label="Select all open challans on this page"
                  />
                </th>
                <th className="th">DC No</th>
                <th className="th">Date</th>
                <th className="th">Company</th>
                <th className="th">Reference</th>
                <th className="th text-right">Items</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pg.pageItems.map((d) => {
                const inv = linkedInvoice(d)
                const billed = Boolean(inv)
                return (
                <tr
                  key={d.id}
                  className={clsx(
                    'hover:bg-slate-50/60',
                    // Billed challans are locked: greyed out with the invoice shown.
                    billed && 'bg-slate-50 [&>td]:text-slate-400',
                    selected.has(d.id) && 'bg-brand-50/60',
                  )}
                >
                  <td className="td w-8">
                    {d.status === 'Open' && (
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-600"
                        checked={selected.has(d.id)}
                        onChange={() => toggle(d.id)}
                        aria-label={`Select ${d.dcNo}`}
                      />
                    )}
                  </td>
                  <td className="td font-mono text-xs font-semibold text-slate-700">{d.dcNo}</td>
                  <td className="td">{fmtDate(d.date)}</td>
                  <td className="td">{companyName(d.companyId)}</td>
                  <td className="td">{d.reference || '—'}</td>
                  <td className="td text-right">{d.lines.length}</td>
                  <td className="td">
                    {billed ? (
                      <div className="flex flex-col gap-0.5">
                        <Badge tone="gray">Invoiced</Badge>
                        <Link
                          to={`/app/invoices/${inv!.id}/print`}
                          className="font-mono text-2xs font-semibold text-brand-700 hover:underline"
                          title="View invoice for this challan"
                        >
                          {inv!.invoiceNo}
                        </Link>
                      </div>
                    ) : (
                      <Badge tone={STATUS_TONE[d.status]}>{d.status}</Badge>
                    )}
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <button
                        className="btn-ghost btn-sm"
                        title="View / Print"
                        onClick={() => navigate(`/app/deliveries/${d.id}/print`)}
                      >
                        <Printer size={15} />
                      </button>
                      <button
                        className="btn-ghost btn-sm"
                        title="Download PDF"
                        onClick={() => downloadChallanPdf(d.id)}
                      >
                        <FileDown size={15} />
                      </button>
                      {d.status === 'Open' && (
                        <button
                          className="btn-ghost btn-sm text-brand-600"
                          title="Create invoice"
                          onClick={() => startInvoice([d])}
                        >
                          <FileText size={15} />
                        </button>
                      )}
                      {isStranded(d) && (
                        <button
                          className="btn-ghost btn-sm text-brand-600"
                          title="Reopen (invoice cancelled)"
                          onClick={() => onReopen(d)}
                        >
                          <RotateCcw size={15} />
                        </button>
                      )}
                      {d.status !== 'Invoiced' && (
                        <button className="btn-ghost btn-sm" title="Edit" onClick={() => setEditing(d)}>
                          <Pencil size={15} />
                        </button>
                      )}
                      {d.status === 'Open' && (
                        <button className="btn-ghost btn-sm text-amber-600" title="Cancel" onClick={() => onCancel(d)}>
                          <Ban size={15} />
                        </button>
                      )}
                      {d.status !== 'Invoiced' && (
                        <button className="btn-ghost btn-sm text-red-500" title="Delete" onClick={() => onDelete(d)}>
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </ResponsiveTable>
        )}
        <Pagination pg={pg} />
      </Card>

      {editing !== undefined && <DcForm dc={editing} onClose={() => setEditing(undefined)} />}

      {invoiceFor && invoiceFor.length > 0 && (
        <InvoiceForm
          invoice={null}
          prefill={{
            companyId: invoiceFor[0].companyId,
            // Every source challan number is carried onto the invoice's DC reference.
            dcReference: invoiceFor.map((d) => d.dcNo).join(', '),
            // Combine all challan lines; when batching, tag each line with its DC
            // so the invoice stays traceable back to the dispatch it came from.
            lines: invoiceFor.flatMap((d) =>
              d.lines.map<InvoiceLine>((l) => ({
                id: uid('l_'),
                jobId: l.jobId,
                description:
                  invoiceFor.length > 1 ? `${l.description} — ${d.dcNo}` : l.description,
                quantity: l.quantity,
                rate: 0,
              })),
            ),
          }}
          onCreated={(invoiceId) => {
            invoiceFor.forEach((d) => dcRepo.setStatus(d.id, 'Invoiced', invoiceId))
            toast.success(
              invoiceFor.length > 1
                ? `Invoice raised against ${invoiceFor.length} challans`
                : `Invoice raised against ${invoiceFor[0].dcNo}`,
            )
            setSelected(new Set())
          }}
          onClose={() => setInvoiceFor(null)}
        />
      )}
    </div>
  )
}

function DcForm({ dc, onClose }: { dc: DeliveryChallan | null; onClose: () => void }) {
  const toast = useToast()
  const companies = useDb((db) => db.companies.filter((c) => c.active || c.id === dc?.companyId))
  const jobs = useDb((db) => db.jobs)
  const products = useDb((db) => db.products.filter((p) => p.active))
  const settings = useDb((db) => db.settings)
  const units = settings.units

  const [companyId, setCompanyId] = useState(dc?.companyId ?? companies[0]?.id ?? '')
  const [date, setDate] = useState(dc?.date ?? todayISO())
  const [jobId, setJobId] = useState(dc?.jobId ?? '')
  const [reference, setReference] = useState(dc?.reference ?? '')
  const [vehicleNo, setVehicleNo] = useState(dc?.vehicleNo ?? '')
  const [notes, setNotes] = useState(dc?.notes ?? '')
  const [lines, setLines] = useState<DcLine[]>(
    dc?.lines ?? [{ id: uid('dl_'), description: '', quantity: 1, unit: units[0] ?? 'Nos' }],
  )

  function updateLine(id: string, patch: Partial<DcLine>) {
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }
  function addLine() {
    setLines((ls) => [...ls, { id: uid('dl_'), description: '', quantity: 1, unit: units[0] ?? 'Nos' }])
  }
  function removeLine(id: string) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls))
  }
  function addProductLine(productId: string) {
    const p = products.find((x) => x.id === productId)
    if (!p) return
    setLines((ls) => [
      ...ls.filter((l) => l.description),
      { id: uid('dl_'), description: p.name, quantity: 1, unit: p.unit || units[0] || 'Nos' },
    ])
  }

  function submit() {
    try {
      const payload = {
        date,
        companyId,
        jobId: jobId || undefined,
        reference: reference || undefined,
        vehicleNo: vehicleNo || undefined,
        lines: lines
          .filter((l) => l.description.trim())
          .map((l) => ({ ...l, quantity: Number(l.quantity) })),
        notes: notes || undefined,
        status: dc?.status ?? ('Open' as const),
      }
      if (dc) {
        dcRepo.update(dc.id, payload)
        toast.success('Challan updated')
      } else {
        dcRepo.create(payload)
        toast.success('Challan created')
      }
      onClose()
    } catch (e) {
      toast.error(e instanceof BusinessRuleError ? e.message : 'Save failed')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={dc ? `Edit ${dc.dcNo}` : 'New Delivery Challan'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit}>
            {dc ? 'Save changes' : 'Create challan'}
          </button>
        </>
      }
    >
      {!dc && (
        <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
          Challan number will be <b>{previewNextNo('dc', settings.numbering.dc)}</b>
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Company" required>
          <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">Select…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Job (optional)">
          <Select value={jobId} onChange={(e) => setJobId(e.target.value)}>
            <option value="">—</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.jobNo} — {j.partName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reference / PO">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Vehicle No.">
          <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} />
        </Field>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="label mb-0">Items</label>
          <div className="flex items-center gap-2">
            {products.length > 0 && (
              <Select
                value=""
                onChange={(e) => {
                  if (e.target.value) addProductLine(e.target.value)
                  e.target.value = ''
                }}
                className="h-8 py-1 text-xs"
                aria-label="Add from rate list"
              >
                <option value="">+ Add from rate list…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
            <button className="btn-ghost btn-sm text-brand-600" onClick={addLine}>
              <Plus size={14} /> Add item
            </button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[30rem]">
            <thead>
              <tr className="bg-slate-50">
                <th className="th">Description</th>
                <th className="th w-28 text-right">Qty</th>
                <th className="th w-28">Unit</th>
                <th className="th w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-2 py-1.5">
                    <input
                      className="input"
                      placeholder="Item"
                      value={l.description}
                      onChange={(e) => updateLine(l.id, { description: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      step="0.001"
                      className="input text-right"
                      value={l.quantity}
                      onChange={(e) => updateLine(l.id, { quantity: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      className="input"
                      value={l.unit}
                      onChange={(e) => updateLine(l.id, { unit: e.target.value })}
                    >
                      {units.map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button className="btn-ghost btn-sm text-red-500" onClick={() => removeLine(l.id)}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Field label="Notes" className="mt-3">
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Modal>
  )
}
