// HRM data access. Simple entities go through the shared generic CRUD
// (selectAll/insertRow/updateRow/deleteRow over the rowMap `maps`); rule-bearing
// operations (employee-code generation, leave apply/decide, payroll run/finalize,
// role assignment) go through the Postgres RPCs from migrations 0019–0021.
//
// Reads degrade to [] when Supabase is not configured (local dev) so pages never
// crash; writes require Supabase and surface a friendly error otherwise.

import { supabase, isSupabaseEnabled } from '@/data/supabase'
import { maps } from '@/lib/api/rowMap'
import { selectAll, insertRow, updateRow, deleteRow } from '@/lib/api/supabaseCrud'
import { uid } from '@/lib/id'
import type {
  Attendance,
  Candidate,
  Department,
  Designation,
  Employee,
  EmployeeAdvance,
  EmployeeAsset,
  EmployeeDocument,
  ExpenseCategory,
  ExpenseClaim,
  Holiday,
  HrAuditEntry,
  HrNotification,
  HrPermission,
  HrRole,
  HrUserRole,
  JobOpening,
  LeaveApplication,
  LeaveBalance,
  LeaveType,
  PayrollPeriod,
  PayrollRecord,
  PayrollRun,
  PerformanceCycle,
  PerformanceReview,
  SalaryComponent,
  Shift,
  TrainingProgram,
  TrainingSession,
} from './types'

type MapKey = keyof typeof maps

function enabled(): boolean {
  return isSupabaseEnabled() && !!supabase
}

// Generic CRUD bound to one rowMap entry. `idPrefix` seeds client-generated ids.
function crud<T extends { id: string }>(mapKey: MapKey, idPrefix: string) {
  const map = maps[mapKey]
  return {
    list: async (): Promise<T[]> => (enabled() ? selectAll<T>(map) : []),
    create: async (input: Partial<T>): Promise<T> => {
      const entity = { id: uid(idPrefix), ...input } as Record<string, unknown>
      return insertRow<T>(map, entity)
    },
    update: async (id: string, patch: Partial<T>): Promise<T> =>
      updateRow<T>(map, id, patch as Record<string, unknown>),
    remove: async (id: string): Promise<void> => deleteRow(map, id),
  }
}

// ---- Simple masters --------------------------------------------------------
export const departmentsApi = crud<Department>('departments', 'dept_')
export const designationsApi = crud<Designation>('designations', 'desg_')
export const shiftsApi = crud<Shift>('shifts', 'shft_')
export const holidaysApi = crud<Holiday>('holidays', 'hol_')
export const leaveTypesApi = crud<LeaveType>('leaveTypes', 'ltyp_')
export const salaryComponentsApi = crud<SalaryComponent>('salaryComponents', 'salc_')
export const payrollPeriodsApi = crud<PayrollPeriod>('payrollPeriods', 'pper_')
export const documentTypesApi = crud<EmployeeDocument>('documentTypes', 'doct_')
export const employeeDocumentsApi = crud<EmployeeDocument>('employeeDocuments', 'edoc_')
export const employeeAssetsApi = crud<EmployeeAsset>('employeeAssets', 'asst_')
export const employeeAdvancesApi = crud<EmployeeAdvance>('employeeAdvances', 'adv_')
export const expenseCategoriesApi = crud<ExpenseCategory>('expenseCategories', 'exc_')
export const expenseClaimsApi = crud<ExpenseClaim>('expenseClaims', 'exp_')
export const jobOpeningsApi = crud<JobOpening>('jobOpenings', 'job_')
export const candidatesApi = crud<Candidate>('candidates', 'cand_')
export const performanceCyclesApi = crud<PerformanceCycle>('performanceCycles', 'pcyc_')
export const performanceReviewsApi = crud<PerformanceReview>('performanceReviews', 'prev_')
export const trainingProgramsApi = crud<TrainingProgram>('trainingPrograms', 'tprg_')
export const trainingSessionsApi = crud<TrainingSession>('trainingSessions', 'tses_')
export const attendanceApi = crud<Attendance>('attendance', 'att_')
export const leaveApplicationsApi = crud<LeaveApplication>('leaveApplications', 'lapp_')
export const leaveBalancesApi = crud<LeaveBalance>('leaveBalances', 'lbal_')

