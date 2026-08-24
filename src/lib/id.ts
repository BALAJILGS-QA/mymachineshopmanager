// Small id + number sequence helpers.

export function uid(prefix = ''): string {
  const rnd = Math.random().toString(36).slice(2, 8)
  const ts = Date.now().toString(36).slice(-6)
  return `${prefix}${ts}${rnd}`
}

// Format a running document number, e.g. formatDocNo('JOB-{FY}-{####}', 12)
// Supported tokens: {FY} financial year (Apr-Mar), {YYYY}, {YY}, {MM}, {####}
export function formatDocNo(pattern: string, seq: number, date = new Date()): string {
  if (!pattern) return String(seq) // defensive: missing numbering pattern
  const year = date.getFullYear()
  const month = date.getMonth() // 0-based
  // Indian financial year Apr(3)-Mar(2)
  const fyStart = month >= 3 ? year : year - 1
  const fyEnd = (fyStart + 1) % 100
  const fy = `${fyStart}-${String(fyEnd).padStart(2, '0')}`

  return pattern
    .replace('{FY}', fy)
    .replace('{YYYY}', String(year))
    .replace('{YY}', String(year).slice(-2))
    .replace('{MM}', String(month + 1).padStart(2, '0'))
    .replace(/\{(#+)\}/g, (_, hashes: string) =>
      String(seq).padStart(hashes.length, '0'),
    )
}
