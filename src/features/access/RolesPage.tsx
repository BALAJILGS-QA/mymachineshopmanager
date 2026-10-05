import { useEffect, useMemo, useState } from 'react'
import { useAppNavigate } from '@/components/nav/app-link'
import { ArrowUpDown, KeyRound, Lock, ShieldCheck, SlidersHorizontal, UserCog } from 'lucide-react'
import type { AppUser, UserRole } from '@/types'
import { useUsers, useUpdateUserAccess } from '@/features/approvals/hooks/useUsers'
import { useUserSubscriptions } from '@/features/subscription/hooks/useSubscription'
import type { UserSubscription } from '@/features/subscription/api/subscriptionApi'
import { SubscriptionDrawer } from '@/features/subscription/SubscriptionDrawer'
import {
  billingLabel,
  planLabel,
  remainingPhrase,
  statusDot,
  statusTone,
  allStatuses,
} from '@/features/subscription/subscriptionView'
import { toUserMessage } from '@/lib/api/errors'
import { useAuth } from '@/features/auth/auth'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { FilterBar, SearchBox } from '@/components/common/Filters'
import { Badge, Card, EmptyState } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import {
  MODULES,
  accessSummary,
  canManageRoles,
  grantableKeysFor,
  isModuleKey,
  mergeSavedPermissions,
  scopeUsersForManager,
} from './modules'
import type { ModuleKey } from '@/components/layout/nav'

const ROLE_TONE: Record<UserRole, string> = {
  SuperAdmin: 'violet',
  Admin: 'blue',
  User: 'slate',
}

const PLAN_OPTIONS = [
  { value: 'all', label: 'All plans' },
  { value: 'trial', label: 'Free Trial' },
  { value: 'starter', label: 'Starter' },
  { value: 'professional', label: 'Professional' },
  { value: 'enterprise', label: 'Enterprise' },
]

const SORT_OPTIONS = [
  { value: 'name', label: 'Default (name)' },
  { value: 'trialEnd', label: 'Trial end date' },
  { value: 'daysRemaining', label: 'Days remaining' },
  { value: 'upgradeDate', label: 'Upgrade date' },
  { value: 'subStart', label: 'Subscription start' },
  { value: 'nextRenewal', label: 'Next renewal' },
] as const
type SortKey = (typeof SORT_OPTIONS)[number]['value']
type QuickFilter = 'none' | 'ending' | 'upgraded' | 'expired'

// Nulls-last comparator used for the subscription sort columns.
function compareNullsLast(a: unknown, b: unknown, dir: 'asc' | 'desc'): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  const base =
    typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))
  return dir === 'asc' ? base : -base
}

function sortValue(sub: UserSubscription | undefined, key: SortKey): string | number | null {
  if (!sub) return null
  switch (key) {
    case 'trialEnd':
      return sub.trialEndDate
    case 'daysRemaining':
      return sub.daysRemaining
    case 'upgradeDate':
      return sub.upgradeDate
    case 'subStart':
      return sub.subscriptionStartDate
    case 'nextRenewal':
      return sub.nextRenewalDate
    default:
      return null
  }
}

// Two managers share this page:
//  • the super admin — sees every approved user, can change roles and grant any module;
//  • an Admin (shop user) — sees only their own shop's Users (same companyName) and can
//    grant only the modules they themselves hold; cannot change roles or approve users.
// The scoping/grant/merge rules are pure functions in ./modules (unit-tested).

