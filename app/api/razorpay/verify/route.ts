// Verifies a Razorpay payment signature server-side, then activates the plan. The
// plan change runs AS THE USER (their forwarded Supabase token) so set_tenant_plan
// resolves the correct tenant and the upgrade is logged to subscription history for
// the super admin. The key secret never leaves the server.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyRazorpaySignature } from '@/server/razorpay'

export const runtime = 'nodejs'

function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
}
function supabaseAnonKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
}

export async function POST(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: {
    orderId?: string
    paymentId?: string
    signature?: string
    plan?: string
    billing?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.orderId || !body.paymentId || !body.signature) {
    return NextResponse.json({ error: 'Missing payment fields' }, { status: 400 })
  }
  if (!verifyRazorpaySignature(body.orderId, body.paymentId, body.signature)) {
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 })
  }

  const url = supabaseUrl()
  const key = supabaseAnonKey()
  if (!url || !key) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })

  const billing = body.billing === 'annual' ? 'annual' : 'monthly'
  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.rpc('set_tenant_plan', {
    p_plan: body.plan,
    p_billing_cycle: billing,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, subscription: data })
}
