import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'

// A date field that always DISPLAYS as dd-mm-yyyy while storing and emitting ISO
// yyyy-mm-dd, so every caller/handler is unchanged. Two ways to set a value:
//   1. Type dd-mm-yyyy (or dd/mm/yyyy) directly in the text box.
//   2. Click the calendar button and pick a day from the popup.
// Empty value ⇒ empty field.

function isoToDisplay(iso?: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return ''
  return `${d}-${m}-${y}`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toIso(y: number, mo: number, d: number): string {
  return `${y}-${pad(mo)}-${pad(d)}`
}

// Parse a typed dd-mm-yyyy / dd/mm/yyyy (2- or 4-digit year) into ISO, rejecting
// impossible dates (e.g. 31-02-2025). Returns null when incomplete/invalid.
function displayToIso(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (!m) return null
  const dd = Number(m[1])
  const mo = Number(m[2])
  let y = Number(m[3])
  if (m[3].length === 2) y += 2000
  if (mo < 1 || mo > 12 || dd < 1 || dd > 31 || y < 1900) return null
  const iso = toIso(y, mo, dd)
  // Validate in UTC (note the trailing Z): a bare `T00:00:00` is parsed as local
  // time, so in positive-offset zones (e.g. IST +05:30) getUTCDate() rolls back
  // a day and rejects otherwise-valid dates — which silently cleared the field.
  const dt = new Date(`${iso}T00:00:00Z`)
  if (dt.getUTCMonth() + 1 !== mo || dt.getUTCDate() !== dd) return null
  return iso
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function DateInput({
  value,
  onChange,
  id,
  name,
  disabled,
  className,
  placeholder = 'dd-mm-yyyy',
  'aria-label': ariaLabel,
}: {
  value: string // ISO yyyy-mm-dd, or '' for empty
  onChange: (iso: string) => void
  id?: string
  name?: string
  disabled?: boolean
  className?: string
  placeholder?: string
  'aria-label'?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [text, setText] = useState(() => isoToDisplay(value))
  const [focused, setFocused] = useState(false)
  const [open, setOpen] = useState(false)

  // Reflect external value changes (reset, prefill) when not actively editing.
  useEffect(() => {
    if (!focused) setText(isoToDisplay(value))
  }, [value, focused])

  // The month currently shown in the popup — seeded from the value (or today).
  const [viewMonth, setViewMonth] = useState<{ y: number; m: number }>(() => {
    const base = value ? new Date(`${value}T00:00:00`) : new Date()
    return { y: base.getFullYear(), m: base.getMonth() + 1 }
  })

  // Re-anchor the popup to the selected value each time it opens.
  useEffect(() => {
    if (!open) return
    const base = value ? new Date(`${value}T00:00:00`) : new Date()
    setViewMonth({ y: base.getFullYear(), m: base.getMonth() + 1 })
  }, [open, value])

  // Close the popup on outside click or Escape.
  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Numeric-only, auto-formatted mask: keep at most 8 digits (DDMMYYYY) and
  // insert the dashes so the box can only ever read dd-mm-yyyy. Non-digit
  // characters (letters, spaces, extra separators) are dropped as typed/pasted.
  function maskDigits(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 8)
    if (digits.length > 4) return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`
    if (digits.length > 2) return `${digits.slice(0, 2)}-${digits.slice(2)}`
    return digits
  }

  function handleText(raw: string) {
    const v = maskDigits(raw)
    setText(v)
    if (v === '') {
      onChange('')
      return
    }
    const iso = displayToIso(v)
    if (iso) onChange(iso)
  }

  function handleBlur() {
    setFocused(false)
    // Normalise: snap to the canonical dd-mm-yyyy, or clear if unparseable.
    const iso = text.trim() === '' ? '' : displayToIso(text)
    setText(iso ? isoToDisplay(iso) : isoToDisplay(value))
    if (text.trim() === '') onChange('')
  }

  function pickDay(d: number) {
    const iso = toIso(viewMonth.y, viewMonth.m, d)
    onChange(iso)
    setText(isoToDisplay(iso))
    setOpen(false)
  }

  function shiftMonth(delta: number) {
    setViewMonth((prev) => {
      const idx = prev.m - 1 + delta
      const y = prev.y + Math.floor(idx / 12)
      const m = ((idx % 12) + 12) % 12
      return { y, m: m + 1 }
    })
  }

  // Grid of the visible month: leading blanks + day numbers.
  const cells = useMemo(() => {
    const firstDow = new Date(viewMonth.y, viewMonth.m - 1, 1).getDay()
    const daysInMonth = new Date(viewMonth.y, viewMonth.m, 0).getDate()
    const out: (number | null)[] = []
    for (let i = 0; i < firstDow; i++) out.push(null)
    for (let d = 1; d <= daysInMonth; d++) out.push(d)
    return out
  }, [viewMonth])

  const selected = value ? value.split('-').map(Number) : null // [y, m, d]
  const today = new Date()
  const todayTriple = [today.getFullYear(), today.getMonth() + 1, today.getDate()]

  return (
    <div ref={rootRef} className={clsx('relative', className)}>
      <input
        type="text"
        inputMode="numeric"
        id={id}
        name={name ?? id}
        className="input pr-9"
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        aria-label={ariaLabel}
        autoComplete="off"
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        onChange={(e) => handleText(e.target.value)}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-label="Open calendar"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 disabled:opacity-40"
      >
        <Calendar size={16} />
      </button>

      {open && !disabled && (
        <div
          role="dialog"
          aria-label="Choose date"
          className="absolute left-0 top-full z-[60] mt-1 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="text-sm font-medium text-slate-700">
              {MONTHS[viewMonth.m - 1]} {viewMonth.y}
            </div>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => shiftMonth(1)}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1 text-[11px] font-medium text-slate-400">
                {w}
              </div>
            ))}
            {cells.map((d, i) => {
              if (d === null) return <div key={`b${i}`} />
              const isSelected =
                !!selected &&
                selected[0] === viewMonth.y &&
                selected[1] === viewMonth.m &&
                selected[2] === d
              const isToday =
                todayTriple[0] === viewMonth.y &&
                todayTriple[1] === viewMonth.m &&
                todayTriple[2] === d
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => pickDay(d)}
                  className={clsx(
                    'h-8 rounded text-sm hover:bg-brand-100',
                    isSelected
                      ? 'bg-brand-600 font-semibold text-white hover:bg-brand-600'
                      : 'text-slate-700',
                    !isSelected && isToday && 'ring-1 ring-inset ring-brand-400',
                  )}
                >
                  {d}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
