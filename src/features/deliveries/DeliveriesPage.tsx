import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { clsx } from 'clsx'
import {
  Ban,
  FileCheck2,
  FileClock,
  FileDown,
  FileText,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Trash2,
  Truck,
} from 'lucide-react'
import type { DeliveryChallan, DcLine, InvoiceLine } from '@/types'
import { downloadChallanPdf } from './challanPdf'
import {
  useChallans,
  useCreateChallan,
  useUpdateChallan,
  useDeleteChallan,
  useSetChallanStatus,
  useReopenChallan,
  useCancelChallan,
} from './hooks/useDeliveries'
import { useInvoices } from '@/features/invoices/hooks/useInvoices'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useJobs } from '@/features/jobs/hooks/useJobs'
import { useMaterials } from '@/features/materials/hooks/useMaterials'
import { usePreviewNo } from '@/features/shared/usePreviewNo'
import { toUserMessage } from '@/lib/api/errors'
import {
  fmtDate,
  inRange,
  monthEndISO,
  monthStartISO,
  qty,
  thisMonthLabel,
  thisMonthPrefix,
  todayISO,
} from '@/lib/format'
import { uid } from '@/lib/id'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { Badge, Card, EmptyState, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { CompanyFilter, DateRangeFilter, FilterBar, SearchBox } from '@/components/common/Filters'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useCompanyName } from '@/features/shared/lookups'
import { InvoiceForm } from '@/features/invoices/InvoiceForm'

