import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Plus, Shield, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Badge, Card, Field, Input, Select } from '@/components/ui/primitives'
import { MasterManager } from '../components/MasterManager'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { toUserMessage } from '@/lib/api/errors'
import { fmtDateTime } from '@/lib/format'
import {
  useExpenseCategories,
  useHrAuditLog,
  useHrRoles,
  useHrSettings,
  useLeaveTypes,
  usePermissionCatalog,
  useRoleActions,
  useSalaryComponents,
  useSaveHrSettings,
  useUserRoles,
} from '../hooks/useHrm'
import { usePermissions } from '../permissions'
import type {
  ExpenseCategory,
  HrAuditEntry,
  HrUserRole,
  LeaveType,
  SalaryComponent,
} from '../types'

const TABS = [
  'Employee ID',
  'Roles & Access',
  'Leave Types',
  'Payroll Components',
  'Expense Categories',
  'Audit Log',
] as const
type Tab = (typeof TABS)[number]

export function HrSettingsPage() {
  const perms = usePermissions()
  const canManage = perms.can('HR_SETTINGS_MANAGE')
  const canRoles = perms.can('ROLE_MANAGE')
  const [tab, setTab] = useState<Tab>('Employee ID')

  const visibleTabs = TABS.filter((t) => (t === 'Roles & Access' ? canRoles : true)).filter((t) =>
    t === 'Audit Log' ? perms.can('AUDIT_VIEW') : true,
  )

  return (
    <div>
      <PageHeader
        title="HR Settings"
        subtitle="Configure employee numbering, roles, leave, payroll and review the audit trail"
      />

      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {visibleTabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Employee ID' && <EmployeeIdSettings canManage={canManage} />}
      {tab === 'Roles & Access' && canRoles && <RolesSettings />}
      {tab === 'Leave Types' && (
        <LeaveTypesSettings canManage={perms.can('HOLIDAY_MANAGE') || canManage} />
      )}
      {tab === 'Payroll Components' && (
        <PayrollComponentsSettings canManage={perms.can('PAYROLL_PROCESS') || canManage} />
      )}
      {tab === 'Expense Categories' && (
        <ExpenseCategoriesSettings canManage={perms.can('EXPENSE_APPROVE') || canManage} />
      )}
      {tab === 'Audit Log' && perms.can('AUDIT_VIEW') && <AuditLogView />}
    </div>
  )
}

// ---- Employee ID -----------------------------------------------------------
function EmployeeIdSettings({ canManage }: { canManage: boolean }) {
  const { data: settings } = useHrSettings()
  const save = useSaveHrSettings()
  const toast = useToast()
  const [prefix, setPrefix] = useState('EMP-')
  const [padding, setPadding] = useState(6)
  const [next, setNext] = useState(1)

  useEffect(() => {
    const cfg = settings?.employeeCode
    if (cfg) {
      setPrefix(cfg.prefix ?? 'EMP-')
      setPadding(cfg.padding ?? 6)
      setNext(cfg.next ?? 1)
    }
  }, [settings])

  const preview = `${prefix}${String(next).padStart(padding, '0')}`

  async function onSave() {
    try {
      await save.mutateAsync({ employeeCode: { prefix, padding, next } })
      toast.success('Employee ID settings saved')
    } catch (e) {
      toast.error(toUserMessage(e, 'Save failed'))
    }
  }

  return (
    <Card className="max-w-lg p-5">
      <h3 className="mb-1 text-sm font-bold text-slate-800">Employee code format</h3>
      <p className="mb-4 text-xs text-slate-500">
        Codes are generated automatically and are immutable once assigned.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Prefix">
          <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} disabled={!canManage} />
        </Field>
        <Field label="Padding">
          <Input
            type="number"
            value={String(padding)}
            onChange={(e) => setPadding(Number(e.target.value))}
            disabled={!canManage}
          />
        </Field>
        <Field label="Next number">
          <Input
            type="number"
            value={String(next)}
            onChange={(e) => setNext(Number(e.target.value))}
            disabled={!canManage}
          />
        </Field>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        Preview: <span className="font-mono font-semibold text-slate-900">{preview}</span>
      </p>
      {canManage && (
        <button className="btn-primary btn-sm mt-4" onClick={onSave} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      )}
    </Card>
  )
}

