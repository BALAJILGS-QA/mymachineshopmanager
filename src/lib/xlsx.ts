// Minimal, dependency-free XLSX (Office Open XML) writer.
//
// Produces a genuine .xlsx workbook (a ZIP of XML parts) that opens cleanly in
// Excel / LibreOffice / Google Sheets with no "format doesn't match" warning.
// We only ever WRITE spreadsheets here, so there is no parser and none of the
// SheetJS advisories apply. Column values are emitted as inline strings or
// numbers; the header row is bold via a tiny styles part.

export interface XlsxColumn<T> {
  header: string
  value: (row: T) => string | number | null | undefined
  /** Optional column width in Excel character units. */
  width?: number
}

// ------------------------------------------------------------------ ZIP writer

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff]
  return (crc ^ 0xffffffff) >>> 0
}

const encoder = new TextEncoder()

interface ZipEntry {
  name: string
  data: Uint8Array
}

// Build a store-only (no compression) ZIP archive as a Blob.
function zip(entries: ZipEntry[]): Blob {
  const out: number[] = []
  const central: number[] = []
  // Fixed DOS date/time (2020-01-01 00:00:00) — keeps output deterministic.
  const dosTime = 0
  const dosDate = ((2020 - 1980) << 9) | (1 << 5) | 1

  const u16 = (arr: number[], v: number) => arr.push(v & 0xff, (v >>> 8) & 0xff)
  const u32 = (arr: number[], v: number) =>
    arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  const bytes = (arr: number[], b: Uint8Array) => {
    for (let i = 0; i < b.length; i++) arr.push(b[i])
  }

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const offset = out.length

    // Local file header
    u32(out, 0x04034b50)
    u16(out, 20) // version needed
    u16(out, 0) // flags
    u16(out, 0) // compression: store
    u16(out, dosTime)
    u16(out, dosDate)
    u32(out, crc)
    u32(out, entry.data.length) // compressed size
    u32(out, entry.data.length) // uncompressed size
    u16(out, nameBytes.length)
    u16(out, 0) // extra length
    bytes(out, nameBytes)
    bytes(out, entry.data)

    // Central directory record
    u32(central, 0x02014b50)
    u16(central, 20) // version made by
    u16(central, 20) // version needed
    u16(central, 0) // flags
    u16(central, 0) // compression
    u16(central, dosTime)
    u16(central, dosDate)
    u32(central, crc)
    u32(central, entry.data.length)
    u32(central, entry.data.length)
    u16(central, nameBytes.length)
    u16(central, 0) // extra length
    u16(central, 0) // comment length
    u16(central, 0) // disk number start
    u16(central, 0) // internal attrs
    u32(central, 0) // external attrs
    u32(central, offset)
    bytes(central, nameBytes)
  }

  const cdOffset = out.length
  for (const b of central) out.push(b)

  // End of central directory
  u32(out, 0x06054b50)
  u16(out, 0)
  u16(out, 0)
  u16(out, entries.length)
  u16(out, entries.length)
  u32(out, central.length)
  u32(out, cdOffset)
  u16(out, 0)

  return new Blob([new Uint8Array(out)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

// ---------------------------------------------------------------- XLSX parts

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// 0-based column index -> Excel column letters (0 -> A, 26 -> AA).
function colLetter(n: number): string {
  let s = ''
  let i = n + 1
  while (i > 0) {
    const m = (i - 1) % 26
    s = String.fromCharCode(65 + m) + s
    i = Math.floor((i - 1) / 26)
  }
  return s
}

function cellXml(ref: string, value: string | number | null | undefined, bold: boolean): string {
  const style = bold ? ' s="1"' : ''
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"${style} t="n"><v>${value}</v></c>`
  }
  const text = value == null ? '' : String(value)
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`

// Excel sheet names may not contain : \ / ? * [ ] and are capped at 31 chars.
function sanitizeSheetName(name: string): string {
  const cleaned = name
    .replace(/[:\\/?*[\]]/g, ' ')
    .trim()
    .slice(0, 31)
  return cleaned || 'Sheet1'
}

function workbookXml(sheetName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sanitizeSheetName(sheetName))}" sheetId="1" r:id="rId1"/></sheets></workbook>`
}

function sheetXml<T>(rows: T[], columns: XlsxColumn<T>[]): string {
  const colsXml = columns.some((c) => c.width)
    ? `<cols>${columns
        .map((c, i) =>
          c.width ? `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>` : '',
        )
        .join('')}</cols>`
    : ''

  const header = `<row r="1">${columns
    .map((c, i) => cellXml(`${colLetter(i)}1`, c.header, true))
    .join('')}</row>`

  const body = rows
    .map((row, ri) => {
      const rowNum = ri + 2
      const cells = columns
        .map((c, ci) => cellXml(`${colLetter(ci)}${rowNum}`, c.value(row), false))
        .join('')
      return `<row r="${rowNum}">${cells}</row>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${colsXml}<sheetData>${header}${body}</sheetData></worksheet>`
}

// ------------------------------------------------------------------- Public API

export function buildXlsx<T>(rows: T[], columns: XlsxColumn<T>[], sheetName = 'Sheet1'): Blob {
  return zip([
    { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: encoder.encode(ROOT_RELS) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml(sheetName)) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(WORKBOOK_RELS) },
    { name: 'xl/styles.xml', data: encoder.encode(STYLES) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheetXml(rows, columns)) },
  ])
}

export function downloadXlsx<T>(
  filename: string,
  rows: T[],
  columns: XlsxColumn<T>[],
  sheetName = 'Sheet1',
) {
  const blob = buildXlsx(rows, columns, sheetName)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
