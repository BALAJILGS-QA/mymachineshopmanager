import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/primitives'
import type { AppUser } from '@/types'
import type { UserSubscription } from './api/subscriptionApi'
import { useSubscriptionEvents } from './hooks/useSubscription'
import {
  billingLabel,
  eventLabel,
  fmtDay,
  planLabel,
  remainingPhrase,
  statusDot,
  statusTone,
  trialDaysUsed,
  trialDuration,
} from './subscriptionView'

// Super-admin subscription detail. Opens from the "Plan & Status" cell on the
// Roles & Permissions page. Read-only — no billing actions, no payment data.
export function SubscriptionDrawer({
  user,
  sub,
  onClose,
}: {
  user: AppUser
  sub: UserSubscription
  onClose: () => void
}) {
  const { data: events = [], isLoading } = useSubscriptionEvents(sub.tenantId, true)
  const duration = trialDuration(sub.trialStartDate, sub.trialEndDate)
  const used = trialDaysUsed(sub.trialStartDate, sub.trialEndDate)

  return (
    <Modal open onClose={onClose} title={`Subscription — ${user.fullName || user.email}`} size="lg">
      <div className="space-y-6">
        <Section title="User information">
          <Grid>
            <Field label="Name" value={user.fullName || '—'} />
            <Field label="Email" value={user.email} />
            <Field label="Company" value={user.companyName || sub.tenantName || '—'} />
            <Field label="Role" value={user.role ?? 'User'} />
          </Grid>
        </Section>

        <Section
          title="Current subscription"
          aside={
            <Badge tone={statusTone(sub.displayStatus)}>
              {statusDot(sub.displayStatus)} {sub.displayStatus}
            </Badge>
          }
        >
          <Grid>
            <Field label="Current plan" value={planLabel(sub.plan)} />
            <Field label="Status" value={sub.displayStatus} />
            <Field label="Billing cycle" value={billingLabel(sub.billingCycle)} />
            <Field label="Subscription start" value={fmtDay(sub.subscriptionStartDate)} />
            <Field label="Upgrade date" value={fmtDay(sub.upgradeDate)} />
            <Field label="Next renewal" value={fmtDay(sub.nextRenewalDate)} />
            {sub.cancelledAt && <Field label="Cancelled on" value={fmtDay(sub.cancelledAt)} />}
          </Grid>
        </Section>

        <Section title="Trial information">
          <Grid>
            <Field label="Trial start" value={fmtDay(sub.trialStartDate)} />
            <Field label="Trial end" value={fmtDay(sub.trialEndDate)} />
            <Field label="Trial duration" value={duration == null ? '—' : `${duration} days`} />
            <Field label="Days used" value={used == null ? '—' : `${used} days`} />
            <Field
              label="Days remaining"
              value={sub.displayStatus === 'Trial' ? remainingPhrase(sub) || '—' : '—'}
            />
            <Field label="Upgraded during trial?" value={sub.upgradedDuringTrial ? 'Yes' : 'No'} />
          </Grid>
        </Section>

        <Section title="Subscription history">
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading history…</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-slate-500">No subscription events recorded.</p>
          ) : (
            <ol className="relative space-y-3 border-l border-slate-200 pl-5">
              {events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[22px] top-1 h-2.5 w-2.5 rounded-full bg-brand-400 ring-2 ring-white" />
                  <div className="text-sm font-semibold text-slate-800">{eventLabel(e.event)}</div>
                  <div className="text-2xs text-slate-500">
                    {fmtDay(e.at)}
                    {e.plan ? ` · ${planLabel(e.plan)}` : ''}
                    {e.billingCycle ? ` · ${billingLabel(e.billingCycle)}` : ''}
                    {e.note ? ` · ${e.note}` : ''}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>
    </Modal>
  )
}

function Section({
  title,
  aside,
  children,
}: {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-2xs font-bold uppercase tracking-wide text-slate-500">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">{children}</div>
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xs text-slate-400">{label}</div>
      <div className="text-sm font-medium text-slate-800">{value}</div>
    </div>
  )
}
