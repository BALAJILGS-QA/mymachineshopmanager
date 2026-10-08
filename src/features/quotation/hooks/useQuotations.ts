import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/api/queryKeys'
import type { Quotation, QuotationLine, QuotationStatus } from '@/types'
import * as api from '../api/quotationApi'

export function useQuotations() {
  return useQuery({ queryKey: qk.quotations.all, queryFn: api.listQuotations })
}

export function useQuotation(id: string) {
  return useQuery({
    queryKey: qk.quotations.detail(id),
    queryFn: () => api.getQuotation(id),
    enabled: !!id,
  })
}

export function useQuotationLines(id: string) {
  return useQuery({
    queryKey: qk.quotations.lines(id),
    queryFn: () => api.listQuotationLines(id),
    enabled: !!id,
  })
}

export function useQuotationHistory(id: string) {
  return useQuery({
    queryKey: qk.quotations.history(id),
    queryFn: () => api.listQuotationHistory(id),
    enabled: !!id,
  })
}

function invalidateOne(client: ReturnType<typeof useQueryClient>, id: string) {
  client.invalidateQueries({ queryKey: qk.quotations.all })
  client.invalidateQueries({ queryKey: qk.quotations.detail(id) })
  client.invalidateQueries({ queryKey: qk.quotations.lines(id) })
  client.invalidateQueries({ queryKey: qk.quotations.history(id) })
}

export function useCreateQuotation() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: api.createQuotation,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.quotations.all })
      client.invalidateQueries({ queryKey: qk.estimations.all })
    },
  })
}

export function useUpdateQuotation() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.QuotationInput }) =>
      api.updateQuotation(id, input),
    onSuccess: (_d, { id }) => invalidateOne(client, id),
  })
}

export function useSetQuotationStatus() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: QuotationStatus; note?: string }) =>
      api.setQuotationStatus(id, status, note),
    onSuccess: (_d, { id }) => invalidateOne(client, id),
  })
}

export function useReviseQuotation() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ source, lines }: { source: Quotation; lines: QuotationLine[] }) =>
      api.reviseQuotation(source, lines),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.quotations.all }),
  })
}

export function useConvertQuotationToJob() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (quotationId: string) => api.convertQuotationToJob(quotationId),
    onSuccess: (_d, quotationId) => {
      invalidateOne(client, quotationId)
      client.invalidateQueries({ queryKey: qk.jobs.all })
    },
  })
}
