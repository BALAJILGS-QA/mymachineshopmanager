import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Download, TrendingUp, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { Card } from '@/components/ui/primitives'
import { downloadXlsx, type XlsxColumn } from '@/lib/xlsx'
import { currency } from '@/lib/format'
import { useTrialBalance } from '../hooks/useFinance'
import { useFinanceAccess } from '../access'
import type { TrialBalanceRow } from '../types'

interface Line {
  code: string
  name: string
  amount: number
}

export function FinancialStatementsPage() {
  const trial = useTrialBalance().data ?? []
  const perms = useFinanceAccess()
  const canExport = perms.can('REPORT_EXPORT') || perms.can('ACCOUNTS_VIEW')
  const [tab, setTab] = useState<'pl' | 'bs'>('pl')

  // Trial-balance `balance` = debit − credit. Income/liability/equity naturally
  // carry credit (negative) balances; flip their sign for presentation.
  const model = useMemo(() => {
    const pick = (type: TrialBalanceRow['accountType'], flip: boolean): Line[] =>
      trial
        .filter((r) => r.accountType === type)
        .map((r) => ({
          code: r.accountCode,
          name: r.accountName,
          amount: flip ? -r.balance : r.balance,
        }))
        .filter((l) => Math.abs(l.amount) > 0.005)
        .sort((a, b) => a.code.localeCompare(b.code))

    const income = pick('income', true)
    const expense = pick('expense', false)
    const asset = pick('asset', false)
    const liability = pick('liability', true)
    const equity = pick('equity', true)
    const sum = (ls: Line[]) => ls.reduce((s, l) => s + l.amount, 0)
    const totalIncome = sum(income)
    const totalExpense = sum(expense)
    const netProfit = totalIncome - totalExpense
    return {
      income,
      expense,
      asset,
      liability,
      equity,
      totalIncome,
      totalExpense,
      netProfit,
      totalAssets: sum(asset),
      totalLiab: sum(liability),
      totalEquity: sum(equity),
    }
  }, [trial])

  function exportStatement() {
    const rows: Line[] =
      tab === 'pl'
        ? [
            ...model.income.map((l) => ({ ...l, name: `Income: ${l.name}` })),
            ...model.expense.map((l) => ({ ...l, name: `Expense: ${l.name}` })),
            { code: '', name: 'NET PROFIT', amount: model.netProfit },
          ]
        : [
            ...model.asset.map((l) => ({ ...l, name: `Asset: ${l.name}` })),
            ...model.liability.map((l) => ({ ...l, name: `Liability: ${l.name}` })),
            ...model.equity.map((l) => ({ ...l, name: `Equity: ${l.name}` })),
            { code: '', name: 'RETAINED (Net Profit)', amount: model.netProfit },
          ]
    const cols: XlsxColumn<Line>[] = [
      { header: 'Code', value: (l) => l.code },
      { header: 'Account', value: (l) => l.name },
      { header: 'Amount', value: (l) => l.amount },
    ]
    downloadXlsx(
      tab === 'pl' ? 'profit-and-loss' : 'balance-sheet',
      rows,
      cols,
      tab === 'pl' ? 'P&L' : 'Balance Sheet',
    )
  }

  const Section = ({ title, lines, total }: { title: string; lines: Line[]; total: number }) => (
    <div className="mb-4">
      <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h4>
      <div className="rounded-lg border border-slate-200">
        {lines.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-400">—</p>
        ) : (
          lines.map((l) => (
            <div
              key={l.code}
              className="flex justify-between border-b border-slate-100 px-3 py-1.5 text-sm last:border-0"
            >
              <span className="text-slate-600">
                <span className="mr-2 font-mono text-2xs text-slate-400">{l.code}</span>
                {l.name}
              </span>
              <span className="tnum">{currency(l.amount)}</span>
            </div>
          ))
        )}
        <div className="flex justify-between bg-slate-50 px-3 py-1.5 text-sm font-semibold">
          <span>Total {title}</span>
          <span className="tnum">{currency(total)}</span>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <PageHeader
        title="Financial Statements"
        subtitle="Profit & Loss and Balance Sheet, derived from posted journals"
        actions={
          canExport && (
            <button className="btn-secondary btn-sm" onClick={exportStatement}>
              <Download size={16} /> Export
            </button>
          )
        }
      />

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {(['pl', 'bs'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium',
              tab === t
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {t === 'pl' ? <TrendingUp size={15} /> : <Wallet size={15} />}
            {t === 'pl' ? 'Profit & Loss' : 'Balance Sheet'}
          </button>
        ))}
      </div>

      {tab === 'pl' ? (
        <Card className="p-5">
          <Section title="Income" lines={model.income} total={model.totalIncome} />
          <Section title="Expenses" lines={model.expense} total={model.totalExpense} />
          <div
            className={clsx(
              'flex justify-between rounded-lg px-3 py-2 text-base font-bold',
              model.netProfit >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
            )}
          >
            <span>Net {model.netProfit >= 0 ? 'Profit' : 'Loss'}</span>
            <span className="tnum">{currency(Math.abs(model.netProfit))}</span>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <Section title="Assets" lines={model.asset} total={model.totalAssets} />
          </Card>
          <Card className="p-5">
            <Section title="Liabilities" lines={model.liability} total={model.totalLiab} />
            <Section title="Equity" lines={model.equity} total={model.totalEquity} />
            <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold">
              <span>Retained (Net Profit)</span>
              <span className="tnum">{currency(model.netProfit)}</span>
            </div>
            <div className="mt-2 flex justify-between rounded-lg bg-blue-50 px-3 py-2 text-base font-bold text-blue-700">
              <span>Liabilities + Equity</span>
              <span className="tnum">
                {currency(model.totalLiab + model.totalEquity + model.netProfit)}
              </span>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
