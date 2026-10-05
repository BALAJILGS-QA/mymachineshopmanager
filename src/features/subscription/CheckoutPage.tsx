import { useState } from 'react'
import { ArrowLeft, Check, CreditCard, Loader2, Lock } from 'lucide-react'
import { clsx } from 'clsx'
import { useAppNavigate } from '@/components/nav/app-link'
import { PageHeader } from '@/components/common/PageHeader'
import { Card } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/Toast'
import { planById, formatINR, type PlanId } from './plans'
import { useSetPlan } from './hooks/useSubscription'
import type { BillingCycle } from './api/subscriptionApi'

// Checkout / payment page reached from the subscription plan cards. Shows an order
// summary with billing cycle + GST, then completes the purchase. NOTE: a live
// payment gateway (Razorpay) is still being finalised — confirming here activates
// the plan and records it for the super admin; swap the pay handler for the
// gateway redirect when it's ready.
export function CheckoutPage({ planId }: { planId: PlanId | null }) {
  const navigate = useAppNavigate()
  const toast = useToast()
  const setPlan = useSetPlan()
  const [billing, setBilling] = useState<BillingCycle>('monthly')

  const plan = planId ? planById(planId) : undefined

  if (!plan) {
    return (
      <div>
        <PageHeader title="Checkout" subtitle="Choose a plan to continue." />
        <button
          className="btn-secondary"
          onClick={() => navigate('/app/subscription')}
          type="button"
        >
          <ArrowLeft size={15} /> Back to plans
        </button>
      </div>
    )
  }

  // Annual = pay for 10 months (2 months free). GST 18%.
  const base = billing === 'annual' ? plan.price * 10 : plan.price
  const gst = Math.round(base * 0.18)
  const total = base + gst
  const period = billing === 'annual' ? 'year' : 'month'

  async function pay() {
    try {
      await setPlan.mutateAsync({ plan: plan!.id, billing })
      toast.success(`Payment successful — ${plan!.name} plan activated.`)
      navigate('/app/subscription')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Payment could not be completed')
    }
  }

  return (
    <div>
      <PageHeader title="Checkout" subtitle={`Upgrade to the ${plan.name} plan`} />

      <button
        type="button"
        onClick={() => navigate('/app/subscription')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft size={15} /> Back to plans
      </button>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        {/* Billing cycle + what's included */}
        <Card className="p-5">
          <h3 className="text-sm font-bold text-slate-900">Billing cycle</h3>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {(['monthly', 'annual'] as BillingCycle[]).map((c) => {
              const active = billing === c
              const price = c === 'annual' ? plan.price * 10 : plan.price
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setBilling(c)}
                  className={clsx(
                    'rounded-xl border px-4 py-3 text-left transition',
                    active
                      ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                      : 'border-slate-200 bg-white hover:bg-slate-50',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold capitalize text-slate-900">{c}</span>
                    {c === 'annual' && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-2xs font-bold text-emerald-700">
                        2 months free
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {formatINR(price)} / {c === 'annual' ? 'year' : 'month'}
                  </div>
                </button>
              )
            })}
          </div>

          <h3 className="mt-6 text-sm font-bold text-slate-900">Included in {plan.name}</h3>
          <ul className="mt-3 space-y-2 text-xs text-slate-600">
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
        </Card>

        {/* Order summary + pay */}
        <Card className="h-fit p-5">
          <h3 className="text-sm font-bold text-slate-900">Order summary</h3>
          <dl className="mt-3 space-y-2.5 text-sm">
            <Row label={`${plan.name} (${billing})`} value={`${formatINR(base)} / ${period}`} />
            <Row label="GST (18%)" value={formatINR(gst)} />
            <div className="border-t border-slate-100 pt-2.5">
              <Row label="Total due" value={`${formatINR(total)} / ${period}`} strong />
            </div>
          </dl>

          <button
            type="button"
            onClick={pay}
            disabled={setPlan.isPending}
            className="btn-primary mt-5 w-full justify-center py-2.5"
          >
            {setPlan.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CreditCard size={16} />
            )}
            Pay {formatINR(total)} securely
          </button>

          <p className="mt-3 flex items-start gap-1.5 text-2xs leading-relaxed text-slate-500">
            <Lock size={12} className="mt-0.5 shrink-0" />
            Secure checkout. Online payment gateway (Razorpay) is being finalised — confirming here
            activates your plan and records the upgrade for your records.
          </p>
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={strong ? 'font-semibold text-slate-900' : 'text-slate-600'}>{label}</dt>
      <dd className={strong ? 'text-base font-bold text-slate-900' : 'font-medium text-slate-800'}>
        {value}
      </dd>
    </div>
  )
}
