import type { ReactNode } from 'react'
import { clsx } from 'clsx'
import { TableSkeleton } from './Skeleton'
import { EmptyState } from '@/components/ui/primitives'

// Shared ERP data table (design-system §19/§21). Centralises the composition
// every list page repeats — ResponsiveTable + .th/.td classes + TableSkeleton +
// EmptyState — behind typed column definitions, so modules render tables
// consistently and gain features (sticky headers, future sorting) in ONE place.
// Deliberately presentational: search/filter/pagination stay in the page (they
// are business state), and rows are whatever the page already computed
// (e.g. `pg.pageItems`), so adopting it changes no behaviour.

export interface DataTableColumn<T> {
  key: string
  header: ReactNode
  /** Applied to the header cell (e.g. 'text-right'). */
  headerClassName?: string
  /** Applied to every body cell of this column. */
  cellClassName?: string
  render: (row: T) => ReactNode
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  loadingRows = 8,
  empty,
  maxHeight,
  minWidthClassName,
  rowClassName,
}: {
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  loading?: boolean
  loadingRows?: number
  /** Shown when not loading and rows is empty. */
  empty: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }
  /** When set (e.g. 'max-h-[70vh]'), the table scrolls vertically inside the
   * card and the header row sticks — otherwise the page scrolls as before. */
  maxHeight?: string
  /** Override the table min-width (default min-w-full) for wide tables. */
  minWidthClassName?: string
  rowClassName?: (row: T) => string | undefined
}) {
  if (loading) return <TableSkeleton rows={loadingRows} cols={columns.length} />
  if (rows.length === 0)
    return (
      <EmptyState
        icon={empty.icon}
        title={empty.title}
        description={empty.description}
        action={empty.action}
      />
    )

  const sticky = Boolean(maxHeight)

  return (
    <div className={clsx('w-full overflow-x-auto', sticky && clsx('overflow-y-auto', maxHeight))}>
      <table className={clsx('w-full border-collapse', minWidthClassName ?? 'min-w-full')}>
        <thead>
          <tr className={clsx('border-b border-slate-100', sticky && 'sticky top-0 z-10')}>
            {columns.map((col) => (
              <th key={col.key} className={clsx('th', col.headerClassName)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((row) => (
            <tr key={rowKey(row)} className={clsx('hover:bg-slate-50/60', rowClassName?.(row))}>
              {columns.map((col) => (
                <td key={col.key} className={clsx('td', col.cellClassName)}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
