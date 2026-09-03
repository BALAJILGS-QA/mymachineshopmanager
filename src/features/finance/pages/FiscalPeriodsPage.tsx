import { useState } from 'react'
import { CalendarRange, Lock, Plus, Unlock } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Badge, Card, Field, Input, Select } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { toUserMessage } from '@/lib/api/errors'
import { fmtDate } from '@/lib/format'
import { useFiscalYears, usePeriods } from '../hooks/useFinance'
import { useFinanceAccess } from '../access'
import type { AccountingPeriod, FiscalYear } from '../types'

const STATUS_TONE: Record<string, string> = { open: 'green', closed: 'amber', locked: 'red' }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function FiscalPeriodsPage() {
  const years = useFiscalYears()
  const periods = usePeriods()
  const perms = useFinanceAccess()
  const canManage = perms.can('ACCOUNTS_MANAGE')
  const toast = useToast()

  const [open, setOpen] = useState(false)
  const [startYear, setStartYear] = useState(new Date().getFullYear())
  const [selectedFy, setSelectedFy] = useState<string | undefined>()

  const fyList = [...(years.list.data ?? [])].sort((a, b) => b.name.localeCompare(a.name))
  const fy = fyList.find((y) => y.id === selectedFy) ?? fyList[0]
  const fyPeriods = (periods.list.data ?? [])
    .filter((p) => p.fiscalYearId === fy?.id)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  // Indian FY: Apr (start year) → Mar (start year + 1).
  async function createYear() {
    const name = `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
    try {
      const created = (await years.create.mutateAsync({
        name,
        startDate: `${startYear}-04-01`,
        endDate: `${startYear + 1}-03-31`,
        status: 'open',
      } as Partial<FiscalYear>)) as FiscalYear
      // Generate 12 monthly periods Apr..Mar.
      for (let i = 0; i < 12; i++) {
        const m = ((3 + i) % 12) + 1 // 4..12,1..3
        const y = i < 9 ? startYear : startYear + 1
        const last = new Date(y, m, 0).getDate()
        await periods.create.mutateAsync({
          fiscalYearId: created.id,
          name: `${y}-${String(m).padStart(2, '0')}`,
          startDate: `${y}-${String(m).padStart(2, '0')}-01`,
          endDate: `${y}-${String(m).padStart(2, '0')}-${last}`,
          status: 'open',
        } as Partial<AccountingPeriod>)
      }
      toast.success(`FY ${name} created with 12 periods`)
      setSelectedFy(created.id)
      setOpen(false)
    } catch (e) {
      toast.error(toUserMessage(e, 'Could not create fiscal year'))
    }
  }

  async function setPeriodStatus(p: AccountingPeriod, status: 'open' | 'closed' | 'locked') {
    try {
      await periods.update.mutateAsync({ id: p.id, patch: { status } })
    } catch (e) {
      toast.error(toUserMessage(e, 'Update failed'))
    }
  }
  async function setYearStatus(y: FiscalYear, status: 'open' | 'closed' | 'locked') {
    try {
      await years.update.mutateAsync({ id: y.id, patch: { status } })
      toast.success(`FY ${y.name} ${status}`)
    } catch (e) {
      toast.error(toUserMessage(e, 'Update failed'))
    }
  }

  const columns: DataTableColumn<AccountingPeriod>[] = [
    {
      key: 'name',
      header: 'Period',
      cellClassName: 'font-semibold',
      render: (p) => `${MONTHS[Number(p.name.slice(5)) - 1]} ${p.name.slice(0, 4)}`,
    },
    {
      key: 'range',
      header: 'Range',
      cellClassName: 'text-xs',
      render: (p) => `${fmtDate(p.startDate)} → ${fmtDate(p.endDate)}`,
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      render: (p) =>
        canManage && (
          <div className="flex justify-end gap-1">
            {p.status !== 'open' && (
              <button
                className="btn-ghost btn-sm text-emerald-600"
                onClick={() => setPeriodStatus(p, 'open')}
                title="Reopen"
              >
                <Unlock size={14} /> Open
              </button>
            )}
            {p.status === 'open' && (
              <button
                className="btn-ghost btn-sm text-amber-600"
                onClick={() => setPeriodStatus(p, 'closed')}
                title="Close"
              >
                Close
              </button>
            )}
            {p.status !== 'locked' && (
              <button
                className="btn-ghost btn-sm text-red-500"
                onClick={() => setPeriodStatus(p, 'locked')}
                title="Lock"
              >
                <Lock size={14} /> Lock
              </button>
            )}
          </div>
        ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Accounting Periods"
        subtitle="Financial years and periods. Locked periods block journal posting."
        actions={
          canManage && (
            <button className="btn-primary btn-sm" onClick={() => setOpen(true)}>
              <Plus size={16} /> New Financial Year
            </button>
          )
        }
      />

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Field label="Financial year" className="w-56">
            <Select value={fy?.id ?? ''} onChange={(e) => setSelectedFy(e.target.value)}>
              {fyList.length === 0 && <option value="">— None —</option>}
              {fyList.map((y) => (
                <option key={y.id} value={y.id}>
                  FY {y.name} ({y.status})
                </option>
              ))}
            </Select>
          </Field>
          {fy && canManage && (
            <div className="flex gap-1 pt-5">
              <button
                className="btn-ghost btn-sm"
                onClick={() => setYearStatus(fy, fy.status === 'open' ? 'closed' : 'open')}
              >
                {fy.status === 'open' ? 'Close year' : 'Reopen year'}
              </button>
              <button
                className="btn-ghost btn-sm text-red-500"
                onClick={() => setYearStatus(fy, 'locked')}
              >
                <Lock size={14} /> Lock year
              </button>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          rows={fyPeriods}
          rowKey={(p) => p.id}
          loading={periods.list.isLoading}
          minWidthClassName="min-w-[44rem]"
          empty={{
            icon: <CalendarRange size={40} />,
            title: 'No periods',
            description: 'Create a financial year to generate monthly periods.',
          }}
        />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New Financial Year"
        footer={
          <>
            <button className="btn-secondary btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary btn-sm" onClick={createYear}>
              Create + generate periods
            </button>
          </>
        }
      >
        <Field
          label="Start calendar year"
          hint="Indian FY runs 1 Apr of this year → 31 Mar next year, with 12 monthly periods."
        >
          <Input
            type="number"
            value={String(startYear)}
            onChange={(e) => setStartYear(Number(e.target.value))}
          />
        </Field>
      </Modal>
    </div>
  )
}
