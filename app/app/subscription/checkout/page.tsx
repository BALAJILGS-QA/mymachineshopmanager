'use client'

// Portal route /app/subscription/checkout — plan checkout / payment.
// Reads the chosen plan from the query string and hands it to the shared page.
// useSearchParams requires a Suspense boundary.

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckoutPage } from '@/features/subscription/CheckoutPage'
import { planById } from '@/features/subscription/plans'

function CheckoutRoute() {
  const params = useSearchParams()
  const plan = planById(params.get('plan'))
  return <CheckoutPage planId={plan?.id ?? null} />
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CheckoutRoute />
    </Suspense>
  )
}