export function DeliveriesPage() {
  const { data: challans = [], isLoading } = useChallans()
  const { data: invoices = [] } = useInvoices()
  const deleteChallan = useDeleteChallan()
  const setChallanStatus = useSetChallanStatus()
  const cancelChallan = useCancelChallan()
  const reopenChallan = useReopenChallan()
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
  // Challan queued for invoicing — opens the invoice form prefilled from it.
  const [invoiceFor, setInvoiceFor] = useState<DeliveryChallan[] | null>(null)
  const [search, setSearch] = useState('')
  const [company, setCompany] = useState('')
  const [from, setFrom] = useState(monthStartISO())
  const [to, setTo] = useState(monthEndISO())

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
        if (!inRange(d.date, from, to)) return false
        if (s && !`${d.dcNo} ${d.reference ?? ''}`.toLowerCase().includes(s)) return false
        return true
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [challans, company, from, to, search])

  const pg = usePagination(rows)

  // Current-month summary tiles.
  const monthPrefix = thisMonthPrefix()
  const monthStats = useMemo(() => {
    const inMonth = challans.filter((d) => d.date.slice(0, 7) === monthPrefix)
    let invoiced = 0
    let notInvoiced = 0
    let cancelled = 0
    for (const d of inMonth) {
      if (d.status === 'Cancelled') cancelled++
      else if (
        d.status === 'Invoiced' &&
        d.invoiceId &&
        invoices.some((i) => i.id === d.invoiceId && i.status !== 'Cancelled')
      )
        invoiced++
      else notInvoiced++
    }
    return { total: inMonth.length, invoiced, notInvoiced, cancelled }
  }, [challans, invoices, monthPrefix])

  // Total quantity dispatched per material across the filtered challans (company
  // + date range), excluding cancelled ones (their stock was restored).
  const dispatched = useMemo(() => {
    const map = new Map<string, { name: string; unit: string; qty: number }>()
    for (const d of rows) {
      if (d.status === 'Cancelled') continue
      for (const l of d.lines) {
        const key = `${l.materialId ?? l.description}|${l.unit}`
        const cur = map.get(key) ?? { name: l.description || '—', unit: l.unit, qty: 0 }
        cur.qty += l.quantity
        map.set(key, cur)
      }
    }
    return [...map.values()].sort((a, b) => b.qty - a.qty)
  }, [rows])

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
      await deleteChallan.mutateAsync(d.id)
      toast.success('Challan deleted')
    } catch (e) {
      toast.error(toUserMessage(e, 'Delete failed'))
    }
  }

  async function onCancel(d: DeliveryChallan) {
    const ok = await confirm({
      title: 'Cancel challan',
      message: `Cancel ${d.dcNo}?`,
      danger: true,
      confirmLabel: 'Cancel challan',
    })
    if (!ok) return
    try {
      await cancelChallan.mutateAsync(d.id)
      toast.success('Challan cancelled — stock restored')
    } catch (e) {
      toast.error(toUserMessage(e, 'Cancel failed'))
    }
  }

  async function onReopen(d: DeliveryChallan) {
    const ok = await confirm({
      title: 'Reopen challan',
      message: `${d.dcNo}'s invoice was cancelled. Reopen it so it can be re-invoiced or removed?`,
      confirmLabel: 'Reopen',
    })
    if (!ok) return
    try {
      await reopenChallan.mutateAsync(d.id)
      toast.success('Challan reopened')
    } catch (e) {
      toast.error(toUserMessage(e, 'Reopen failed'))
    }
  }

  return (
    <div>
      <PageHeader
        title="Delivery Challans"
        actions={
          <button className="btn-primary" onClick={() => setEditing(null)}>
            <Plus size={16} /> New Challan
          </button>
        }
      />

      <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-slate-500">
        This month — {thisMonthLabel()}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<Truck size={18} />}
          label="Challans"
          value={monthStats.total}
          tone="brand"
        />
        <StatTile
          icon={<FileCheck2 size={18} />}
          label="Invoiced"
          value={monthStats.invoiced}
          tone="green"
        />
        <StatTile
          icon={<FileClock size={18} />}
          label="Not invoiced"
          value={monthStats.notInvoiced}
          tone="amber"
        />
        <StatTile
          icon={<Ban size={18} />}
          label="Cancelled"
          value={monthStats.cancelled}
          tone="red"
        />
      </div>

      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search challan or ref…" />
        <CompanyFilter value={company} onChange={setCompany} />
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </FilterBar>

      {/* Total quantity dispatched per material for the current filters. */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
        <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-slate-500">
          Products dispatched{company ? ` — ${companyName(company)}` : ''}
        </p>
        {dispatched.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing dispatched for the current filters.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {dispatched.map((m) => (
              <span
                key={`${m.name}|${m.unit}`}
                className="inline-flex items-baseline gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm"
              >
                <span className="font-medium text-slate-800">{m.name}</span>
                <span className="font-semibold text-brand-700">{qty(m.qty)}</span>
                <span className="text-2xs text-slate-500">{m.unit}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading challans…</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Truck size={40} />}
            title="No delivery challans"
            description="Create a challan for dispatched goods, then raise an invoice against it."
          />
        ) : (
          <ResponsiveTable className="min-w-[48rem]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">DC No</th>
                <th className="th">Date</th>
                <th className="th">Company</th>
                <th className="th">Items &amp; Qty</th>
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
                    )}
                  >
                    <td className="td font-mono text-xs font-semibold text-slate-700">{d.dcNo}</td>
                    <td className="td">{fmtDate(d.date)}</td>
                    <td className="td">{companyName(d.companyId)}</td>
                    <td className="td">
                      <div className="flex flex-col gap-0.5">
                        {d.lines.map((l) => (
                          <span key={l.id} className="text-xs text-slate-700">
                            {l.description || '—'}
                            <span className="ml-1 text-2xs text-slate-500">
                              · {qty(l.quantity)} {l.unit}
                            </span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="td">
                      {billed ? (
                        <div className="flex flex-col gap-0.5">
                          <Badge tone="green">Invoiced</Badge>
                          <Link
                            to="/app/invoices/$id/print"
                            params={{ id: inv!.id }}
                            className="font-mono text-2xs font-semibold text-brand-700 hover:underline"
                            title="View invoice for this challan"
                          >
                            {inv!.invoiceNo}
                          </Link>
                        </div>
                      ) : d.status === 'Cancelled' ? (
                        <Badge tone="red">Cancelled</Badge>
                      ) : (
                        <Badge tone="amber">Not Invoiced</Badge>
                      )}
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <button
                          className="btn-ghost btn-sm"
                          title="View / Print"
                          onClick={() =>
                            navigate({ to: '/app/deliveries/$id/print', params: { id: d.id } })
                          }
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
                          <button
                            className="btn-ghost btn-sm"
                            title="Edit"
                            onClick={() => setEditing(d)}
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                        {d.status === 'Open' && (
                          <button
                            className="btn-ghost btn-sm text-amber-600"
                            title="Cancel"
                            onClick={() => onCancel(d)}
                          >
                            <Ban size={15} />
                          </button>
                        )}
                        {d.status !== 'Invoiced' && (
                          <button
                            className="btn-ghost btn-sm text-red-500"
                            title="Delete"
                            onClick={() => onDelete(d)}
                          >
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
                description: invoiceFor.length > 1 ? `${l.description} — ${d.dcNo}` : l.description,
                quantity: l.quantity,
                rate: 0,
              })),
            ),
          }}
          onCreated={(invoiceId) => {
            invoiceFor.forEach((d) =>
              setChallanStatus.mutate({ id: d.id, status: 'Invoiced', invoiceId }),
            )
            toast.success(
              invoiceFor.length > 1
                ? `Invoice raised against ${invoiceFor.length} challans`
                : `Invoice raised against ${invoiceFor[0].dcNo}`,
            )
          }}
          onClose={() => setInvoiceFor(null)}
        />
      )}
    </div>
  )
}

