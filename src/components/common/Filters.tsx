import { Search } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Card, Select } from '@/components/ui/primitives'
import { DateInput } from '@/components/ui/DateInput'
import { useCompanies } from '@/features/companies/hooks/useCompanies'

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
  const id = useId()
  return (
    <div className="relative min-w-[10rem] flex-1">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
      <input
        id={id}
        name={id}
        aria-label={placeholder}
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
  const { data: companies = [] } = useCompanies()
  const id = useId()
  return (
    <div>
      <label className="label" htmlFor={id}>
        Company
      </label>
      <Select
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[9rem]"
      >
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
  const fromId = useId()
  const toId = useId()
  return (
    <>
      <div>
        <label className="label" htmlFor={fromId}>
          From
        </label>
        <DateInput id={fromId} name={fromId} value={from} onChange={onFrom} />
      </div>
      <div>
        <label className="label" htmlFor={toId}>
          To
        </label>
        <DateInput id={toId} name={toId} value={to} onChange={onTo} />
      </div>
    </>
  )
}
