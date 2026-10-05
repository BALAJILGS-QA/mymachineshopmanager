import crypto from 'node:crypto'

// Server-only Razorpay helper. Keeps the key secret on the server; the key id is
// public and returned to the client for the checkout widget. Works in both test
// and live mode — the mode is determined entirely by which keys are configured
// (rzp_test_* vs rzp_live_*), so pointing to live later is just an env change.
//
// Env:
//   RAZORPAY_KEY_ID      — e.g. rzp_test_xxxxxxxx (public-ish; sent to client)
//   RAZORPAY_KEY_SECRET  — secret, server-only, never sent to the client

const KEY_ID = process.env.RAZORPAY_KEY_ID
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET

export function razorpayConfigured(): boolean {
  return !!(KEY_ID && KEY_SECRET)
}

export function razorpayKeyId(): string | undefined {
  return KEY_ID
}

/** True when running against Razorpay TEST keys (rzp_test_*). */
export function razorpayTestMode(): boolean {
  return (KEY_ID ?? '').startsWith('rzp_test')
}

export interface RazorpayOrder {
  id: string
  amount: number
  currency: string
}

export async function createRazorpayOrder(opts: {
  amountPaise: number
  receipt: string
  notes?: Record<string, string>
}): Promise<RazorpayOrder> {
  if (!KEY_ID || !KEY_SECRET) throw new Error('Razorpay is not configured')
  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: opts.amountPaise,
      currency: 'INR',
      receipt: opts.receipt,
      notes: opts.notes ?? {},
    }),
  })
  const data = (await res.json()) as RazorpayOrder & { error?: { description?: string } }
  if (!res.ok) throw new Error(data?.error?.description || 'Could not create payment order')
  return { id: data.id, amount: data.amount, currency: data.currency }
}

/** Verify the Razorpay payment signature (HMAC-SHA256 of orderId|paymentId). */
export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  if (!KEY_SECRET) return false
  const expected = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}
