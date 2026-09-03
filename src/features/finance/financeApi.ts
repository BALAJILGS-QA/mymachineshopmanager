// Accounts & Finance data access. Simple masters use the shared generic CRUD
// over rowMap `maps`; rule-bearing operations (balanced journal posting, bank
// transaction posting, duplicate detection) go through the Postgres RPCs from
// migrations 0022–0024. Reads degrade to [] without Supabase.

import { supabase, isSupabaseEnabled } from '@/data/supabase'
import { maps, fromRow, type Row } from '@/lib/api/rowMap'
import { selectAll, insertRow, updateRow, deleteRow } from '@/lib/api/supabaseCrud'
import { uid } from '@/lib/id'
import type {
  Account,
  AccountingPeriod,
  BankAccount,
  BankRule,
  BankTxn,
  EInvoiceRecord,
  EwayBill,
  FiscalYear,
  GLRow,
  GstRegistration,
  GstReturnPeriod,
  GstTaxRate,
  HsnCode,
  Journal,
  JournalLine,
  StatementFile,
  TrialBalanceRow,
} from './types'

type MapKey = keyof typeof maps
function enabled() {
  return isSupabaseEnabled() && !!supabase
}

function crud<T extends { id: string }>(mapKey: MapKey, idPrefix: string) {
  const map = maps[mapKey]
  return {
    list: async (): Promise<T[]> => (enabled() ? selectAll<T>(map) : []),
    create: async (input: Partial<T>): Promise<T> =>
      insertRow<T>(map, { id: uid(idPrefix), ...input } as Record<string, unknown>),
    update: async (id: string, patch: Partial<T>): Promise<T> =>
      updateRow<T>(map, id, patch as Record<string, unknown>),
    remove: async (id: string): Promise<void> => deleteRow(map, id),
  }
}

// ---- Masters ---------------------------------------------------------------
export const accountsApi = crud<Account>('chartOfAccounts', 'coa_u_')
export const bankAccountsApi = crud<BankAccount>('bankAccounts', 'ba_')
export const bankRulesApi = crud<BankRule>('bankTxnRules', 'btr_')
export const gstRegistrationsApi = crud<GstRegistration>('gstRegistrations', 'gstr_')
export const gstTaxRatesApi = crud<GstTaxRate>('gstTaxRates', 'gtr_')
export const hsnCodesApi = crud<HsnCode>('hsnCodes', 'hsn_')
export const gstReturnsApi = crud<GstReturnPeriod>('gstReturnPeriods', 'gret_')
export const einvoiceApi = crud<EInvoiceRecord>('einvoiceRecords', 'einv_')
export const ewayApi = crud<EwayBill>('ewayBills', 'ewb_')
export const fiscalYearsApi = crud<FiscalYear>('fiscalYears', 'fy_')
export const periodsApi = crud<AccountingPeriod>('accountingPeriods', 'per_')

// ---- System accounts (system_key → account) --------------------------------
export async function listSystemAccounts(): Promise<Record<string, string>> {
  if (!enabled() || !supabase) return {}
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .select('id, system_key')
    .not('system_key', 'is', null)
  if (error) throw error
  const out: Record<string, string> = {}
  for (const r of data ?? []) out[String(r.system_key)] = String(r.id)
  return out
}

// ---- Journals --------------------------------------------------------------
export const journalsApi = {
  list: async (): Promise<Journal[]> => (enabled() ? selectAll<Journal>(maps.journals) : []),
  lines: async (journalId: string): Promise<JournalLine[]> => {
    if (!enabled() || !supabase) return []
    const { data, error } = await supabase
      .from('journal_lines')
      .select('*')
      .eq('journal_id', journalId)
    if (error) throw error
    return (data ?? []).map((r) => fromRow<JournalLine>(r as Row, maps.journalLines))
  },
}

export interface JournalLineInput {
  accountId: string
  debit: number
  credit: number
  description?: string
  partyType?: string
  partyId?: string
}

export async function postJournal(input: {
  companyId?: string
  date: string
  narration?: string
  lines: JournalLineInput[]
  source?: string
}): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('post_journal', {
    p_company_id: input.companyId ?? null,
    p_date: input.date,
    p_narration: input.narration ?? null,
    p_lines: input.lines.map((l) => ({
      account_id: l.accountId,
      debit: l.debit,
      credit: l.credit,
      description: l.description ?? null,
      party_type: l.partyType ?? null,
      party_id: l.partyId ?? null,
    })),
    p_source: input.source ?? 'manual',
    p_source_type: null,
    p_source_id: null,
    p_status: 'posted',
  })
  if (error) throw error
  return data as string
}

