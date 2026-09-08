#!/usr/bin/env node
// QA-Orchestra — extract a workflow output file into raw case JSON + spec files.
//   node scripts/qa-extract.mjs <workflow-output.json>
import fs from 'node:fs'
import path from 'node:path'

const src = process.argv[2]
if (!src) throw new Error('usage: qa-extract.mjs <workflow-output.json>')
const root = process.cwd()
const RAW = path.join(root, 'qa/manual-testcases/_raw')
const GEN = path.join(root, 'e2e/generated')
fs.mkdirSync(RAW, { recursive: true })
fs.mkdirSync(GEN, { recursive: true })

const doc = JSON.parse(fs.readFileSync(src, 'utf8'))

// Find the results array wherever it sits in the wrapper.
function findResults(o) {
  if (!o || typeof o !== 'object') return null
  if (Array.isArray(o.results) && o.results.some((r) => r && r.module && (r.cases || r.spec)))
    return o.results
  for (const v of Object.values(o)) {
    const r = findResults(v)
    if (r) return r
  }
  return null
}
const results = findResults(doc)
if (!results) throw new Error('no results[] with module/cases/spec found in output')

let specs = 0
let rawFiles = 0
let totalCases = 0
for (const r of results) {
  const id = r.module
  if (r.cases && r.cases.length) {
    fs.writeFileSync(
      path.join(RAW, `${id}.json`),
      JSON.stringify(
        { module: id, component: r.component, understanding: r.understanding, cases: r.cases },
        null,
        2,
      ),
    )
    rawFiles++
    totalCases += r.cases.length
  }
  if (r.spec && r.spec.trim()) {
    fs.writeFileSync(
      path.join(GEN, `${id}.spec.ts`),
      r.spec.endsWith('\n') ? r.spec : r.spec + '\n',
    )
    specs++
  }
  console.log(
    `  ${id}: ${r.cases?.length || 0} cases, spec ${r.spec ? 'yes' : 'NO'}, automatedKeys ${r.automatedKeys?.length || 0}`,
  )
}
console.log(`\nWrote ${rawFiles} raw case files (${totalCases} cases) + ${specs} spec files.`)
