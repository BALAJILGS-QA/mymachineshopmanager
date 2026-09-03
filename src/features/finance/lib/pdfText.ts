// Text-based PDF bank-statement extraction via pdfjs-dist. Loaded dynamically
// (client-only) so pdfjs never enters the SSR/build path. We reconstruct a cell
// grid from each text item's position (transform e/f + width): items are grouped
// into visual rows by Y, ordered by X, and split into cells wherever the
// horizontal gap is large — so the SAME column-detection pipeline that handles
// CSV/XLSX also handles the PDF grid.
//
// Digital (text-layer) PDFs go through pdfToGrid. Scanned/screenshot PDFs have no
// text layer — pdfOcrToGrid renders each page to a canvas and OCRs it
// (tesseract.js), reconstructing the same cell grid from word bounding boxes. OCR
// output is inherently low-confidence, so callers force every OCR row through
// review before posting (§11 — never silently import low-confidence data).

// Rounding buckets for grouping items onto one visual line.
const Y_TOLERANCE = 2.5
// Horizontal gap (PDF units) above which two text runs are different columns.
const COLUMN_GAP = 11

interface Item {
  str: string
  x: number
  y: number
  w: number
}

export async function pdfToGrid(buf: ArrayBuffer): Promise<string[][]> {
  // pdfjs v4 is ESM; import the main entry and point the worker at the bundled
  // asset URL (webpack/Turbopack turn this into a real asset in the client build).
  const pdfjs = await import('pdfjs-dist')
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString()
  } catch {
    /* if the bundler can't resolve it, pdfjs falls back to a main-thread worker */
  }

  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
  const grid: string[][] = []

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()

    // Collect positioned text items.
    const items: Item[] = []
    for (const it of content.items) {
      // TextItem has `str` + `transform`; TextMarkedContent does not.
      const anyIt = it as { str?: string; transform?: number[]; width?: number }
      if (typeof anyIt.str !== 'string' || anyIt.str.trim() === '' || !anyIt.transform) continue
      items.push({
        str: anyIt.str,
        x: anyIt.transform[4],
        y: anyIt.transform[5],
        w: anyIt.width ?? 0,
      })
    }

    // Group into rows by Y (page origin is bottom-left, so larger Y = higher up).
    const rowsByY = new Map<number, Item[]>()
    for (const it of items) {
      const key = Math.round(it.y / Y_TOLERANCE) * Y_TOLERANCE
      const arr = rowsByY.get(key) ?? []
      arr.push(it)
      rowsByY.set(key, arr)
    }

    const ys = Array.from(rowsByY.keys()).sort((a, b) => b - a) // top → bottom
    for (const y of ys) {
      const line = rowsByY.get(y)!.sort((a, b) => a.x - b.x)
      const cells: string[] = []
      let cur = ''
      let cursorEnd = -Infinity
      for (const it of line) {
        const gap = it.x - cursorEnd
        if (cur === '') {
          cur = it.str
        } else if (gap > COLUMN_GAP) {
          cells.push(cur.trim())
          cur = it.str
        } else {
          // Same cell — join with a space unless the runs are touching.
          cur += (gap > 1 ? ' ' : '') + it.str
        }
        cursorEnd = it.x + it.w
      }
      if (cur !== '') cells.push(cur.trim())
      if (cells.some((c) => c !== '')) grid.push(cells)
    }
  }

  await doc.cleanup?.()
  return grid
}

// --- OCR fallback for scanned / screenshot statements -----------------------
// Horizontal gap (rendered pixels) above which two OCR words are different
// columns, and vertical tolerance for grouping words onto one line. Tuned for a
// scale-2 render; kept generous because OCR bounding boxes are approximate.
const OCR_COLUMN_GAP = 26
const OCR_LINE_TOL = 12
const OCR_SCALE = 2

interface OcrWord {
  text: string
  x: number
  y: number
  w: number
}

// Pull word boxes from whatever shape this tesseract build returns.
function collectOcrWords(data: unknown): OcrWord[] {
  const out: OcrWord[] = []
  const push = (arr: unknown) => {
    for (const w of (arr as { text?: string; bbox?: { x0: number; y0: number; x1: number } }[]) ??
      []) {
      if (w?.text && w.text.trim() && w.bbox) {
        out.push({ text: w.text, x: w.bbox.x0, y: w.bbox.y0, w: w.bbox.x1 - w.bbox.x0 })
      }
    }
  }
  const d = data as {
    words?: unknown
    lines?: { words?: unknown }[]
    blocks?: { paragraphs?: { lines?: { words?: unknown }[] }[] }[]
  }
  if (Array.isArray(d.words) && d.words.length) push(d.words)
  else if (d.blocks)
    for (const b of d.blocks)
      for (const p of b.paragraphs ?? []) for (const l of p.lines ?? []) push(l.words)
  else if (d.lines) for (const l of d.lines) push(l.words)
  return out
}

export async function pdfOcrToGrid(
  buf: ArrayBuffer,
  onProgress?: (msg: string) => void,
): Promise<string[][]> {
  if (typeof document === 'undefined') return [] // client-only (needs canvas)
  const pdfjs = await import('pdfjs-dist')
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString()
  } catch {
    /* fall back to main-thread worker */
  }
  const Tesseract = await import('tesseract.js')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
  const grid: string[][] = []

  const worker = await Tesseract.createWorker('eng')
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      onProgress?.(`Reading page ${p}/${doc.numPages} with OCR…`)
      const page = await doc.getPage(p)
      const viewport = page.getViewport({ scale: OCR_SCALE })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      // pdfjs renders the whole page — including embedded statement images — so
      // OCR sees the table even when it isn't in the text layer.
      await page.render({ canvasContext: ctx, viewport }).promise

      const { data } = await worker.recognize(canvas)
      const words = collectOcrWords(data)
      if (!words.length) continue

      // Group words into lines by Y (OCR origin is top-left → ascending Y is
      // top→bottom), then split into cells by X gaps.
      words.sort((a, b) => a.y - b.y || a.x - b.x)
      const lines: OcrWord[][] = []
      for (const w of words) {
        const last = lines[lines.length - 1]
        if (last && Math.abs(w.y - last[0].y) <= OCR_LINE_TOL) last.push(w)
        else lines.push([w])
      }
      for (const line of lines) {
        line.sort((a, b) => a.x - b.x)
        const cells: string[] = []
        let cur = ''
        let cursorEnd = -Infinity
        for (const w of line) {
          const gap = w.x - cursorEnd
          if (cur === '') cur = w.text
          else if (gap > OCR_COLUMN_GAP) {
            cells.push(cur.trim())
            cur = w.text
          } else cur += ` ${w.text}`
          cursorEnd = w.x + w.w
        }
        if (cur !== '') cells.push(cur.trim())
        if (cells.some((c) => c !== '')) grid.push(cells)
      }
    }
  } finally {
    await worker.terminate()
    await doc.cleanup?.()
  }
  return grid
}