// ---- Employees (create routed through the RPC for immutable code) -----------
export const employeesApi = {
  list: async (): Promise<Employee[]> => (enabled() ? selectAll<Employee>(maps.employees) : []),
  get: async (id: string): Promise<Employee | undefined> => {
    if (!enabled() || !supabase) return undefined
    const { data, error } = await supabase.from('employees').select('*').eq('id', id).single()
    if (error) throw error
    const { fromRow } = await import('@/lib/api/rowMap')
    return fromRow<Employee>(data, maps.employees)
  },
  create: async (input: Partial<Employee>): Promise<Employee> => {
    // Generate the immutable employee_code server-side, then insert.
    let code = input.employeeCode
    if (!code && supabase) {
      const { data, error } = await supabase.rpc('hr_next_employee_code')
      if (error) throw error
      code = data as string
    }
    return insertRow<Employee>(maps.employees, {
      id: uid('emp_'),
      status: 'active',
      ...input,
      employeeCode: code,
    } as Record<string, unknown>)
  },
  update: async (id: string, patch: Partial<Employee>): Promise<Employee> =>
    updateRow<Employee>(maps.employees, id, patch as Record<string, unknown>),
  // Soft-delete / archive rather than destroy history.
  archive: async (id: string): Promise<Employee> =>
    updateRow<Employee>(maps.employees, id, {
      status: 'inactive',
      archivedAt: new Date().toISOString(),
    } as Record<string, unknown>),
}

// ---- Leave (RPC-backed workflow) -------------------------------------------
export async function applyLeave(input: {
  employeeId: string
  leaveTypeId: string
  startDate: string
  endDate: string
  isHalfDay?: boolean
  halfDayPart?: string | null
  days?: number | null
  reason?: string | null
  attachmentUrl?: string | null
}): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('hr_apply_leave', {
    p_employee_id: input.employeeId,
    p_leave_type_id: input.leaveTypeId,
    p_start: input.startDate,
    p_end: input.endDate,
    p_is_half_day: input.isHalfDay ?? false,
    p_half_part: input.halfDayPart ?? null,
    p_days: input.days ?? null,
    p_reason: input.reason ?? null,
    p_attachment_url: input.attachmentUrl ?? null,
  })
  if (error) throw error
  return data as string
}

export async function decideLeave(
  appId: string,
  decision: 'approve' | 'reject' | 'cancel',
  note?: string,
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.rpc('hr_decide_leave', {
    p_app_id: appId,
    p_decision: decision,
    p_note: note ?? null,
  })
  if (error) throw error
}

export async function listLeaveBalances(employeeId?: string): Promise<LeaveBalance[]> {
  if (!enabled() || !supabase) return []
  let q = supabase.from('leave_balances').select('*')
  if (employeeId) q = q.eq('employee_id', employeeId)
  const { data, error } = await q
  if (error) throw error
  const { fromRow } = await import('@/lib/api/rowMap')
  return (data ?? []).map((r) => fromRow<LeaveBalance>(r, maps.leaveBalances))
}

// ---- Payroll (RPC-backed) --------------------------------------------------
export async function runPayroll(periodId: string, force = false): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('hr_run_payroll', {
    p_period_id: periodId,
    p_force: force,
  })
  if (error) throw error
  return data as string
}

export async function finalizePayroll(periodId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.rpc('hr_finalize_payroll', { p_period_id: periodId })
  if (error) throw error
}

export async function listPayrollRuns(periodId?: string): Promise<PayrollRun[]> {
  if (!enabled() || !supabase) return []
  let q = supabase.from('payroll_runs').select('*').order('run_at', { ascending: false })
  if (periodId) q = q.eq('period_id', periodId)
  const { data, error } = await q
  if (error) throw error
  const { fromRow } = await import('@/lib/api/rowMap')
  return (data ?? []).map((r) => fromRow<PayrollRun>(r, maps.payrollRuns))
}

export async function listPayrollRecords(runId: string): Promise<PayrollRecord[]> {
  if (!enabled() || !supabase) return []
  const { data, error } = await supabase.from('payroll_records').select('*').eq('run_id', runId)
  if (error) throw error
  const { fromRow } = await import('@/lib/api/rowMap')
  return (data ?? []).map((r) => {
    const rec = fromRow<PayrollRecord>(r, maps.payrollRecords)
    // jsonb columns arrive as arrays already; coerce defensively.
    rec.earnings = (r.earnings as PayrollRecord['earnings']) ?? []
    rec.deductions = (r.deductions as PayrollRecord['deductions']) ?? []
    return rec
  })
}

