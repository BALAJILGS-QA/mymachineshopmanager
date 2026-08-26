// Maps thrown errors to a safe, user-facing message. Business-rule violations
// carry an intentional, human message; everything else is shown as a generic
// fallback so raw database/internal errors never leak to the UI (the technical
// detail is logged separately by the caller / logger).

import { BusinessRuleError } from '@/data/repo'

export function toUserMessage(
  e: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (e instanceof BusinessRuleError) return e.message
  return fallback
}
