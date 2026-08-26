import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Check, ShieldCheck, UserCheck, X } from 'lucide-react'
import type { AppUser, UserStatus } from '@/types'
import { userRepo, BusinessRuleError } from '@/data/repo'
import { setRemoteApproval } from '@/data/backend'
import { useDb } from '@/data/store'
import { useAuth } from '@/features/auth/auth'
import { fmtDate } from '@/lib/format'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { Badge, Card, EmptyState } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

const STATUS_TONE: Record<UserStatus, string> = {
  pending: 'amber',
  approved: 'green',
  rejected: 'red',
}

const FILTERS: { key: UserStatus | 'all'; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
]

export function ApprovalsPage() {
  const { isSuperAdmin, session, supabaseMode } = useAuth()
  const users = useDb((db) => db.users)
  const toast = useToast()
  const confirm = useConfirm()
  const [filter, setFilter] = useState<UserStatus | 'all'>('pending')

  const rows = useMemo(
    () =>
      users
        .filter((u) => (filter === 'all' ? true : u.status === filter))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [users, filter],
  )
  const pendingCount = users.filter((u) => u.status === 'pending').length

  // Only the super admin may review registrations. Guard AFTER all hooks so the
  // hook call order is stable across renders (react-hooks/rules-of-hooks).
  if (!isSuperAdmin) return <Navigate to="/app" replace />

  async function onApprove(u: AppUser) {
    try {
      userRepo.approve(u.id, session?.username ?? 'admin')
      if (supabaseMode) await setRemoteApproval(u.email, true)
      toast.success(`${u.fullName || u.email} approved`)
    } catch (e) {
      toast.error(e instanceof BusinessRuleError ? e.message : 'Approve failed')
    }
  }

  async function onReject(u: AppUser) {
    const ok = await confirm({
      title: 'Reject registration',
      message: `Reject ${u.fullName || u.email}? They will not be able to sign in.`,
      danger: true,
      confirmLabel: 'Reject',
    })
    if (!ok) return
    try {
      userRepo.reject(u.id, session?.username ?? 'admin')
      if (supabaseMode) await setRemoteApproval(u.email, false)
      toast.success('Registration rejected')
    } catch (e) {
      toast.error(e instanceof BusinessRuleError ? e.message : 'Reject failed')
    }
  }

  return (
    <div>
      <PageHeader
        title="User Approvals"
        subtitle={
          pendingCount > 0
            ? `${pendingCount} registration${pendingCount === 1 ? '' : 's'} awaiting approval`
            : 'Review and approve new account registrations'
        }
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={
              filter === f.key
                ? 'rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white'
                : 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50'
            }
          >
            {f.label}
            {f.key === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-2xs font-bold text-white">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<UserCheck size={40} />}
            title={filter === 'pending' ? 'No pending registrations' : 'No records'}
            description={
              filter === 'pending'
                ? 'New sign-ups will appear here for your approval.'
                : 'Nothing to show for this filter.'
            }
          />
        ) : (
          <ResponsiveTable>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">Applicant</th>
                <th className="th">Company</th>
                <th className="th">Contact</th>
                <th className="th">GSTIN</th>
                <th className="th">Requested</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/60">
                  <td className="td">
                    <div className="font-semibold text-slate-900">{u.fullName || '—'}</div>
                    <div className="text-2xs text-slate-500">{u.email}</div>
                  </td>
                  <td className="td">
                    <div>{u.companyName || '—'}</div>
                    {u.address && <div className="text-2xs text-slate-500">{u.address}</div>}
                  </td>
                  <td className="td">{u.phone || '—'}</td>
                  <td className="td">{u.gstin || '—'}</td>
                  <td className="td">{fmtDate(u.createdAt)}</td>
                  <td className="td">
                    <Badge tone={STATUS_TONE[u.status]}>{u.status}</Badge>
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-1.5">
                      {u.status !== 'approved' && (
                        <button className="btn-primary btn-sm" onClick={() => onApprove(u)}>
                          <Check size={14} /> Approve
                        </button>
                      )}
                      {u.status !== 'rejected' && (
                        <button
                          className="btn-secondary btn-sm text-red-600"
                          onClick={() => onReject(u)}
                        >
                          <X size={14} /> Reject
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        )}
      </Card>

      <p className="mt-3 flex items-center gap-1.5 text-2xs text-slate-500">
        <ShieldCheck size={13} /> Only the super admin can see and action this page.
      </p>
    </div>
  )
}
