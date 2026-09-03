// Deterministic bank-transaction classification + party / invoice matching.
// Rules run first (configured, highest signal), then keyword heuristics, then
// fuzzy party matching against customers/vendors (+ aliases) and invoice-number
// extraction. Everything carries a confidence so the review UI can gate posting
// (§15/§19: no low-confidence auto-post). No ML — purely deterministic + rules.

import type { ParsedTxn } from './statementParser'

export type Classification =
  | 'customer_receipt'
  | 'vendor_payment'
  | 'bank_charges'
  | 'salary'
  | 'gst_payment'
  | 'loan_emi'
  | 'other'
  | 'unknown'

export interface PartyRef {
  id: string
  name: string
  code?: string
  gstin?: string
}
export interface InvoiceRef {
  id: string
  invoiceNo: string
  companyId: string
  outstanding?: number
}
export interface AliasRef {
  partyType: 'customer' | 'vendor'
  partyId: string
  alias: string
}
export interface RuleRef {
  priority: number
  matchField: 'narration' | 'reference'
  matchOp: 'contains' | 'equals' | 'starts_with' | 'regex'
  matchValue: string
  direction: 'debit' | 'credit' | 'any'
  classification?: string
  partyType?: string
  partyId?: string
  ledgerAccountId?: string
  confidence: number
  active?: boolean
}

export interface ClassifyContext {
  customers: PartyRef[]
  vendors: PartyRef[]
  invoices: InvoiceRef[]
  aliases: AliasRef[]
  rules: RuleRef[]
  /** account id resolved by system_key, e.g. systemAccount('bank_charges'). */
  systemAccount: (key: string) => string | undefined
}

export interface ClassifyResult {
  classification: Classification
  matchedPartyType?: 'customer' | 'vendor' | 'employee' | 'other'
  matchedPartyId?: string
  matchedInvoiceId?: string
  matchedLedgerAccountId?: string
  confidence: number
  reason: string
}

const KEYWORDS: { re: RegExp; cls: Classification; sysKey?: string; conf: number }[] = [
  {
    re: /\b(gst|gstn|tax payment|cgst|sgst|igst)\b/i,
    cls: 'gst_payment',
    sysKey: 'gst_output',
    conf: 85,
  },
  { re: /\b(salary|payroll|wages|sal\b)/i, cls: 'salary', sysKey: 'salary', conf: 85 },
  {
    re: /\b(charges|neft chg|rtgs chg|imps chg|amc|sms charge|bank charge)\b/i,
    cls: 'bank_charges',
    sysKey: 'bank_charges',
    conf: 88,
  },
  { re: /\b(emi|loan|instal?ment)\b/i, cls: 'loan_emi', conf: 75 },
]

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function tokenScore(hay: string, needle: string): number {
  // Fraction of the needle's meaningful tokens present in the haystack.
  const nTokens = normalize(needle)
    .split(' ')
    .filter((t) => t.length >= 3)
  if (!nTokens.length) return 0
  const hits = nTokens.filter((t) => hay.includes(t)).length
  return hits / nTokens.length
}

function matchParty(
  narr: string,
  parties: PartyRef[],
  aliases: AliasRef[],
  type: 'customer' | 'vendor',
) {
  let best: { party: PartyRef; score: number } | null = null
  for (const p of parties) {
    let score = tokenScore(narr, p.name)
    if (p.code && narr.includes(normalize(p.code))) score = Math.max(score, 0.9)
    if (p.gstin && narr.replace(/\s/g, '').includes(p.gstin.toLowerCase())) score = 1
    for (const a of aliases) {
      if (a.partyType === type && a.partyId === p.id) {
        score = Math.max(score, tokenScore(narr, a.alias))
      }
    }
    if (!best || score > best.score) best = { party: p, score }
  }
  return best
}

function extractInvoiceNo(narr: string, invoices: InvoiceRef[]): InvoiceRef | undefined {
  const compact = narr.toUpperCase().replace(/\s/g, '')
  // Direct: the invoice number appears in the narration.
  return invoices.find(
    (inv) => inv.invoiceNo && compact.includes(inv.invoiceNo.toUpperCase().replace(/\s/g, '')),
  )
}