export function RolesPage() {
  const { isSuperAdmin, session } = useAuth()
  const navigate = useAppNavigate()
  const { data: users = [] } = useUsers()
  // Subscription data is super-admin only (DB-enforced); the query is disabled for
  // Admins so the existing role-management flow is completely unaffected.
  const { data: subs = [] } = useUserSubscriptions(isSuperAdmin)
  const toast = useToast()
  const updateAccess = useUpdateUserAccess()
  const [editing, setEditing] = useState<AppUser | null>(null)
  const [viewing, setViewing] = useState<AppUser | null>(null)

  // Subscription view filters/sort (super admin only).
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [quick, setQuick] = useState<QuickFilter>('none')
  const [sortBy, setSortBy] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const subByEmail = useMemo(() => new Map(subs.map((s) => [s.email.toLowerCase(), s])), [subs])

  // The current manager's own record (undefined for the email-based super admin).
  const me = useMemo(
    () => users.find((u) => u.email.toLowerCase() === (session?.email ?? '').toLowerCase()),
    [users, session?.email],
  )
  const ctx = { isSuperAdmin, me }
  const canManage = canManageRoles(ctx)
  const allowedKeys = useMemo(() => grantableKeysFor(ctx), [isSuperAdmin, me])
  const managed = useMemo(() => scopeUsersForManager(ctx, users), [users, isSuperAdmin, me])

  // Apply subscription search / filters / sort (super admin only). Admins get the
  // unmodified `managed` list and none of these controls render.
  const rows = useMemo(() => {
    if (!isSuperAdmin) return managed
    const q = search.trim().toLowerCase()
    let list = managed.filter((u) => {
      const s = subByEmail.get(u.email.toLowerCase())
      if (q) {
        const hay = [u.fullName, u.email, u.companyName, planLabel(s?.plan)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (planFilter !== 'all' && (s?.plan ?? '') !== planFilter) return false
      if (statusFilter !== 'all' && (s?.displayStatus ?? '') !== statusFilter) return false
      if (quick === 'ending' && !(s?.displayStatus === 'Trial' && (s?.daysRemaining ?? 999) <= 7))
        return false
      if (quick === 'upgraded' && !s?.upgradeDate) return false
      if (quick === 'expired' && s?.displayStatus !== 'Trial Expired') return false
      return true
    })
    if (sortBy !== 'name') {
      list = [...list].sort((a, b) =>
        compareNullsLast(
          sortValue(subByEmail.get(a.email.toLowerCase()), sortBy),
          sortValue(subByEmail.get(b.email.toLowerCase()), sortBy),
          sortDir,
        ),
      )
    }
    return list
  }, [managed, subByEmail, isSuperAdmin, search, planFilter, statusFilter, quick, sortBy, sortDir])

  const viewingSub = viewing ? subByEmail.get(viewing.email.toLowerCase()) : undefined

  // Guard AFTER the hooks so hook order stays stable across renders.
  useEffect(() => {
    if (!canManage) navigate('/app', { replace: true })
  }, [canManage, navigate])
  if (!canManage) return null

  async function onSave(role: UserRole, keys: ModuleKey[]) {
    if (!editing) return
    try {
      const permissions = mergeSavedPermissions({
        role,
        allowedKeys,
        checked: keys,
        existing: editing.permissions,
      })
      await updateAccess.mutateAsync({ id: editing.id, role, permissions })
      toast.success(`Access updated for ${editing.fullName || editing.email}`)
      setEditing(null)
    } catch (e) {
      toast.error(toUserMessage(e, 'Could not update access'))
    }
  }

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        subtitle={
          isSuperAdmin
            ? 'Assign roles and choose which modules each approved user can access.'
            : 'Grant your shop’s users access to the modules you manage.'
        }
      />

      {isSuperAdmin && (
        <FilterBar>
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search name, email, company or plan…"
          />
          <div>
            <label className="label">Plan</label>
            <select
              className="input"
              aria-label="Filter by plan"
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
            >
              {PLAN_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select
              className="input"
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              {allStatuses().map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Sort by</label>
            <div className="flex items-center gap-1.5">
              <select
                className="input"
                aria-label="Sort by"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-secondary btn-sm"
                aria-label="Toggle sort direction"
                title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              >
                <ArrowUpDown size={14} />
                {sortDir === 'asc' ? 'Asc' : 'Desc'}
              </button>
            </div>
          </div>
          <div>
            <label className="label">Quick filters</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['ending', 'Trial ending soon'],
                  ['upgraded', 'Upgraded users'],
                  ['expired', 'Expired trials'],
                ] as [QuickFilter, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setQuick((q) => (q === key ? 'none' : key))}
                  className={
                    quick === key
                      ? 'rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white'
                      : 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50'
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </FilterBar>
      )}

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<UserCog size={40} />}
            title={
              isSuperAdmin &&
              (search || planFilter !== 'all' || statusFilter !== 'all' || quick !== 'none')
                ? 'No users match these filters'
                : isSuperAdmin
                  ? 'No approved users yet'
                  : 'No users in your shop yet'
            }
            description={
              isSuperAdmin
                ? 'Approve registrations first — approved users appear here for role and module assignment.'
                : 'Users who register with your company name and are approved by the super admin will appear here.'
            }
          />
        ) : (
          <ResponsiveTable className={isSuperAdmin ? 'min-w-[64rem]' : 'min-w-[48rem]'}>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">User</th>
                <th className="th">Company</th>
                <th className="th">Role</th>
                <th className="th">Module Access</th>
                {isSuperAdmin && <th className="th">Plan &amp; Status</th>}
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((u) => {
                const role: UserRole = u.role ?? 'User'
                const sub = subByEmail.get(u.email.toLowerCase())
                return (
                  <tr key={u.id} className="hover:bg-slate-50/60">
                    <td className="td">
                      <div className="font-semibold text-slate-900">{u.fullName || '—'}</div>
                      <div className="text-2xs text-slate-500">{u.email}</div>
                    </td>
                    <td className="td">{u.companyName || '—'}</td>
                    <td className="td">
                      <Badge tone={ROLE_TONE[role]}>{role}</Badge>
                    </td>
                    <td className="td text-slate-700">{accessSummary(u)}</td>
                    {isSuperAdmin && (
                      <td className="td">
                        {sub ? (
                          <button
                            type="button"
                            onClick={() => setViewing(u)}
                            className="group text-left"
                            title="View subscription details"
                          >
                            <Badge tone={statusTone(sub.displayStatus)}>
                              {statusDot(sub.displayStatus)} {sub.displayStatus}
                            </Badge>
                            <div className="mt-1 text-2xs text-slate-500">
                              {planLabel(sub.plan)}
                              {sub.displayStatus === 'Trial' && remainingPhrase(sub)
                                ? ` · ${remainingPhrase(sub)}`
                                : ''}
                              {sub.billingCycle ? ` · ${billingLabel(sub.billingCycle)}` : ''}
                            </div>
                            <div className="text-2xs font-semibold text-brand-600 opacity-0 transition group-hover:opacity-100">
                              View details →
                            </div>
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    )}
                    <td className="td">
                      <div className="flex justify-end">
                        <button className="btn-secondary btn-sm" onClick={() => setEditing(u)}>
                          <SlidersHorizontal size={14} /> Manage access
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </ResponsiveTable>
        )}
      </Card>

      <p className="mt-3 flex items-center gap-1.5 text-2xs text-slate-500">
        <ShieldCheck size={13} />
        {isSuperAdmin
          ? 'Only the super admin can manage roles and module access.'
          : 'You can grant module access to users in your shop. Roles and approvals are handled by the super admin.'}
      </p>

      {editing && (
        <AccessEditor
          user={editing}
          allowedKeys={allowedKeys}
          canEditRole={isSuperAdmin}
          saving={updateAccess.isPending}
          onClose={() => setEditing(null)}
          onSave={onSave}
        />
      )}

      {/* Super-admin subscription detail — read-only. */}
      {isSuperAdmin && viewing && viewingSub && (
        <SubscriptionDrawer user={viewing} sub={viewingSub} onClose={() => setViewing(null)} />
      )}
    </div>
  )
}

// Modal editor: role selector (super admin only) + per-module checkboxes limited
// to the modules the current manager is allowed to grant.
function AccessEditor({
  user,
  allowedKeys,
  canEditRole,
  saving,
  onClose,
  onSave,
}: {
  user: AppUser
  allowedKeys: ModuleKey[]
  canEditRole: boolean
  saving: boolean
  onClose: () => void
  onSave: (role: UserRole, keys: ModuleKey[]) => void
}) {
  // A scoped Admin can only ever set role 'User'; the super admin may pick either.
  const [role, setRole] = useState<UserRole>(
    canEditRole && user.role === 'Admin' ? 'Admin' : 'User',
  )
  const [keys, setKeys] = useState<Set<ModuleKey>>(
    () =>
      new Set((user.permissions ?? []).filter(isModuleKey).filter((k) => allowedKeys.includes(k))),
  )
  const grantable = MODULES.filter((m) => allowedKeys.includes(m.key))

  const toggle = (k: ModuleKey) =>
    setKeys((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  const allChecked = grantable.every((m) => keys.has(m.key))
  const setAll = (on: boolean) => setKeys(on ? new Set(grantable.map((m) => m.key)) : new Set())

  return (
    <Modal
      open
      onClose={onClose}
      title={`Manage access — ${user.fullName || user.email}`}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => onSave(role, [...keys])} disabled={saving}>
            {saving ? 'Saving…' : 'Save access'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Role — super admin only */}
        {canEditRole && (
          <div>
            <label className="label flex items-center gap-1.5">
              <KeyRound size={13} /> Role
            </label>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {(['Admin', 'User'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={
                    role === r
                      ? 'rounded-lg border-2 border-brand-500 bg-brand-50 px-3 py-2.5 text-left'
                      : 'rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left hover:bg-slate-50'
                  }
                >
                  <div className="text-sm font-semibold text-slate-900">{r}</div>
                  <div className="text-2xs text-slate-500">
                    {r === 'Admin'
                      ? 'Full access to every module.'
                      : 'Only the modules selected below.'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Module checkboxes — only meaningful for the User role */}
        <div>
          <div className="flex items-center justify-between">
            <label className="label flex items-center gap-1.5">
              <SlidersHorizontal size={13} /> Modules
            </label>
            {role === 'User' && grantable.length > 0 && (
              <button
                type="button"
                className="text-2xs font-semibold text-brand-600 hover:underline"
                onClick={() => setAll(!allChecked)}
              >
                {allChecked ? 'Clear all' : 'Select all'}
              </button>
            )}
          </div>

          {role === 'Admin' ? (
            <p className="mt-1.5 rounded-lg bg-blue-50 px-3 py-2.5 text-xs text-blue-800 ring-1 ring-blue-200">
              Admins have access to all modules — no need to select individually.
            </p>
          ) : (
            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
              {/* Always-on Dashboard shown as a locked row. */}
              <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <Lock size={15} className="mt-0.5 shrink-0 text-slate-400" />
                <div>
                  <div className="text-sm font-medium text-slate-700">Dashboard</div>
                  <div className="text-2xs text-slate-500">Always available</div>
                </div>
              </div>
              {grantable.map((m) => {
                const checked = keys.has(m.key)
                return (
                  <label
                    key={m.key}
                    className={
                      checked
                        ? 'flex cursor-pointer items-start gap-2.5 rounded-lg border-2 border-brand-400 bg-brand-50/60 px-3 py-2.5'
                        : 'flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 hover:bg-slate-50'
                    }
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
                      checked={checked}
                      onChange={() => toggle(m.key)}
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-800">{m.label}</div>
                      <div className="text-2xs text-slate-500">{m.description}</div>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