function DcForm({ dc, onClose }: { dc: DeliveryChallan | null; onClose: () => void }) {
  const toast = useToast()
  const createChallan = useCreateChallan()
  const updateChallan = useUpdateChallan()
  const saving = createChallan.isPending || updateChallan.isPending
  const { data: allCompanies = [] } = useCompanies()
  const companies = allCompanies.filter((c) => c.active || c.id === dc?.companyId)
  const { data: jobs = [] } = useJobs()
  const { data: allMaterials = [] } = useMaterials()
  const materials = allMaterials.filter((m) => m.active)
  const { data: existingChallans = [] } = useChallans()
  const dcNoPreview = usePreviewNo('dc')
  const isEdit = !!dc // existing challan already dispatched -> lines are locked

  const [companyId, setCompanyId] = useState(dc?.companyId ?? companies[0]?.id ?? '')
  const [date, setDate] = useState(dc?.date ?? todayISO())
  const [jobId, setJobId] = useState(dc?.jobId ?? '')
  const [reference, setReference] = useState(dc?.reference ?? '')
  const [vehicleNo, setVehicleNo] = useState(dc?.vehicleNo ?? '')
  const [notes, setNotes] = useState(dc?.notes ?? '')
  // Challan number: auto (server sequential counter) by default, or a manual
  // override the user types in. Auto mode never consumes the counter early.
  const [autoNumber, setAutoNumber] = useState(true)
  const [manualDcNo, setManualDcNo] = useState('')
  const emptyLine = (): DcLine => ({
    id: uid('dl_'),
    materialId: '',
    ownerType: 'Company',
    description: '',
    quantity: 1,
    unit: 'Nos',
  })
  const [lines, setLines] = useState<DcLine[]>(dc?.lines ?? [emptyLine()])

  function updateLine(id: string, patch: Partial<DcLine>) {
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }
  function pickMaterial(id: string, materialId: string) {
    const m = materials.find((x) => x.id === materialId)
    updateLine(id, {
      materialId,
      description: m?.name ?? '',
      unit: m?.unit ?? 'Nos',
    })
  }
  function addLine() {
    setLines((ls) => [...ls, emptyLine()])
  }
  function removeLine(id: string) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls))
  }

  async function submit() {
    try {
      if (isEdit) {
        // Lines are immutable after dispatch; only metadata is editable.
        await updateChallan.mutateAsync({
          id: dc.id,
          patch: {
            reference: reference || undefined,
            vehicleNo: vehicleNo || undefined,
            notes: notes || undefined,
          },
        })
        toast.success('Challan updated')
        onClose()
        return
      }
      const cleaned = lines.filter((l) => l.materialId && Number(l.quantity) > 0)
      if (!cleaned.length) {
        toast.error('Add at least one item with a material and quantity')
        return
      }
      // Resolve the challan number: undefined => server mints the next sequential
      // one; a trimmed manual value is validated for presence + uniqueness here
      // (the DB unique constraint is the final guard).
      let dcNo: string | undefined
      if (!autoNumber) {
        dcNo = manualDcNo.trim()
        if (!dcNo) {
          toast.error('Enter a challan number, or switch to Auto')
          return
        }
        if (existingChallans.some((c) => c.dcNo.toLowerCase() === dcNo!.toLowerCase())) {
          toast.error(`Challan number "${dcNo}" already exists`)
          return
        }
      }
      await createChallan.mutateAsync({
        dcNo,
        date,
        companyId,
        jobId: jobId || undefined,
        reference: reference || undefined,
        vehicleNo: vehicleNo || undefined,
        notes: notes || undefined,
        status: 'Open',
        lines: cleaned.map((l) => ({
          id: l.id,
          materialId: l.materialId,
          ownerType: l.ownerType,
          description: l.description,
          quantity: Number(l.quantity),
          unit: l.unit,
          jobId: jobId || undefined,
        })),
      })
      toast.success('Challan created — stock dispatched')
      onClose()
    } catch (e) {
      toast.error(toUserMessage(e, 'Save failed'))
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
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : dc ? 'Save changes' : 'Create & dispatch'}
          </button>
        </>
      }
    >
      {!dc ? (
        <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
          Creating this challan dispatches the items and reduces stock.
        </p>
      ) : (
        <p className="mb-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
          Items are locked once dispatched. To change items, cancel this challan (which restores
          stock) and create a new one.
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {isEdit ? (
          <Field label="Challan No." required>
            <Input value={dc.dcNo} disabled />
          </Field>
        ) : (
          <div>
            {/* Manual label (the composite input+toggle can't use <Field>'s
                single-child label association). */}
            <label className="label" htmlFor="dc-no-input">
              Challan No.<span className="text-red-500"> *</span>
            </label>
            <div className="flex items-stretch gap-2">
              <Input
                id="dc-no-input"
                value={autoNumber ? (dcNoPreview === '…' ? 'Auto…' : dcNoPreview) : manualDcNo}
                onChange={(e) => setManualDcNo(e.target.value)}
                disabled={autoNumber}
                placeholder="Enter challan no."
                title={
                  autoNumber ? 'Next sequential number (auto)' : 'Type a custom challan number'
                }
              />
              <button
                type="button"
                className="btn-secondary btn-sm whitespace-nowrap"
                title={
                  autoNumber ? 'Switch to manual entry' : 'Use the automatic sequential number'
                }
                onClick={() => {
                  if (autoNumber) {
                    // Going manual: prefill with the previewed next number as a start.
                    setManualDcNo(dcNoPreview === '…' ? '' : dcNoPreview)
                    setAutoNumber(false)
                  } else {
                    setAutoNumber(true)
                  }
                }}
              >
                {autoNumber ? 'Manual' : 'Auto'}
              </button>
            </div>
            <p className="mt-1 text-2xs text-slate-500">
              {autoNumber ? 'Automatic sequential number.' : 'Manual number.'}
            </p>
          </div>
        )}
        <Field label="Company" required>
          <Select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            disabled={isEdit}
          >
            <option value="">Select…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date" required>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={isEdit}
          />
        </Field>
        <Field label="Job (optional)">
          <Select value={jobId} onChange={(e) => setJobId(e.target.value)} disabled={isEdit}>
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
          <label className="label mb-0">Items (dispatched from stock)</label>
          {!isEdit && (
            <button className="btn-ghost btn-sm text-brand-600" onClick={addLine}>
              <Plus size={14} /> Add item
            </button>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[34rem]">
            <thead>
              <tr className="bg-slate-50">
                <th className="th">Material</th>
                <th className="th w-36">From stock</th>
                <th className="th w-24 text-right">Qty</th>
                <th className="th w-16">Unit</th>
                <th className="th w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-2 py-1.5">
                    {isEdit ? (
                      <span className="text-sm text-slate-700">{l.description || '—'}</span>
                    ) : (
                      <select
                        className="input"
                        value={l.materialId ?? ''}
                        onChange={(e) => pickMaterial(l.id, e.target.value)}
                      >
                        <option value="">Select material…</option>
                        {materials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.unit})
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {isEdit ? (
                      <span className="text-2xs text-slate-500">
                        {l.ownerType === 'Shop' ? 'Own (shop)' : 'Customer'}
                      </span>
                    ) : (
                      <select
                        className="input"
                        value={l.ownerType ?? 'Company'}
                        onChange={(e) =>
                          updateLine(l.id, { ownerType: e.target.value as DcLine['ownerType'] })
                        }
                      >
                        <option value="Company">This customer's stock</option>
                        <option value="Shop">Own (shop) stock</option>
                      </select>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      step="0.001"
                      min={0}
                      className="input text-right"
                      value={l.quantity}
                      disabled={isEdit}
                      onChange={(e) => updateLine(l.id, { quantity: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-slate-600">{l.unit}</td>
                  <td className="px-2 py-1.5 text-right">
                    {!isEdit && (
                      <button
                        className="btn-ghost btn-sm text-red-500"
                        onClick={() => removeLine(l.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
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
