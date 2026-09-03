import type { ReactNode } from 'react'
import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import type { Department, Designation, Employee, Shift } from '../types'

// Sectioned employee form body used inside the add/edit modal. Grouped logically
// (§62): identity, contact, employment, organisation, banking, emergency. The
// employee code is shown read-only on edit (immutable, §6) and auto-generated on
// create. Banking is only editable by callers with the right permission.
export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'intern', 'temporary']
export const EMPLOYEE_STATUSES = [
  'active',
  'probation',
  'on_leave',
  'suspended',
  'resigned',
  'terminated',
  'retired',
  'inactive',
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-slate-200 p-4">
      <legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500">
        {title}
      </legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

export function EmployeeForm({
  draft,
  patch,
  editing,
  departments,
  designations,
  shifts,
  managers,
  canSeeBanking = true,
}: {
  draft: Record<string, unknown>
  patch: (p: Record<string, unknown>) => void
  editing: boolean
  departments: Department[]
  designations: Designation[]
  shifts: Shift[]
  managers: Employee[]
  canSeeBanking?: boolean
}) {
  const v = (k: string) => String(draft[k] ?? '')
  const filteredDesignations = draft.departmentId
    ? designations.filter((d) => !d.departmentId || d.departmentId === draft.departmentId)
    : designations

  return (
    <div className="space-y-4">
      <Section title="Identity">
        <Field label="Employee code">
          <Input value={v('employeeCode')} disabled placeholder={editing ? '' : 'Auto-generated'} />
        </Field>
        <Field label="Status">
          <Select
            value={v('status') || 'active'}
            onChange={(e) => patch({ status: e.target.value })}
          >
            {EMPLOYEE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="First name" required>
          <Input value={v('firstName')} onChange={(e) => patch({ firstName: e.target.value })} />
        </Field>
        <Field label="Middle name">
          <Input value={v('middleName')} onChange={(e) => patch({ middleName: e.target.value })} />
        </Field>
        <Field label="Last name">
          <Input value={v('lastName')} onChange={(e) => patch({ lastName: e.target.value })} />
        </Field>
        <Field label="Display name">
          <Input
            value={v('displayName')}
            onChange={(e) => patch({ displayName: e.target.value })}
          />
        </Field>
        <Field label="Gender">
          <Select
            value={v('gender')}
            onChange={(e) => patch({ gender: e.target.value || undefined })}
          >
            <option value="">—</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="undisclosed">Prefer not to say</option>
          </Select>
        </Field>
        <Field label="Date of birth">
          <Input
            type="date"
            value={v('dateOfBirth')}
            onChange={(e) => patch({ dateOfBirth: e.target.value || undefined })}
          />
        </Field>
        <Field label="Marital status">
          <Input
            value={v('maritalStatus')}
            onChange={(e) => patch({ maritalStatus: e.target.value })}
          />
        </Field>
        <Field label="Nationality">
          <Input
            value={v('nationality')}
            onChange={(e) => patch({ nationality: e.target.value })}
          />
        </Field>
      </Section>

      <Section title="Contact">
        <Field label="Work email">
          <Input
            type="email"
            value={v('workEmail')}
            onChange={(e) => patch({ workEmail: e.target.value })}
          />
        </Field>
        <Field label="Personal email">
          <Input
            type="email"
            value={v('personalEmail')}
            onChange={(e) => patch({ personalEmail: e.target.value })}
          />
        </Field>
        <Field label="Mobile">
          <Input value={v('mobile')} onChange={(e) => patch({ mobile: e.target.value })} />
        </Field>
        <Field label="Alternate mobile">
          <Input
            value={v('alternateMobile')}
            onChange={(e) => patch({ alternateMobile: e.target.value })}
          />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Textarea
            rows={2}
            value={v('addressLine')}
            onChange={(e) => patch({ addressLine: e.target.value })}
          />
        </Field>
        <Field label="City">
          <Input value={v('city')} onChange={(e) => patch({ city: e.target.value })} />
        </Field>
        <Field label="State">
          <Input value={v('state')} onChange={(e) => patch({ state: e.target.value })} />
        </Field>
        <Field label="Country">
          <Input value={v('country')} onChange={(e) => patch({ country: e.target.value })} />
        </Field>
        <Field label="Postal code">
          <Input value={v('postalCode')} onChange={(e) => patch({ postalCode: e.target.value })} />
        </Field>
      </Section>

      <Section title="Employment">
        <Field label="Date of joining">
          <Input
            type="date"
            value={v('dateOfJoining')}
            onChange={(e) => patch({ dateOfJoining: e.target.value || undefined })}
          />
        </Field>
        <Field label="Employment type">
          <Select
            value={v('employmentType')}
            onChange={(e) => patch({ employmentType: e.target.value || undefined })}
          >
            <option value="">—</option>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace('_', ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Department">
          <Select
            value={v('departmentId')}
            onChange={(e) => patch({ departmentId: e.target.value || undefined })}
          >
            <option value="">—</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Designation">
          <Select
            value={v('designationId')}
            onChange={(e) => patch({ designationId: e.target.value || undefined })}
          >
            <option value="">—</option>
            {filteredDesignations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reporting manager">
          <Select
            value={v('reportingManagerId')}
            onChange={(e) => patch({ reportingManagerId: e.target.value || undefined })}
          >
            <option value="">—</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName || `${m.firstName} ${m.lastName ?? ''}`} ({m.employeeCode})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Shift">
          <Select
            value={v('shiftId')}
            onChange={(e) => patch({ shiftId: e.target.value || undefined })}
          >
            <option value="">—</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Work location">
          <Input
            value={v('workLocation')}
            onChange={(e) => patch({ workLocation: e.target.value })}
          />
        </Field>
        <Field label="Branch">
          <Input value={v('branch')} onChange={(e) => patch({ branch: e.target.value })} />
        </Field>
        <Field label="Probation (months)">
          <Input
            type="number"
            value={v('probationMonths')}
            onChange={(e) =>
              patch({ probationMonths: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </Field>
        <Field label="Notice period (days)">
          <Input
            type="number"
            value={v('noticePeriodDays')}
            onChange={(e) =>
              patch({ noticePeriodDays: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </Field>
      </Section>

      {canSeeBanking && (
        <Section title="Banking">
          <Field label="Account holder name">
            <Input
              value={v('bankAccountHolder')}
              onChange={(e) => patch({ bankAccountHolder: e.target.value })}
            />
          </Field>
          <Field label="Bank name">
            <Input value={v('bankName')} onChange={(e) => patch({ bankName: e.target.value })} />
          </Field>
          <Field label="Account number">
            <Input
              value={v('bankAccountNo')}
              onChange={(e) => patch({ bankAccountNo: e.target.value })}
            />
          </Field>
          <Field label="IFSC / routing">
            <Input value={v('bankIfsc')} onChange={(e) => patch({ bankIfsc: e.target.value })} />
          </Field>
          <Field label="Payment method">
            <Select
              value={v('paymentMethod')}
              onChange={(e) => patch({ paymentMethod: e.target.value || undefined })}
            >
              <option value="">—</option>
              <option value="bank">Bank transfer</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="upi">UPI</option>
            </Select>
          </Field>
        </Section>
      )}

      <Section title="Emergency contact">
        <Field label="Contact name">
          <Input
            value={v('emergencyName')}
            onChange={(e) => patch({ emergencyName: e.target.value })}
          />
        </Field>
        <Field label="Relationship">
          <Input
            value={v('emergencyRelation')}
            onChange={(e) => patch({ emergencyRelation: e.target.value })}
          />
        </Field>
        <Field label="Phone">
          <Input
            value={v('emergencyPhone')}
            onChange={(e) => patch({ emergencyPhone: e.target.value })}
          />
        </Field>
      </Section>
    </div>
  )
}
