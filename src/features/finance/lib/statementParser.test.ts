import { describe, it, expect } from 'vitest'
import {
  parseStatement,
  parseCsv,
  parseDate,
  firstDate,
  alignPdfItems,
  detectColumns,
  extractRows,
  type PdfItem,
} from './statementParser'

// Build a File from text (Node 20+ has a global File). parseStatement only reads
// file.name (for the extension) and file.arrayBuffer().
function csvFile(text: string, name = 'statement.csv'): File {
  return new File([text], name, { type: 'text/csv' })
}

describe('parseDate / firstDate', () => {
  it('parses Indian dd-MMM-yy and dd/mm/yyyy', () => {
    expect(parseDate('31-Mar-25')).toBe('2025-03-31')
    expect(parseDate('01/04/2025')).toBe('2025-04-01')
    expect(parseDate('2025-03-31')).toBe('2025-03-31')
  })

  it('extracts the first date from an IOB "date (value date)" cell', () => {
    // IOB puts the value date in parentheses on the same logical row — the bare
    // anchored parser would fail and the whole row would be dropped.
    expect(firstDate('31-Mar-25 (31-Mar-25)')).toBe('2025-03-31')
    expect(firstDate('(31-Mar-25)')).toBe('2025-03-31')
    expect(firstDate('Total')).toBeUndefined()
  })
})

describe('parseStatement — Indian Overseas Bank layout', () => {
  // Mirrors the real IOB export: parenthetical-unit headers, a Transaction Type
  // column between reference and amounts, a dash for the empty side, Indian
  // lakh-grouped amounts, and a totals footer that must NOT be imported.
  const csv = [
    'Date(Value Date),Particulars,Ref No./Cheque No,Transaction Type,Debit(Rs),Credit(Rs),Balance(Rs)',
    '31-Mar-25,UPI/509064181014/DR/RAMESH N/YES/UPI,S96897936,Transfer,"1,700.00",-,"1,01,986.29"',
    '28-Mar-25,LEDGER FOLIO CHARGES FY 2024-2025,S38938910,Transfer,708.00,-,"1,09,635.29"',
    '26-Mar-25,NEFT-UTIB-AXISP00639000778-FLOWRA GLO-BILL PAYME,S10117916,Transfer,-,"38,839.00","1,10,343.29"',
    'Total,,,,"2,34,129.89","2,93,618.00",',
  ].join('\n')

  it('detects columns and keeps every real transaction (no skips)', async () => {
    const res = await parseStatement(csvFile(csv))
    expect(res.parserType).toBe('csv')
    // 3 real transactions; the "Total" footer has no date and is dropped.
    expect(res.rows.length).toBe(3)
  })

  it('maps debits and credits to the correct side', async () => {
    const res = await parseStatement(csvFile(csv))
    const [t1, t2, t3] = res.rows
    expect(t1.debitAmount).toBe(1700)
    expect(t1.creditAmount).toBe(0)
    expect(t2.debitAmount).toBe(708)
    expect(t3.creditAmount).toBe(38839)
    expect(t3.debitAmount).toBe(0)
  })

  it('parses dates and Indian lakh-grouped balances', async () => {
    const res = await parseStatement(csvFile(csv))
    expect(res.rows[0].transactionDate).toBe('2025-03-31')
    expect(res.rows[0].balanceAfter).toBe(101986.29)
    expect(res.rows[2].balanceAfter).toBe(110343.29)
  })

  it('carries the narration for classification', async () => {
    const res = await parseStatement(csvFile(csv))
    expect(res.rows[0].narration).toContain('RAMESH')
    expect(res.rows[2].narration).toContain('NEFT')
  })
})

describe('alignPdfItems — multi-line PDF layout (Indian Overseas Bank)', () => {
  // Real IOB geometry (x/y/w in PDF points), captured from an actual statement:
  // each transaction spans several baselines — date, wrapped particulars, the
  // value-date in parens, and the amounts row — and the header labels are split.
  const it_ = (str: string, x: number, y: number, w: number, page = 1): PdfItem => ({
    str,
    x,
    y,
    w,
    page,
  })
  const items: PdfItem[] = [
    // Header
    it_('Date(Value', 49.6, 557.8, 46.1),
    it_('Date)', 62.7, 549.1, 22.2),
    it_('Particulars', 167.9, 554.5, 42.8),
    it_('Ref No.', 283.3, 560.1, 31.7),
    it_('/Cheque No', 275.1, 549, 48.1),
    it_('Transaction', 333.7, 557.8, 47.3),
    it_('Type', 346.7, 549.1, 20.6),
    it_('Debit(Rs)', 398.5, 554.5, 39.5),
    it_('Credit(Rs)', 455.6, 554.5, 42.3),
    it_('Balance(Rs)', 507.3, 554.5, 49.5),
    // Txn 1 — a debit
    it_('31-Mar-25', 44.7, 530.3, 39),
    it_('(31-Mar-25)', 44.7, 521.3, 45),
    it_('UPI/509064181014/DR/RAMESH N/YES', 111.9, 531.3, 154.3),
    it_('/UPI', 111.9, 521.3, 17),
    it_('S96897936', 278.6, 526.3, 41),
    it_('Transfer', 343.9, 526.3, 30.5),
    it_('1,700.00', 408.5, 526.3, 31.5),
    it_('-', 495.9, 526.3, 3),
    it_('1,01,986.29', 515, 526.3, 42.8),
    // Txn 2 — a credit (NEFT). Debit side is the "-" placeholder.
    it_('26-Mar-25', 44.7, 507.3, 39),
    it_('(26-Mar-25)', 44.7, 498.3, 45),
    it_('NEFT-UTIB-AXISP00639000778-', 111.9, 508.3, 150),
    it_('FLOWRA GLO-BILL PAYME', 111.9, 498.3, 120),
    it_('S10117916', 278.6, 503.3, 41),
    it_('Transfer', 343.9, 503.3, 30.5),
    it_('-', 434, 503.3, 3),
    it_('38,839.00', 451, 503.3, 47),
    it_('1,10,343.29', 515, 503.3, 42.8),
    // A grand-totals footer below the last txn — must NOT be imported.
    it_('2,34,129.89', 408.5, 470, 40),
    it_('2,93,618.00', 451, 470, 47),
  ]

  it('reconstructs one aligned row per transaction', () => {
    const grid = alignPdfItems(items)
    expect(grid.length).toBe(3) // header + 2 transactions
    expect(grid[1][0]).toBe('31-Mar-25')
    expect(grid[1][1]).toContain('RAMESH')
    expect(grid[2][1]).toContain('NEFT')
  })

  it('parses debit/credit to the correct side and ignores the totals footer', () => {
    const grid = alignPdfItems(items)
    const { headerRow, map } = detectColumns(grid)
    const { rows } = extractRows(grid, map, headerRow, { parserType: 'pdf', ocrUsed: false })
    expect(rows.length).toBe(2)
    expect(rows[0]).toMatchObject({
      transactionDate: '2025-03-31',
      debitAmount: 1700,
      creditAmount: 0,
    })
    expect(rows[1]).toMatchObject({
      transactionDate: '2025-03-26',
      debitAmount: 0,
      creditAmount: 38839,
    })
  })
})

describe('parseCsv', () => {
  it('honours quoted fields containing commas', () => {
    const rows = parseCsv('a,"1,700.00",b\n')
    expect(rows[0]).toEqual(['a', '1,700.00', 'b'])
  })
})
