import { Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card, Select } from '@/components/ui/primitives'
import { useDb } from '@/data/store'

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <Card className="mb-3 p-3">
      <div className="flex flex-wrap items-end gap-2">{children}</div>
    </Card>
  )
}

export function SearchBox({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="relative min-w-[10rem] flex-1">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
      <input
        className="input pl-9"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export function CompanyFilter({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const companies = useDb((db) => db.companies)
  return (
    <div>
      <label className="label">Company</label>
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="min-w-[9rem]">
        <option value="">All companies</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </div>
  )
}

export function DateRangeFilter({
  from,
  to,
  onFrom,
  onTo,
}: {
  from: string
  to: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
}) {
  return (
    <>
      <div>
        <label className="label">From</label>
        <input type="date" className="input" value={from} onChange={(e) => onFrom(e.target.value)} />
      </div>
      <div>
        <label className="label">To</label>
        <input type="date" className="input" value={to} onChange={(e) => onTo(e.target.value)} />
      </div>
    </>
  )
}

export function inRange(date: string, from: string, to: string): boolean {
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}
