import { useDb } from '@/data/store'

export function useCompanyName() {
  const companies = useDb((db) => db.companies)
  const map = new Map(companies.map((c) => [c.id, c.name]))
  return (id?: string) => (id ? map.get(id) ?? '—' : '—')
}

export function useMaterialName() {
  const materials = useDb((db) => db.materials)
  const map = new Map(materials.map((m) => [m.id, m.name]))
  return (id?: string) => (id ? map.get(id) ?? '—' : '—')
}

export function useJobNo() {
  const jobs = useDb((db) => db.jobs)
  const map = new Map(jobs.map((j) => [j.id, j.jobNo]))
  return (id?: string) => (id ? map.get(id) ?? '—' : '—')
}
