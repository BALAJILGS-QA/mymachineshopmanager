import { describe, expect, it } from 'vitest'
import {
  computeToolLife,
  computeToolStock,
  emptyStock,
  isLowStock,
  suggestReorderQty,
} from './toolStock'
import type { ToolTransaction, ToolTxnType } from './types'

// Helper: build a minimal ledger row.
let n = 0
function tx(type: ToolTxnType, qty: number, from?: string, to?: string): ToolTransaction {
  return {
    id: `t${n++}`,
    toolId: 'tool1',
    txnType: type,
    qty,
    fromBucket: from as ToolTransaction['fromBucket'],
    toBucket: to as ToolTransaction['toBucket'],
  }
}

describe('computeToolStock', () => {
  it('an empty ledger is all zeros', () => {
    expect(computeToolStock([])).toEqual(emptyStock())
  })

  it('receipt lands entirely in available and on-hand', () => {
    const s = computeToolStock([tx('receipt', 25, undefined, 'available')])
    expect(s.available).toBe(25)
    expect(s.onHand).toBe(25)
    expect(s.net).toBe(25)
  })

  it('reserve → issue → return good round-trips back to available', () => {
    const s = computeToolStock([
      tx('receipt', 10, undefined, 'available'),
      tx('reserve', 3, 'available', 'reserved'),
      tx('issue_reserved', 3, 'reserved', 'issued'),
      tx('return_available', 3, 'issued', 'available'),
    ])
    expect(s.available).toBe(10)
    expect(s.reserved).toBe(0)
    expect(s.issued).toBe(0)
    expect(s.onHand).toBe(10)
  })

  it('full lifecycle keeps buckets and on-hand consistent', () => {
    // 25 received; 7 issued (2 consumed, 3 returned good, 1 damaged, 1 needs calib);
    // 2 sent to maintenance; 1 scrapped from available.
    const s = computeToolStock([
      tx('receipt', 25, undefined, 'available'),
      tx('issue', 7, 'available', 'issued'),
      tx('consume', 2, 'issued', 'consumed'),
      tx('return_available', 3, 'issued', 'available'),
      tx('return_damaged', 1, 'issued', 'damaged'),
      tx('return_calibration', 1, 'issued', 'calibration'),
      tx('maintenance_send', 2, 'available', 'maintenance'),
      tx('scrap', 1, 'available', 'scrap'),
    ])
    // available: 25 -7 +3 -2 -1 = 18
    expect(s.available).toBe(18)
    expect(s.issued).toBe(0) // 7 -2 -3 -1 -1
    expect(s.consumed).toBe(2)
    expect(s.damaged).toBe(1)
    expect(s.calibration).toBe(1)
    expect(s.maintenance).toBe(2)
    expect(s.scrap).toBe(1)
    // on hand excludes scrap + consumed: 18 +1 +1 +2 = 22
    expect(s.onHand).toBe(22)
    // net includes everything ever received: 25
    expect(s.net).toBe(25)
  })

  it('maintenance completing to available frees stock', () => {
    const s = computeToolStock([
      tx('receipt', 5, undefined, 'available'),
      tx('maintenance_send', 5, 'available', 'maintenance'),
      tx('maintenance_pass', 4, 'maintenance', 'available'),
      tx('maintenance_scrap', 1, 'maintenance', 'scrap'),
    ])
    expect(s.available).toBe(4)
    expect(s.maintenance).toBe(0)
    expect(s.scrap).toBe(1)
    expect(s.onHand).toBe(4)
  })
})

describe('isLowStock', () => {
  it('is true at or below a positive reorder level', () => {
    expect(isLowStock(5, 5)).toBe(true)
    expect(isLowStock(4, 5)).toBe(true)
    expect(isLowStock(6, 5)).toBe(false)
  })
  it('is never low when reorder level is zero', () => {
    expect(isLowStock(0, 0)).toBe(false)
  })
})

describe('suggestReorderQty', () => {
  it('covers the deficit but at least one reorder batch', () => {
    expect(suggestReorderQty(2, 10, 20)).toBe(20) // batch beats deficit(8)
    expect(suggestReorderQty(2, 30, 5)).toBe(28) // deficit(28) beats batch(5)
  })
  it('never exceeds max stock headroom', () => {
    expect(suggestReorderQty(2, 30, 50, 10)).toBe(8) // capped to 10-2
  })
  it('is zero when already above reorder level', () => {
    expect(suggestReorderQty(50, 10, 20)).toBe(20) // still supplies a batch
    expect(suggestReorderQty(50, 10, 0)).toBe(0)
  })
})

describe('computeToolLife', () => {
  it('returns null when no expected life is set', () => {
    expect(computeToolLife(0, 5)).toBeNull()
  })
  it('grades usage against thresholds', () => {
    expect(computeToolLife(100, 50)?.stage).toBe('ok')
    expect(computeToolLife(100, 80)?.stage).toBe('warn')
    expect(computeToolLife(100, 95)?.stage).toBe('critical')
    expect(computeToolLife(100, 120)?.stage).toBe('expired')
  })
  it('clamps remaining and percent', () => {
    const life = computeToolLife(100, 120)!
    expect(life.remaining).toBe(0)
    expect(life.usagePercent).toBe(100)
  })
})
