// Maps thrown errors to a safe, user-facing message. Three sources:
//  1. BusinessRuleError - legacy client rules (still used until the store retires)
//  2. Our Postgres RPCs - `raise exception '...'` surfaces as a PostgrestError with
//     code P0001 and our intended human message
//  3. Constraint violations - unique/FK/check/not-null - mapped to friendly text so
//     raw database internals never leak to the UI.

import { BusinessRuleError } from '@/data/repo'

interface PgError {
  code?: string
  message?: string
  details?: string
}

export function toUserMessage(
  e: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (e instanceof BusinessRuleError) return e.message

  const err = e as PgError | null
  switch (err?.code) {
    case 'P0001': // raise exception from our RPCs - message is the business rule
      return err.message || fallback
    case '23505': // unique_violation
      return 'That value already exists. Please use a different one.'
    case '23503': // foreign_key_violation
      return 'This record is referenced by other data and cannot be changed or deleted.'
    case '23514': // check_violation
    case '23502': // not_null_violation
      return 'Some required values are missing or invalid.'
    default:
      break
  }
  // A plain Error (or RPC business message without a recognised code) - prefer its
  // message when present, else the fallback.
  if (err?.message && !/duplicate key|violates|constraint|null value/i.test(err.message)) {
    return err.message
  }
  return fallback
}