export async function voidJournal(id: string, reason?: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.rpc('void_journal', { p_id: id, p_reason: reason ?? null })
  if (error) throw error
}

// ---- General ledger / trial balance (views) --------------------------------
export async function listGeneralLedger(opts?: {
  accountId?: string
  from?: string
  to?: string
}): Promise<GLRow[]> {
  if (!enabled() || !supabase) return []
  let q = supabase
    .from('general_ledger')
    .select('*')
    .order('date', { ascending: false })
    .limit(1000)
  if (opts?.accountId) q = q.eq('account_id', opts.accountId)
  if (opts?.from) q = q.gte('date', opts.from)
  if (opts?.to) q = q.lte('date', opts.to)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((r) => ({
    lineId: String(r.line_id),
    journalId: String(r.journal_id),
    journalNo: (r.journal_no as string) ?? undefined,
    date: String(r.date),
    companyId: (r.company_id as string) ?? undefined,
    narration: (r.narration as string) ?? undefined,
    source: String(r.source),
    accountId: String(r.account_id),
    accountCode: String(r.account_code),
    accountName: String(r.account_name),
    accountType: r.account_type as GLRow['accountType'],
    debit: Number(r.debit ?? 0),
    credit: Number(r.credit ?? 0),
    description: (r.description as string) ?? undefined,
    partyType: (r.party_type as string) ?? undefined,
    partyId: (r.party_id as string) ?? undefined,
  }))
}

export async function listTrialBalance(): Promise<TrialBalanceRow[]> {
  if (!enabled() || !supabase) return []
  const { data, error } = await supabase.from('trial_balance').select('*').order('account_code')
  if (error) throw error
  return (data ?? []).map((r) => ({
    accountId: String(r.account_id),
    accountCode: String(r.account_code),
    accountName: String(r.account_name),
    accountType: r.account_type as TrialBalanceRow['accountType'],
    companyId: (r.company_id as string) ?? undefined,
    openingBalance: Number(r.opening_balance ?? 0),
    totalDebit: Number(r.total_debit ?? 0),
    totalCredit: Number(r.total_credit ?? 0),
    balance: Number(r.balance ?? 0),
  }))
}

// ---- Bank statement import -------------------------------------------------
export async function findStatementByHash(hash: string): Promise<StatementFile | undefined> {
  if (!enabled() || !supabase) return undefined
  const { data, error } = await supabase
    .from('bank_statement_files')
    .select('*')
    .eq('file_hash', hash)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? fromRow<StatementFile>(data as Row, maps.bankStatementFiles) : undefined
}

export async function createStatementFile(input: Partial<StatementFile>): Promise<StatementFile> {
  return insertRow<StatementFile>(maps.bankStatementFiles, {
    id: uid('bsf_'),
    status: 'parsed',
    ...input,
  } as Record<string, unknown>)
}

export async function updateStatementFile(
  id: string,
  patch: Partial<StatementFile>,
): Promise<void> {
  if (!supabase) return
  await updateRow(maps.bankStatementFiles, id, patch as Record<string, unknown>)
}

// Bulk-insert canonical transactions for a parsed file. Only defined fields are
// written so DB defaults (created_at/updated_at = now()) apply instead of null.
export async function insertBankTxns(txns: Partial<BankTxn>[]): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')
  const map = maps.bankTransactions
  const rows: Row[] = txns.map((t) => {
    const entity = { id: uid('btx_'), ...t } as Record<string, unknown>
    const row: Row = {}
    for (const [tsField, col] of Object.entries(map.fields)) {
      const v = entity[tsField]
      if (v !== undefined) row[col] = v
    }
    return row
  })
  const { error } = await supabase.from('bank_transactions').insert(rows)
  if (error) throw error
}

