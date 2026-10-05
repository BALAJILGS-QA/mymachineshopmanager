// Creates a Razorpay order for a subscription plan. The amount is computed
// SERVER-SIDE from the plan catalogue (never trusted from the client). Returns the
// order id + public key id for the checkout widget.

import { NextResponse } from 'next/server'
import { PLANS } from '@/features/subscription/plans'
import { createRazorpayOrder, razorpayConfigured, razorpayKeyId } from '@/server/razorpay'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (!razorpayConfigured()) {
    return NextResponse.json({ error: 'Online payment is not configured yet' }, { status: 503 })
  }

  let body: { plan?: string; billing?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const plan = PLANS.find((p) => p.id === body.plan)
  if (!plan) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  const billing = body.billing === 'annual' ? 'annual' : 'monthly'

  // Annual = 10 months (2 free). GST 18%.
  const base = billing === 'annual' ? plan.price * 10 : plan.price
  const gst = Math.round(base * 0.18)
  const total = base + gst

  try {
    const order = await createRazorpayOrder({
      amountPaise: total * 100,
      receipt: `sub_${plan.id}_${billing}_${Date.now()}`,
      notes: { plan: plan.id, billing },
    })
    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: razorpayKeyId(),
      planName: plan.name,
      total,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not create order' },
      { status: 502 },
    )
  }
}
