import { Landmark } from 'lucide-react'
import { MasterManager } from '@/features/hrm/components/MasterManager'
import { useFinanceAccess } from '../access'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useAccounts, useBankAccounts } from '../hooks/useFinance'
import type { BankAccount } from '../types'
import type { DataTableColumn } from '@/components/common/DataTable'
import { Badge, Field, Input, Select } from '@/components/ui/primitives'
import { currency } from '@/lib/format'

const maskAcct = (n?: string) => (n && n.length > 4 ? `••••${n.slice(-4)}` : n || '—')

export function BankAccountsPage() {
  const { list, create, update, remove } = useBankAccounts()
  const companies = useCompanies().data ?? []
  const accounts = (useAccounts().list.data ?? []).filter((a) => !a.isGroup && a.type === 'asset')
  const perms = useFinanceAccess()
  const canWrite = perms.can('BANK_MANAGE')

  const columns: DataTableColumn<BankAccount>[] = [
    { key: 'name', header: 'Account', cellClassName: 'font-semibold', render: (b) => b.name },
    { key: 'bank', header: 'Bank', render: (b) => b.bankName || '—' },
    {
      key: 'number',
      header: 'A/C No.',
      cellClassName: 'font-mono text-xs',
      render: (b) => maskAcct(b.accountNumber),
    },
    {
      key: 'ifsc',
      header: 'IFSC',
      cellClassName: 'font-mono text-xs',
      render: (b) => b.ifsc || '—',
    },
    {
      key: 'opening',
      header: 'Opening',
      cellClassName: 'tnum text-right',
      headerClassName: 'text-right',
      render: (b) => currency(b.openingBalance),
    },
    {
      key: 'status',
      header: 'Status',
      render: (b) => (
        <Badge tone={b.active ? 'green' : 'slate'}>{b.active ? 'Active' : 'Inactive'}</Badge>
      ),
    },
  ]

  return (
    <MasterManager<BankAccount>
      title="Bank Accounts"
      subtitle="Company bank accounts. Numbers are masked; each links to a ledger account."
      addLabel="Add Bank Account"
      emptyIcon={<Landmark size={40} />}
      emptyTitle="No bank accounts"
      rows={list.data ?? []}
      loading={list.isLoading}
      columns={columns}
      canWrite={canWrite}
      search={(b, q) =>
        b.name.toLowerCase().includes(q) || (b.bankName ?? '').toLowerCase().includes(q)
      }
      emptyDraft={() => ({ name: '', active: true, openingBalance: 0, accountType: 'current' })}
      toDraft={(b) => ({ ...b })}
      validate={(d) => (!String(d.name).trim() ? 'Account name is required' : null)}
      onCreate={(d) => create.mutateAsync(d as Partial<BankAccount>)}
      onUpdate={(id, d) => update.mutateAsync({ id, patch: d as Partial<BankAccount> })}
      onDelete={(b) => remove.mutateAsync(b.id)}
      renderForm={(draft, patch) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Account name" required>
            <Input
              value={String(draft.name ?? '')}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="HDFC Current A/C"
            />
          </Field>
          <Field label="Company">
            <Select
              value={String(draft.companyId ?? '')}
              onChange={(e) => patch({ companyId: e.target.value || undefined })}
            >
              <option value="">—</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Bank name">
            <Input
              value={String(draft.bankName ?? '')}
              onChange={(e) => patch({ bankName: e.target.value })}
            />
          </Field>
          <Field label="Account number">
            <Input
              value={String(draft.accountNumber ?? '')}
              onChange={(e) => patch({ accountNumber: e.target.value })}
            />
          </Field>
          <Field label="IFSC">
            <Input
              value={String(draft.ifsc ?? '')}
              onChange={(e) => patch({ ifsc: e.target.value })}
            />
          </Field>
          <Field label="Branch">
            <Input
              value={String(draft.branch ?? '')}
              onChange={(e) => patch({ branch: e.target.value })}
            />
          </Field>
          <Field label="Account type">
            <Select
              value={String(draft.accountType ?? 'current')}
              onChange={(e) => patch({ accountType: e.target.value })}
            >
              <option value="current">Current</option>
              <option value="savings">Savings</option>
              <option value="cc">Cash Credit</option>
              <option value="od">Overdraft</option>
            </Select>
          </Field>
          <Field label="Opening balance">
            <Input
              type="number"
              value={String(draft.openingBalance ?? 0)}
              onChange={(e) => patch({ openingBalance: Number(e.target.value) })}
            />
          </Field>
          <Field
            label="Ledger account"
            className="sm:col-span-2"
            hint="Bank transactions post against this ledger account."
          >
            <Select
              value={String(draft.ledgerAccountId ?? '')}
              onChange={(e) => patch({ ledgerAccountId: e.target.value || undefined })}
            >
              <option value="">— Use default Bank account —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={draft.active === false ? 'inactive' : 'active'}
              onChange={(e) => patch({ active: e.target.value === 'active' })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        </div>
      )}
    />
  )
}
