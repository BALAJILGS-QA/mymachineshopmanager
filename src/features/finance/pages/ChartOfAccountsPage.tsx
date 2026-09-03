import { Landmark } from 'lucide-react'
import { MasterManager } from '@/features/hrm/components/MasterManager'
import { useFinanceAccess } from '../access'
import { useAccounts } from '../hooks/useFinance'
import type { Account, AccountType } from '../types'
import type { DataTableColumn } from '@/components/common/DataTable'
import { Badge, Field, Input, Select } from '@/components/ui/primitives'

const TYPE_TONE: Record<AccountType, string> = {
  asset: 'blue',
  liability: 'amber',
  equity: 'violet',
  income: 'green',
  expense: 'red',
}

export function ChartOfAccountsPage() {
  const { list, create, update, remove } = useAccounts()
  const perms = useFinanceAccess()
  const canWrite = perms.can('ACCOUNTS_MANAGE')
  const accounts = [...(list.data ?? [])].sort((a, b) => a.code.localeCompare(b.code))
  const parentName = (id?: string) => accounts.find((a) => a.id === id)?.name ?? '—'

  const columns: DataTableColumn<Account>[] = [
    { key: 'code', header: 'Code', cellClassName: 'font-mono text-xs', render: (a) => a.code },
    {
      key: 'name',
      header: 'Account',
      cellClassName: 'font-semibold',
      render: (a) => (
        <span className={a.isGroup ? 'font-bold text-slate-900' : ''}>
          {a.name}
          {a.systemKey && (
            <span className="ml-2 text-2xs font-normal text-slate-400">[{a.systemKey}]</span>
          )}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (a) => <Badge tone={TYPE_TONE[a.type]}>{a.type}</Badge>,
    },
    { key: 'parent', header: 'Parent', render: (a) => (a.parentId ? parentName(a.parentId) : '—') },
    { key: 'group', header: 'Postable', render: (a) => (a.isGroup ? 'Group' : 'Yes') },
  ]

  return (
    <MasterManager<Account>
      title="Chart of Accounts"
      subtitle="Hierarchical, configurable accounts underpinning the double-entry ledger"
      addLabel="Add Account"
      emptyIcon={<Landmark size={40} />}
      emptyTitle="No accounts"
      rows={accounts}
      loading={list.isLoading}
      columns={columns}
      canWrite={canWrite}
      modalSize="lg"
      search={(a, q) => a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q)}
      emptyDraft={() => ({
        code: '',
        name: '',
        type: 'asset',
        isGroup: false,
        gstRelevant: false,
        active: true,
        openingBalance: 0,
      })}
      toDraft={(a) => ({ ...a })}
      validate={(d) =>
        !String(d.name).trim()
          ? 'Name is required'
          : !String(d.code).trim()
            ? 'Code is required'
            : null
      }
      onCreate={(d) => create.mutateAsync(d as Partial<Account>)}
      onUpdate={(id, d) => update.mutateAsync({ id, patch: d as Partial<Account> })}
      onDelete={(a) => remove.mutateAsync(a.id)}
      deleteLabel={(a) => `Delete account "${a.name}"`}
      renderForm={(draft, patch) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Code" required>
            <Input
              value={String(draft.code ?? '')}
              onChange={(e) => patch({ code: e.target.value })}
              placeholder="1102"
            />
          </Field>
          <Field label="Name" required>
            <Input
              value={String(draft.name ?? '')}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Bank Accounts"
            />
          </Field>
          <Field label="Type" required>
            <Select
              value={String(draft.type ?? 'asset')}
              onChange={(e) => patch({ type: e.target.value })}
            >
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
              <option value="equity">Equity</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </Select>
          </Field>
          <Field label="Parent account">
            <Select
              value={String(draft.parentId ?? '')}
              onChange={(e) => patch({ parentId: e.target.value || undefined })}
            >
              <option value="">— None —</option>
              {accounts
                .filter((a) => a.isGroup)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Is group (header)">
            <Select
              value={draft.isGroup ? 'yes' : 'no'}
              onChange={(e) => patch({ isGroup: e.target.value === 'yes' })}
            >
              <option value="no">No — postable account</option>
              <option value="yes">Yes — group header</option>
            </Select>
          </Field>
          <Field label="Opening balance">
            <Input
              type="number"
              value={String(draft.openingBalance ?? 0)}
              onChange={(e) => patch({ openingBalance: Number(e.target.value) })}
            />
          </Field>
          <Field label="GST relevant">
            <Select
              value={draft.gstRelevant ? 'yes' : 'no'}
              onChange={(e) => patch({ gstRelevant: e.target.value === 'yes' })}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
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
