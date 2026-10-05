'use client'

import { useAppNavigate } from '@/components/nav/app-link'
import { useSubscription } from './hooks/useSubscription'

// A gentle scrolling ("moving label") trial notice pinned to the bottom of the
// dashboard. Shows only while the tenant is on a trial; clicking opens the plans.
// Super admins are reported as `exempt`, so this never shows for the operator.
export function TrialMarquee() {
  const { data: sub } = useSubscription()
  const navigate = useAppNavigate()

  if (!sub || sub.status !== 'trialing') return null
  const days = sub.daysLeft
  if (days == null) return null

  const text =
    days <= 0
      ? 'Your free trial has ended — upgrade now to keep using your shop data.'
      : `Free Trial account — ${days} day${days === 1 ? '' : 's'} remaining. Upgrade to keep all your data and unlock every module.`
  const message = `🟡  ${text}`

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate('/app/subscription')}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate('/app/subscription')}
      title="View subscription plans"
      aria-label={text}
      className="mt-6 cursor-pointer overflow-hidden rounded-xl border border-amber-200 bg-amber-50 py-2"
    >
      {/* Two copies animated by -50% give a seamless continuous scroll. */}
      <div className="msm-marquee-track text-sm font-semibold text-amber-800">
        <span className="px-6">{message}</span>
        <span className="px-6" aria-hidden="true">
          {message}
        </span>
      </div>
    </div>
  )
}
