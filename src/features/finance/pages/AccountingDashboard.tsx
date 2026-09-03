import { useMemo } from 'react'
import {
  BookOpen,
  Building2,
  FileSpreadsheet,
  Landmark,
  Percent,
  Receipt,
  Scale,
  TrendingDown,
  TrendingUp,
  Upload,
  Wallet,
} from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { Card } from '@/components/ui/primitives'
import { AppLink } from '@/components/nav/app-link'
import { currency } from '@/lib/format'
import { useAccounts, useBankTxns, useTrialBalance } from '../hooks/useFinance'

const LINKS = [
  { to: '/app/accounts/chart-of-accounts', label: 'Chart of Accounts', icon: Landmark },
  { to: '/app/accounts/journals', label: 'Journals', icon: BookOpen },
  { to: '/app/accounts/ledger', label: 'General Ledger', icon: Scale },
  { to: '/app/accounts/bank-accounts', label: 'Bank Accounts', icon: Building2 },
  { to: '/app/accounts/bank-import', label: 'Bank Import', icon: Upload },
  { to: '/app/accounts/reconciliation', label: 'Reconciliation', icon: Scale },
  { to: '/app/accounts/gst', label: 'GST', icon: Percent },
  { to: '/app/accounts/tax-config', label: 'Tax Config', icon: Percent },
]

export function AccountingDashboard() {
  const accounts = useAccounts().list.data ?? []
  const trial = useTrialBalance().data ?? []
  const bankTxns = useBankTxns().data ?? []

  const stats = useMemo(() => {
    const bySysKey = new Map<string, number>()
    const byId = new Map(trial.map((t) => [t.accountId, t]))
    for (const a of accounts) {
      if (!a.systemKey) continue
      const tb = byId.get(a.id)
      if (tb) bySysKey.set(a.systemKey, (bySysKey.get(a.systemKey) ?? 0) + tb.balance)
    }
    const unreconciled = bankTxns.filter(
      (t) => t.reconciliationStatus !== 'reconciled' && t.dupStatus !== 'duplicate',
    ).length
    return {
      bank: (bySysKey.get('bank') ?? 0) + (bySysKey.get('cash') ?? 0),
      receivable: bySysKey.get('ar') ?? 0,
      payable: -(bySysKey.get('ap') ?? 0), // liabilities carry credit (negative) balances
      gstPayable: -(bySysKey.get('gst_output') ?? 0),
      unreconciled,
    }
  }, [accounts, trial, bankTxns])

  return (
    <div>
      <PageHeader
        title="Accounts & Finance"
        subtitle="Ledgers, banking, GST and reconciliation at a glance"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          icon={<Wallet size={20} />}
          label="Cash & Bank"
          value={currency(stats.bank)}
          tone="green"
          to="/app/accounts/ledger"
        />
        <StatTile
          icon={<TrendingUp size={20} />}
          label="Receivables"
          value={currency(stats.receivable)}
          tone="blue"
        />
        <StatTile
          icon={<TrendingDown size={20} />}
          label="Payables"
          value={currency(stats.payable)}
          tone="amber"
        />
        <StatTile
          icon={<Percent size={20} />}
          label="GST Payable"
          value={currency(stats.gstPayable)}
          tone="red"
          to="/app/accounts/gst"
        />
        <StatTile
          icon={<FileSpreadsheet size={20} />}
          label="Unreconciled"
          value={stats.unreconciled}
          tone="orange"
          to="/app/accounts/reconciliation"
        />
      </div>

      <Card className="mt-4 p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-800">Quick access</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {LINKS.map((l) => {
            const Icon = l.icon
            return (
              <AppLink
                key={l.to}
                to={l.to}
                className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-3 text-center transition-all hover:-translate-y-px hover:border-brand-300 hover:shadow-sm"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-600">
                  <Icon size={18} />
                </span>
                <span className="text-xs font-medium text-slate-700">{l.label}</span>
              </AppLink>
            )
          })}
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
            <Receipt size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-800">Import a bank statement</p>
            <p className="text-xs text-slate-500">
              Upload CSV/Excel → auto-classify → review → post to Payments/Receipts with balanced
              journals.
            </p>
          </div>
          <AppLink to="/app/accounts/bank-import" className="btn-primary btn-sm ml-auto">
            <Upload size={15} /> Import
          </AppLink>
        </div>
      </Card>
    </div>
  )
}
