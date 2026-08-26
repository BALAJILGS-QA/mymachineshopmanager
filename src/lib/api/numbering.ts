// Server-authoritative document numbering. Consumes the next integer for a
// counter key atomically from Postgres (next_seq RPC), so two clients can never
// mint the same number — the race the old client-side app_state.sequences had.
// The app keeps its existing pattern formatter (formatDocNo), so all current
// number formats are preserved exactly.

import { supabase } from '@/data/supabase'
import { formatDocNo } from '@/lib/id'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is required for server-side numbering')
  return supabase
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
