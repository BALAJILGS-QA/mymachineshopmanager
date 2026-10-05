import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, CreditCard, Loader2, Lock } from 'lucide-react'
import { clsx } from 'clsx'
import { useAppNavigate } from '@/components/nav/app-link'
import { PageHeader } from '@/components/common/PageHeader'
import { Card } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/data/supabase'
import { planById, formatINR, type PlanId } from './plans'
import type { BillingCycle } from './api/subscriptionApi'

// ---- Razorpay checkout types (loaded at runtime from checkout.js) -------------
interface RazorpayResponse {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}
interface RazorpayOptions {
  key: string
  order_id: string
  amount: number
  currency: string
  name: string
  description?: string
  theme?: { color?: string }
  prefill?: { email?: string; name?: string }
  handler: (r: RazorpayResponse) => void
  modal?: { ondismiss?: () => void }
}
interface RazorpayInstance {
  open: () => void
}
declare global {
  interface Window {
    Razorpay?: new (o: RazorpayOptions) => RazorpayInstance
  }
}

function loadRazorpay(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (window.Razorpay) return Promise.resolve(true)
  return new Promise((resolve) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve(true)
    s.onerror = () => resolve(false)
    document.body.appendChild(s)
  })
}

// Checkout / payment page reached from the subscription plan cards. Shows an order
// summary (billing cycle + GST), then pays via Razorpay. The order amount is
// computed server-side; the payment signature is verified server-side before the
// plan is activated — so the upgrade is real and recorded for the super admin.
export function CheckoutPage({ planId }: { planId: PlanId | null }) {
  const navigate = useAppNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const [billing, setBilling] = useState<BillingCycle>('monthly')
  const [paying, setPaying] = useState(false)

  const plan = planId ? planById(planId) : undefined

  if (!plan) {
    return (
      <div>
        <PageHeader title="Checkout" subtitle="Choose a plan to continue." />
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate('/app/subscription')}
        >
          <ArrowLeft size={15} /> Back to plans
        </button>
      </div>
    )
  }

  const base = billing === 'annual' ? plan.price * 10 : plan.price
  const gst = Math.round(base * 0.18)
  const total = base + gst
  const period = billing === 'annual' ? 'year' : 'month'

  async function pay() {
    const selected = plan!
    setPaying(true)
    try {
      const orderRes = await fetch('/api/razorpay/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selected.id, billing }),
      })
      const order = await orderRes.json()
      if (!orderRes.ok) {
        toast.error(
          orderRes.status === 503
            ? 'Online payment is being set up — please try again shortly or contact us.'
            : order?.error || 'Could not start payment',
        )
        setPaying(false)
        return
      }

      const loaded = await loadRazorpay()
      if (!loaded || !window.Razorpay) {
        toast.error('Could not load the payment gateway. Check your connection.')
        setPaying(false)
        return
      }

      const token = (await supabase?.auth.getSession())?.data?.session?.access_token
      if (!token) {
        toast.error('Your session expired — please sign in again.')
        setPaying(false)
        return
      }

      const rz = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: 'My Machine Shop Manager',
        description: `${order.planName} plan (${billing})`,
        theme: { color: '#ea580c' },
        handler: async (resp) => {
          try {
            const vr = await fetch('/api/razorpay/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                orderId: resp.razorpay_order_id,
                paymentId: resp.razorpay_payment_id,
                signature: resp.razorpay_signature,
                plan: selected.id,
                billing,
              }),
            })
            const vd = await vr.json()
            if (!vr.ok) {
              toast.error(vd?.error || 'Payment verification failed')
              return
            }
            await qc.invalidateQueries({ queryKey: ['subscription'] })
            await qc.invalidateQueries({ queryKey: ['user-subscriptions'] })
            toast.success(`Payment successful — ${selected.name} plan activated.`)
            navigate('/app/subscription')
          } catch {
            toast.error('Could not confirm payment. If charged, contact support.')
          } finally {
            setPaying(false)
          }
        },
        modal: { ondismiss: () => setPaying(false) },
      })
      rz.open()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Payment failed')
      setPaying(false)
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
            disabled={paying}
            className="btn-primary mt-5 w-full justify-center py-2.5"
          >
            {paying ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
            Pay {formatINR(total)} securely
          </button>

          <p className="mt-3 flex items-start gap-1.5 text-2xs leading-relaxed text-slate-500">
            <Lock size={12} className="mt-0.5 shrink-0" />
            Payments are processed securely by Razorpay. Your card details never touch our servers.
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
