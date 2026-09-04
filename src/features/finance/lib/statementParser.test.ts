import { describe, it, expect } from 'vitest'
import { parseStatement, parseCsv, parseDate, firstDate } from './statementParser'

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

describe('parseCsv', () => {
  it('honours quoted fields containing commas', () => {
    const rows = parseCsv('a,"1,700.00",b\n')
    expect(rows[0]).toEqual(['a', '1,700.00', 'b'])
  })
})