export async function listBankTxns(fileId?: string): Promise<BankTxn[]> {
  if (!enabled() || !supabase) return []
  let q = supabase
    .from('bank_transactions')
    .select('*')
    .order('transaction_date', { ascending: true })
  if (fileId) q = q.eq('statement_file_id', fileId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((r) => fromRow<BankTxn>(r as Row, maps.bankTransactions))
}

export async function updateBankTxn(id: string, patch: Partial<BankTxn>): Promise<BankTxn> {
  return updateRow<BankTxn>(maps.bankTransactions, id, patch as Record<string, unknown>)
}

export async function detectDuplicates(fileId: string): Promise<number> {
  if (!supabase) return 0
  const { data, error } = await supabase.rpc('detect_bank_duplicates', { p_file_id: fileId })
  if (error) throw error
  return Number(data ?? 0)
}

export async function postBankTxn(
  txnId: string,
  overrides?: {
    ledgerAccountId?: string
    partyType?: string
    partyId?: string
    invoiceId?: string
    category?: string
  },
): Promise<{ payment_id?: string; expense_id?: string; journal_id?: string }> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('post_bank_txn', {
    p_txn_id: txnId,
    p_ledger_account_id: overrides?.ledgerAccountId ?? null,
    p_party_type: overrides?.partyType ?? null,
    p_party_id: overrides?.partyId ?? null,
    p_invoice_id: overrides?.invoiceId ?? null,
    p_category: overrides?.category ?? null,
  })
  if (error) throw error
  return (data ?? {}) as { payment_id?: string; expense_id?: string; journal_id?: string }
}

export interface BankSplit {
  ledgerAccountId: string
  amount: number
  partyType?: string
  partyId?: string
  description?: string
  category?: string
}

export async function postBankTxnSplit(
  txnId: string,
  splits: BankSplit[],
): Promise<{ journal_id?: string; splits?: number }> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('post_bank_txn_split', {
    p_txn_id: txnId,
    p_splits: splits.map((s) => ({
      ledger_account_id: s.ledgerAccountId,
      amount: s.amount,
      party_type: s.partyType ?? null,
      party_id: s.partyId ?? null,
      description: s.description ?? null,
      category: s.category ?? null,
    })),
  })
  if (error) throw error
  return (data ?? {}) as { journal_id?: string; splits?: number }
}

export const statementFilesApi = {
  list: async (): Promise<StatementFile[]> =>
    enabled() ? selectAll<StatementFile>(maps.bankStatementFiles) : [],
}

// ---- E-invoice / E-way (server route generates; client persists under RLS) --
export async function generateEInvoice(input: {
  invoiceId: string
  companyId?: string
  invoiceNo: string
  invoiceDate: string
  supplierGstin?: string
  recipientGstin?: string
  totalValue?: number
}): Promise<EInvoiceRecord> {
  const res = await fetch('/api/einvoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'generate', input }),
  })
  const data = await res.json()
  if (!res.ok || data.status === 'failed')
    throw new Error(data.error || data.errorMessage || 'E-invoice generation failed')
  return einvoiceApi.create({
    invoiceId: input.invoiceId,
    companyId: input.companyId,
    status: data.status,
    provider: data.provider,
    irn: data.irn,
    ackNo: data.ackNo,
    ackDate: data.ackDate,
  } as Partial<EInvoiceRecord>)
}

export async function cancelEInvoice(rec: EInvoiceRecord, reason: string): Promise<void> {
  const res = await fetch('/api/einvoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cancel', irn: rec.irn, reason }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Cancel failed')
  await einvoiceApi.update(rec.id, { status: 'cancelled' } as Partial<EInvoiceRecord>)
}

export async function generateEway(input: {
  invoiceId: string
  companyId?: string
  documentNo: string
  documentDate: string
  supplierGstin?: string
  recipientGstin?: string
  transportMode?: string
  vehicleNumber?: string
  invoiceValue?: number
  distanceKm?: number
}): Promise<EwayBill> {
  const res = await fetch('/api/eway', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'generate', input }),
  })
  const data = await res.json()
  if (!res.ok || data.status === 'failed')
    throw new Error(data.error || data.errorMessage || 'E-way generation failed')
  return ewayApi.create({
    invoiceId: input.invoiceId,
    companyId: input.companyId,
    documentNo: input.documentNo,
    documentDate: input.documentDate,
    supplierGstin: input.supplierGstin,
    recipientGstin: input.recipientGstin,
    transportMode: input.transportMode,
    vehicleNumber: input.vehicleNumber,
    invoiceValue: input.invoiceValue,
    ewbNumber: data.ewbNumber,
    validUntil: data.validUntil,
    generatedDate: new Date().toISOString(),
    status: data.status,
    provider: data.provider,
  } as Partial<EwayBill>)
}

export async function cancelEway(rec: EwayBill, reason: string): Promise<void> {
  const res = await fetch('/api/eway', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cancel', ewb: rec.ewbNumber, reason }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Cancel failed')
  await ewayApi.update(rec.id, {
    status: 'cancelled',
    cancellationDate: new Date().toISOString(),
  } as Partial<EwayBill>)
}
