// Name/number lookup hooks, backed by the Supabase query cache (TanStack Query
// dedupes these across every page that uses them).

import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useMaterials } from '@/features/materials/hooks/useMaterials'
import { useJobs } from '@/features/jobs/hooks/useJobs'

export function useCompanyName() {
  const { data: companies = [] } = useCompanies()
  const map = new Map(companies.map((c) => [c.id, c.name]))
  return (id?: string) => (id ? (map.get(id) ?? '—') : '—')
}

export function useMaterialName() {
  const { data: materials = [] } = useMaterials()
  const map = new Map(materials.map((m) => [m.id, m.name]))
  return (id?: string) => (id ? (map.get(id) ?? '—') : '—')
}

export function useJobNo() {
  const { data: jobs = [] } = useJobs()
  const map = new Map(jobs.map((j) => [j.id, j.jobNo]))
  return (id?: string) => (id ? (map.get(id) ?? '—') : '—')
}
