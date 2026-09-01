import { useEffect, useMemo, useState } from 'react'
import { useAppNavigate } from '@/components/nav/app-link'
import { Check, ShieldCheck, UserCheck, X } from 'lucide-react'
import type { AppUser, UserStatus } from '@/types'
import { useUsers, useApproveUser, useRejectUser } from './hooks/useUsers'
import { toUserMessage } from '@/lib/api/errors'
import { useAuth } from '@/features/auth/auth'
import { fmtDate, inRange } from '@/lib/format'
import { PageHeader, ResponsiveTable } from '@/components/common/PageHeader'
import { DateRangeFilter, FilterBar } from '@/components/common/Filters'
import { Badge, Card, EmptyState } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { USER_STATUS_TONE as STATUS_TONE } from '@/constants/domain'

const FILTERS: { key: UserStatus | 'all'; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
]

export function ApprovalsPage() {
  const { isSuperAdmin, session } = useAuth()
  const navigate = useAppNavigate()
  const { data: users = [] } = useUsers()
  const approveUser = useApproveUser()
  const rejectUser = useRejectUser()
  const toast = useToast()
  const confirm = useConfirm()
  const [filter, setFilter] = useState<UserStatus | 'all'>('pending')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const rows = useMemo(
    () =>
      users
        .filter((u) => (filter === 'all' ? true : u.status === filter))
        .filter((u) => inRange(u.createdAt.slice(0, 10), from, to))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [users, filter, from, to],
  )
  const pendingCount = users.filter((u) => u.status === 'pending').length

  // Only the super admin may review registrations. Guard AFTER all hooks so the
  // hook call order is stable across renders (react-hooks/rules-of-hooks).
  // Router-agnostic redirect: an effect replaces the old <Navigate> element.
  useEffect(() => {
    if (!isSuperAdmin) navigate('/app', { replace: true })
  }, [isSuperAdmin, navigate])
  if (!isSuperAdmin) return null

  async function onApprove(u: AppUser) {
    try {
      await approveUser.mutateAsync({ id: u.id, by: session?.username ?? 'admin', email: u.email })
      toast.success(`${u.fullName || u.email} approved`)
    } catch (e) {
      toast.error(toUserMessage(e, 'Approve failed'))
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
      await rejectUser.mutateAsync({ id: u.id, by: session?.username ?? 'admin', email: u.email })
      toast.success('Registration rejected')
    } catch (e) {
      toast.error(toUserMessage(e, 'Reject failed'))
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

      <FilterBar>
        <div>
          <label className="label">Status</label>
          <div className="flex flex-wrap items-center gap-1.5">
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
        </div>
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </FilterBar>

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