function ruleMatches(rule: RuleRef, txn: ParsedTxn): boolean {
  if (rule.active === false) return false
  const isDebit = txn.debitAmount > 0
  if (rule.direction === 'debit' && !isDebit) return false
  if (rule.direction === 'credit' && isDebit) return false
  const field =
    rule.matchField === 'reference' ? (txn.referenceNumber ?? '') : (txn.narration ?? '')
  const hay = field.toLowerCase()
  const needle = rule.matchValue.toLowerCase()
  switch (rule.matchOp) {
    case 'equals':
      return hay.trim() === needle.trim()
    case 'starts_with':
      return hay.trim().startsWith(needle.trim())
    case 'regex':
      try {
        return new RegExp(rule.matchValue, 'i').test(field)
      } catch {
        return false
      }
    default:
      return hay.includes(needle)
  }
}

export function classifyTxn(txn: ParsedTxn, ctx: ClassifyContext): ClassifyResult {
  const isCredit = txn.creditAmount > 0
  const narr = normalize(txn.narration || '')

  // 1) Configured rules (highest priority first).
  const rules = [...ctx.rules]
    .filter((r) => r.active !== false)
    .sort((a, b) => a.priority - b.priority)
  for (const rule of rules) {
    if (ruleMatches(rule, txn)) {
      return {
        classification:
          (rule.classification as Classification) ||
          (isCredit ? 'customer_receipt' : 'vendor_payment'),
        matchedPartyType: (rule.partyType as ClassifyResult['matchedPartyType']) || undefined,
        matchedPartyId: rule.partyId || undefined,
        matchedLedgerAccountId: rule.ledgerAccountId || undefined,
        confidence: rule.confidence,
        reason: `Rule match: "${rule.matchValue}"`,
      }
    }
  }

  // 2) Keyword heuristics (bank charges / salary / gst / loan).
  for (const k of KEYWORDS) {
    if (k.re.test(txn.narration || '')) {
      return {
        classification: k.cls,
        matchedLedgerAccountId: k.sysKey ? ctx.systemAccount(k.sysKey) : undefined,
        confidence: k.conf,
        reason: 'Keyword match',
      }
    }
  }

  // 3) Party + invoice matching by direction.
  if (isCredit) {
    const cust = matchParty(narr, ctx.customers, ctx.aliases, 'customer')
    const inv = extractInvoiceNo(txn.narration || '', ctx.invoices)
    if (cust && cust.score >= 0.5) {
      const conf = Math.min(99, Math.round(60 + cust.score * 35) + (inv ? 5 : 0))
      return {
        classification: 'customer_receipt',
        matchedPartyType: 'customer',
        matchedPartyId: cust.party.id,
        matchedInvoiceId: inv?.id,
        matchedLedgerAccountId: ctx.systemAccount('ar'),
        confidence: conf,
        reason: inv
          ? `Customer "${cust.party.name}" + invoice ${inv.invoiceNo}`
          : `Customer "${cust.party.name}"`,
      }
    }
    return {
      classification: 'customer_receipt',
      matchedLedgerAccountId: ctx.systemAccount('ar'),
      confidence: 40,
      reason: 'Credit — party not matched',
    }
  } else {
    const vend = matchParty(narr, ctx.vendors, ctx.aliases, 'vendor')
    if (vend && vend.score >= 0.5) {
      const conf = Math.min(99, Math.round(60 + vend.score * 35))
      return {
        classification: 'vendor_payment',
        matchedPartyType: 'vendor',
        matchedPartyId: vend.party.id,
        matchedLedgerAccountId: ctx.systemAccount('ap'),
        confidence: conf,
        reason: `Vendor "${vend.party.name}"`,
      }
    }
    return {
      classification: 'vendor_payment',
      matchedLedgerAccountId: ctx.systemAccount('other_expense'),
      confidence: 40,
      reason: 'Debit — vendor not matched',
    }
  }
}

// Confidence band helper for the UI (§19).
export function confidenceBand(c: number): 'high' | 'medium' | 'review' {
  if (c >= 95) return 'high'
  if (c >= 80) return 'medium'
  return 'review'
}