// ---- RBAC read + role assignment (RPC) -------------------------------------
export async function listRoles(): Promise<HrRole[]> {
  if (!enabled() || !supabase) return []
  const { data, error } = await supabase.from('hr_roles').select('*').order('name')
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: String(r.id),
    key: String(r.key),
    name: String(r.name),
    description: (r.description as string) ?? undefined,
    isSystem: !!r.is_system,
  }))
}

export async function listPermissionCatalog(): Promise<HrPermission[]> {
  if (!enabled() || !supabase) return []
  const { data, error } = await supabase.from('hr_permissions').select('*').order('sort')
  if (error) throw error
  return (data ?? []).map((r) => ({
    key: String(r.key),
    module: String(r.module),
    label: String(r.label),
    description: (r.description as string) ?? undefined,
    sort: Number(r.sort ?? 0),
  }))
}

export async function listUserRoles(): Promise<HrUserRole[]> {
  if (!enabled() || !supabase) return []
  const { data, error } = await supabase
    .from('hr_user_roles')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: String(r.id),
    email: String(r.email),
    roleId: String(r.role_id),
    companyId: (r.company_id as string) ?? undefined,
    createdAt: (r.created_at as string) ?? undefined,
  }))
}

export async function assignRole(
  email: string,
  roleKey: string,
  companyId?: string,
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.rpc('hr_assign_role', {
    p_email: email,
    p_role_key: roleKey,
    p_company_id: companyId ?? null,
  })
  if (error) throw error
}

export async function revokeRole(
  email: string,
  roleKey: string,
  companyId?: string,
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.rpc('hr_revoke_role', {
    p_email: email,
    p_role_key: roleKey,
    p_company_id: companyId ?? null,
  })
  if (error) throw error
}

// ---- HR settings (singleton jsonb blob) ------------------------------------
export interface HrSettings {
  employeeCode?: { prefix?: string; padding?: number; next?: number }
  [key: string]: unknown
}

export async function getHrSettings(): Promise<HrSettings> {
  if (!enabled() || !supabase) return {}
  const { data, error } = await supabase
    .from('hr_settings')
    .select('data')
    .eq('id', 'singleton')
    .single()
  if (error) return {}
  return (data?.data as HrSettings) ?? {}
}

export async function saveHrSettings(patch: HrSettings): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')
  const current = await getHrSettings()
  const merged = { ...current, ...patch }
  const { error } = await supabase
    .from('hr_settings')
    .update({ data: merged, updated_at: new Date().toISOString() })
    .eq('id', 'singleton')
  if (error) throw error
}

// ---- Notifications ----------------------------------------------------------
export async function listNotifications(): Promise<HrNotification[]> {
  if (!enabled() || !supabase) return []
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: String(r.id),
    recipientEmail: String(r.recipient_email),
    type: String(r.type),
    title: String(r.title),
    body: (r.body as string) ?? undefined,
    entity: (r.entity as string) ?? undefined,
    entityId: (r.entity_id as string) ?? undefined,
    link: (r.link as string) ?? undefined,
    isRead: !!r.is_read,
    createdAt: String(r.created_at),
    readAt: (r.read_at as string) ?? undefined,
  }))
}

export async function markNotificationRead(id: string): Promise<void> {
  if (!supabase) return
  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id)
}

// ---- Audit log --------------------------------------------------------------
export async function listAuditLog(limit = 200): Promise<HrAuditEntry[]> {
  if (!enabled() || !supabase) return []
  const { data, error } = await supabase
    .from('hr_audit_log')
    .select('*')
    .order('at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: String(r.id),
    at: String(r.at),
    actorEmail: (r.actor_email as string) ?? undefined,
    actorName: (r.actor_name as string) ?? undefined,
    action: String(r.action),
    entity: String(r.entity),
    entityId: (r.entity_id as string) ?? undefined,
    companyId: (r.company_id as string) ?? undefined,
    summary: (r.summary as string) ?? undefined,
  }))
}
