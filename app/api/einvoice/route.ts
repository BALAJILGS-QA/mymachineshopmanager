// Server route for e-invoice generation/cancellation. Keeps any IRP/GSP secrets
// server-side; the client persists the returned IRN/status to Supabase under RLS
// (EINVOICE_MANAGE). Never logs credentials or full payloads.

import { NextResponse } from 'next/server'
import { selectEInvoiceProvider, type EInvoiceInput } from '@/server/einvoiceProvider'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: { action?: string; input?: EInvoiceInput; irn?: string; reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const provider = selectEInvoiceProvider()
    if (body.action === 'cancel') {
      if (!body.irn) return NextResponse.json({ error: 'irn is required' }, { status: 400 })
      const res = await provider.cancel(body.irn, body.reason ?? '')
      return NextResponse.json({ provider: provider.name, ...res })
    }
    if (!body.input?.invoiceNo) {
      return NextResponse.json({ error: 'input.invoiceNo is required' }, { status: 400 })
    }
    const res = await provider.generate(body.input)
    return NextResponse.json(res)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'E-invoice request failed' },
      { status: 400 },
    )
  }
}
