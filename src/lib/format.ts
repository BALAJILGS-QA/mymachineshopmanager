import { format, parseISO, isValid, startOfMonth, endOfMonth } from 'date-fns'

let CURRENCY_SYMBOL = '₹'
let CURRENCY_CODE = 'INR'

export function setCurrency(symbol: string, code: string) {
  CURRENCY_SYMBOL = symbol
  CURRENCY_CODE = code
}

export function currency(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n))
  const sign = n < 0 ? '-' : ''
  return `${sign}${CURRENCY_SYMBOL}${formatted}`
}

export function currencyCode(): string {
  return CURRENCY_CODE
}

export function qty(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(n)
}

export function fmtDate(value?: string | null): string {
  if (!value) return '—'
  const d = value.length <= 10 ? parseISO(value) : new Date(value)
  return isValid(d) ? format(d, 'dd MMM yyyy') : '—'
}

export function fmtDateTime(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return isValid(d) ? format(d, 'dd MMM yyyy, HH:mm') : '—'
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

// Current-month prefix ('yyyy-MM') for filtering ISO dates by this month.
export function thisMonthPrefix(): string {
  return format(new Date(), 'yyyy-MM')
}

// Human label for the current month, e.g. "August 2026".
export function thisMonthLabel(): string {
  return format(new Date(), 'MMMM yyyy')
}

// First / last day of the current month as ISO dates (for default date-range filters).
export function monthStartISO(): string {
  return format(startOfMonth(new Date()), 'yyyy-MM-dd')
}
export function monthEndISO(): string {
  return format(endOfMonth(new Date()), 'yyyy-MM-dd')
}

// Inclusive date-range test for ISO date strings ('' bounds mean unbounded).
export function inRange(date: string, from: string, to: string): boolean {
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}

export function nowISO(): string {
  return new Date().toISOString()
}
