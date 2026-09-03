import { useEffect, useState } from 'react'
import { FileText, Lock, Play, Plus, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Badge, Card, Field, Input } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { StatTile } from '@/components/common/StatTile'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { toUserMessage } from '@/lib/api/errors'
import { currency, fmtDate } from '@/lib/format'
import {
  useEmployees,
  usePayrollActions,
  usePayrollPeriods,
  usePayrollRuns,
  usePayrollRecords,
} from '../hooks/useHrm'
import { usePermissions } from '../permissions'
import { employeeName } from '../components/employeeUi'
import type { PayrollPeriod, PayrollRecord } from '../types'

const PERIOD_TONE: Record<string, string> = {
  draft: 'slate',
  processing: 'amber',
  calculated: 'blue',
  reviewed: 'blue',
  approved: 'violet',
  finalized: 'green',
  locked: 'green',
}

export function PayrollPage() {
  const periodsHook = usePayrollPeriods()
  const periods = [...(periodsHook.list.data ?? [])].sort((a, b) => b.name.localeCompare(a.name))
  const employees = useEmployees().data ?? []
  const perms = usePermissions()
  const toast = useToast()
  const confirm = useConfirm()
  const { run, finalize } = usePayrollActions()

  const canProcess = perms.can('PAYROLL_PROCESS')
  const canFinalize = perms.can('PAYROLL_FINALIZE')

  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [payslip, setPayslip] = useState<PayrollRecord | null>(null)

  useEffect(() => {
    if (!selectedId && periods.length) setSelectedId(periods[0].id)
  }, [periods, selectedId])

  const runs = usePayrollRuns(selectedId).data ?? []
  const latestRun = runs[0]
  const records = usePayrollRecords(latestRun?.id).data ?? []
  const selected = periods.find((p) => p.id === selectedId)

  const empName = (id: string) => {
    const e = employees.find((x) => x.id === id)
    return e ? employeeName(e) : id
  }

  async function createPeriod() {
    if (!draft.name || !draft.startDate || !draft.endDate)
      return toast.error('Name and date range are required')
    try {
      await periodsHook.create.mutateAsync(draft as Partial<PayrollPeriod>)
      toast.success('Period created')
      setOpen(false)
    } catch (e) {
      toast.error(toUserMessage(e, 'Could not create period'))
    }
  }

  async function onRun() {
    if (!selectedId) return
    const ok = await confirm({
      title: 'Process payroll',
      message: `Run payroll for ${selected?.name}? This recalculates every active employee's pay.`,
      confirmLabel: 'Run',
    })
    if (!ok) return
    try {
      await run.mutateAsync({ periodId: selectedId })
      toast.success('Payroll processed')
    } catch (e) {
      toast.error(toUserMessage(e, 'Payroll run failed'))
    }
  }

  async function onFinalize() {
    if (!selectedId) return
    const ok = await confirm({
      title: 'Finalize payroll',
      message: `Finalize ${selected?.name}? Finalised payroll is locked against further edits.`,
      confirmLabel: 'Finalize',
    })
    if (!ok) return
    try {
      await finalize.mutateAsync(selectedId)
      toast.success('Payroll finalized')
    } catch (e) {
      toast.error(toUserMessage(e, 'Finalize failed'))
    }
  }

  const columns: DataTableColumn<PayrollRecord>[] = [
    {
      key: 'emp',
      header: 'Employee',
      cellClassName: 'font-semibold',
      render: (r) => empName(r.employeeId),
    },
    {
      key: 'gross',
      header: 'Gross',
      cellClassName: 'tnum text-right',
      headerClassName: 'text-right',
      render: (r) => currency(r.gross),
    },
    {
      key: 'ded',
      header: 'Deductions',
      cellClassName: 'tnum text-right',
      headerClassName: 'text-right',
      render: (r) => currency(r.totalDeductions),
    },
    {
      key: 'net',
      header: 'Net Pay',
      cellClassName: 'tnum text-right font-semibold',
      headerClassName: 'text-right',
      render: (r) => currency(r.net),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'text-right',
      render: (r) => (
        <div className="flex justify-end">
          <button className="btn-ghost btn-sm" onClick={() => setPayslip(r)} title="Payslip">
            <FileText size={15} /> Payslip
          </button>
        </div>
      ),
    },
  ]

  const locked = selected?.status === 'finalized' || selected?.status === 'locked'

  return (
    <div>
      <PageHeader
        title="Payroll"
        subtitle="Process periodic payroll from configurable salary structures. Finalised runs are locked."
        actions={
          canProcess && (
            <button
              className="btn-primary btn-sm"
              onClick={() => {
                setDraft({ status: 'draft' })
                setOpen(true)
              }}
            >
              <Plus size={16} /> New Period
            </button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {/* Periods list */}
        <Card className="p-3 lg:col-span-1">
          <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Periods
          </h3>
          {periods.length === 0 ? (
            <p className="px-1 py-4 text-xs text-slate-500">No periods yet.</p>
          ) : (
            <ul className="space-y-1">
              {periods.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => setSelectedId(p.id)}
                    className={
                      'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ' +
                      (selectedId === p.id
                        ? 'bg-brand-50 font-semibold text-brand-800'
                        : 'hover:bg-slate-50')
                    }
                  >
                    <span>{p.name}</span>
                    <Badge tone={PERIOD_TONE[p.status] ?? 'slate'}>{p.status}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Selected period */}
        <div className="space-y-4 lg:col-span-3">
          {selected ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile
                  icon={<Wallet size={20} />}
                  label="Employees"
                  value={latestRun?.employeeCount ?? 0}
                  tone="blue"
                />
                <StatTile
                  icon={<Wallet size={20} />}
                  label="Gross"
                  value={currency(latestRun?.grossTotal ?? 0)}
                  tone="green"
                />
                <StatTile
                  icon={<Wallet size={20} />}
                  label="Deductions"
                  value={currency(latestRun?.deductionTotal ?? 0)}
                  tone="amber"
                />
                <StatTile
                  icon={<Wallet size={20} />}
                  label="Net Pay"
                  value={currency(latestRun?.netTotal ?? 0)}
                  tone="violet"
                />
              </div>

              <Card className="p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      {selected.name} · {fmtDate(selected.startDate)} → {fmtDate(selected.endDate)}
                    </p>
                    <p className="text-xs text-slate-500">
                      Status:{' '}
                      <Badge tone={PERIOD_TONE[selected.status] ?? 'slate'}>
                        {selected.status}
                      </Badge>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {canProcess && !locked && (
                      <button
                        className="btn-secondary btn-sm"
                        onClick={onRun}
                        disabled={run.isPending}
                      >
                        <Play size={15} /> {run.isPending ? 'Running…' : 'Run payroll'}
                      </button>
                    )}
                    {canFinalize && !locked && latestRun && (
                      <button className="btn-primary btn-sm" onClick={onFinalize}>
                        <Lock size={15} /> Finalize
                      </button>
                    )}
                  </div>
                </div>

                <DataTable
                  columns={columns}
                  rows={records}
                  rowKey={(r) => r.id}
                  minWidthClassName="min-w-[44rem]"
                  empty={{
                    icon: <Wallet size={40} />,
                    title: latestRun ? 'No records' : 'Not processed yet',
                    description: latestRun
                      ? 'This run produced no records — check salary assignments.'
                      : 'Run payroll to generate employee records for this period.',
                  }}
                />
              </Card>
            </>
          ) : (
            <Card className="p-8 text-center text-sm text-slate-500">
              Create a payroll period to get started.
            </Card>
          )}
        </div>
      </div>

      {/* New period modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New Payroll Period"
        footer={
          <>
            <button className="btn-secondary btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary btn-sm" onClick={createPeriod}>
              Create
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" required className="sm:col-span-2">
            <Input
              placeholder="2026-09"
              value={String(draft.name ?? '')}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </Field>
          <Field label="Start date" required>
            <Input
              type="date"
              value={String(draft.startDate ?? '')}
              onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
            />
          </Field>
          <Field label="End date" required>
            <Input
              type="date"
              value={String(draft.endDate ?? '')}
              onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
            />
          </Field>
          <Field label="Pay date">
            <Input
              type="date"
              value={String(draft.payDate ?? '')}
              onChange={(e) => setDraft((d) => ({ ...d, payDate: e.target.value || undefined }))}
            />
          </Field>
        </div>
      </Modal>

      {/* Payslip modal */}
      <Modal open={!!payslip} onClose={() => setPayslip(null)} title="Payslip" size="lg">
        {payslip && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <p className="text-base font-bold text-slate-900">{empName(payslip.employeeId)}</p>
                <p className="text-xs text-slate-500">{selected?.name}</p>
              </div>
              <p className="text-right text-2xl font-bold text-slate-900 tnum">
                {currency(payslip.net)}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h4 className="mb-1 text-xs font-bold uppercase text-emerald-600">Earnings</h4>
                {payslip.earnings.map((l, i) => (
                  <div
                    key={i}
                    className="flex justify-between border-b border-slate-100 py-1 text-sm"
                  >
                    <span className="text-slate-600">{l.name}</span>
                    <span className="tnum">{currency(l.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-1 text-sm font-semibold">
                  <span>Gross</span>
                  <span className="tnum">{currency(payslip.gross)}</span>
                </div>
              </div>
              <div>
                <h4 className="mb-1 text-xs font-bold uppercase text-red-500">Deductions</h4>
                {payslip.deductions.map((l, i) => (
                  <div
                    key={i}
                    className="flex justify-between border-b border-slate-100 py-1 text-sm"
                  >
                    <span className="text-slate-600">{l.name}</span>
                    <span className="tnum">{currency(l.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-1 text-sm font-semibold">
                  <span>Total deductions</span>
                  <span className="tnum">{currency(payslip.totalDeductions)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
