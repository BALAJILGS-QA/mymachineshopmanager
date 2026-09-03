// Domain types for the HRM module. Field names mirror the camelCase side of the
// rowMap `maps.*` entries (src/lib/api/rowMap.ts); the DB columns are snake_case.

export type EmployeeStatus =
  | 'active'
  | 'probation'
  | 'on_leave'
  | 'suspended'
  | 'resigned'
  | 'terminated'
  | 'retired'
  | 'inactive'

export interface Department {
  id: string
  companyId?: string
  code: string
  name: string
  description?: string
  parentId?: string
  headEmployeeId?: string
  active: boolean
  createdAt?: string
  updatedAt?: string
}

export interface Designation {
  id: string
  companyId?: string
  code: string
  name: string
  departmentId?: string
  grade?: string
  description?: string
  active: boolean
  createdAt?: string
  updatedAt?: string
}

export interface Employee {
  id: string
  companyId?: string
  employeeCode: string
  firstName: string
  middleName?: string
  lastName?: string
  displayName?: string
  photoUrl?: string
  gender?: string
  dateOfBirth?: string
  nationality?: string
  maritalStatus?: string
  personalEmail?: string
  workEmail?: string
  mobile?: string
  alternateMobile?: string
  addressLine?: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
  emergencyName?: string
  emergencyRelation?: string
  emergencyPhone?: string
  dateOfJoining?: string
  employmentType?: string
  departmentId?: string
  designationId?: string
  reportingManagerId?: string
  location?: string
  branch?: string
  workLocation?: string
  shiftId?: string
  status: EmployeeStatus
  confirmationDate?: string
  probationMonths?: number
  noticePeriodDays?: number
  dateOfLeaving?: string
  reasonForLeaving?: string
  bankAccountNo?: string
  bankName?: string
  bankIfsc?: string
  bankAccountHolder?: string
  paymentMethod?: string
  statutory?: Record<string, unknown>
  notes?: string
  archivedAt?: string
  createdAt?: string
  updatedAt?: string
  createdBy?: string
}

export interface Shift {
  id: string
  companyId?: string
  code: string
  name: string
  startTime: string
  endTime: string
  breakMinutes: number
  graceMinutes: number
  lateAfterMinutes: number
  earlyExitMinutes: number
  otAfterMinutes?: number
  workingDays: number[]
  isOvernight: boolean
  active: boolean
  createdAt?: string
  updatedAt?: string
}

export interface Holiday {
  id: string
  companyId?: string
  name: string
  holidayDate: string
  type: 'company' | 'regional' | 'optional'
  location?: string
  departmentId?: string
  active: boolean
  createdAt?: string
  updatedAt?: string
}

export interface LeaveType {
  id: string
  companyId?: string
  code: string
  name: string
  isPaid: boolean
  annualQuota: number
  accrual: 'yearly' | 'monthly' | 'none'
  carryForward: boolean
  maxCarryForward?: number
  allowHalfDay: boolean
  allowNegative: boolean
  probationEligible: boolean
  requiresHrApproval: boolean
  color?: string
  active: boolean
  createdAt?: string
  updatedAt?: string
}

export interface LeaveBalance {
  id: string
  employeeId: string
  leaveTypeId: string
  year: number
  opening: number
  accrued: number
  used: number
  pending: number
  adjusted: number
}

export type LeaveStatus =
  'draft' | 'submitted' | 'manager_approved' | 'approved' | 'rejected' | 'cancelled'

export interface LeaveApplication {
  id: string
  companyId?: string
  employeeId: string
  leaveTypeId: string
  startDate: string
  endDate: string
  isHalfDay: boolean
  halfDayPart?: string
  days: number
  reason?: string
  attachmentUrl?: string
  status: LeaveStatus
  managerId?: string
  decidedBy?: string
  decidedAt?: string
  decisionNote?: string
  createdAt?: string
  updatedAt?: string
}

export type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'half_day'
  | 'late'
  | 'early_exit'
  | 'overtime'
  | 'wfh'
  | 'on_duty'
  | 'holiday'
  | 'weekly_off'
  | 'leave'

export interface Attendance {
  id: string
  companyId?: string
  employeeId: string
  attendanceDate: string
  shiftId?: string
  checkIn?: string
  checkOut?: string
  totalMinutes?: number
  regularMinutes?: number
  overtimeMinutes?: number
  status: AttendanceStatus
  source: 'manual' | 'admin' | 'biometric' | 'import' | 'api'
  remarks?: string
  createdAt?: string
}

