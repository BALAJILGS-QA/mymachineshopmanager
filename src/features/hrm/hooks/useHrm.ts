// TanStack Query hooks for HRM. Pages talk only to these; mutations invalidate
// the relevant qk.hrm.* keys so tables reflect writes immediately.

import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import * as api from '../hrmApi'
import type {
  Attendance,
  Candidate,
  Department,
  Designation,
  Employee,
  EmployeeAdvance,
  EmployeeAsset,
  ExpenseCategory,
  ExpenseClaim,
  Holiday,
  JobOpening,
  LeaveType,
  PayrollPeriod,
  PerformanceCycle,
  SalaryComponent,
  Shift,
  TrainingProgram,
} from '../types'

// Generic list + create/update/remove hook set bound to a query key + api object.
interface CrudApi<T> {
  list: () => Promise<T[]>
  create: (input: Partial<T>) => Promise<T>
  update: (id: string, patch: Partial<T>) => Promise<T>
  remove: (id: string) => Promise<void>
}

function useCrud<T extends { id: string }>(key: QueryKey, crud: CrudApi<T>) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: key })
  const list = useQuery({ queryKey: key, queryFn: crud.list })
  const create = useMutation({ mutationFn: crud.create, onSuccess: invalidate })
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<T> }) => crud.update(id, patch),
    onSuccess: invalidate,
  })
  const remove = useMutation({ mutationFn: (id: string) => crud.remove(id), onSuccess: invalidate })
  return { list, create, update, remove }
}

// ---- Masters ---------------------------------------------------------------
export const useDepartments = () => useCrud<Department>(qk.hrm.departments, api.departmentsApi)
export const useDesignations = () => useCrud<Designation>(qk.hrm.designations, api.designationsApi)
export const useShifts = () => useCrud<Shift>(qk.hrm.shifts, api.shiftsApi)
export const useHolidays = () => useCrud<Holiday>(qk.hrm.holidays, api.holidaysApi)
export const useLeaveTypes = () => useCrud<LeaveType>(qk.hrm.leaveTypes, api.leaveTypesApi)
export const useSalaryComponents = () =>
  useCrud<SalaryComponent>(qk.hrm.salaryComponents, api.salaryComponentsApi)
export const usePayrollPeriods = () =>
  useCrud<PayrollPeriod>(qk.hrm.payrollPeriods, api.payrollPeriodsApi)
export const useEmployeeAssets = () => useCrud<EmployeeAsset>(qk.hrm.assets, api.employeeAssetsApi)
export const useEmployeeAdvances = () =>
  useCrud<EmployeeAdvance>(qk.hrm.advances, api.employeeAdvancesApi)
export const useExpenseCategories = () =>
  useCrud<ExpenseCategory>(qk.hrm.expenseCategories, api.expenseCategoriesApi)
export const useExpenseClaims = () =>
  useCrud<ExpenseClaim>(qk.hrm.expenseClaims, api.expenseClaimsApi)
export const useJobOpenings = () => useCrud<JobOpening>(qk.hrm.jobOpenings, api.jobOpeningsApi)
export const useCandidates = () => useCrud<Candidate>(qk.hrm.candidates, api.candidatesApi)
export const usePerformanceCycles = () =>
  useCrud<PerformanceCycle>(qk.hrm.performanceCycles, api.performanceCyclesApi)
export const useTrainingPrograms = () =>
  useCrud<TrainingProgram>(qk.hrm.trainingPrograms, api.trainingProgramsApi)
export const useAttendance = () => useCrud<Attendance>(qk.hrm.attendance, api.attendanceApi)
export const useEmployeeDocuments = () =>
  useCrud<import('../types').EmployeeDocument>(qk.hrm.documents(), api.employeeDocumentsApi)
export const useTrainingSessions = () =>
  useCrud<import('../types').TrainingSession>(qk.hrm.trainingSessions, api.trainingSessionsApi)

// ---- Employees -------------------------------------------------------------
export function useEmployees() {
  return useQuery({ queryKey: qk.hrm.employees, queryFn: api.employeesApi.list })
}

export function useEmployee(id: string | undefined) {
  return useQuery({
    queryKey: id ? qk.hrm.employee(id) : ['hrm', 'employees', 'none'],
    queryFn: () => api.employeesApi.get(id as string),
    enabled: !!id,
  })
}

