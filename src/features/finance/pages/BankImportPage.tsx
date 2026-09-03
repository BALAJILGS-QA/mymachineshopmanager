import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, FileSpreadsheet, Upload, X } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/common/DataTable'
import { Badge, Card, Field, Select } from '@/components/ui/primitives'
import { StatTile } from '@/components/common/StatTile'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { toUserMessage } from '@/lib/api/errors'
import { currency, fmtDate } from '@/lib/format'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useVendors } from '@/features/vendors/hooks/useVendors'
import { useInvoices } from '@/features/invoices/hooks/useInvoices'
import { useFinanceAccess } from '../access'
import {
  useAccounts,
  useBankAccounts,
  useBankImportActions,
  useBankRules,
  useBankTxns,
  useSystemAccounts,
} from '../hooks/useFinance'
import * as api from '../financeApi'
import { parseStatement, dedupeHash, sha256Hex } from '../lib/statementParser'
import { classifyTxn, confidenceBand, type ClassifyContext } from '../lib/classify'
import type { BankTxn } from '../types'

const CLS_LABEL: Record<string, string> = {
  customer_receipt: 'Receipt',
  vendor_payment: 'Payment',
  bank_charges: 'Bank Charges',
  salary: 'Salary',
  gst_payment: 'GST Payment',
  loan_emi: 'Loan / EMI',
  other: 'Other',
  unknown: 'Needs Review',
}

