// Job orders data-access (service) layer. Async by contract; delegates to
// jobRepo today, re-pointed at Supabase in phase 5b. Note: creating a job may
// auto-issue material (affecting stock), and transitions record production
// events — the hooks invalidate the affected caches accordingly.

import { jobRepo } from '@/data/repo'
import type { JobOrder, JobStatus, ProductionEvent } from '@/types'

export type JobCreateInput = Parameters<typeof jobRepo.create>[0]
export type JobUpdateInput = Parameters<typeof jobRepo.update>[1]
export type JobTransitionOpts = Parameters<typeof jobRepo.transition>[2]

export async function listJobs(): Promise<JobOrder[]> {
  return jobRepo.list()
}

export async function createJob(input: JobCreateInput): Promise<JobOrder> {
  return jobRepo.create(input)
}

export async function updateJob(id: string, patch: JobUpdateInput): Promise<JobOrder> {
  return jobRepo.update(id, patch)
}

export async function deleteJob(id: string): Promise<void> {
  jobRepo.remove(id)
}

export async function transitionJob(
  id: string,
  to: JobStatus,
  opts?: JobTransitionOpts,
): Promise<JobOrder> {
  return jobRepo.transition(id, to, opts)
}

export async function listJobEvents(jobId: string): Promise<ProductionEvent[]> {
  return jobRepo.events(jobId)
}
