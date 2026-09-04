// Bank-statement parser: turns an uploaded CSV or XLSX file into canonical
// transactions, WITHOUT any third-party dependency. XLSX is read by parsing the
// ZIP container and inflating entries with the platform DecompressionStream
// (deflate-raw) — the same hand-rolled ethos as src/lib/xlsx.ts (which writes).
//
// Bank column names differ wildly, so headers are auto-detected against a
// synonym table and mapped into a canonical row shape. Nothing is silently
// dropped: rows that fail to parse are surfaced with low parser confidence.

export interface ParsedTxn {
  transactionDate: string // ISO yyyy-mm-dd
  valueDate?: string
  narration: string
  referenceNumber?: string
  chequeNumber?: string
  debitAmount: number
  creditAmount: number
  balanceAfter?: number
  sourceRowNumber: number
  parserConfidence: number // 0..100 for this row
}

export interface ParseResult {
  parserType: 'csv' | 'xlsx' | 'pdf'
  rows: ParsedTxn[]
  totalRows: number
  headerRow: number
  columnMap: Record<string, number>
  parserConfidence: number // overall 0..100
  warnings: string[]
}

// -- SHA-256 of raw bytes (statement-file de-dup, §14) ------------------------
export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// -- CSV -----------------------------------------------------------------------
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((v) => v.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    if (row.some((v) => v.trim() !== '')) rows.push(row)
  }
  return rows
}

// -- XLSX (ZIP + deflate-raw) --------------------------------------------------
async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const DS = (
    globalThis as unknown as {
      DecompressionStream?: new (format: string) => GenericTransformStream
    }
  ).DecompressionStream
  if (!DS) throw new Error('DecompressionStream not available in this environment')
  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new DS('deflate-raw'))
  const ab = await new Response(stream).arrayBuffer()
  return new Uint8Array(ab)
}

interface ZipEntry {
  name: string
  method: number
  offset: number
  compSize: number
}

// Read the ZIP central directory to enumerate entries (sizes always present).
function readZipCentralDir(buf: Uint8Array): ZipEntry[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  // Find End Of Central Directory (0x06054b50), scanning back from the end.
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Not a valid XLSX (no ZIP end record)')
  const count = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true) // central directory offset
  const entries: ZipEntry[] = []
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break
    const method = dv.getUint16(p + 10, true)
    const compSize = dv.getUint32(p + 20, true)
    const nameLen = dv.getUint16(p + 28, true)
    const extraLen = dv.getUint16(p + 30, true)
    const commentLen = dv.getUint16(p + 32, true)
    const offset = dv.getUint32(p + 42, true)
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen))
    entries.push({ name, method, offset, compSize })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

async function readZipEntry(buf: Uint8Array, entry: ZipEntry): Promise<string> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  // Local file header at `offset`: 30 bytes fixed + name + extra, then data.
  const nameLen = dv.getUint16(entry.offset + 26, true)
  const extraLen = dv.getUint16(entry.offset + 28, true)
  const dataStart = entry.offset + 30 + nameLen + extraLen
  const raw = buf.subarray(dataStart, dataStart + entry.compSize)
  const out = entry.method === 0 ? raw : await inflateRaw(raw)
  return new TextDecoder().decode(out)
}