export interface SalaryComponent {
  id: string
  companyId?: string
  code: string
  name: string
  kind: 'earning' | 'deduction'
  calcType: 'fixed' | 'percent_of_basic' | 'percent_of_gross' | 'formula'
  isStatutory: boolean
  taxable: boolean
  sort: number
  active: boolean
}

export interface PayrollPeriod {
  id: string
  companyId?: string
  name: string
  startDate: string
  endDate: string
  payDate?: string
  status: 'draft' | 'processing' | 'calculated' | 'reviewed' | 'approved' | 'finalized' | 'locked'
  createdAt?: string
  updatedAt?: string
}

export interface PayrollRun {
  id: string
  periodId: string
  companyId?: string
  status: 'draft' | 'calculated' | 'approved' | 'finalized'
  runAt?: string
  runBy?: string
  employeeCount: number
  grossTotal: number
  deductionTotal: number
  netTotal: number
}

export interface PayComponentLine {
  code: string
  name: string
  amount: number
}

export interface PayrollRecord {
  id: string
  runId: string
  periodId: string
  employeeId: string
  gross: number
  totalDeductions: number
  net: number
  paidDays?: number
  lopDays?: number
  earnings: PayComponentLine[]
  deductions: PayComponentLine[]
}

export interface EmployeeDocument {
  id: string
  companyId?: string
  employeeId: string
  documentTypeId?: string
  title: string
  documentNo?: string
  issueDate?: string
  expiryDate?: string
  filePath?: string
  status: string
  remarks?: string
  createdAt?: string
}

export interface EmployeeAsset {
  id: string
  companyId?: string
  code?: string
  name: string
  category?: string
  serialNo?: string
  status: 'available' | 'assigned' | 'retired'
  createdAt?: string
}

export interface EmployeeAdvance {
  id: string
  companyId?: string
  employeeId: string
  amount: number
  reason?: string
  advanceDate: string
  installments: number
  outstanding: number
  status: 'pending' | 'approved' | 'active' | 'closed' | 'rejected'
  approvedBy?: string
}

export interface ExpenseCategory {
  id: string
  companyId?: string
  code: string
  name: string
  active: boolean
}

export interface ExpenseClaim {
  id: string
  companyId?: string
  employeeId: string
  categoryId?: string
  amount: number
  claimDate: string
  description?: string
  receiptPath?: string
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid'
  approver?: string
  decidedAt?: string
}

export interface JobOpening {
  id: string
  companyId?: string
  title: string
  departmentId?: string
  designationId?: string
  location?: string
  employmentType?: string
  openings: number
  description?: string
  requirements?: string
  status: 'draft' | 'open' | 'on_hold' | 'closed'
  createdAt?: string
}

export interface Candidate {
  id: string
  companyId?: string
  jobId?: string
  name: string
  email?: string
  phone?: string
  resumePath?: string
  source?: string
  stage: 'applied' | 'screening' | 'interview' | 'selected' | 'rejected' | 'offer' | 'joined'
  rating?: number
  notes?: string
  createdAt?: string
}

export interface PerformanceCycle {
  id: string
  companyId?: string
  name: string
  startDate?: string
  endDate?: string
  ratingScale: number
  status: 'draft' | 'active' | 'closed'
}

export interface PerformanceReview {
  id: string
  cycleId: string
  employeeId: string
  reviewerId?: string
  selfRating?: number
  managerRating?: number
  finalRating?: number
  status: 'pending' | 'self' | 'manager' | 'completed'
  comments?: string
}

export interface TrainingProgram {
  id: string
  companyId?: string
  code?: string
  name: string
  category?: string
  description?: string
  active: boolean
}

export interface TrainingSession {
  id: string
  programId: string
  trainer?: string
  startDate?: string
  endDate?: string
  durationHours?: number
  location?: string
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled'
}

// RBAC (from migration 0019)
export interface HrRole {
  id: string
  key: string
  name: string
  description?: string
  isSystem: boolean
}

export interface HrPermission {
  key: string
  module: string
  label: string
  description?: string
  sort: number
}

export interface HrUserRole {
  id: string
  email: string
  roleId: string
  companyId?: string
  createdAt?: string
}

export interface HrNotification {
  id: string
  recipientEmail: string
  type: string
  title: string
  body?: string
  entity?: string
  entityId?: string
  link?: string
  isRead: boolean
  createdAt: string
  readAt?: string
}

export interface HrAuditEntry {
  id: string
  at: string
  actorEmail?: string
  actorName?: string
  action: string
  entity: string
  entityId?: string
  companyId?: string
  summary?: string
}
