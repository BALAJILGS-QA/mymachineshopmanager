// React binding for the local store. useSyncExternalStore gives every screen
// automatic re-render whenever repo mutations persist, without manual cache
// invalidation. Selectors keep re-renders scoped.

import { useSyncExternalStore } from 'react'
import { getDb, loadDb, subscribe, saveDb, replaceLocal, hasDb, getRevision } from './db'
import type { Database } from './db'
import { buildInitialDb, DEFAULT_SETTINGS } from './seed'
import { setCurrency } from '@/lib/format'
import { isSupabaseEnabled } from './supabase'
import { loadAll } from './backend'
import { setNumberingCache } from '@/lib/api/numbering'

// Ensure a valid in-memory DB exists so getDb()/selectors never throw. In
// Supabase mode this local DB is transient and replaced by hydrateFromRemote().
export function ensureDb(): void {
  if (!hasDb()) {
    saveDb(buildInitialDb())
  }
  // Migrate older local datasets: backfill any settings keys added since the
  // stored DB was created (e.g. numbering.dc) so nothing reads undefined.
  const db = getDb()
  const before = JSON.stringify(db.settings)
  db.settings = {
    ...DEFAULT_SETTINGS,
    ...db.settings,
    numbering: { ...DEFAULT_SETTINGS.numbering, ...db.settings.numbering },
    company: { ...DEFAULT_SETTINGS.company, ...db.settings.company },
  }
  if (JSON.stringify(db.settings) !== before) replaceLocal(db)
  setCurrency(db.settings.currencySymbol, db.settings.currency)
}

// After a Supabase session exists, pull the full dataset into the local store so
// the (still store-backed) readers have data during the Part B/C transition.
// NOTE: the write-through sync hook is intentionally NOT installed anymore — all
// writes now go directly to Supabase via the feature api layer, so the store is a
// read-only cache. This removes any risk of the store clobbering Supabase.
export async function hydrateFromRemote(): Promise<void> {
  if (!isSupabaseEnabled()) return
  const remote = await loadAll()
  if (remote) {
    replaceLocal(remote)
    const s = getDb().settings
    setCurrency(s.currencySymbol, s.currency)
    setNumberingCache(s.numbering)
  }
}

// Subscribe to the store's revision (a stable number, so getSnapshot is cached
// and never loops) then run the selector against the current DB on every
// render. This stays correct even when selectors return freshly-built arrays
// (e.g. `.filter()`), which the naive getSnapshot approach cannot.
export function useDb<T>(selector: (db: Database) => T): T {
  useSyncExternalStore(subscribe, getRevision, getRevision)
  return selector(getDb())
}

// Version that tolerates an uninitialised DB (used before ensureDb runs).
export function useMaybeDb<T>(selector: (db: Database | null) => T): T {
  useSyncExternalStore(subscribe, getRevision, getRevision)
  return selector(loadDb())
}
