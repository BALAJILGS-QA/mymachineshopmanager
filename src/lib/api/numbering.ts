// Server-authoritative document numbering. Consumes the next integer for a
// counter key atomically from Postgres (next_seq RPC), so two clients can never
// mint the same number — the race the old client-side app_state.sequences had.
// The app keeps its existing pattern formatter (formatDocNo), so all current
// number formats are preserved exactly.

import { supabase } from '@/data/supabase'
import { formatDocNo } from '@/lib/id'
import { DEFAULT_SETTINGS } from '@/data/seed'
import type { Settings } from '@/types'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is required for server-side numbering')
  return supabase
}

// ---- Numbering pattern cache -----------------------------------------------
// Document-number patterns live in settings (app_state). They rarely change, so
// they're cached; the settings mutation refreshes the cache, and the first use
// lazily loads them if the app hasn't primed it yet.
type Numbering = Settings['numbering']
let numberingCache: Numbering | null = null

export function setNumberingCache(n: Numbering): void {
  numberingCache = { ...DEFAULT_SETTINGS.numbering, ...n }
}

export async function getNumbering(): Promise<Numbering> {
  if (numberingCache) return numberingCache
  if (!supabase) {
    numberingCache = DEFAULT_SETTINGS.numbering
    return numberingCache
  }
  // Read the caller-tenant settings (migration 0054); the numbering patterns
  // live under the settings blob. Falls back to the standard default patterns.
  const { data } = await supabase.rpc('get_tenant_settings')
  const n = (data as { numbering?: Numbering } | null)?.numbering
  numberingCache = { ...DEFAULT_SETTINGS.numbering, ...(n ?? {}) }
  return numberingCache
}

// Convenience: format the next document number for a settings.numbering key.
export async function nextNumberedDoc(key: keyof Numbering): Promise<string> {
  const numbering = await getNumbering()
  return nextDocNo(key, numbering[key])
}

// Consume and return the next raw integer for a counter key.
export async function nextSeq(key: string): Promise<number> {
  const { data, error } = await requireSupabase().rpc('next_seq', { p_key: key })
  if (error) throw error
  return Number(data)
}

// Peek at the next integer WITHOUT consuming it (for "next number will be…" hints).
export async function peekSeq(key: string): Promise<number> {
  const { data, error } = await requireSupabase().rpc('peek_seq', { p_key: key })
  if (error) throw error
  return Number(data)
}

// Consume the next number for a document type and format it with the app pattern.
export async function nextDocNo(key: string, pattern: string): Promise<string> {
  return formatDocNo(pattern, await nextSeq(key))
}

// Master-data codes (companies/materials/products) use a fixed prefix + zero-pad.
export async function nextCode(key: string, prefix: string, width = 3): Promise<string> {
  const n = await nextSeq(key)
  return `${prefix}${String(n).padStart(width, '0')}`
}
