// Server route for e-way-bill generation/cancellation. Secrets stay server-side;
// the client persists the returned EWB number/status under RLS (EWAYBILL_MANAGE).

import { NextResponse } from 'next/server'
import { selectEwayProvider, type EwayInput } from '@/server/einvoiceProvider'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: { action?: string; input?: EwayInput; ewb?: string; reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const provider = selectEwayProvider()
    if (body.action === 'cancel') {
      if (!body.ewb) return NextResponse.json({ error: 'ewb is required' }, { status: 400 })
      const res = await provider.cancel(body.ewb, body.reason ?? '')
      return NextResponse.json({ provider: provider.name, ...res })
    }
    if (!body.input?.documentNo) {
      return NextResponse.json({ error: 'input.documentNo is required' }, { status: 400 })
    }
    const res = await provider.generate(body.input)
    return NextResponse.json(res)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'E-way request failed' },
      { status: 400 },
    )
  }
}