export function useEmployeeMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.hrm.employees })
  const create = useMutation({ mutationFn: api.employeesApi.create, onSuccess: invalidate })
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Employee> }) =>
      api.employeesApi.update(id, patch),
    onSuccess: (_d, v) => {
      invalidate()
      qc.invalidateQueries({ queryKey: qk.hrm.employee(v.id) })
    },
  })
  const archive = useMutation({ mutationFn: api.employeesApi.archive, onSuccess: invalidate })
  return { create, update, archive }
}

// ---- Leave -----------------------------------------------------------------
export function useLeaveApplications() {
  return useQuery({ queryKey: qk.hrm.leaveApplications, queryFn: api.leaveApplicationsApi.list })
}

export function useLeaveBalances(employeeId?: string) {
  return useQuery({
    queryKey: qk.hrm.leaveBalances(employeeId),
    queryFn: () => api.listLeaveBalances(employeeId),
  })
}

export function useLeaveActions() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.hrm.leaveApplications })
    qc.invalidateQueries({ queryKey: ['hrm', 'leaveBalances'] })
  }
  const apply = useMutation({ mutationFn: api.applyLeave, onSuccess: invalidate })
  const decide = useMutation({
    mutationFn: ({
      appId,
      decision,
      note,
    }: {
      appId: string
      decision: 'approve' | 'reject' | 'cancel'
      note?: string
    }) => api.decideLeave(appId, decision, note),
    onSuccess: invalidate,
  })
  return { apply, decide }
}

// ---- Payroll ---------------------------------------------------------------
export function usePayrollRuns(periodId?: string) {
  return useQuery({
    queryKey: qk.hrm.payrollRuns(periodId),
    queryFn: () => api.listPayrollRuns(periodId),
  })
}

export function usePayrollRecords(runId: string | undefined) {
  return useQuery({
    queryKey: runId ? qk.hrm.payrollRecords(runId) : ['hrm', 'payrollRecords', 'none'],
    queryFn: () => api.listPayrollRecords(runId as string),
    enabled: !!runId,
  })
}

export function usePayrollActions() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.hrm.payrollPeriods })
    qc.invalidateQueries({ queryKey: ['hrm', 'payrollRuns'] })
  }
  const run = useMutation({
    mutationFn: ({ periodId, force }: { periodId: string; force?: boolean }) =>
      api.runPayroll(periodId, force),
    onSuccess: invalidate,
  })
  const finalize = useMutation({ mutationFn: api.finalizePayroll, onSuccess: invalidate })
  return { run, finalize }
}

// ---- RBAC / settings / notifications / audit -------------------------------
export const useHrRoles = () => useQuery({ queryKey: qk.hrm.roles, queryFn: api.listRoles })
export const usePermissionCatalog = () =>
  useQuery({ queryKey: qk.hrm.permissionsCatalog, queryFn: api.listPermissionCatalog })
export const useUserRoles = () =>
  useQuery({ queryKey: qk.hrm.userRoles, queryFn: api.listUserRoles })

export function useRoleActions() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.hrm.userRoles })
  const assign = useMutation({
    mutationFn: ({
      email,
      roleKey,
      companyId,
    }: {
      email: string
      roleKey: string
      companyId?: string
    }) => api.assignRole(email, roleKey, companyId),
    onSuccess: invalidate,
  })
  const revoke = useMutation({
    mutationFn: ({
      email,
      roleKey,
      companyId,
    }: {
      email: string
      roleKey: string
      companyId?: string
    }) => api.revokeRole(email, roleKey, companyId),
    onSuccess: invalidate,
  })
  return { assign, revoke }
}

export const useHrSettings = () =>
  useQuery({ queryKey: qk.hrm.settings, queryFn: api.getHrSettings })

export function useSaveHrSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.saveHrSettings,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.hrm.settings }),
  })
}

export const useHrNotifications = () =>
  useQuery({ queryKey: qk.hrm.notifications, queryFn: api.listNotifications })

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.markNotificationRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.hrm.notifications }),
  })
}

export const useHrAuditLog = () =>
  useQuery({ queryKey: qk.hrm.auditLog, queryFn: () => api.listAuditLog() })