function colRefToIndex(ref: string): number {
  const m = ref.match(/^([A-Z]+)/)
  if (!m) return 0
  let n = 0
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export async function parseXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const bytes = new Uint8Array(buf)
  const entries = readZipCentralDir(bytes)
  const byName = new Map(entries.map((e) => [e.name, e]))

  // Shared strings.
  const shared: string[] = []
  const sst = byName.get('xl/sharedStrings.xml')
  if (sst) {
    const xml = await readZipEntry(bytes, sst)
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    for (const si of Array.from(doc.getElementsByTagName('si'))) {
      // Concatenate all <t> runs inside this shared-string item.
      shared.push(
        Array.from(si.getElementsByTagName('t'))
          .map((t) => t.textContent ?? '')
          .join(''),
      )
    }
  }

  // First worksheet (sheet1.xml, or the first xl/worksheets/*.xml).
  const sheetEntry =
    byName.get('xl/worksheets/sheet1.xml') ??
    entries.find((e) => e.name.startsWith('xl/worksheets/') && e.name.endsWith('.xml'))
  if (!sheetEntry) throw new Error('XLSX has no worksheet')
  const sheetXml = await readZipEntry(bytes, sheetEntry)
  const doc = new DOMParser().parseFromString(sheetXml, 'application/xml')

  const rows: string[][] = []
  for (const rowEl of Array.from(doc.getElementsByTagName('row'))) {
    const cells: string[] = []
    for (const c of Array.from(rowEl.getElementsByTagName('c'))) {
      const ref = c.getAttribute('r') ?? ''
      const idx = colRefToIndex(ref)
      const type = c.getAttribute('t')
      let val = ''
      if (type === 's') {
        const v = c.getElementsByTagName('v')[0]?.textContent
        val = v != null ? (shared[Number(v)] ?? '') : ''
      } else if (type === 'inlineStr') {
        val = Array.from(c.getElementsByTagName('t'))
          .map((t) => t.textContent ?? '')
          .join('')
      } else {
        val = c.getElementsByTagName('v')[0]?.textContent ?? ''
      }
      cells[idx] = val
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = ''
    if (cells.some((v) => v.trim() !== '')) rows.push(cells)
  }
  return rows
}

// -- Canonical column detection ------------------------------------------------
const SYNONYMS: Record<string, string[]> = {
  transactionDate: [
    'txn date',
    'transaction date',
    'tran date',
    'date',
    'posting date',
    'post date',
    'trans date',
  ],
  valueDate: ['value date', 'val date', 'value dt'],
  narration: [
    'narration',
    'description',
    'particulars',
    'details',
    'remarks',
    'transaction remarks',
    'transaction details',
  ],
  reference: [
    'reference',
    'ref no',
    'ref',
    'chq / ref no',
    'chq/ref no',
    'ref no.',
    'utr',
    'utr no',
    'transaction id',
    'cheque/reference no',
  ],
  cheque: ['cheque no', 'cheque', 'chq no', 'instrument no', 'chq no.'],
  debit: [
    'debit',
    'withdrawal',
    'withdrawal amt',
    'withdrawal amt.',
    'withdrawal (dr)',
    'dr',
    'debit amount',
    'paid out',
    'withdrawals',
  ],
  credit: [
    'credit',
    'deposit',
    'deposit amt',
    'deposit amt.',
    'deposit (cr)',
    'cr',
    'credit amount',
    'paid in',
    'deposits',
  ],
  amount: ['amount', 'txn amount', 'transaction amount', 'amount (inr)'],
  drcr: ['dr/cr', 'dr / cr', 'type', 'txn type', 'debit/credit'],
  balance: [
    'balance',
    'closing balance',
    'running balance',
    'balance amt',
    'balance (inr)',
    'available balance',
  ],
}

const norm = (s: string) => s.toLowerCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim()

// Header-cell normalizer for matching: drop any parenthetical unit/note so real
// bank headers reduce to their keyword — "Debit(Rs)" → "debit", "Balance(Rs)" →
// "balance", "Date(Value Date)" → "date", "Date(Value" → "date" (unbalanced,
// from a two-line PDF header) — and collapse separators.
const headerNorm = (s: string) =>
  s
    .toLowerCase()
    .split('(')[0]
    .replace(/[._/\\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function matchCanon(n: string): string | null {
  for (const [canon, syns] of Object.entries(SYNONYMS)) {
    if (syns.some((s) => n === s || n.startsWith(`${s} `))) return canon
  }
  return null
}

export function detectColumns(rows: string[][]): {
  headerRow: number
  map: Record<string, number>
} {
  let best = { score: 0, row: 0, map: {} as Record<string, number> }
  // Scan the WHOLE document — bank PDFs put the transaction header well below
  // the logo + customer-details block (often past row 20).
  const limit = Math.min(rows.length, 400)
  for (let r = 0; r < limit; r++) {
    const map: Record<string, number> = {}
    let score = 0
    rows[r].forEach((cell, i) => {
      const n = headerNorm(cell)
      if (!n) return
      const canon = matchCanon(n)
      if (canon && map[canon] === undefined) {
        map[canon] = i
        score++
      }
    })
    // A valid header needs a date and some amount signal.
    const hasDate = map.transactionDate !== undefined || map.valueDate !== undefined
    const hasAmt = map.debit !== undefined || map.credit !== undefined || map.amount !== undefined
    if (hasDate && hasAmt && score > best.score) best = { score, row: r, map }
  }
  return { headerRow: best.row, map: best.map }
}

// -- Value normalization -------------------------------------------------------
function parseAmount(raw?: string): number {
  if (!raw) return 0
  const cleaned = raw
    .replace(/[₹$,\s]/g, '')
    .replace(/(cr|dr)$/i, '')
    .trim()
  const n = Number(cleaned)
  return Number.isFinite(n) ? Math.abs(n) : 0
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

// Parse to ISO. Indian statements are predominantly dd/mm/yyyy or dd-MMM-yyyy.
export function parseDate(raw?: string): string | undefined {
  if (!raw) return undefined
  const s = raw.trim()
  // dd-MMM-yyyy / dd MMM yy
  let m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,})[-/ ](\d{2,4})$/)
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()]
    if (mon) return iso(Number(m[1]), mon, yr(m[3]))
  }
  // yyyy-mm-dd
  m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]))
  // dd/mm/yyyy or dd-mm-yyyy (Indian default)
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/)
  if (m) {
    let d = Number(m[1])
    let mo = Number(m[2])
    if (d > 12 && mo <= 12) {
      /* clearly dd/mm */
    } else if (mo > 12 && d <= 12) {
      // actually mm/dd — swap
      ;[d, mo] = [mo, d]
    }
    return iso(d, mo, yr(m[3]))
  }
  return undefined
}
const yr = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s))
const iso = (d: number, m: number, y: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

// Extract the FIRST date found anywhere in a cell. Real bank cells often carry
// more than a bare date — IOB puts the value date in parentheses on the same
// logical row ("31-Mar-25 (31-Mar-25)"), and OCR/PDF reconstruction can glue
// stray tokens onto the date. Anchored parseDate would return undefined for
// those and the row would be silently dropped (§: never skip a real record), so
// we scan for the first date-shaped substring and parse that.
export function firstDate(raw?: string): string | undefined {
  if (!raw) return undefined
  const s = raw.trim()
  const whole = parseDate(s)
  if (whole) return whole
  const patterns = [
    /\d{1,2}[-/ ][A-Za-z]{3,}[-/ ]\d{2,4}/, // dd-MMM-yyyy / dd MMM yy
    /\d{4}[-/]\d{1,2}[-/]\d{1,2}/, // yyyy-mm-dd
    /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/, // dd/mm/yyyy
  ]
  for (const re of patterns) {
    const m = s.match(re)
    if (m) {
      const d = parseDate(m[0])
      if (d) return d
    }
  }
  return undefined
}

// -- Column-aware PDF reconstruction ------------------------------------------
// Many bank PDFs (e.g. Indian Overseas Bank) print each transaction across 2-3
// physical text lines — date on one line, particulars wrapping over two, the
// value-date in parentheses below, amounts on their own baseline — and the
// header labels are split/centered. A naive "group by Y, split by X-gap" grid
// then has no single row carrying date+amounts, so the generic column detector
// fails. This reconstruction instead:
//   1. derives column x-boundaries from the header labels' positions (adapts to
//      the template rather than hard-coding pixels), and
//   2. anchors each transaction on its primary date, folding every item that
//      belongs to that date's block (across all its physical lines) into one row.
// It returns a clean aligned grid (synthetic header + one row per transaction)
// that flows through the same detectColumns/extractRows pipeline. Pure over the
// positioned text items, so it is unit-testable without pdfjs.
export interface PdfItem {
  str: string
  x: number // left edge
  y: number // baseline (PDF origin bottom-left: larger y = higher on the page)
  w: number
  page: number
}

const HDR = {
  date: /^date/i,
  part: /^particular/i,
  ref: /^(ref|chq|cheque|\/cheque|instrument)/i,
  type: /^(transaction|type|txn)/i,
  debit: /^(debit|withdrawal|dr\b)/i,
  credit: /^(credit|deposit|cr\b)/i,
  balance: /^balance/i,
}

const PDF_DATE_RE = /^\(?\d{1,2}[-/][A-Za-z0-9]{2,}[-/]\d{2,4}\)?$/

export function alignPdfItems(items: PdfItem[]): string[][] {
  if (!items.length) return []
  // Locate the header via the distinctive amount labels.
  const amountHdr = items.filter(
    (i) =>
      HDR.debit.test(i.str.trim()) ||
      HDR.credit.test(i.str.trim()) ||
      HDR.balance.test(i.str.trim()),
  )
  if (!amountHdr.length) return []
  const headerPage = amountHdr[0].page
  const headerY = amountHdr[0].y
  const hdr = items.filter((i) => i.page === headerPage && Math.abs(i.y - headerY) < 16)
  const span = (re: RegExp) => {
    const m = hdr.filter((i) => re.test(i.str.trim()))
    if (!m.length) return null
    return { left: Math.min(...m.map((i) => i.x)), right: Math.max(...m.map((i) => i.x + i.w)) }
  }
  const D = span(HDR.date)
  const R = span(HDR.ref)
  const T = span(HDR.type)
  const DB = span(HDR.debit)
  const CR = span(HDR.credit)
  const BL = span(HDR.balance)
  if (!D || !DB || !CR || !BL) return [] // not enough structure — let OCR/others try

  // Column cut lines (by an item's LEFT edge). Left-aligned text columns cut just
  // before the next column's label; right-aligned amount columns cut at the gap
  // midpoint between neighbouring labels.
  const c1 = D.right + 10 // date | particulars
  const c2 = (R?.left ?? DB.left - 90) - 5 // particulars | reference
  const c4 = DB.left - 6 // (type) | debit
  const c3 = T ? T.left - 6 : c4 // reference | type
  const c5 = (DB.right + CR.left) / 2 // debit | credit
  const c6 = (CR.right + BL.left) / 2 // credit | balance
  const colOf = (
    x: number,
  ): 'date' | 'narration' | 'reference' | 'type' | 'debit' | 'credit' | 'balance' => {
    if (x < c1) return 'date'
    if (x < c2) return 'narration'
    if (x < c3) return 'reference'
    if (x < c4) return 'type'
    if (x < c5) return 'debit'
    if (x < c6) return 'credit'
    return 'balance'
  }

  // Primary date anchors (a bare date in the date column, not the "(value date)").
  const anchors = items
    .filter((i) => colOf(i.x) === 'date' && PDF_DATE_RE.test(i.str.trim()) && !i.str.includes('('))
    .sort((a, b) => a.page - b.page || b.y - a.y)
  if (!anchors.length) return []

  interface Bucket {
    date: string
    narration: PdfItem[]
    reference: string[]
    debit: string[]
    credit: string[]
    balance: string[]
    y: number
    page: number
  }
  const buckets: Bucket[] = anchors.map((a) => ({
    date: a.str.trim(),
    narration: [],
    reference: [],
    debit: [],
    credit: [],
    balance: [],
    y: a.y,
    page: a.page,
  }))
  const anchorsByPage = new Map<number, { y: number; idx: number }[]>()
  anchors.forEach((a, idx) => {
    const arr = anchorsByPage.get(a.page) ?? []
    arr.push({ y: a.y, idx })
    anchorsByPage.set(a.page, arr)
  })

  for (const it of items) {
    const col = colOf(it.x)
    const pageAnchors = anchorsByPage.get(it.page)
    if (!pageAnchors) continue
    // Owner = nearest anchor at or above the item (content flows downward from the
    // date), within a downward band so page totals/footers below the last txn are
    // excluded.
    let owner = -1
    let bestY = Infinity
    for (const a of pageAnchors) {
      if (a.y >= it.y - 3 && a.y < bestY && a.y <= it.y + 40) {
        bestY = a.y
        owner = a.idx
      }
    }
    if (owner < 0) continue
    if (it.y < buckets[owner].y - 22) continue // too far below the date → footer/total
    const b = buckets[owner]
    const s = it.str.trim()
    if (!s) continue
    if (col === 'date')
      continue // date already captured; skip value-date
    else if (col === 'narration') b.narration.push(it)
    else if (col === 'reference') b.reference.push(s)
    else if (col === 'debit') b.debit.push(s)
    else if (col === 'credit') b.credit.push(s)
    else if (col === 'balance') b.balance.push(s)
    // 'type' column is intentionally dropped.
  }

  const amount = (arr: string[]) => arr.find((s) => /\d/.test(s)) ?? ''
  const grid: string[][] = [
    [
      'Date(Value Date)',
      'Particulars',
      'Ref No./Cheque No',
      'Debit(Rs)',
      'Credit(Rs)',
      'Balance(Rs)',
    ],
  ]
  for (const b of buckets) {
    const narration = b.narration
      .sort((a, c) => c.y - a.y || a.x - c.x)
      .map((i) => i.str.trim())
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    grid.push([
      b.date,
      narration,
      b.reference.join(' '),
      amount(b.debit),
      amount(b.credit),
      amount(b.balance),
    ])
  }
  return grid
}

// Turn a detected grid + column map into canonical transactions. Exported so the
// pure detection→row pipeline can be validated against real grids (e.g. a bank
// PDF) independently of pdfjs. A row is a real transaction iff it has a parseable
// date and a non-zero amount; everything else (headers, sub-lines, totals) is
// skipped — but nothing with a date+amount is ever dropped.
export function extractRows(
  grid: string[][],
  map: Record<string, number>,
  headerRow: number,
  opts: { parserType: 'csv' | 'xlsx' | 'pdf'; ocrUsed: boolean },
): { rows: ParsedTxn[]; good: number } {
  const rows: ParsedTxn[] = []
  let good = 0
  for (let r = headerRow + 1; r < grid.length; r++) {
    const cells = grid[r]
    const get = (k: string) => (map[k] !== undefined ? (cells[map[k]] ?? '').trim() : '')
    const date = firstDate(get('transactionDate')) ?? firstDate(get('valueDate'))
    if (!date) continue // skip non-transaction rows (headers/footers/totals)

    let debit = 0
    let credit = 0
    if (map.debit !== undefined || map.credit !== undefined) {
      debit = parseAmount(get('debit'))
      credit = parseAmount(get('credit'))
    } else if (map.amount !== undefined) {
      const amt = parseAmount(get('amount'))
      const dc = norm(get('drcr'))
      const signed = Number((get('amount') || '').replace(/[₹$,\s]/g, ''))
      if (dc.startsWith('d') || /-/.test(get('amount'))) debit = amt
      else if (dc.startsWith('c')) credit = amt
      else if (signed < 0) debit = amt
      else credit = amt
    }
    if (debit === 0 && credit === 0) continue

    let conf = date && (debit || credit) ? 100 : 60
    // PDF grids are positionally reconstructed — cap confidence so every row is
    // reviewed before posting (§11: never silently import low-confidence data).
    // OCR is even less certain (digits can be misread) → cap lower still.
    if (opts.ocrUsed) conf = Math.min(conf, 55)
    else if (opts.parserType === 'pdf') conf = Math.min(conf, 70)
    if (conf >= 100) good++
    rows.push({
      transactionDate: date,
      valueDate: firstDate(get('valueDate')),
      narration: get('narration') || get('reference') || '',
      referenceNumber: get('reference') || undefined,
      chequeNumber: get('cheque') || undefined,
      debitAmount: debit,
      creditAmount: credit,
      balanceAfter:
        map.balance !== undefined ? parseAmount(get('balance')) || undefined : undefined,
      sourceRowNumber: r + 1,
      parserConfidence: conf,
    })
  }
  return { rows, good }
}

// -- Main entry ----------------------------------------------------------------
export async function parseStatement(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<ParseResult> {
  const name = file.name.toLowerCase()
  const buf = await file.arrayBuffer()
  let grid: string[][]
  let parserType: 'csv' | 'xlsx' | 'pdf'
  let pdfItems: PdfItem[] | null = null
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
    grid = await parseXlsx(buf)
    parserType = 'xlsx'
  } else if (name.endsWith('.pdf')) {
    // Dynamic import keeps pdfjs/tesseract out of the SSR/main bundle.
    const { pdfToItems, itemsToGrid } = await import('./pdfText')
    pdfItems = await pdfToItems(buf)
    grid = itemsToGrid(pdfItems)
    parserType = 'pdf'
  } else {
    grid = parseCsv(new TextDecoder().decode(buf))
    parserType = 'csv'
  }

  const warnings: string[] = []
  let ocrUsed = false
  let { headerRow, map } = detectColumns(grid)

  // PDF whose transactions span multiple physical lines (the generic grid then
  // has no row carrying date+amounts together, e.g. Indian Overseas Bank) →
  // reconstruct a column-aligned grid from the raw items and try again.
  if (parserType === 'pdf' && Object.keys(map).length === 0 && pdfItems) {
    const aligned = alignPdfItems(pdfItems)
    if (aligned.length > 1) {
      const d = detectColumns(aligned)
      if (Object.keys(d.map).length > 0) {
        grid = aligned
        headerRow = d.headerRow
        map = d.map
      }
    }
  }

  // PDF with no detectable table (no text layer, or the table is a scanned/
  // screenshot image) → OCR the rendered pages and try again.
  if (parserType === 'pdf' && Object.keys(map).length === 0) {
    onProgress?.('No selectable text found — running OCR on the statement image…')
    const { pdfOcrToGrid } = await import('./pdfText')
    const ocrGrid = await pdfOcrToGrid(buf, onProgress)
    if (ocrGrid.length) {
      grid = ocrGrid
      ocrUsed = true
      ;({ headerRow, map } = detectColumns(grid))
    }
  }

  if (Object.keys(map).length === 0) {
    const hint =
      parserType === 'pdf'
        ? 'Could not read a transaction table from this PDF, even with OCR. The image may be low-resolution or not a statement — try the bank’s CSV/Excel export, or a clearer/original PDF.'
        : 'Could not detect statement columns — the file has no recognisable Date / Debit / Credit columns. Check that this is a transaction statement (not a summary), or upload the bank’s CSV/Excel export.'
    return {
      parserType,
      rows: [],
      totalRows: 0,
      headerRow: 0,
      columnMap: {},
      parserConfidence: 0,
      warnings: [hint],
    }
  }

  const { rows, good } = extractRows(grid, map, headerRow, { parserType, ocrUsed })

  if (rows.length === 0) warnings.push('No transaction rows were recognised.')
  else if (ocrUsed)
    warnings.push(
      'Read via OCR — amounts and dates can be misread, so VERIFY every row before posting.',
    )
  else if (parserType === 'pdf')
    warnings.push('PDF parsing is best-effort — review every row before posting.')
  const parserConfidence = rows.length ? Math.round((good / rows.length) * 100) : 0

  return {
    parserType,
    rows,
    totalRows: rows.length,
    headerRow,
    columnMap: map,
    parserConfidence,
    warnings,
  }
}

// Normalized signature for de-dup (§13): account + date + amount + direction +
// ref/cheque + squashed narration. Hash it client-side; the DB stores it and the
// detect_bank_duplicates RPC flags collisions.
export async function dedupeHash(bankAccountId: string, t: ParsedTxn): Promise<string> {
  const narr = (t.narration || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 40)
  const key = [
    bankAccountId,
    t.transactionDate,
    t.debitAmount.toFixed(2),
    t.creditAmount.toFixed(2),
    (t.referenceNumber || t.chequeNumber || '').toLowerCase().replace(/\s/g, ''),
    narr,
  ].join('|')
  const buf = new TextEncoder().encode(key)
  return sha256Hex(buf.buffer as ArrayBuffer)
}
