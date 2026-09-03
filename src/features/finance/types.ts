// Domain types for the Accounts & Finance module. camelCase mirrors the rowMap
// `maps.*` finance entries; DB columns are snake_case.

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense'

export interface Account {
  id: string
  companyId?: string
  code: string
  name: string
  type: AccountType
  parentId?: string
  isGroup: boolean
  systemKey?: string
  gstRelevant: boolean
  openingBalance: number
  active: boolean
  createdAt?: string
  updatedAt?: string
}

export interface FiscalYear {
  id: string
  companyId?: string
  name: string
  startDate: string
  endDate: string
  status: 'open' | 'closed' | 'locked'
}

export interface AccountingPeriod {
  id: string
  fiscalYearId: string
  companyId?: string
  name: string
  startDate: string
  endDate: string
  status: 'open' | 'closed' | 'locked'
}

export interface Journal {
  id: string
  companyId?: string
  journalNo?: string
  date: string
  periodId?: string
  narration?: string
  source: string
  sourceType?: string
  sourceId?: string
  status: 'draft' | 'posted' | 'void'
  createdBy?: string
  postedBy?: string
  postedAt?: string
  createdAt?: string
}

export interface JournalLine {
  id: string
  journalId: string
  accountId: string
  debit: number
  credit: number
  description?: string
  partyType?: string
  partyId?: string
  lineNo?: number
}

export interface GLRow {
  lineId: string
  journalId: string
  journalNo?: string
  date: string
  companyId?: string
  narration?: string
  source: string
  accountId: string
  accountCode: string
  accountName: string
  accountType: AccountType
  debit: number
  credit: number
  description?: string
  partyType?: string
  partyId?: string
}

export interface TrialBalanceRow {
  accountId: string
  accountCode: string
  accountName: string
  accountType: AccountType
  companyId?: string
  openingBalance: number
  totalDebit: number
  totalCredit: number
  balance: number
}

export interface BankAccount {
  id: string
  companyId?: string
  name: string
  bankName?: string
  accountNumber?: string
  ifsc?: string
  branch?: string
  accountType?: string
  openingBalance: number
  ledgerAccountId?: string
  active: boolean
  createdAt?: string
}

export interface StatementFile {
  id: string
  companyId?: string
  bankAccountId?: string
  fileName: string
  fileHash: string
  fileSize?: number
  parserType?: string
  rowCount: number
  status: 'uploaded' | 'parsed' | 'reviewed' | 'posted' | 'partial'
  meta?: Record<string, unknown>
  importedBy?: string
  importedAt?: string
}

export type DupStatus = 'new' | 'possible_duplicate' | 'duplicate' | 'ignored'
export type ReviewStatus = 'pending' | 'approved' | 'ignored'

export interface BankTxn {
  id: string
  bankAccountId: string
  statementFileId?: string
  companyId?: string
  transactionDate: string
  valueDate?: string
  narration?: string
  referenceNumber?: string
  chequeNumber?: string
  debitAmount: number
  creditAmount: number
  balanceAfter?: number
  currency: string
  sourceRowNumber?: number
  parserType?: string
  parserConfidence?: number
  classification?: string
  matchedPartyType?: string
  matchedPartyId?: string
  matchedInvoiceId?: string
  matchedLedgerAccountId?: string
  confidence: number
  dedupeHash?: string
  dupStatus: DupStatus
  reviewStatus: ReviewStatus
  reconciliationStatus: 'unreconciled' | 'reconciled'
  postingStatus: 'unposted' | 'posted'
  postedPaymentId?: string
  postedExpenseId?: string
  postedJournalId?: string
  notes?: string
}

export interface BankRule {
  id: string
  companyId?: string
  name: string
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
  active: boolean
}

export interface GstRegistration {
  id: string
  companyId?: string
  legalName: string
  tradeName?: string
  gstin: string
  registrationType?: string
  state?: string
  stateCode?: string
  pan?: string
  address?: string
  effectiveDate?: string
  status: 'active' | 'inactive'
  isDefault: boolean
}

export interface GstTaxRate {
  id: string
  name: string
  totalRate: number
  cgst: number
  sgst: number
  igst: number
  cess: number
  active: boolean
}

export interface HsnCode {
  id: string
  code: string
  kind: 'hsn' | 'sac'
  description?: string
  taxRateId?: string
  unit?: string
  active: boolean
}

export interface GstReturnPeriod {
  id: string
  companyId?: string
  gstin?: string
  period: string
  returnType: 'GSTR1' | 'GSTR3B' | 'GSTR2B'
  status: 'draft' | 'prepared' | 'exported' | 'filed'
  summary?: Record<string, unknown>
  preparedAt?: string
  filedAt?: string
}

export interface EInvoiceRecord {
  id: string
  invoiceId?: string
  companyId?: string
  status: 'not_applicable' | 'pending' | 'submitted' | 'generated' | 'failed' | 'cancelled'
  provider?: string
  irn?: string
  ackNo?: string
  ackDate?: string
  errorMessage?: string
}

export interface EwayBill {
  id: string
  invoiceId?: string
  companyId?: string
  ewbNumber?: string
  documentNo?: string
  documentDate?: string
  supplierGstin?: string
  recipientGstin?: string
  taxableValue?: number
  invoiceValue?: number
  transporterName?: string
  vehicleNumber?: string
  generatedDate?: string
  validUntil?: string
  status: 'draft' | 'generated' | 'cancelled' | 'rejected' | 'expired'
}
