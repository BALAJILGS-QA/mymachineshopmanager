import { useMemo } from 'react'
import {
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Clock,
  FileText,
  GraduationCap,
  Laptop,
  Plane,
  Target,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { Card } from '@/components/ui/primitives'
import { AppLink } from '@/components/nav/app-link'
import { todayISO } from '@/lib/format'
import {
  useAttendance,
  useCandidates,
  useDepartments,
  useEmployees,
  useJobOpenings,
  useLeaveApplications,
} from '../hooks/useHrm'
import { usePermissions } from '../permissions'

const QUICK_LINKS = [
  { to: '/app/hrm/employees', label: 'Employees', icon: Users, tone: 'blue' as const },
  { to: '/app/hrm/organization', label: 'Departments', icon: Building2, tone: 'cyan' as const },
  { to: '/app/hrm/designations', label: 'Designations', icon: BadgeCheck, tone: 'cyan' as const },
  { to: '/app/hrm/attendance', label: 'Attendance', icon: CalendarCheck, tone: 'green' as const },
  { to: '/app/hrm/shifts', label: 'Shifts', icon: Clock, tone: 'violet' as const },
  { to: '/app/hrm/leave', label: 'Leave', icon: Plane, tone: 'orange' as const },
  { to: '/app/hrm/holidays', label: 'Holidays', icon: CalendarDays, tone: 'amber' as const },
  { to: '/app/hrm/payroll', label: 'Payroll', icon: Wallet, tone: 'green' as const },
  { to: '/app/hrm/documents', label: 'Documents', icon: FileText, tone: 'slate' as const },
  { to: '/app/hrm/assets', label: 'Assets', icon: Laptop, tone: 'cyan' as const },
  { to: '/app/hrm/expenses', label: 'Advances & Expenses', icon: Wallet, tone: 'amber' as const },
  { to: '/app/hrm/recruitment', label: 'Recruitment', icon: Briefcase, tone: 'purple' as const },
  { to: '/app/hrm/performance', label: 'Performance', icon: Target, tone: 'purple' as const },
  { to: '/app/hrm/training', label: 'Training', icon: GraduationCap, tone: 'cyan' as const },
]

export function HrDashboard() {
  const employees = useEmployees().data ?? []
  const attendance = useAttendance().list.data ?? []
  const applications = useLeaveApplications().data ?? []
  const openings = useJobOpenings().list.data ?? []
  const candidates = useCandidates().list.data ?? []
  const departments = useDepartments().list.data ?? []
  const perms = usePermissions()

  const today = todayISO()
  const stats = useMemo(() => {
    const active = employees.filter((e) => e.status === 'active' || e.status === 'probation')
    const monthPrefix = today.slice(0, 7)
    const newJoiners = employees.filter((e) => (e.dateOfJoining ?? '').startsWith(monthPrefix))
    const todays = attendance.filter((a) => a.attendanceDate === today)
    const present = todays.filter((a) =>
      ['present', 'late', 'wfh', 'on_duty', 'overtime'].includes(a.status),
    )
    const absent = todays.filter((a) => a.status === 'absent')
    const onLeave = applications.filter(
      (a) => a.status === 'approved' && a.startDate <= today && a.endDate >= today,
    )
    const pendingLeave = applications.filter(
      (a) => a.status === 'submitted' || a.status === 'manager_approved',
    )
    const openPositions = openings.filter((o) => o.status === 'open')
    return {
      total: employees.length,
      active: active.length,
      newJoiners: newJoiners.length,
      present: present.length,
      absent: absent.length,
      onLeave: onLeave.length,
      pendingLeave: pendingLeave.length,
      openPositions: openPositions.length,
      candidates: candidates.length,
      departments: departments.length,
    }
  }, [employees, attendance, applications, openings, candidates, departments, today])

  const links = QUICK_LINKS

  return (
    <div>
      <PageHeader
        title="HR Dashboard"
        subtitle="Workforce overview — headcount, attendance, leave and hiring at a glance"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile
          icon={<Users size={20} />}
          label="Total Employees"
          value={stats.total}
          tone="blue"
          to="/app/hrm/employees"
        />
        <StatTile
          icon={<BadgeCheck size={20} />}
          label="Active"
          value={stats.active}
          tone="green"
        />
        <StatTile
          icon={<UserPlus size={20} />}
          label="New Joiners (mo)"
          value={stats.newJoiners}
          tone="purple"
        />
        <StatTile
          icon={<CalendarCheck size={20} />}
          label="Present Today"
          value={stats.present}
          tone="green"
        />
        <StatTile icon={<Users size={20} />} label="Absent Today" value={stats.absent} tone="red" />
        <StatTile
          icon={<Plane size={20} />}
          label="On Leave Today"
          value={stats.onLeave}
          tone="orange"
          to="/app/hrm/leave"
        />
        <StatTile
          icon={<CalendarClock size={20} />}
          label="Pending Leave"
          value={stats.pendingLeave}
          tone="orange"
          to="/app/hrm/leave"
        />
        <StatTile
          icon={<Briefcase size={20} />}
          label="Open Positions"
          value={stats.openPositions}
          tone="purple"
          to="/app/hrm/recruitment"
        />
      </div>

      <Card className="mt-4 p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-800">Quick access</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {links.map((l) => {
            const Icon = l.icon
            return (
              <AppLink
                key={l.to}
                to={l.to}
                className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-3 text-center transition-all hover:-translate-y-px hover:border-brand-300 hover:shadow-sm"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-600">
                  <Icon size={18} />
                </span>
                <span className="text-xs font-medium text-slate-700">{l.label}</span>
              </AppLink>
            )
          })}
        </div>
      </Card>

      {!perms.can('HRM_VIEW') && !perms.isLoading && (
        <p className="mt-4 text-center text-xs text-slate-400">
          Some HR areas may be hidden based on your role.
        </p>
      )}
    </div>
  )
}
