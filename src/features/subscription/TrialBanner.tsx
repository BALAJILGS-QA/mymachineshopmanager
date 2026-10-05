'use client'

import { useState } from 'react'
import { AlertTriangle, ArrowRight, X } from 'lucide-react'
import { useAppNavigate } from '@/components/nav/app-link'
import { useSubscription } from './hooks/useSubscription'
import { TRIAL_REMINDER_DAYS } from './plans'

// Trial reminder popup. Appears in the bottom-right once a tenant's free trial has
// TRIAL_REMINDER_DAYS (5) or fewer days left — covering the 5 / 3 / 1-day marks the
// customer should see — with a live countdown and an "Upgrade plan" button that
// routes to the subscription page. Super admins are reported as exempt by
// get_my_subscription, so this never shows for the platform operator.
export function TrialBanner() {
  const { data: sub } = useSubscription()
  const navigate = useAppNavigate()
  const [dismissed, setDismissed] = useState(false)

  const trialing = sub?.status === 'trialing'
  const daysLeft = sub?.daysLeft ?? null
  const show =
    trialing && typeof daysLeft === 'number' && daysLeft <= TRIAL_REMINDER_DAYS && !dismissed

  if (!show) return null

  const expired = daysLeft <= 0
  const label = expired
    ? 'Your free trial has ended'
    : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your free trial`

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(92vw,22rem)] rounded-2xl border border-amber-200 bg-white p-4 shadow-xl shadow-amber-900/10">
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="absolute right-3 top-3 text-slate-400 transition hover:text-slate-600"
      >
        <X size={16} />
      </button>

      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
          <AlertTriangle size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">{label}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {expired
              ? 'Upgrade now to keep using your shop data without interruption.'
              : 'Please upgrade to a paid plan to keep everything running after your trial.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setDismissed(true)
              navigate('/app/subscription')
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-600"
          >
            Upgrade plan <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
