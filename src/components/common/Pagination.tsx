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
  if (total === 0) return null
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-3 py-2.5 text-xs text-slate-500 sm:flex-row">
      <div className="flex items-center gap-2">
        <span>Rows per page</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs outline-none focus:border-brand-500"
          aria-label="Rows per page"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="ml-1 tabular-nums">
          {from}–{to} of {total}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          className="btn-secondary btn-sm disabled:opacity-40"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="px-2 tabular-nums">
          Page {page} / {pageCount}
        </span>
        <button
          className="btn-secondary btn-sm disabled:opacity-40"
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )
}