export function BankImportPage() {
  const bankAccounts = (useBankAccounts().list.data ?? []).filter((b) => b.active)
  const companies = useCompanies().data ?? []
  const vendors = useVendors().data ?? []
  const invoices = useInvoices().data ?? []
  const accounts = (useAccounts().list.data ?? []).filter((a) => !a.isGroup)
  const rules = useBankRules().list.data ?? []
  const systemAccounts = useSystemAccounts().data ?? {}
  const perms = useFinanceAccess()
  const canImport = perms.can('BANK_IMPORT')
  const toast = useToast()
  const confirm = useConfirm()
  const fileInput = useRef<HTMLInputElement>(null)

  const [bankAccountId, setBankAccountId] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [activeFileId, setActiveFileId] = useState<string | undefined>()
  const [edit, setEdit] = useState<BankTxn | null>(null)
  const [splitting, setSplitting] = useState<BankTxn | null>(null)

  const { post, updateTxn, split } = useBankImportActions()
  const txns = useBankTxns(activeFileId).data ?? []

  const partyName = (id?: string) =>
    companies.find((c) => c.id === id)?.name ?? vendors.find((v) => v.id === id)?.name ?? '—'
  const invoiceNo = (id?: string) => invoices.find((i) => i.id === id)?.invoiceNo ?? '—'

  const ctx: ClassifyContext = useMemo(
    () => ({
      customers: companies.map((c) => ({ id: c.id, name: c.name, code: c.code, gstin: c.gstin })),
      vendors: vendors.map((v) => ({ id: v.id, name: v.name, code: v.code, gstin: v.gstin })),
      invoices: invoices.map((i) => ({ id: i.id, invoiceNo: i.invoiceNo, companyId: i.companyId })),
      aliases: [],
      rules: rules.map((r) => ({ ...r })),
      systemAccount: (k) => systemAccounts[k],
    }),
    [companies, vendors, invoices, rules, systemAccounts],
  )

  async function onPick(file: File) {
    if (!bankAccountId) {
      toast.error('Select a bank account first')
      return
    }
    const bank = bankAccounts.find((b) => b.id === bankAccountId)
    setBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const hash = await sha256Hex(buf)
      const existing = await api.findStatementByHash(hash)
      if (existing) {
        const go = await confirm({
          title: 'Statement already imported',
          message: `This exact file ("${existing.fileName}") appears to have been imported already. Import it again anyway?`,
          confirmLabel: 'Import again',
          danger: true,
        })
        if (!go) {
          setBusy(false)
          return
        }
      }

      const parsed = await parseStatement(file, setStatus)
      if (parsed.rows.length === 0) {
        toast.error(parsed.warnings[0] ?? 'No transactions found in the file')
        setBusy(false)
        return
      }

      const fileRow = await api.createStatementFile({
        companyId: bank?.companyId,
        bankAccountId,
        fileName: file.name,
        fileHash: hash,
        fileSize: file.size,
        parserType: parsed.parserType,
        rowCount: parsed.rows.length,
        status: 'parsed',
        meta: { columnMap: parsed.columnMap, parserConfidence: parsed.parserConfidence },
      })

      // Classify + build canonical rows.
      const rows: Partial<BankTxn>[] = []
      for (const t of parsed.rows) {
        const c = classifyTxn(t, ctx)
        rows.push({
          bankAccountId,
          statementFileId: fileRow.id,
          companyId: bank?.companyId,
          transactionDate: t.transactionDate,
          valueDate: t.valueDate,
          narration: t.narration,
          referenceNumber: t.referenceNumber,
          chequeNumber: t.chequeNumber,
          debitAmount: t.debitAmount,
          creditAmount: t.creditAmount,
          balanceAfter: t.balanceAfter,
          currency: 'INR',
          sourceRowNumber: t.sourceRowNumber,
          parserType: parsed.parserType,
          parserConfidence: t.parserConfidence,
          classification: c.classification,
          matchedPartyType: c.matchedPartyType,
          matchedPartyId: c.matchedPartyId,
          matchedInvoiceId: c.matchedInvoiceId,
          matchedLedgerAccountId: c.matchedLedgerAccountId,
          confidence: c.confidence,
          dedupeHash: await dedupeHash(bankAccountId, t),
          dupStatus: 'new',
          reviewStatus: 'pending',
          reconciliationStatus: 'unreconciled',
          postingStatus: 'unposted',
        })
      }
      await api.insertBankTxns(rows)
      const dupes = await api.detectDuplicates(fileRow.id)
      setActiveFileId(fileRow.id)
      toast.success(
        `Imported ${rows.length} transactions${dupes ? ` — ${dupes} flagged as duplicates` : ''}`,
      )
    } catch (e) {
      toast.error(toUserMessage(e, 'Could not process the statement'))
    } finally {
      setBusy(false)
      setStatus('')
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  // A transaction is "ready" to auto-post only when BOTH its classification and
  // its parser confidence are high, it isn't a duplicate, and isn't posted.
  const isReady = (t: BankTxn) =>
    t.postingStatus === 'unposted' &&
    t.dupStatus !== 'duplicate' &&
    t.reviewStatus !== 'ignored' &&
    t.confidence >= 80 &&
    (t.parserConfidence ?? 100) >= 80

  const summary = useMemo(() => {
    const s = { total: txns.length, dup: 0, review: 0, posted: 0, ready: 0 }
    for (const t of txns) {
      if (t.dupStatus === 'duplicate') s.dup++
      if (t.postingStatus === 'posted') s.posted++
      else if (isReady(t)) s.ready++
      else s.review++
    }
    return s
  }, [txns])

  async function postOne(t: BankTxn) {
    try {
      await post.mutateAsync({ id: t.id })
      toast.success('Posted')
    } catch (e) {
      toast.error(toUserMessage(e, 'Posting failed'))
    }
  }

  async function postAllReady() {
    const ready = txns.filter(isReady)
    if (!ready.length) return toast.info('Nothing ready to post')
    const ok = await confirm({
      title: 'Post high-confidence transactions',
      message: `Post ${ready.length} transaction(s) with confidence ≥ 80%? Each creates a payment/receipt or expense plus a balanced journal.`,
      confirmLabel: 'Post all',
    })
    if (!ok) return
    let done = 0
    for (const t of ready) {
      try {
        await post.mutateAsync({ id: t.id })
        done++
      } catch {
        /* keep going; errors surfaced per row on retry */
      }
    }
    toast.success(`Posted ${done}/${ready.length}`)
  }

  async function ignore(t: BankTxn) {
    await updateTxn.mutateAsync({
      id: t.id,
      patch: { reviewStatus: 'ignored', dupStatus: 'ignored' },
    })
  }

  const columns: DataTableColumn<BankTxn>[] = [
    {
      key: 'date',
      header: 'Date',
      cellClassName: 'whitespace-nowrap tnum text-xs',
      render: (t) => fmtDate(t.transactionDate),
    },
    {
      key: 'narration',
      header: 'Narration',
      cellClassName: 'max-w-xs',
      render: (t) => <span className="line-clamp-2 text-xs text-slate-600">{t.narration}</span>,
    },
    {
      key: 'debit',
      header: 'Debit',
      cellClassName: 'tnum text-right text-red-600',
      headerClassName: 'text-right',
      render: (t) => (t.debitAmount ? currency(t.debitAmount) : '—'),
    },
    {
      key: 'credit',
      header: 'Credit',
      cellClassName: 'tnum text-right text-emerald-600',
      headerClassName: 'text-right',
      render: (t) => (t.creditAmount ? currency(t.creditAmount) : '—'),
    },
    {
      key: 'type',
      header: 'Suggested',
      render: (t) => (
        <Badge tone="blue">{CLS_LABEL[t.classification ?? 'unknown'] ?? t.classification}</Badge>
      ),
    },
    {
      key: 'party',
      header: 'Party',
      cellClassName: 'text-xs',
      render: (t) => (t.matchedPartyId ? partyName(t.matchedPartyId) : '—'),
    },
    {
      key: 'invoice',
      header: 'Invoice',
      cellClassName: 'text-xs',
      render: (t) => (t.matchedInvoiceId ? invoiceNo(t.matchedInvoiceId) : '—'),
    },
    {
      key: 'confidence',
      header: 'Conf.',
      cellClassName: 'tnum',
      render: (t) => {
        const band = confidenceBand(t.confidence)
        return (
          <Badge tone={band === 'high' ? 'green' : band === 'medium' ? 'amber' : 'red'}>
            {t.confidence}%
          </Badge>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) =>
        t.postingStatus === 'posted' ? (
          <Badge tone="green">Posted</Badge>
        ) : t.dupStatus === 'duplicate' ? (
          <Badge tone="red">Duplicate</Badge>
        ) : t.dupStatus === 'possible_duplicate' ? (
          <Badge tone="amber">Possible dup</Badge>
        ) : t.reviewStatus === 'ignored' ? (
          <Badge tone="slate">Ignored</Badge>
        ) : (
          <Badge tone="blue">New</Badge>
        ),
    },
    {
      key: 'actions',
      header: 'Action',
      headerClassName: 'text-right',
      render: (t) => (
        <div className="flex justify-end gap-1">
          {t.postingStatus === 'unposted' &&
            t.dupStatus !== 'duplicate' &&
            t.reviewStatus !== 'ignored' && (
              <>
                <button
                  className="btn-ghost btn-sm text-emerald-600"
                  onClick={() => postOne(t)}
                  title="Approve & post"
                >
                  <Check size={15} />
                </button>
                <button className="btn-ghost btn-sm" onClick={() => setEdit(t)} title="Edit">
                  Edit
                </button>
                <button className="btn-ghost btn-sm" onClick={() => setSplitting(t)} title="Split">
                  Split
                </button>
                <button
                  className="btn-ghost btn-sm text-slate-400"
                  onClick={() => ignore(t)}
                  title="Ignore"
                >
                  <X size={15} />
                </button>
              </>
            )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Bank Statement Import"
        subtitle="Upload a statement → auto-extract, classify, de-duplicate, review, and post to Payments / Receipts with balanced journals"
        actions={
          activeFileId &&
          canImport && (
            <button className="btn-primary btn-sm" onClick={postAllReady} disabled={post.isPending}>
              <Check size={16} /> Post high-confidence
            </button>
          )
        }
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Bank account" className="w-64">
            <Select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
              <option value="">— Select —</option>
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.bankName ? ` · ${b.bankName}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.xlsx,.xlsm,.pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
          />
          <button
            className="btn-primary btn-sm"
            disabled={!bankAccountId || busy || !canImport}
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={16} /> {busy ? 'Processing…' : 'Upload statement'}
          </button>
          <span className="text-xs text-slate-500">
            {status ||
              'CSV, Excel (.xlsx) or PDF (text or scanned — OCR). Columns are auto-detected; PDF/OCR rows always need review.'}
          </span>
        </div>
        {bankAccounts.length === 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
            <AlertTriangle size={14} /> Add a bank account first (Accounts → Bank Accounts).
          </p>
        )}
      </Card>

      {activeFileId && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            <StatTile
              icon={<FileSpreadsheet size={20} />}
              label="Transactions"
              value={summary.total}
              tone="blue"
            />
            <StatTile icon={<Check size={20} />} label="Ready" value={summary.ready} tone="green" />
            <StatTile
              icon={<AlertTriangle size={20} />}
              label="Needs review"
              value={summary.review}
              tone="amber"
            />
            <StatTile icon={<X size={20} />} label="Duplicates" value={summary.dup} tone="red" />
            <StatTile
              icon={<Check size={20} />}
              label="Posted"
              value={summary.posted}
              tone="violet"
            />
          </div>

          <Card>
            <DataTable
              columns={columns}
              rows={txns}
              rowKey={(t) => t.id}
              minWidthClassName="min-w-[72rem]"
              empty={{
                icon: <FileSpreadsheet size={40} />,
                title: 'No transactions',
                description: 'Upload a statement to begin.',
              }}
            />
          </Card>
        </>
      )}

      {edit && (
        <EditTxnModal
          txn={edit}
          accounts={accounts}
          companies={companies}
          vendors={vendors}
          invoices={invoices}
          onClose={() => setEdit(null)}
          onSave={async (patch) => {
            await updateTxn.mutateAsync({ id: edit.id, patch })
            setEdit(null)
          }}
          onPost={async (overrides) => {
            try {
              await post.mutateAsync({ id: edit.id, overrides })
              toast.success('Posted')
              setEdit(null)
            } catch (e) {
              toast.error(toUserMessage(e, 'Posting failed'))
            }
          }}
        />
      )}

      {splitting && (
        <SplitTxnModal
          txn={splitting}
          accounts={accounts}
          vendors={vendors}
          companies={companies}
          onClose={() => setSplitting(null)}
          onPost={async (splits) => {
            try {
              await split.mutateAsync({ id: splitting.id, splits })
              toast.success('Split posted')
              setSplitting(null)
            } catch (e) {
              toast.error(toUserMessage(e, 'Split failed'))
            }
          }}
        />
      )}
    </div>
  )
}

// ---- Split one bank transaction across multiple postings (§22) -------------
function SplitTxnModal({
  txn,
  accounts,
  vendors,
  companies,
  onClose,
  onPost,
}: {
  txn: BankTxn
  accounts: { id: string; code: string; name: string }[]
  vendors: { id: string; name: string }[]
  companies: { id: string; name: string }[]
  onClose: () => void
  onPost: (
    splits: {
      ledgerAccountId: string
      amount: number
      partyType?: string
      partyId?: string
      category?: string
    }[],
  ) => Promise<void>
}) {
  const isCredit = txn.creditAmount > 0
  const total = isCredit ? txn.creditAmount : txn.debitAmount
  const parties = isCredit ? companies : vendors
  const [lines, setLines] = useState([
    { ledgerAccountId: '', amount: '', partyId: '', category: '' },
    { ledgerAccountId: '', amount: '', partyId: '', category: '' },
  ])
  const sum = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const balanced = Math.abs(sum - total) < 0.005

  return (
    <Modal
      open
      onClose={onClose}
      title="Split transaction"
      size="lg"
      footer={
        <>
          <div className="mr-auto text-sm">
            <span className="tnum">{currency(sum)}</span> / {currency(total)}{' '}
            {balanced ? (
              <Badge tone="green">Balanced</Badge>
            ) : (
              <Badge tone="red">Off by {currency(total - sum)}</Badge>
            )}
          </div>
          <button className="btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary btn-sm"
            disabled={!balanced}
            onClick={() =>
              onPost(
                lines
                  .filter((l) => l.ledgerAccountId && Number(l.amount))
                  .map((l) => ({
                    ledgerAccountId: l.ledgerAccountId,
                    amount: Number(l.amount),
                    partyType: isCredit ? 'customer' : 'vendor',
                    partyId: l.partyId || undefined,
                    category: l.category || undefined,
                  })),
              )
            }
          >
            Post split
          </button>
        </>
      }
    >
      <p className="mb-3 text-xs text-slate-500">
        {fmtDate(txn.transactionDate)} · {isCredit ? 'Credit' : 'Debit'} {currency(total)} —{' '}
        {txn.narration}
      </p>
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_8rem_2rem]">
            <Select
              value={l.ledgerAccountId}
              onChange={(e) =>
                setLines((ls) =>
                  ls.map((x, idx) => (idx === i ? { ...x, ledgerAccountId: e.target.value } : x)),
                )
              }
            >
              <option value="">— Ledger account —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </Select>
            <Select
              value={l.partyId}
              onChange={(e) =>
                setLines((ls) =>
                  ls.map((x, idx) => (idx === i ? { ...x, partyId: e.target.value } : x)),
                )
              }
            >
              <option value="">{isCredit ? '— Customer —' : '— Vendor —'}</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <input
              className="input text-right"
              type="number"
              placeholder="0.00"
              value={l.amount}
              onChange={(e) =>
                setLines((ls) =>
                  ls.map((x, idx) => (idx === i ? { ...x, amount: e.target.value } : x)),
                )
              }
            />
            {lines.length > 2 ? (
              <button
                className="btn-ghost btn-sm text-red-500"
                onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
              >
                <X size={14} />
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>
      <button
        className="btn-ghost btn-sm mt-2"
        onClick={() =>
          setLines((ls) => [...ls, { ledgerAccountId: '', amount: '', partyId: '', category: '' }])
        }
      >
        + Add split line
      </button>
    </Modal>
  )
}

// ---- Edit / correct a single transaction before posting --------------------
function EditTxnModal({
  txn,
  accounts,
  companies,
  vendors,
  invoices,
  onClose,
  onSave,
  onPost,
}: {
  txn: BankTxn
  accounts: { id: string; code: string; name: string }[]
  companies: { id: string; name: string }[]
  vendors: { id: string; name: string }[]
  invoices: { id: string; invoiceNo: string; companyId: string }[]
  onClose: () => void
  onSave: (patch: Partial<BankTxn>) => Promise<void>
  onPost: (overrides: {
    ledgerAccountId?: string
    partyType?: string
    partyId?: string
    invoiceId?: string
  }) => Promise<void>
}) {
  const isCredit = txn.creditAmount > 0
  const [partyId, setPartyId] = useState(txn.matchedPartyId ?? '')
  const [invoiceId, setInvoiceId] = useState(txn.matchedInvoiceId ?? '')
  const [ledgerAccountId, setLedgerAccountId] = useState(txn.matchedLedgerAccountId ?? '')
  const parties = isCredit ? companies : vendors
  const partyType = isCredit ? 'customer' : 'vendor'
  const invoiceOptions = invoices.filter((i) => !partyId || i.companyId === partyId)

  const overrides = {
    ledgerAccountId: ledgerAccountId || undefined,
    partyType,
    partyId: partyId || undefined,
    invoiceId: invoiceId || undefined,
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Review transaction"
      size="lg"
      footer={
        <>
          <button
            className="btn-secondary btn-sm"
            onClick={() =>
              onSave({
                matchedPartyId: partyId || undefined,
                matchedInvoiceId: invoiceId || undefined,
                matchedLedgerAccountId: ledgerAccountId || undefined,
              })
            }
          >
            Save match
          </button>
          <button className="btn-primary btn-sm" onClick={() => onPost(overrides)}>
            Approve & post
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-semibold text-slate-800">{txn.narration}</p>
          <p className="mt-1 text-xs text-slate-500">
            {fmtDate(txn.transactionDate)} ·{' '}
            {isCredit ? (
              <span className="text-emerald-600">Credit {currency(txn.creditAmount)}</span>
            ) : (
              <span className="text-red-600">Debit {currency(txn.debitAmount)}</span>
            )}
            {txn.referenceNumber ? ` · Ref ${txn.referenceNumber}` : ''}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={isCredit ? 'Customer' : 'Vendor'}>
            <Select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              <option value="">—</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          {isCredit && (
            <Field label="Allocate to invoice">
              <Select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
                <option value="">— Advance / unallocated —</option>
                {invoiceOptions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.invoiceNo}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Ledger account" className="sm:col-span-2">
            <Select value={ledgerAccountId} onChange={(e) => setLedgerAccountId(e.target.value)}>
              <option value="">— Auto —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="text-2xs text-slate-400">
          Posting creates a {isCredit ? 'receipt (Payments)' : 'expense'} plus a balanced journal,
          and marks this transaction reconciled.
        </p>
      </div>
    </Modal>
  )
}
