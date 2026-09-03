import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Scale } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Badge, Card, Field, Select } from '@/components/ui/primitives'
import { StatTile } from '@/components/common/StatTile'
import { AppLink } from '@/components/nav/app-link'
import { currency, fmtDate } from '@/lib/format'
import { useBankAccounts, useBankTxns } from '../hooks/useFinance'
import type { BankTxn } from '../types'

export function BankReconciliationPage() {
  const banks = (useBankAccounts().list.data ?? []).filter((b) => b.active)
  const [bankId, setBankId] = useState('')
  const allTxns = useBankTxns().data ?? []
  const txns = useMemo(
    () => allTxns.filter((t) => !bankId || t.bankAccountId === bankId),
    [allTxns, bankId],
  )
  const bank = banks.find((b) => b.id === bankId)

  const stats = useMemo(() => {
    const reconciled = txns.filter((t) => t.reconciliationStatus === 'reconciled')
    const unreconciled = txns.filter(
      (t) => t.reconciliationStatus !== 'reconciled' && t.dupStatus !== 'duplicate',
    )
    const credits = txns.reduce((s, t) => s + t.creditAmount, 0)
    const debits = txns.reduce((s, t) => s + t.debitAmount, 0)
    // Statement closing = latest transaction's balance_after when present.
    const sorted = [...txns].sort((a, b) => (a.transactionDate < b.transactionDate ? -1 : 1))
    const stmtClosing = [...sorted].reverse().find((t) => t.balanceAfter != null)?.balanceAfter
    const bookBalance = (bank?.openingBalance ?? 0) + credits - debits
    return {
      reconciled: reconciled.length,
      unreconciled: unreconciled.length,
      credits,
      debits,
      stmtClosing,
      bookBalance,
      diff: stmtClosing != null ? Math.round((stmtClosing - bookBalance) * 100) / 100 : null,
      unreconciledRows: unreconciled,
    }
  }, [txns, bank])

  const columns: DataTableColumn<BankTxn>[] = [
    {
      key: 'date',
      header: 'Date',
      cellClassName: 'whitespace-nowrap tnum text-xs',
      render: (t) => fmtDate(t.transactionDate),
    },
    {
      key: 'narration',
      header: 'Narration',
      cellClassName: 'max-w-sm',
      render: (t) => <span className="line-clamp-1 text-xs text-slate-600">{t.narration}</span>,
    },
    {
      key: 'debit',
      header: 'Debit',
      cellClassName: 'tnum text-right',
      headerClassName: 'text-right',
      render: (t) => (t.debitAmount ? currency(t.debitAmount) : '—'),
    },
    {
      key: 'credit',
      header: 'Credit',
      cellClassName: 'tnum text-right',
      headerClassName: 'text-right',
      render: (t) => (t.creditAmount ? currency(t.creditAmount) : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => (
        <Badge tone={t.postingStatus === 'posted' ? 'green' : 'amber'}>
          {t.postingStatus === 'posted' ? 'Posted' : 'Unposted'}
        </Badge>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Bank Reconciliation"
        subtitle="Compare the bank statement against the books and clear unreconciled items"
        actions={
          <AppLink to="/app/accounts/bank-import" className="btn-secondary btn-sm">
            Import statement
          </AppLink>
        }
      />

      <Card className="mb-4 p-3">
        <Field label="Bank account" className="w-72">
          <Select value={bankId} onChange={(e) => setBankId(e.target.value)}>
            <option value="">All bank accounts</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.bankName ? ` · ${b.bankName}` : ''}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          icon={<CheckCircle2 size={20} />}
          label="Reconciled"
          value={stats.reconciled}
          tone="green"
        />
        <StatTile
          icon={<AlertTriangle size={20} />}
          label="Unreconciled"
          value={stats.unreconciled}
          tone="amber"
        />
        <StatTile
          icon={<Scale size={20} />}
          label="Book Balance"
          value={currency(stats.bookBalance)}
          tone="blue"
        />
        <StatTile
          icon={<Scale size={20} />}
          label="Statement Bal."
          value={stats.stmtClosing != null ? currency(stats.stmtClosing) : '—'}
          tone="violet"
        />
        <StatTile
          icon={<Scale size={20} />}
          label="Difference"
          value={stats.diff != null ? currency(stats.diff) : '—'}
          tone={stats.diff != null && Math.abs(stats.diff) > 0.5 ? 'red' : 'green'}
        />
      </div>

      <Card>
        <div className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
          Unreconciled transactions ({stats.unreconciledRows.length})
        </div>
        <DataTable
          columns={columns}
          rows={stats.unreconciledRows}
          rowKey={(t) => t.id}
          minWidthClassName="min-w-[48rem]"
          empty={{
            icon: <CheckCircle2 size={40} />,
            title: 'All reconciled',
            description: 'Every imported transaction for this account is posted and reconciled.',
          }}
        />
      </Card>
    </div>
  )
}
