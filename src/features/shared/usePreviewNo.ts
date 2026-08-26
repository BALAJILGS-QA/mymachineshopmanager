// "Next number will be X" hint for create forms. Peeks the server counter
// (without consuming it) and formats it with the current pattern. Re-peeks on
// mount so a freshly opened form shows the up-to-date next number.

import { useQuery } from '@tanstack/react-query'
import { peekSeq } from '@/lib/api/numbering'
import { formatDocNo } from '@/lib/id'
import { useSettings } from '@/features/settings/hooks/useSettings'
import type { Settings } from '@/types'

export function usePreviewNo(key: keyof Settings['numbering']): string {
  const { data: settings } = useSettings()
  const { data: next } = useQuery({
    queryKey: ['peekSeq', key],
    queryFn: () => peekSeq(key),
    staleTime: 0,
  })
  if (!settings || next == null) return '…'
  return formatDocNo(settings.numbering[key], next)
}
