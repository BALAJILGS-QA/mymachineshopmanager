// Server-side e-invoice / e-way-bill provider abstraction. Runs ONLY in Next API
// routes (never shipped to the client), so this is where a real IRP/GSP
// integration and its secrets live. The provider is selected by env
// (EINVOICE_PROVIDER / EWAYBILL_PROVIDER); a built-in "sandbox" provider lets the
// whole workflow (generate → store IRN/EWB → cancel) run end-to-end without a
// live GSP, and is clearly labelled so no one mistakes it for a real filing.
//
// To wire a real GSP: implement the interface, read credentials from process.env
// (NEVER log them), and register it in `selectEInvoiceProvider` / `selectEway…`.

import { createHash, randomUUID } from 'node:crypto'

export interface EInvoiceInput {
  invoiceId: string
  invoiceNo: string
  invoiceDate: string
  supplierGstin?: string
  recipientGstin?: string
  totalValue?: number
}
export interface EInvoiceResult {
  status: 'generated' | 'failed' | 'cancelled'
  provider: string
  irn?: string
  ackNo?: string
  ackDate?: string
  signedQr?: string
  qrData?: string
  errorMessage?: string
}

export interface EInvoiceProvider {
  name: string
  generate(input: EInvoiceInput): Promise<EInvoiceResult>
  cancel(irn: string, reason: string): Promise<{ status: 'cancelled' }>
}

// Deterministic, offline sandbox: a 64-hex IRN derived from the invoice so the
// same invoice always yields the same IRN (mirrors IRP idempotency), plus a
// synthetic ack. NOT a real government IRN.
const sandbox: EInvoiceProvider = {
  name: 'sandbox',
  async generate(input) {
    if (!input.invoiceNo)
      return { status: 'failed', provider: 'sandbox', errorMessage: 'Invoice number is required' }
    const irn = createHash('sha256')
      .update(`${input.invoiceId}|${input.supplierGstin ?? ''}|${input.invoiceNo}`)
      .digest('hex')
    return {
      status: 'generated',
      provider: 'sandbox',
      irn,
      ackNo: String(Date.now()).slice(-10),
      ackDate: new Date().toISOString(),
      qrData: `${irn}|${input.invoiceNo}|${input.totalValue ?? ''}`,
    }
  },
  async cancel() {
    return { status: 'cancelled' }
  },
}

export function selectEInvoiceProvider(): EInvoiceProvider {
  const name = process.env.EINVOICE_PROVIDER ?? 'sandbox'
  if (name === 'sandbox') return sandbox
  // Real providers (NIC IRP direct, or a GSP) plug in here. Fail loudly rather
  // than silently pretending to file when creds are absent.
  throw new Error(
    `E-invoice provider "${name}" is not configured on this server. Set EINVOICE_PROVIDER + credentials, or use "sandbox".`,
  )
}

// ---- E-way bill ------------------------------------------------------------
export interface EwayInput {
  invoiceId: string
  documentNo: string
  documentDate: string
  supplierGstin?: string
  recipientGstin?: string
  transportMode?: string
  vehicleNumber?: string
  invoiceValue?: number
  distanceKm?: number
}
export interface EwayResult {
  status: 'generated' | 'failed' | 'cancelled'
  provider: string
  ewbNumber?: string
  validUntil?: string
  errorMessage?: string
}

export interface EwayProvider {
  name: string
  generate(input: EwayInput): Promise<EwayResult>
  cancel(ewb: string, reason: string): Promise<{ status: 'cancelled' }>
}

const ewaySandbox: EwayProvider = {
  name: 'sandbox',
  async generate(input) {
    if (!input.documentNo)
      return { status: 'failed', provider: 'sandbox', errorMessage: 'Document number is required' }
    // 12-digit EWB-like number derived from a uuid.
    const ewb = randomUUID().replace(/\D/g, '').padEnd(12, '0').slice(0, 12)
    // Validity ~1 day per 200km (indicative sandbox rule; real rules vary).
    const days = Math.max(1, Math.ceil((input.distanceKm ?? 100) / 200))
    const valid = new Date(Date.now() + days * 86400000).toISOString()
    return { status: 'generated', provider: 'sandbox', ewbNumber: ewb, validUntil: valid }
  },
  async cancel() {
    return { status: 'cancelled' }
  },
}

export function selectEwayProvider(): EwayProvider {
  const name = process.env.EWAYBILL_PROVIDER ?? 'sandbox'
  if (name === 'sandbox') return ewaySandbox
  throw new Error(
    `E-way-bill provider "${name}" is not configured on this server. Set EWAYBILL_PROVIDER + credentials, or use "sandbox".`,
  )
}
