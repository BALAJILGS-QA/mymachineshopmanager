import { Badge } from '@/components/ui/primitives'
import type { Employee, EmployeeStatus } from '../types'

export function employeeName(e: Pick<Employee, 'displayName' | 'firstName' | 'lastName'>): string {
  return e.displayName || `${e.firstName} ${e.lastName ?? ''}`.trim()
}

const STATUS: Record<EmployeeStatus, { tone: string; label: string }> = {
  active: { tone: 'green', label: 'Active' },
  probation: { tone: 'amber', label: 'Probation' },
  on_leave: { tone: 'blue', label: 'On Leave' },
  suspended: { tone: 'red', label: 'Suspended' },
  resigned: { tone: 'slate', label: 'Resigned' },
  terminated: { tone: 'red', label: 'Terminated' },
  retired: { tone: 'slate', label: 'Retired' },
  inactive: { tone: 'slate', label: 'Inactive' },
}

export function StatusBadge({ status }: { status: EmployeeStatus }) {
  const s = STATUS[status] ?? STATUS.inactive
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export function EmployeeAvatar({
  employee,
  size = 36,
}: {
  employee: Pick<Employee, 'displayName' | 'firstName' | 'lastName' | 'photoUrl'>
  size?: number
}) {
  const name = employeeName(employee)
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  if (employee.photoUrl) {
    return (
      <img
        src={employee.photoUrl}
        alt={name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover ring-1 ring-slate-200"
      />
    )
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800 ring-1 ring-brand-200"
    >
      {initials || '—'}
    </div>
  )
}
