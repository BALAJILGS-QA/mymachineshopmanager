// Centralized GST calculation (§30). One place computes the CGST/SGST vs IGST
// split so no invoice/page duplicates it. Intra-state (same state code) → CGST +
// SGST; inter-state (different) → IGST. Rates come from a configured slab, never
// hardcoded. An explicit `forceInterState` override is supported for edge cases.

import type { GstTaxRate } from '../types'

export interface GstInput {
  taxableValue: number
  rate: Pick<GstTaxRate, 'cgst' | 'sgst' | 'igst' | 'cess' | 'totalRate'>
  supplierStateCode?: string
  placeOfSupplyStateCode?: string
  forceInterState?: boolean
}

export interface GstBreakup {
  taxableValue: number
  cgst: number
  sgst: number
  igst: number
  cess: number
  totalTax: number
  grandTotal: number
  isInterState: boolean
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function computeGst(input: GstInput): GstBreakup {
  const { taxableValue, rate } = input
  const inter =
    input.forceInterState ??
    (!!input.supplierStateCode &&
      !!input.placeOfSupplyStateCode &&
      input.supplierStateCode !== input.placeOfSupplyStateCode)

  let cgst = 0
  let sgst = 0
  let igst = 0
  if (inter) {
    igst = r2((taxableValue * (rate.igst || rate.totalRate)) / 100)
  } else {
    cgst = r2((taxableValue * rate.cgst) / 100)
    sgst = r2((taxableValue * rate.sgst) / 100)
  }
  const cess = r2((taxableValue * (rate.cess || 0)) / 100)
  const totalTax = r2(cgst + sgst + igst + cess)
  return {
    taxableValue: r2(taxableValue),
    cgst,
    sgst,
    igst,
    cess,
    totalTax,
    grandTotal: r2(taxableValue + totalTax),
    isInterState: inter,
  }
}
