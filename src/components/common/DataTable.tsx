import type { ReactNode } from 'react'
import { clsx } from 'clsx'
import { TableSkeleton } from './Skeleton'
import { EmptyState } from '@/components/ui/primitives'

// Shared ERP data table (design-system §19/§21). Centralises the composition
// every list page repeats — ResponsiveTable + .th/.td classes + TableSkeleton +
// EmptyState — behind typed column definitions, so modules render tables
// consistently and gain features (sticky headers, mobile cards) in ONE place.
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
  /** Hide this column below the given breakpoint while keeping it in the table at
   * that breakpoint and up. It stays available to the mobile card renderer. */
  hideBelow?: 'md' | 'lg'
  /** Field caption used by the built-in mobile card renderer. Falls back to the
   * `header` when it is a string. */
  mobileLabel?: string
  /** Omit this column from the built-in mobile card (e.g. an actions column that
   * is rendered separately, or data already shown in the card title). */
  hideOnCard?: boolean
}

const HIDE_BELOW: Record<'md' | 'lg', string> = {
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
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
  mobileCard,
  onRowClick,
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
  /** Opt in to a stacked mobile layout. Below `md` the table is replaced by one
   * card per row. Pass a render function for full control, or `true` to use the
   * built-in renderer driven by each column's `mobileLabel` / `hideOnCard`. */
  mobileCard?: ((row: T) => ReactNode) | true
  /** Row click handler, wired on both table rows and mobile cards. */
  onRowClick?: (row: T) => void
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
  const hasCards = Boolean(mobileCard)

  const table = (
    <div
      className={clsx(
        'w-full overflow-x-auto',
        sticky && clsx('overflow-y-auto', maxHeight),
        hasCards && 'hidden md:block',
      )}
    >
      <table className={clsx('w-full border-collapse', minWidthClassName ?? 'min-w-full')}>
        <thead>
          <tr className={clsx('border-b border-slate-100', sticky && 'sticky top-0 z-10')}>
            {columns.map((col) => (
              <th
                key={col.key}
                className={clsx(
                  'th',
                  col.hideBelow && HIDE_BELOW[col.hideBelow],
                  col.headerClassName,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={clsx(
                'hover:bg-slate-50/60',
                onRowClick && 'cursor-pointer',
                rowClassName?.(row),
              )}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={clsx(
                    'td',
                    col.hideBelow && HIDE_BELOW[col.hideBelow],
                    col.cellClassName,
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  if (!hasCards) return table

  const cardColumns = columns.filter((c) => !c.hideOnCard)
  const [titleCol, ...detailCols] = cardColumns

  const renderCardBody =
    typeof mobileCard === 'function'
      ? mobileCard
      : (row: T) => (
          <>
            {titleCol && <div className="font-semibold text-slate-800">{titleCol.render(row)}</div>}
            {detailCols.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                {detailCols.map((col) => (
                  <div key={col.key} className="min-w-0">
                    <dt className="text-2xs uppercase tracking-wide text-slate-400">
                      {col.mobileLabel ?? (typeof col.header === 'string' ? col.header : '')}
                    </dt>
                    <dd className="text-sm text-slate-800">{col.render(row)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )

  return (
    <>
      {table}
      <div className="divide-y divide-slate-100 md:hidden">
        {rows.map((row) =>
          onRowClick ? (
            <button
              key={rowKey(row)}
              type="button"
              onClick={() => onRowClick(row)}
              className={clsx(
                'flex w-full flex-col gap-3 p-4 text-left transition-colors active:bg-slate-50',
                rowClassName?.(row),
              )}
            >
              {renderCardBody(row)}
            </button>
          ) : (
            <div key={rowKey(row)} className={clsx('flex flex-col gap-3 p-4', rowClassName?.(row))}>
              {renderCardBody(row)}
            </div>
          ),
        )}
      </div>
    </>
  )
}