// ---- Roles & Access --------------------------------------------------------
function RolesSettings() {
  const roles = useHrRoles().data ?? []
  const userRoles = useUserRoles().data ?? []
  const catalog = usePermissionCatalog().data ?? []
  const { assign, revoke } = useRoleActions()
  const toast = useToast()
  const confirm = useConfirm()
  const [email, setEmail] = useState('')
  const [roleKey, setRoleKey] = useState('')

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id

  async function onAssign() {
    if (!email.trim() || !roleKey) return toast.error('Enter an email and pick a role')
    try {
      await assign.mutateAsync({ email: email.trim(), roleKey })
      toast.success('Role assigned')
      setEmail('')
    } catch (e) {
      toast.error(toUserMessage(e, 'Could not assign role'))
    }
  }

  async function onRevoke(ur: HrUserRole) {
    const role = roles.find((r) => r.id === ur.roleId)
    const ok = await confirm({
      title: 'Revoke role',
      message: `Revoke ${role?.name} from ${ur.email}?`,
      danger: true,
      confirmLabel: 'Revoke',
    })
    if (!ok) return
    try {
      await revoke.mutateAsync({ email: ur.email, roleKey: role?.key ?? '' })
      toast.success('Role revoked')
    } catch (e) {
      toast.error(toUserMessage(e, 'Could not revoke role'))
    }
  }

  const cols: DataTableColumn<HrUserRole>[] = [
    { key: 'email', header: 'User', cellClassName: 'font-medium', render: (u) => u.email },
    {
      key: 'role',
      header: 'Role',
      render: (u) => <Badge tone="violet">{roleName(u.roleId)}</Badge>,
    },
    { key: 'scope', header: 'Company', render: (u) => u.companyId || 'All companies' },
    {
      key: 'actions',
      header: '',
      headerClassName: 'text-right',
      render: (u) => (
        <div className="flex justify-end">
          <button
            className="btn-ghost btn-sm text-red-500"
            onClick={() => onRevoke(u)}
            title="Revoke"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ]

  const byModule = catalog.reduce<Record<string, typeof catalog>>((acc, p) => {
    ;(acc[p.module] ??= []).push(p)
    return acc
  }, {})

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-bold text-slate-800">Assign a role</h3>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="User email" className="min-w-[16rem] flex-1">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@company.com"
              />
            </Field>
            <Field label="Role" className="w-48">
              <Select value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
                <option value="">— Select —</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.key}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <button className="btn-primary btn-sm" onClick={onAssign} disabled={assign.isPending}>
              <Plus size={15} /> Assign
            </button>
          </div>
        </Card>

        <Card>
          <DataTable
            columns={cols}
            rows={userRoles}
            rowKey={(u) => u.id}
            empty={{
              icon: <Shield size={40} />,
              title: 'No role assignments',
              description: 'Assign roles to grant HR access.',
            }}
          />
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-bold text-slate-800">Permission catalog</h3>
        <div className="space-y-3">
          {Object.entries(byModule).map(([mod, perms]) => (
            <div key={mod}>
              <p className="text-2xs font-bold uppercase tracking-wide text-slate-400">{mod}</p>
              <ul className="mt-1 space-y-0.5">
                {perms.map((p) => (
                  <li key={p.key} className="text-xs text-slate-600">
                    {p.label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ---- Leave Types -----------------------------------------------------------
function LeaveTypesSettings({ canManage }: { canManage: boolean }) {
  const { list, create, update, remove } = useLeaveTypes()
  const columns: DataTableColumn<LeaveType>[] = [
    { key: 'code', header: 'Code', cellClassName: 'font-mono text-xs', render: (t) => t.code },
    { key: 'name', header: 'Leave type', cellClassName: 'font-semibold', render: (t) => t.name },
    { key: 'quota', header: 'Quota/yr', cellClassName: 'tnum', render: (t) => t.annualQuota },
    {
      key: 'paid',
      header: 'Paid',
      render: (t) => (
        <Badge tone={t.isPaid ? 'green' : 'slate'}>{t.isPaid ? 'Paid' : 'Unpaid'}</Badge>
      ),
    },
    { key: 'cf', header: 'Carry fwd', render: (t) => (t.carryForward ? 'Yes' : 'No') },
  ]
  return (
    <MasterManager<LeaveType>
      title="Leave Types"
      subtitle="Configure leave categories, quotas and policies"
      addLabel="Add Leave Type"
      rows={list.data ?? []}
      loading={list.isLoading}
      columns={columns}
      canWrite={canManage}
      search={(t, q) => t.name.toLowerCase().includes(q)}
      emptyDraft={() => ({
        code: '',
        name: '',
        isPaid: true,
        annualQuota: 0,
        accrual: 'yearly',
        allowHalfDay: true,
        active: true,
      })}
      toDraft={(t) => ({ ...t })}
      validate={(d) =>
        !String(d.name).trim()
          ? 'Name is required'
          : !String(d.code).trim()
            ? 'Code is required'
            : null
      }
      onCreate={(d) => create.mutateAsync(d as Partial<LeaveType>)}
      onUpdate={(id, d) => update.mutateAsync({ id, patch: d as Partial<LeaveType> })}
      onDelete={(t) => remove.mutateAsync(t.id)}
      renderForm={(draft, patch) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Code" required>
            <Input
              value={String(draft.code ?? '')}
              onChange={(e) => patch({ code: e.target.value })}
              placeholder="CL"
            />
          </Field>
          <Field label="Name" required>
            <Input
              value={String(draft.name ?? '')}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Casual Leave"
            />
          </Field>
          <Field label="Annual quota (days)">
            <Input
              type="number"
              value={String(draft.annualQuota ?? 0)}
              onChange={(e) => patch({ annualQuota: Number(e.target.value) })}
            />
          </Field>
          <Field label="Accrual">
            <Select
              value={String(draft.accrual ?? 'yearly')}
              onChange={(e) => patch({ accrual: e.target.value })}
            >
              <option value="yearly">Yearly</option>
              <option value="monthly">Monthly</option>
              <option value="none">None</option>
            </Select>
          </Field>
          <Field label="Paid">
            <Select
              value={draft.isPaid === false ? 'no' : 'yes'}
              onChange={(e) => patch({ isPaid: e.target.value === 'yes' })}
            >
              <option value="yes">Paid</option>
              <option value="no">Unpaid</option>
            </Select>
          </Field>
          <Field label="Carry forward">
            <Select
              value={draft.carryForward ? 'yes' : 'no'}
              onChange={(e) => patch({ carryForward: e.target.value === 'yes' })}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          </Field>
          <Field label="Allow half day">
            <Select
              value={draft.allowHalfDay === false ? 'no' : 'yes'}
              onChange={(e) => patch({ allowHalfDay: e.target.value === 'yes' })}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
          <Field label="Allow negative balance">
            <Select
              value={draft.allowNegative ? 'yes' : 'no'}
              onChange={(e) => patch({ allowNegative: e.target.value === 'yes' })}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          </Field>
        </div>
      )}
    />
  )
}

// ---- Payroll components ----------------------------------------------------
function PayrollComponentsSettings({ canManage }: { canManage: boolean }) {
  const { list, create, update, remove } = useSalaryComponents()
  const columns: DataTableColumn<SalaryComponent>[] = [
    { key: 'code', header: 'Code', cellClassName: 'font-mono text-xs', render: (c) => c.code },
    { key: 'name', header: 'Component', cellClassName: 'font-semibold', render: (c) => c.name },
    {
      key: 'kind',
      header: 'Kind',
      render: (c) => <Badge tone={c.kind === 'earning' ? 'green' : 'red'}>{c.kind}</Badge>,
    },
    {
      key: 'calc',
      header: 'Calculation',
      cellClassName: 'text-xs',
      render: (c) => c.calcType.replace(/_/g, ' '),
    },
    { key: 'statutory', header: 'Statutory', render: (c) => (c.isStatutory ? 'Yes' : 'No') },
  ]
  return (
    <MasterManager<SalaryComponent>
      title="Payroll Components"
      subtitle="Configurable earnings and deductions used by salary structures"
      addLabel="Add Component"
      rows={list.data ?? []}
      loading={list.isLoading}
      columns={columns}
      canWrite={canManage}
      search={(c, q) => c.name.toLowerCase().includes(q)}
      emptyDraft={() => ({
        code: '',
        name: '',
        kind: 'earning',
        calcType: 'fixed',
        taxable: true,
        isStatutory: false,
        sort: 0,
        active: true,
      })}
      toDraft={(c) => ({ ...c })}
      validate={(d) =>
        !String(d.name).trim()
          ? 'Name is required'
          : !String(d.code).trim()
            ? 'Code is required'
            : null
      }
      onCreate={(d) => create.mutateAsync(d as Partial<SalaryComponent>)}
      onUpdate={(id, d) => update.mutateAsync({ id, patch: d as Partial<SalaryComponent> })}
      onDelete={(c) => remove.mutateAsync(c.id)}
      renderForm={(draft, patch) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Code" required>
            <Input
              value={String(draft.code ?? '')}
              onChange={(e) => patch({ code: e.target.value })}
              placeholder="BASIC"
            />
          </Field>
          <Field label="Name" required>
            <Input
              value={String(draft.name ?? '')}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Basic Salary"
            />
          </Field>
          <Field label="Kind">
            <Select
              value={String(draft.kind ?? 'earning')}
              onChange={(e) => patch({ kind: e.target.value })}
            >
              <option value="earning">Earning</option>
              <option value="deduction">Deduction</option>
            </Select>
          </Field>
          <Field label="Calculation">
            <Select
              value={String(draft.calcType ?? 'fixed')}
              onChange={(e) => patch({ calcType: e.target.value })}
            >
              <option value="fixed">Fixed amount</option>
              <option value="percent_of_basic">% of basic</option>
              <option value="percent_of_gross">% of gross</option>
            </Select>
          </Field>
          <Field label="Statutory">
            <Select
              value={draft.isStatutory ? 'yes' : 'no'}
              onChange={(e) => patch({ isStatutory: e.target.value === 'yes' })}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          </Field>
          <Field label="Taxable">
            <Select
              value={draft.taxable === false ? 'no' : 'yes'}
              onChange={(e) => patch({ taxable: e.target.value === 'yes' })}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
          <Field label="Sort order">
            <Input
              type="number"
              value={String(draft.sort ?? 0)}
              onChange={(e) => patch({ sort: Number(e.target.value) })}
            />
          </Field>
        </div>
      )}
    />
  )
}

// ---- Expense categories ----------------------------------------------------
function ExpenseCategoriesSettings({ canManage }: { canManage: boolean }) {
  const { list, create, update, remove } = useExpenseCategories()
  const columns: DataTableColumn<ExpenseCategory>[] = [
    { key: 'code', header: 'Code', cellClassName: 'font-mono text-xs', render: (c) => c.code },
    { key: 'name', header: 'Category', cellClassName: 'font-semibold', render: (c) => c.name },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <Badge tone={c.active ? 'green' : 'slate'}>{c.active ? 'Active' : 'Inactive'}</Badge>
      ),
    },
  ]
  return (
    <MasterManager<ExpenseCategory>
      title="Expense Categories"
      subtitle="Categories used when employees raise expense claims"
      addLabel="Add Category"
      rows={list.data ?? []}
      loading={list.isLoading}
      columns={columns}
      canWrite={canManage}
      search={(c, q) => c.name.toLowerCase().includes(q)}
      emptyDraft={() => ({ code: '', name: '', active: true })}
      toDraft={(c) => ({ ...c })}
      validate={(d) =>
        !String(d.name).trim()
          ? 'Name is required'
          : !String(d.code).trim()
            ? 'Code is required'
            : null
      }
      onCreate={(d) => create.mutateAsync(d as Partial<ExpenseCategory>)}
      onUpdate={(id, d) => update.mutateAsync({ id, patch: d as Partial<ExpenseCategory> })}
      onDelete={(c) => remove.mutateAsync(c.id)}
      renderForm={(draft, patch) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Code" required>
            <Input
              value={String(draft.code ?? '')}
              onChange={(e) => patch({ code: e.target.value })}
              placeholder="TRAVEL"
            />
          </Field>
          <Field label="Name" required>
            <Input
              value={String(draft.name ?? '')}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Travel"
            />
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

// ---- Audit log -------------------------------------------------------------
function AuditLogView() {
  const { data: entries = [], isLoading } = useHrAuditLog()
  const cols: DataTableColumn<HrAuditEntry>[] = [
    {
      key: 'at',
      header: 'When',
      cellClassName: 'whitespace-nowrap text-xs text-slate-500',
      render: (e) => fmtDateTime(e.at),
    },
    { key: 'actor', header: 'Actor', render: (e) => e.actorEmail || '—' },
    { key: 'action', header: 'Action', render: (e) => <Badge tone="blue">{e.action}</Badge> },
    {
      key: 'entity',
      header: 'Entity',
      cellClassName: 'text-xs',
      render: (e) => `${e.entity}${e.entityId ? ` · ${e.entityId}` : ''}`,
    },
    {
      key: 'summary',
      header: 'Summary',
      render: (e) => <span className="text-xs text-slate-600">{e.summary || '—'}</span>,
    },
  ]
  return (
    <Card>
      <DataTable
        columns={cols}
        rows={entries}
        rowKey={(e) => e.id}
        loading={isLoading}
        minWidthClassName="min-w-[52rem]"
        empty={{
          icon: <Shield size={40} />,
          title: 'No audit entries',
          description: 'Sensitive HR actions will be recorded here.',
        }}
      />
    </Card>
  )
}
