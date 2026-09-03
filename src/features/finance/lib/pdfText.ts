// Text-based PDF bank-statement extraction via pdfjs-dist. Loaded dynamically
// (client-only) so pdfjs never enters the SSR/build path. We reconstruct a cell
// grid from each text item's position (transform e/f + width): items are grouped
// into visual rows by Y, ordered by X, and split into cells wherever the
// horizontal gap is large — so the SAME column-detection pipeline that handles
// CSV/XLSX also handles the PDF grid.
//
// Scope: text (digital) PDFs only. Scanned/image PDFs contain no text layer and
// yield no rows — the caller surfaces that as "needs review" (no OCR, §11).

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
