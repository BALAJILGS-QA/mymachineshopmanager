import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { BookOpen, Download, Scale } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Card, Select } from '@/components/ui/primitives'
import { downloadXlsx, type XlsxColumn } from '@/lib/xlsx'
import { currency, fmtDate } from '@/lib/format'
import { useAccounts, useGeneralLedger, useTrialBalance } from '../hooks/useFinance'
import { useFinanceAccess } from '../access'
import type { GLRow, TrialBalanceRow } from '../types'

export function LedgerPage() {
  const [tab, setTab] = useState<'trial' | 'ledger'>('trial')
  const [accountId, setAccountId] = useState('')
  const accounts = (useAccounts().list.data ?? []).filter((a) => !a.isGroup)
  const trial = useTrialBalance().data ?? []
  const gl = useGeneralLedger(accountId ? { accountId } : undefined).data ?? []
  const perms = useFinanceAccess()
  const canExport = perms.can('REPORT_EXPORT') || perms.can('ACCOUNTS_VIEW')

  const trialTotals = useMemo(
    () => ({
      debit: trial.reduce((s, r) => s + r.totalDebit, 0),
      credit: trial.reduce((s, r) => s + r.totalCredit, 0),
    }),
    [trial],
  )

  const trialCols: DataTableColumn<TrialBalanceRow>[] = [
    {
      key: 'code',
      header: 'Code',
      cellClassName: 'font-mono text-xs',
      render: (r) => r.accountCode,
    },
    {
      key: 'name',
      header: 'Account',
      cellClassName: 'font-semibold',
      render: (r) => r.accountName,
    },
    {
      key: 'type',
      header: 'Type',
      cellClassName: 'capitalize text-xs',
      render: (r) => r.accountType,
    },
    {
      key: 'debit',
      header: 'Debit',
      cellClassName: 'tnum text-right',
      headerClassName: 'text-right',
      render: (r) => (r.totalDebit ? currency(r.totalDebit) : '—'),
    },
    {
      key: 'credit',
      header: 'Credit',
      cellClassName: 'tnum text-right',
      headerClassName: 'text-right',
      render: (r) => (r.totalCredit ? currency(r.totalCredit) : '—'),
    },
    {
      key: 'balance',
      header: 'Balance',
      cellClassName: 'tnum text-right font-semibold',
      headerClassName: 'text-right',
      render: (r) => currency(r.balance),
    },
  ]

  const glCols: DataTableColumn<GLRow>[] = [
    {
      key: 'date',
      header: 'Date',
      cellClassName: 'whitespace-nowrap tnum text-xs',
      render: (r) => fmtDate(r.date),
    },
    {
      key: 'journal',
      header: 'Journal',
      cellClassName: 'font-mono text-xs',
      render: (r) => r.journalNo || '—',
    },
    { key: 'account', header: 'Account', render: (r) => `${r.accountCode} · ${r.accountName}` },
    {
      key: 'narration',
      header: 'Narration',
      cellClassName: 'max-w-xs',
      render: (r) => (
        <span className="line-clamp-1 text-xs text-slate-600">
          {r.description || r.narration || '—'}
        </span>
      ),
    },
    {
      key: 'debit',
      header: 'Debit',
      cellClassName: 'tnum text-right',
      headerClassName: 'text-right',
      render: (r) => (r.debit ? currency(r.debit) : '—'),
    },
    {
      key: 'credit',
      header: 'Credit',
      cellClassName: 'tnum text-right',
      headerClassName: 'text-right',
      render: (r) => (r.credit ? currency(r.credit) : '—'),
    },
  ]

  function exportTrial() {
    const cols: XlsxColumn<TrialBalanceRow>[] = [
      { header: 'Code', value: (r) => r.accountCode },
      { header: 'Account', value: (r) => r.accountName },
      { header: 'Type', value: (r) => r.accountType },
      { header: 'Debit', value: (r) => r.totalDebit },
      { header: 'Credit', value: (r) => r.totalCredit },
      { header: 'Balance', value: (r) => r.balance },
    ]
    downloadXlsx('trial-balance', trial, cols, 'Trial Balance')
  }

  return (
    <div>
      <PageHeader
        title="General Ledger"
        subtitle="Trial balance and account-wise ledger, built from posted journals"
        actions={
          canExport &&
          tab === 'trial' && (
            <button className="btn-secondary btn-sm" onClick={exportTrial}>
              <Download size={16} /> Export
            </button>
          )
        }
      />

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {(['trial', 'ledger'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'border-b-2 px-3 py-2 text-sm font-medium',
              tab === t
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {t === 'trial' ? 'Trial Balance' : 'Account Ledger'}
          </button>
        ))}
      </div>

      {tab === 'trial' ? (
        <Card>
          <DataTable
            columns={trialCols}
            rows={trial}
            rowKey={(r) => r.accountId}
            minWidthClassName="min-w-[48rem]"
            empty={{
              icon: <Scale size={40} />,
              title: 'Nothing posted yet',
              description: 'The trial balance populates as journals are posted.',
            }}
          />
          {trial.length > 0 && (
            <div className="flex justify-end gap-8 border-t border-slate-200 px-4 py-2 text-sm font-semibold">
              <span className="tnum">Dr {currency(trialTotals.debit)}</span>
              <span className="tnum">Cr {currency(trialTotals.credit)}</span>
            </div>
          )}
        </Card>
      ) : (
        <>
          <Card className="mb-3 p-3">
            <Select
              className="w-72"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              aria-label="Account"
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </Select>
          </Card>
          <Card>
            <DataTable
              columns={glCols}
              rows={gl}
              rowKey={(r) => r.lineId}
              minWidthClassName="min-w-[56rem]"
              empty={{
                icon: <BookOpen size={40} />,
                title: 'No ledger entries',
                description: 'Post journals or import a statement.',
              }}
            />
          </Card>
        </>
      )}
    </div>
  )
}
