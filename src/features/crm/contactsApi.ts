// CRM contact-message data access. Submissions come from the public "Contact
// Us" form (anonymous) and are surfaced in the app's CRM module (authenticated).
//
// Storage is Supabase-first (table `contact_messages`, see
// supabase/migrations/0016_contact_messages.sql) with a localStorage fallback so
// the feature works in local/dev mode and degrades gracefully if the table is
// not yet provisioned. Both read and write use the same resolution, so a session
// stays internally consistent.

import { supabase, isSupabaseEnabled } from '@/data/supabase'
import { uid } from '@/lib/id'
import { logger } from '@/lib/logger'

export type ContactStatus = 'new' | 'contacted' | 'closed'

export interface ContactMessage {
  id: string
  name: string
  email: string
  phone?: string
  company?: string
  message: string
  status: ContactStatus
  createdAt: string
}

export interface ContactInput {
  name: string
  email: string
  phone?: string
  company?: string
  message: string
}

const TABLE = 'contact_messages'
const LOCAL_KEY = 'msm-contact-messages'

type Row = Record<string, unknown>

function toRow(c: ContactMessage): Row {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone ?? null,
    company: c.company ?? null,
    message: c.message,
    status: c.status,
    created_at: c.createdAt,
  }
}

function fromRow(r: Row): ContactMessage {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    email: String(r.email ?? ''),
    phone: (r.phone as string) ?? undefined,
    company: (r.company as string) ?? undefined,
    message: String(r.message ?? ''),
    status: (r.status as ContactStatus) ?? 'new',
    createdAt: String(r.created_at ?? new Date().toISOString()),
  }
}

// -- localStorage fallback ---------------------------------------------------
function readLocal(): ContactMessage[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]') as ContactMessage[]
  } catch {
    return []
  }
}

function writeLocal(list: ContactMessage[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list))
  } catch (e) {
    logger.error('Failed to persist contact message locally', e)
  }
}

// -- Public API --------------------------------------------------------------

// Submit a new message from the public Contact form.
export async function submitContact(input: ContactInput): Promise<void> {
  const rec: ContactMessage = {
    id: uid('con_'),
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone?.trim() || undefined,
    company: input.company?.trim() || undefined,
    message: input.message.trim(),
    status: 'new',
    createdAt: new Date().toISOString(),
  }
  if (isSupabaseEnabled() && supabase) {
    const { error } = await supabase.from(TABLE).insert(toRow(rec))
    if (!error) return
    logger.warn('Contact insert to Supabase failed — saving locally', error)
  }
  writeLocal([rec, ...readLocal()])
}

// List all messages, newest first (CRM table).
export async function listContacts(): Promise<ContactMessage[]> {
  if (isSupabaseEnabled() && supabase) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) return (data ?? []).map((r) => fromRow(r as Row))
    logger.warn('Contact list from Supabase failed — reading locally', error)
  }
  return readLocal()
}

export async function updateContactStatus(id: string, status: ContactStatus): Promise<void> {
  if (isSupabaseEnabled() && supabase) {
    const { error } = await supabase.from(TABLE).update({ status }).eq('id', id)
    if (!error) return
    logger.warn('Contact status update to Supabase failed — updating locally', error)
  }
  writeLocal(readLocal().map((c) => (c.id === id ? { ...c, status } : c)))
}

export async function deleteContact(id: string): Promise<void> {
  if (isSupabaseEnabled() && supabase) {
    const { error } = await supabase.from(TABLE).delete().eq('id', id)
    if (!error) return
    logger.warn('Contact delete from Supabase failed — deleting locally', error)
  }
  writeLocal(readLocal().filter((c) => c.id !== id))
}
