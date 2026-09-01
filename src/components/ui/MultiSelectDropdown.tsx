import { ChevronDown } from 'lucide-react'

export interface MultiSelectOption {
  id: string
  label: string
  hint?: string
}

// A compact checkbox dropdown (built on <details> so it needs no outside-click
// wiring) for picking several options at once. Used to map multiple materials
// onto a delivery challan / invoice in one go — each tick adds a line.
export function MultiSelectDropdown({
  options,
  selectedIds,
  onToggle,
  placeholder = 'Select…',
  emptyText = 'No options',
}: {
  options: MultiSelectOption[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  placeholder?: string
  emptyText?: string
}) {
  return (
    <details className="group">
      <summary className="input flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
        <span className={selectedIds.size ? 'text-slate-800' : 'text-slate-500'}>
          {selectedIds.size ? `${selectedIds.size} selected` : placeholder}
        </span>
        <ChevronDown size={16} className="text-slate-500 transition group-open:rotate-180" />
      </summary>
      <div className="mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white p-1">
        {options.length === 0 ? (
          <div className="px-2 py-2 text-xs text-slate-500">{emptyText}</div>
        ) : (
          options.map((o) => (
            <label
              key={o.id}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand-600"
                checked={selectedIds.has(o.id)}
                onChange={() => onToggle(o.id)}
              />
              <span className="min-w-0 flex-1 text-slate-700">
                {o.label}
                {o.hint && <span className="ml-1 text-2xs text-slate-500">({o.hint})</span>}
              </span>
            </label>
          ))
        )}
      </div>
    </details>
  )
}
