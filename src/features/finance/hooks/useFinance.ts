// TanStack Query hooks for Accounts & Finance. Pages talk only to these.

import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import * as api from '../financeApi'
import type {
  Account,
  AccountingPeriod,
  BankAccount,
  BankRule,
  FiscalYear,
  GstRegistration,
  GstReturnPeriod,
  GstTaxRate,
  HsnCode,
} from '../types'

interface CrudApi<T> {
  list: () => Promise<T[]>
  create: (input: Partial<T>) => Promise<T>
  update: (id: string, patch: Partial<T>) => Promise<T>
  remove: (id: string) => Promise<void>
}

function useCrud<T extends { id: string }>(key: QueryKey, crud: CrudApi<T>) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: key })
  const list = useQuery({ queryKey: key, queryFn: crud.list })
  const create = useMutation({ mutationFn: crud.create, onSuccess: invalidate })
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<T> }) => crud.update(id, patch),
    onSuccess: invalidate,
  })
  const remove = useMutation({ mutationFn: (id: string) => crud.remove(id), onSuccess: invalidate })
  return { list, create, update, remove }
}

export const useAccounts = () => useCrud<Account>(qk.fin.accounts, api.accountsApi)
export const useBankAccounts = () => useCrud<BankAccount>(qk.fin.bankAccounts, api.bankAccountsApi)
export const useBankRules = () => useCrud<BankRule>(qk.fin.bankRules, api.bankRulesApi)
export const useGstRegistrations = () =>
  useCrud<GstRegistration>(qk.fin.gstRegistrations, api.gstRegistrationsApi)
export const useGstTaxRates = () => useCrud<GstTaxRate>(qk.fin.gstTaxRates, api.gstTaxRatesApi)
export const useHsnCodes = () => useCrud<HsnCode>(qk.fin.hsnCodes, api.hsnCodesApi)
export const useGstReturns = () => useCrud<GstReturnPeriod>(qk.fin.gstReturns, api.gstReturnsApi)
export const useFiscalYears = () => useCrud<FiscalYear>(qk.fin.fiscalYears, api.fiscalYearsApi)
export const usePeriods = () => useCrud<AccountingPeriod>(qk.fin.periods, api.periodsApi)

export const useSystemAccounts = () =>
  useQuery({ queryKey: ['fin', 'systemAccounts'], queryFn: api.listSystemAccounts })

export const useJournals = () =>
  useQuery({ queryKey: qk.fin.journals, queryFn: api.journalsApi.list })
export const useJournalLines = (journalId: string | undefined) =>
  useQuery({
    queryKey: journalId ? qk.fin.journalLines(journalId) : ['fin', 'journalLines', 'none'],
    queryFn: () => api.journalsApi.lines(journalId as string),
    enabled: !!journalId,
  })

export function useJournalActions() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.fin.journals })
    qc.invalidateQueries({ queryKey: qk.fin.generalLedger })
    qc.invalidateQueries({ queryKey: qk.fin.trialBalance })
  }
  const post = useMutation({ mutationFn: api.postJournal, onSuccess: invalidate })
  const voidJ = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => api.voidJournal(id, reason),
    onSuccess: invalidate,
  })
  return { post, voidJ }
}

export const useGeneralLedger = (opts?: { accountId?: string; from?: string; to?: string }) =>
  useQuery({
    queryKey: [...qk.fin.generalLedger, opts],
    queryFn: () => api.listGeneralLedger(opts),
  })
export const useTrialBalance = () =>
  useQuery({ queryKey: qk.fin.trialBalance, queryFn: api.listTrialBalance })

// ---- Bank import -----------------------------------------------------------
export const useStatementFiles = () =>
  useQuery({ queryKey: qk.fin.statementFiles, queryFn: api.statementFilesApi.list })

// ---- E-invoice / E-way -----------------------------------------------------
export const useEInvoices = () =>
  useQuery({ queryKey: qk.fin.einvoices, queryFn: api.einvoiceApi.list })
export const useEwayBills = () =>
  useQuery({ queryKey: qk.fin.ewayBills, queryFn: api.ewayApi.list })

export function useEInvoiceActions() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.fin.einvoices })
  const generate = useMutation({ mutationFn: api.generateEInvoice, onSuccess: invalidate })
  const cancel = useMutation({
    mutationFn: ({
      rec,
      reason,
    }: {
      rec: Parameters<typeof api.cancelEInvoice>[0]
      reason: string
    }) => api.cancelEInvoice(rec, reason),
    onSuccess: invalidate,
  })
  return { generate, cancel }
}

export function useEwayActions() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.fin.ewayBills })
  const generate = useMutation({ mutationFn: api.generateEway, onSuccess: invalidate })
  const cancel = useMutation({
    mutationFn: ({ rec, reason }: { rec: Parameters<typeof api.cancelEway>[0]; reason: string }) =>
      api.cancelEway(rec, reason),
    onSuccess: invalidate,
  })
  return { generate, cancel }
}

export const useBankTxns = (fileId?: string) =>
  useQuery({ queryKey: qk.fin.bankTxns(fileId), queryFn: () => api.listBankTxns(fileId) })

export function useBankImportActions() {
  const qc = useQueryClient()
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['fin', 'bankTxns'] })
    qc.invalidateQueries({ queryKey: qk.fin.statementFiles })
    qc.invalidateQueries({ queryKey: qk.payments.all })
    qc.invalidateQueries({ queryKey: qk.expenses.all })
    qc.invalidateQueries({ queryKey: qk.fin.journals })
    qc.invalidateQueries({ queryKey: qk.fin.trialBalance })
  }
  const updateTxn = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateBankTxn>[1] }) =>
      api.updateBankTxn(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fin', 'bankTxns'] }),
  })
  const post = useMutation({
    mutationFn: ({
      id,
      overrides,
    }: {
      id: string
      overrides?: Parameters<typeof api.postBankTxn>[1]
    }) => api.postBankTxn(id, overrides),
    onSuccess: invalidateAll,
  })
  const split = useMutation({
    mutationFn: ({ id, splits }: { id: string; splits: api.BankSplit[] }) =>
      api.postBankTxnSplit(id, splits),
    onSuccess: invalidateAll,
  })
  return { updateTxn, post, split, invalidateAll }
}
