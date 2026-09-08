import { useEffect, useMemo, useState } from 'react'
import { useAppNavigate } from '@/components/nav/app-link'
import { KeyRound, Lock, ShieldCheck, SlidersHorizontal, UserCog } from 'lucide-react'
import type { AppUser, UserRole } from '@/types'
import { useUsers, useUpdateUserAccess } from '@/features/approvals/hooks/useUsers'
import { toUserMessage } from '@/lib/api/errors'
import { useAuth } from '@/features/auth/auth'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { Badge, Card, EmptyState } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { ALWAYS_ON, MODULES, effectiveModuleKeys, isModuleKey } from './modules'
import type { ModuleKey } from '@/components/layout/nav'

const ROLE_TONE: Record<UserRole, string> = {
  SuperAdmin: 'violet',
  Admin: 'blue',
  User: 'slate',
}

// Two managers share this page:
//  • the super admin — sees every approved user, can change roles and grant any module;
//  • an Admin (shop user) — sees only their own shop's Users (same companyName) and can
//    grant only the modules they themselves hold; cannot change roles or approve users.

function sameCompany(a?: string, b?: string): boolean {
  const x = (a ?? '').trim().toLowerCase()
  const y = (b ?? '').trim().toLowerCase()
  return x !== '' && x === y
}

// Human summary of what a user can reach, for the table's Access column.
function accessSummary(u: AppUser): string {
  const eff = effectiveModuleKeys({ isSuperAdmin: false, user: u })
  if (eff === 'all') return 'All modules'
  const granted = eff.filter((k) => !ALWAYS_ON.includes(k)).length
  return granted === 0 ? 'Dashboard only' : `${granted} of ${MODULES.length} modules`
}

export function RolesPage() {
  const { isSuperAdmin, session } = useAuth()
  const navigate = useAppNavigate()
  const { data: users = [] } = useUsers()
  const toast = useToast()
  const updateAccess = useUpdateUserAccess()
  const [editing, setEditing] = useState<AppUser | null>(null)

  // The current manager's own record (undefined for the email-based super admin).
  const me = useMemo(
    () => users.find((u) => u.email.toLowerCase() === (session?.email ?? '').toLowerCase()),
    [users, session?.email],
  )
  const isAdmin = !isSuperAdmin && me?.role === 'Admin'
  const canManage = isSuperAdmin || isAdmin

  // The modules this manager is allowed to grant. Super admin & Admin both resolve
  // to every module today; computed generically so it stays correct if an Admin is
  // ever given a restricted set. Dashboard is always-on and never a toggle.
  const allowedKeys = useMemo<ModuleKey[]>(() => {
    const eff = effectiveModuleKeys({ isSuperAdmin, user: me })
    const keys = eff === 'all' ? MODULES.map((m) => m.key) : eff
    return keys.filter((k) => !ALWAYS_ON.includes(k))
  }, [isSuperAdmin, me])

  // Super admin manages everyone; an Admin only their own shop's standard Users.
  const managed = useMemo(() => {
    const approved = users.filter((u) => u.status === 'approved')
    const scoped = isSuperAdmin
      ? approved
      : approved.filter(
          (u) =>
            (u.role ?? 'User') === 'User' &&
            u.id !== me?.id &&
            sameCompany(u.companyName, me?.companyName),
        )
    return scoped.sort((a, b) => (a.fullName || a.email).localeCompare(b.fullName || b.email))
  }, [users, isSuperAdmin, me])

  // Guard AFTER the hooks so hook order stays stable across renders.
  useEffect(() => {
    if (!canManage) navigate('/app', { replace: true })
  }, [canManage, navigate])
  if (!canManage) return null

  async function onSave(role: UserRole, keys: ModuleKey[]) {
    if (!editing) return
    try {
      // Preserve any modules the current manager isn't allowed to touch (so a
      // scoped Admin can't accidentally strip access granted by the super admin).
      const preserved = (editing.permissions ?? []).filter(
        (k) => isModuleKey(k) && !allowedKeys.includes(k),
      )
      const permissions = role === 'Admin' ? [] : [...new Set<string>([...preserved, ...keys])]
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

      <Card>
        {managed.length === 0 ? (
          <EmptyState
            icon={<UserCog size={40} />}
            title={isSuperAdmin ? 'No approved users yet' : 'No users in your shop yet'}
            description={
              isSuperAdmin
                ? 'Approve registrations first — approved users appear here for role and module assignment.'
                : 'Users who register with your company name and are approved by the super admin will appear here.'
            }
          />
        ) : (
          <ResponsiveTable className="min-w-[48rem]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">User</th>
                <th className="th">Company</th>
                <th className="th">Role</th>
                <th className="th">Module Access</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {managed.map((u) => {
                const role: UserRole = u.role ?? 'User'
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
