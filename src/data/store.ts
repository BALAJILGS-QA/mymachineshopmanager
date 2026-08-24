// React binding for the local store. useSyncExternalStore gives every screen
// automatic re-render whenever repo mutations persist, without manual cache
// invalidation. Selectors keep re-renders scoped.

import { useSyncExternalStore } from 'react'
import { getDb, loadDb, subscribe, saveDb, hasDb, getRevision } from './db'
import type { Database } from './db'
import { buildInitialDb } from './seed'
import { setCurrency } from '@/lib/format'

export function ensureDb(): void {
  if (!hasDb()) {
    saveDb(buildInitialDb())
  }
  const s = getDb().settings
  setCurrency(s.currencySymbol, s.currency)
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
