import { useMemo, useState } from 'react'
import { BookOpen, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Pagination, usePagination } from '@/components/common/Pagination'
import { Badge, Card, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { toUserMessage } from '@/lib/api/errors'
import { currency, fmtDate, todayISO } from '@/lib/format'
import { useAccounts, useJournalActions, useJournalLines, useJournals } from '../hooks/useFinance'
import { useFinanceAccess } from '../access'
import type { Journal } from '../types'

interface DraftLine {
  accountId: string
  debit: string
  credit: string
  description: string
}

export function JournalsPage() {
  const journals = [...(useJournals().data ?? [])].sort((a, b) => (b.date > a.date ? 1 : -1))
  const accounts = (useAccounts().list.data ?? []).filter((a) => !a.isGroup)
  const { post, voidJ } = useJournalActions()
  const perms = useFinanceAccess()
  const canPost = perms.can('JOURNAL_POST')
  const toast = useToast()
  const confirm = useConfirm()

  const [open, setOpen] = useState(false)
  const [viewing, setViewing] = useState<Journal | null>(null)
  const [date, setDate] = useState(todayISO())
  const [narration, setNarration] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([
    { accountId: '', debit: '', credit: '', description: '' },
    { accountId: '', debit: '', credit: '', description: '' },
  ])
  const [saving, setSaving] = useState(false)

  const acctName = (id: string) => {
    const a = accounts.find((x) => x.id === id)
    return a ? `${a.code} · ${a.name}` : id
  }

  const totals = useMemo(() => {
    const d = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
    const c = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
    return { debit: d, credit: c, balanced: Math.abs(d - c) < 0.005 && d > 0 }
  }, [lines])

  const pg = usePagination(journals)

  function reset() {
    setDate(todayISO())
    setNarration('')
    setLines([
      { accountId: '', debit: '', credit: '', description: '' },
      { accountId: '', debit: '', credit: '', description: '' },
    ])
  }
  function setLine(i: number, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  async function submit() {
    if (!totals.balanced)
      return toast.error('Journal must balance (total debit = total credit, > 0)')
    const payload = lines
      .filter((l) => l.accountId && (Number(l.debit) || Number(l.credit)))
      .map((l) => ({
        accountId: l.accountId,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        description: l.description || undefined,
      }))
    if (payload.length < 2) return toast.error('At least two lines are required')
    setSaving(true)
    try {
      await post.mutateAsync({
        date,
        narration: narration || undefined,
        lines: payload,
        source: 'manual',
      })
      toast.success('Journal posted')
      setOpen(false)
      reset()
    } catch (e) {
      toast.error(toUserMessage(e, 'Could not post journal'))
    } finally {
      setSaving(false)
    }
  }

  async function onVoid(j: Journal) {
    const ok = await confirm({
      title: 'Void journal',
      message: `Void ${j.journalNo}? This reverses its effect on the ledger.`,
      danger: true,
      confirmLabel: 'Void',
    })
    if (!ok) return
    try {
      await voidJ.mutateAsync({ id: j.id })
      toast.success('Journal voided')
    } catch (e) {
      toast.error(toUserMessage(e, 'Void failed'))
    }
  }

  const columns: DataTableColumn<Journal>[] = [
    {
      key: 'no',
      header: 'Journal',
      cellClassName: 'font-mono text-xs',
      render: (j) => j.journalNo || j.id.slice(0, 8),
    },
    {
      key: 'date',
      header: 'Date',
      cellClassName: 'whitespace-nowrap tnum text-xs',
      render: (j) => fmtDate(j.date),
    },
    {
      key: 'narration',
      header: 'Narration',
      render: (j) => <span className="text-sm text-slate-700">{j.narration || '—'}</span>,
    },
    {
      key: 'source',
      header: 'Source',
      cellClassName: 'text-xs capitalize',
      render: (j) => j.source.replace('_', ' '),
    },
    {
      key: 'status',
      header: 'Status',
      render: (j) => (
        <Badge tone={j.status === 'posted' ? 'green' : j.status === 'void' ? 'red' : 'slate'}>
          {j.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      render: (j) => (
        <div className="flex justify-end gap-1">
          <button className="btn-ghost btn-sm" onClick={() => setViewing(j)}>
            View
          </button>
          {canPost && j.status === 'posted' && (
            <button
              className="btn-ghost btn-sm text-red-500"
              onClick={() => onVoid(j)}
              title="Void"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Journal Entries"
        subtitle="Double-entry journals. Every posting is validated to balance before it hits the ledger."
        actions={
          canPost && (
            <button
              className="btn-primary btn-sm"
              onClick={() => {
                reset()
                setOpen(true)
              }}
            >
              <Plus size={16} /> New Journal
            </button>
          )
        }
      />

      <Card>
        <DataTable
          columns={columns}
          rows={pg.pageItems}
          rowKey={(j) => j.id}
          minWidthClassName="min-w-[52rem]"
          empty={{
            icon: <BookOpen size={40} />,
            title: 'No journals yet',
            description: 'Post a manual journal or import a bank statement.',
          }}
        />
        <Pagination pg={pg} />
      </Card>

      {/* New journal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New Journal Entry"
        size="xl"
        footer={
          <>
            <div className="mr-auto text-sm">
              <span className="tnum">Dr {currency(totals.debit)}</span> ·{' '}
              <span className="tnum">Cr {currency(totals.credit)}</span>{' '}
              {totals.balanced ? (
                <Badge tone="green">Balanced</Badge>
              ) : (
                <Badge tone="red">Unbalanced</Badge>
              )}
            </div>
            <button className="btn-secondary btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary btn-sm"
              onClick={submit}
              disabled={saving || !totals.balanced}
            >
              {saving ? 'Posting…' : 'Post journal'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Date" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Narration" className="sm:col-span-2">
            <Textarea rows={2} value={narration} onChange={(e) => setNarration(e.target.value)} />
          </Field>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-2xs uppercase text-slate-500">
                <th className="p-1">Account</th>
                <th className="p-1 text-right">Debit</th>
                <th className="p-1 text-right">Credit</th>
                <th className="p-1"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="p-1">
                    <Select
                      value={l.accountId}
                      onChange={(e) => setLine(i, { accountId: e.target.value })}
                    >
                      <option value="">— Account —</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} · {a.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="p-1">
                    <Input
                      type="number"
                      className="text-right"
                      value={l.debit}
                      onChange={(e) => setLine(i, { debit: e.target.value, credit: '' })}
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      type="number"
                      className="text-right"
                      value={l.credit}
                      onChange={(e) => setLine(i, { credit: e.target.value, debit: '' })}
                    />
                  </td>
                  <td className="p-1">
                    {lines.length > 2 && (
                      <button
                        className="btn-ghost btn-sm text-red-500"
                        onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          className="btn-ghost btn-sm mt-2"
          onClick={() =>
            setLines((ls) => [...ls, { accountId: '', debit: '', credit: '', description: '' }])
          }
        >
          <Plus size={14} /> Add line
        </button>
      </Modal>

      {/* View lines */}
      {viewing && (
        <JournalView journal={viewing} acctName={acctName} onClose={() => setViewing(null)} />
      )}
    </div>
  )
}

function JournalView({
  journal,
  acctName,
  onClose,
}: {
  journal: Journal
  acctName: (id: string) => string
  onClose: () => void
}) {
  const lines = useJournalLines(journal.id).data ?? []
  return (
    <Modal
      open
      onClose={onClose}
      title={`${journal.journalNo ?? 'Journal'} · ${fmtDate(journal.date)}`}
      size="lg"
    >
      {journal.narration && <p className="mb-3 text-sm text-slate-600">{journal.narration}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-2xs uppercase text-slate-500">
            <th className="py-1">Account</th>
            <th className="py-1 text-right">Debit</th>
            <th className="py-1 text-right">Credit</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-t border-slate-100">
              <td className="py-1.5">{acctName(l.accountId)}</td>
              <td className="py-1.5 text-right tnum">{l.debit ? currency(l.debit) : ''}</td>
              <td className="py-1.5 text-right tnum">{l.credit ? currency(l.credit) : ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 font-semibold">
            <td className="py-1.5">Total</td>
            <td className="py-1.5 text-right tnum">
              {currency(lines.reduce((s, l) => s + l.debit, 0))}
            </td>
            <td className="py-1.5 text-right tnum">
              {currency(lines.reduce((s, l) => s + l.credit, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </Modal>
  )
}
