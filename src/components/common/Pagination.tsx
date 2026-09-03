import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PAGE_SIZES, DEFAULT_PAGE_SIZE } from '@/constants/domain'

// Client-side pagination hook. Default 25 rows, options 25/50/100.
export function usePagination<T>(items: T[], defaultSize = DEFAULT_PAGE_SIZE) {
  const [pageSize, setPageSizeState] = useState(defaultSize)
  const [page, setPage] = useState(1)
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  useEffect(() => {
    if (page > pageCount) setPage(1)
  }, [page, pageCount])

  const start = (page - 1) * pageSize
  const pageItems = items.slice(start, start + pageSize)

  return {
    page,
    setPage,
    pageSize,
    setPageSize: (n: number) => {
      setPageSizeState(n)
      setPage(1)
    },
    pageItems,
    pageCount,
    total,
    from: total ? start + 1 : 0,
    to: Math.min(total, start + pageSize),
  }
}

export interface PaginationState {
  page: number
  pageCount: number
  pageSize: number
  from: number
  to: number
  total: number
  setPage: (p: number) => void
  setPageSize: (n: number) => void
}

// Condensed page list with ellipsis for large datasets: always shows the first
// and last page plus a window around the current page, e.g.
//   [1, 'gap', 5, 6, 7, 'gap', 20]. Up to 7 numbers are shown in full.
function buildPages(current: number, count: number): (number | 'gap')[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1)
  const pages: (number | 'gap')[] = [1]
  const left = Math.max(2, current - 1)
  const right = Math.min(count - 1, current + 1)
  if (left > 2) pages.push('gap')
  for (let i = left; i <= right; i++) pages.push(i)
  if (right < count - 1) pages.push('gap')
  pages.push(count)
  return pages
}

// Shared control styles (MSM tokens): white / gray-border / dark-gray text,
// soft-orange hover, solid-orange active, muted disabled. 36px targets, 8px
// radius, subtle orange focus ring.
const NAV_BTN =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium tabular-nums text-slate-600 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/30 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300 disabled:hover:bg-slate-50'
const NAV_BTN_ACTIVE =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-brand-400 bg-brand-400 px-2 text-sm font-semibold tabular-nums text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/40'

export function Pagination({ pg }: { pg: PaginationState }) {
  const {
    page,
    pageCount,
    pageSize,
    from,
    to,
    total,
    setPage: onPage,
    setPageSize: onPageSize,
  } = pg
  // Preserve existing behaviour: no footer when there are no rows (pages render
  // their own empty state instead).
  if (total === 0) return null

  const pages = buildPages(page, pageCount)

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Record range + rows-per-page */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
        <span>
          Showing{' '}
          <span className="font-medium tabular-nums text-slate-700">
            {from}–{to}
          </span>{' '}
          of <span className="font-medium tabular-nums text-slate-700">{total}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-slate-500">Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-orange-400/30"
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </span>
      </div>

      {/* Page navigation */}
      <nav className="flex items-center gap-1.5" aria-label="Pagination">
        <button
          type="button"
          className={NAV_BTN}
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        {pages.map((p, i) =>
          p === 'gap' ? (
            <span
              key={`gap-${i}`}
              className="inline-flex h-9 min-w-6 items-center justify-center px-0.5 text-sm text-slate-400"
              aria-hidden
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={p === page ? NAV_BTN_ACTIVE : NAV_BTN}
              onClick={() => onPage(p)}
              aria-label={`Go to page ${p}`}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          className={NAV_BTN}
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </nav>
    </div>
  )
}
