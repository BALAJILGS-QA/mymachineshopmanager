// Per-material stock summary derived from the EXISTING per-source stock figures
// (useSourceStock → received / totalDispatched / available). This is a thin
// aggregation layer only — it introduces no new stock rule, so Inventory numbers
// can never diverge from the Materials & Stock page or the rest of the system.

import { useMemo } from 'react'
import { roundMoney } from '@/data/computations'
import type { Material } from '@/types'
import { useMaterials, useSourceStock } from '@/features/materials/hooks/useMaterials'

export type StockStatusKey = 'in' | 'low' | 'out'

export interface MaterialStockSummary {
  materialId: string
  material?: Material
  name: string
  code?: string
  unit: string
  type?: string
  received: number
  dispatched: number
  current: number
  value: number
  status: StockStatusKey
}

export function stockStatusKey(current: number, reorderLevel?: number): StockStatusKey {
  if (current <= 0) return 'out'
  if (reorderLevel && reorderLevel > 0 && current <= reorderLevel) return 'low'
  return 'in'
}

// Aggregate every material's per-source rows into one summary row. `scope` maps
// to the same owner scoping the Materials page uses (undefined = all).
export function useMaterialStockSummaries(scope?: string): MaterialStockSummary[] {
  const { data: materials = [] } = useMaterials()
  const rows = useSourceStock(scope ? { scope } : {})
  return useMemo(() => {
    const byId = new Map(materials.map((m) => [m.id, m]))
    const map = new Map<string, MaterialStockSummary>()
    for (const rs of rows) {
      let s = map.get(rs.materialId)
      const material = byId.get(rs.materialId)
      if (!s) {
        s = {
          materialId: rs.materialId,
          material,
          name: material?.name ?? rs.materialId,
          code: material?.code,
          unit: rs.unit,
          type: material?.type,
          received: 0,
          dispatched: 0,
          current: 0,
          value: 0,
          status: 'out',
        }
        map.set(rs.materialId, s)
      }
      s.received += rs.received
      s.dispatched += rs.totalDispatched
      s.current += rs.available
    }
    // Include materials that have no receipts yet (so Total Materials is complete).
    for (const m of materials) {
      if (!map.has(m.id)) {
        map.set(m.id, {
          materialId: m.id,
          material: m,
          name: m.name,
          code: m.code,
          unit: m.unit,
          type: m.type,
          received: 0,
          dispatched: 0,
          current: 0,
          value: 0,
          status: 'out',
        })
      }
    }
    return [...map.values()].map((s) => {
      const current = roundMoney(s.current)
      const rate = s.material?.defaultRate ?? 0
      return {
        ...s,
        received: roundMoney(s.received),
        dispatched: roundMoney(s.dispatched),
        current,
        value: roundMoney(current * rate),
        status: stockStatusKey(current, s.material?.reorderLevel),
      }
    })
  }, [materials, rows])
}
