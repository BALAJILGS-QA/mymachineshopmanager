'use client'

// Reusable employee <select> — the single way other modules reference a person
// from the HRM employee registry (HRM-B). Self-contained: loads employees itself.

import { useEmployees } from '../hooks/useHrm'
import type { Employee } from '../types'
import { Select } from '@/components/ui/primitives'

export function employeeName(e?: Employee): string {
  if (!e) return '—'
  return e.displayName || [e.firstName, e.lastName].filter(Boolean).join(' ') || e.employeeCode
}

export function EmployeePicker({
  value,
  onChange,
  placeholder = '— unassigned —',
  activeOnly = true,
  disabled,
  className,
}: {
  value: string
  onChange: (employeeId: string) => void
  placeholder?: string
  activeOnly?: boolean
  disabled?: boolean
  className?: string
}) {
  const { data: employees = [] } = useEmployees()
  const list = activeOnly
    ? employees.filter((e) => String(e.status).toLowerCase() === 'active')
    : employees
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={className}
    >
      <option value="">{placeholder}</option>
      {list.map((e) => (
        <option key={e.id} value={e.id}>
          {employeeName(e)}
        </option>
      ))}
    </Select>
  )
}
