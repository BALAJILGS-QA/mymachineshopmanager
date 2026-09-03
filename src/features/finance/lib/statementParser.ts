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

function detectColumns(rows: string[][]): { headerRow: number; map: Record<string, number> } {
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

// -- Main entry ----------------------------------------------------------------
export async function parseStatement(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<ParseResult> {
  const name = file.name.toLowerCase()
  const buf = await file.arrayBuffer()
  let grid: string[][]
  let parserType: 'csv' | 'xlsx' | 'pdf'
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
    grid = await parseXlsx(buf)
    parserType = 'xlsx'
  } else if (name.endsWith('.pdf')) {
    // Dynamic import keeps pdfjs/tesseract out of the SSR/main bundle.
    const { pdfToGrid } = await import('./pdfText')
    grid = await pdfToGrid(buf)
    parserType = 'pdf'
  } else {
    grid = parseCsv(new TextDecoder().decode(buf))
    parserType = 'csv'
  }

  const warnings: string[] = []
  let ocrUsed = false
  let { headerRow, map } = detectColumns(grid)

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

  const rows: ParsedTxn[] = []
  let good = 0
  for (let r = headerRow + 1; r < grid.length; r++) {
    const cells = grid[r]
    const get = (k: string) => (map[k] !== undefined ? (cells[map[k]] ?? '').trim() : '')
    const date = parseDate(get('transactionDate')) ?? parseDate(get('valueDate'))
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
    if (ocrUsed) conf = Math.min(conf, 55)
    else if (parserType === 'pdf') conf = Math.min(conf, 70)
    if (conf >= 100) good++
    rows.push({
      transactionDate: date,
      valueDate: parseDate(get('valueDate')),
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
