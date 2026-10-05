import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns'
import type { UserSubscription } from './api/subscriptionApi'

// Presentation helpers for the super-admin subscription views. All are defensive —
// missing / invalid data renders as "—", never NaN / undefined / negative days.

export type DisplayStatus =
  'Trial' | 'Active' | 'Trial Expired' | 'Expired' | 'Cancelled' | 'Pending' | 'Suspended'

// Badge tone (maps to the existing primitives Badge tones) + a leading status dot.
const STATUS_META: Record<string, { tone: string; dot: string }> = {
  Trial: { tone: 'amber', dot: '🟡' },
  Active: { tone: 'green', dot: '🟢' },
  'Trial Expired': { tone: 'red', dot: '🔴' },
  Expired: { tone: 'red', dot: '🔴' },
  Cancelled: { tone: 'gray', dot: '🔴' },
  Pending: { tone: 'blue', dot: '🟠' },
  Suspended: { tone: 'slate', dot: '⚫' },
}

export function statusTone(status?: string): string {
  return STATUS_META[status ?? '']?.tone ?? 'slate'
}
export function statusDot(status?: string): string {
  return STATUS_META[status ?? '']?.dot ?? '⚪'
}

const ALL_STATUSES: DisplayStatus[] = [
  'Trial',
  'Active',
  'Trial Expired',
  'Expired',
  'Cancelled',
  'Pending',
  'Suspended',
]
export function allStatuses(): DisplayStatus[] {
  return ALL_STATUSES
}

/** Format an ISO date as DD-MMM-YYYY, or "—" when missing/invalid. */
export function fmtDay(iso?: string | null): string {
  if (!iso) return '—'
  const d = parseISO(iso)
  return isValid(d) ? format(d, 'dd-MMM-yyyy') : '—'
}

function parse(iso?: string | null): Date | null {
  if (!iso) return null
  const d = parseISO(iso)
  return isValid(d) ? d : null
}

/** Whole days remaining until `iso` (never negative); null when missing/invalid. */
export function daysRemaining(iso?: string | null): number | null {
  const d = parse(iso)
  if (!d) return null
  return Math.max(0, differenceInCalendarDays(d, new Date()))
}

/** Total trial length in days (null when dates missing/invalid). */
export function trialDuration(startIso?: string | null, endIso?: string | null): number | null {
  const s = parse(startIso)
  const e = parse(endIso)
  if (!s || !e) return null
  return Math.max(0, differenceInCalendarDays(e, s))
}

/** Trial days elapsed, clamped to [0, duration]. */
export function trialDaysUsed(startIso?: string | null, endIso?: string | null): number | null {
  const s = parse(startIso)
  if (!s) return null
  const dur = trialDuration(startIso, endIso)
  const used = Math.max(0, differenceInCalendarDays(new Date(), s))
  return dur == null ? used : Math.min(used, dur)
}

export function planLabel(plan?: string | null): string {
  if (!plan) return '—'
  if (plan === 'trial') return 'Free Trial'
  return plan.charAt(0).toUpperCase() + plan.slice(1)
}

export function billingLabel(cycle?: string | null): string {
  if (!cycle) return '—'
  return cycle.charAt(0).toUpperCase() + cycle.slice(1)
}

export const EVENT_LABEL: Record<string, string> = {
  trial_started: 'Trial Started',
  plan_upgraded: 'Plan Upgraded',
  subscription_activated: 'Subscription Activated',
  subscription_renewed: 'Subscription Renewed',
  subscription_cancelled: 'Subscription Cancelled',
  subscription_expired: 'Subscription Expired',
}
export function eventLabel(event: string): string {
  return EVENT_LABEL[event] ?? event.replace(/_/g, ' ')
}

// A short "trial window" line, e.g. "01-Oct-2026 → 03-Nov-2026".
export function trialWindow(
  sub: Pick<UserSubscription, 'trialStartDate' | 'trialEndDate'>,
): string {
  if (!sub.trialStartDate && !sub.trialEndDate) return '—'
  return `${fmtDay(sub.trialStartDate)} → ${fmtDay(sub.trialEndDate)}`
}

/** One-line remaining-days phrase for a trial, handling the today/expired edges. */
export function remainingPhrase(sub: UserSubscription): string {
  if (sub.displayStatus === 'Trial Expired') return 'Trial expired'
  const d = sub.daysRemaining ?? daysRemaining(sub.trialEndDate)
  if (d == null) return ''
  if (d <= 0) return 'Ends today'
  return `${d} day${d === 1 ? '' : 's'} remaining`
}
