'use client'

import { useParams } from 'next/navigation'
import { EmployeeProfile } from '@/features/hrm/pages/EmployeeProfile'

export default function Page() {
  const params = useParams<{ id: string }>()
  return <EmployeeProfile employeeId={params?.id ?? ''} />
}
