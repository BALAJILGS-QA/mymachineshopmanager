import { useEffect, useRef, useState } from 'react'
import { Calendar } from 'lucide-react'
import { clsx } from 'clsx'

// A date field that always DISPLAYS as dd-mm-yyyy (native <input type="date">
// renders in the browser locale, which we can't control), while still storing
// and emitting ISO yyyy-mm-dd so every caller/handler is unchanged. A calendar
// button opens the native date picker for point-and-click selection; the text
// box also accepts typed dd-mm-yyyy (or dd/mm/yyyy). Empty value ⇒ empty field.

function isoToDisplay(iso?: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return ''
  return `${d}-${m}-${y}`
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
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  const dt = new Date(`${iso}T00:00:00`)
  if (dt.getUTCMonth() + 1 !== mo || dt.getUTCDate() !== dd) return null
  return iso
}

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
  const nativeRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(() => isoToDisplay(value))
  const [focused, setFocused] = useState(false)

  // Reflect external value changes (reset, prefill) when not actively editing.
  useEffect(() => {
    if (!focused) setText(isoToDisplay(value))
  }, [value, focused])

  function handleText(v: string) {
    setText(v)
    if (v.trim() === '') {
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

  function openPicker() {
    const el = nativeRef.current
    if (!el) return
    if (typeof el.showPicker === 'function') el.showPicker()
    else el.focus()
  }

  return (
    <div className={clsx('relative', className)}>
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
        onClick={openPicker}
        aria-label="Open calendar"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 disabled:opacity-40"
      >
        <Calendar size={16} />
      </button>
      {/* Hidden native picker — drives the calendar UI; value stays ISO. */}
      <input
        ref={nativeRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="pointer-events-none absolute bottom-0 left-3 h-0 w-0 opacity-0"
      />
    </div>
  )
}
