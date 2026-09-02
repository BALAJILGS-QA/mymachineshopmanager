// TanStack Query hooks for CRM contact messages. The CRM page talks only to
// these; mutations invalidate the list so the table reflects writes.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import * as api from '../contactsApi'

export function useContacts() {
  return useQuery({ queryKey: qk.contacts.all, queryFn: api.listContacts })
}

export function useUpdateContactStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: api.ContactStatus }) =>
      api.updateContactStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.contacts.all }),
  })
}

export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteContact(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.contacts.all }),
  })
}
