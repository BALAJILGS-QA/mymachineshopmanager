import { Check, Crown, Sparkles } from 'lucide-react'
import { clsx } from 'clsx'
import { useAppNavigate } from '@/components/nav/app-link'
import { PageHeader } from '@/components/common/PageHeader'
import { PLANS, formatINR, type PlanId } from './plans'
import { useSubscription } from './hooks/useSubscription'

// Subscription / plan selection page. Shows the three tiers, highlights the
// tenant's current plan, and routes to checkout (payment) when a plan is chosen.
export function SubscriptionPage() {
  const { data: sub } = useSubscription()
  const navigate = useAppNavigate()

  const current = sub?.plan ?? null
  const isTrialing = sub?.status === 'trialing'
  const daysLeft = sub?.daysLeft ?? null
  const expired = isTrialing && (daysLeft ?? 0) <= 0

  // Choosing a plan sends the user to the checkout / payment page.
  function choose(plan: PlanId) {
    navigate(`/app/subscription/checkout?plan=${plan}`)
  }

  return (
    <div>
      <PageHeader
        title="Subscription & Plans"
        subtitle="Choose the plan that fits your shop. Prices are per month, exclusive of GST."
      />

      {expired ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <Sparkles size={18} className="shrink-0 text-red-500" />
          <span>
            Your <b>free trial has ended</b>. Choose a plan below to restore access to your shop
            data.
          </span>
        </div>
      ) : (
        isTrialing && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Sparkles size={18} className="shrink-0 text-amber-500" />
            <span>
              You're on the <b>free trial</b>
              {typeof daysLeft === 'number' ? (
                <>
                  {' '}
                  —{' '}
                  <b>
                    {daysLeft} day{daysLeft === 1 ? '' : 's'} left
                  </b>
                  . Upgrade any time to keep your data and unlock everything.
                </>
              ) : (
                '.'
              )}
            </span>
          </div>
        )
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = current === plan.id
          return (
            <div
              key={plan.id}
              className={clsx(
                'relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm transition',
                plan.popular
                  ? 'border-brand-400 ring-1 ring-brand-400'
                  : 'border-slate-200 hover:border-slate-300',
              )}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-brand-500 px-3 py-1 text-2xs font-bold uppercase tracking-wide text-white">
                  <Crown size={12} /> Most popular
                </span>
              )}

              <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
              <p className="mt-1 text-sm text-slate-500">{plan.tagline}</p>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-slate-900">
                  {formatINR(plan.price)}
                </span>
                <span className="text-sm text-slate-500">/ month</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{plan.audience}</p>

              <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600">
                <li className="font-semibold text-slate-700">
                  {plan.limits.users} · {plan.limits.companies} · {plan.limits.invoicesPerMonth}
                </li>
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                disabled={isCurrent}
                onClick={() => choose(plan.id)}
                className={clsx(
                  'mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition',
                  isCurrent
                    ? 'cursor-default bg-slate-100 text-slate-500'
                    : plan.popular
                      ? 'bg-brand-500 text-white hover:bg-brand-600'
                      : 'border border-slate-300 text-slate-700 hover:bg-slate-50',
                )}
              >
                {isCurrent ? 'Current plan' : `Choose ${plan.name}`}
              </button>
            </div>
          )
        })}
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Need a custom plan or help migrating your data? Contact us and our team will set you up.
      </p>
    </div>
  )
}
