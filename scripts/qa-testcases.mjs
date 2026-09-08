#!/usr/bin/env node
// QA-Orchestra — manual test case CSV tool (Zephyr Scale format).
//
//   node scripts/qa-testcases.mjs build
//       Read qa/manual-testcases/_raw/*.json (produced by the pipeline) and
//       write one CSV per module + a combined all-testcases.csv.
//
//   node scripts/qa-testcases.mjs mark-automated <module-id> <KEY> [KEY...] --spec <path>
//       Flip Automation=Automated + set AutomatedTest for the given case keys.
//
// Raw JSON shape (per module):
//   { "module": "invoices", "component": "Invoices", "cases": [ TestCase, ... ] }
// TestCase: { key,name,category,priority,status,automation,automatedTest,
//             objective,precondition,testData,steps:[...],expectedResult,labels }
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.cwd())
const RAW = path.join(ROOT, 'qa/manual-testcases/_raw')
const OUT = path.join(ROOT, 'qa/manual-testcases')

const COLUMNS = [
  ['Key', (c) => c.key],
  ['Name', (c) => c.name],
  ['Folder', (c) => c.folder || `/${c.component}/${c.category}`],
  ['Category', (c) => c.category],
  ['Priority', (c) => c.priority || 'Normal'],
  ['Status', (c) => c.status || 'Approved'],
  ['Automation', (c) => c.automation || 'Manual'],
  ['AutomatedTest', (c) => c.automatedTest || ''],
  ['Component', (c) => c.component],
  ['Objective', (c) => c.objective || ''],
  ['Precondition', (c) => c.precondition || 'Logged in as QA super-admin'],
  ['TestData', (c) => c.testData || ''],
  [
    'Steps',
    (c) =>
      Array.isArray(c.steps) ? c.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') : c.steps || '',
  ],
  ['ExpectedResult', (c) => c.expectedResult || ''],
  ['Labels', (c) => (Array.isArray(c.labels) ? c.labels.join(' ') : c.labels || '')],
]

const q = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const toCsv = (cases) =>
  [
    COLUMNS.map(([h]) => h).join(','),
    ...cases.map((c) => COLUMNS.map(([, f]) => q(f(c))).join(',')),
  ].join('\n') + '\n'

function readRaw() {
  if (!fs.existsSync(RAW)) return []
  return fs
    .readdirSync(RAW)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')))
}

function build() {
  const modules = readRaw()
  fs.mkdirSync(OUT, { recursive: true })
  let all = []
  let total = 0
  for (const m of modules) {
    const cases = (m.cases || []).map((c) => ({ ...c, component: c.component || m.component }))
    fs.writeFileSync(path.join(OUT, `${m.module}.csv`), toCsv(cases))
    all = all.concat(cases)
    total += cases.length
    console.log(`  ${m.module}.csv — ${cases.length} cases`)
  }
  fs.writeFileSync(path.join(OUT, 'all-testcases.csv'), toCsv(all))
  // Coverage summary by category.
  const byCat = {}
  for (const c of all) byCat[c.category] = (byCat[c.category] || 0) + 1
  console.log(`\nTotal: ${total} cases across ${modules.length} modules`)
  console.log('By category:', JSON.stringify(byCat))
}

function markAutomated() {
  const [, , , moduleId, ...rest] = process.argv
  const specIdx = rest.indexOf('--spec')
  const spec = specIdx >= 0 ? rest[specIdx + 1] : ''
  const keys = new Set(specIdx >= 0 ? rest.slice(0, specIdx) : rest)
  const rawFile = path.join(RAW, `${moduleId}.json`)
  if (!fs.existsSync(rawFile)) throw new Error(`no raw file for module ${moduleId}`)
  const data = JSON.parse(fs.readFileSync(rawFile, 'utf8'))
  let n = 0
  for (const c of data.cases || []) {
    if (keys.size === 0 || keys.has(c.key)) {
      c.automation = 'Automated'
      if (spec) c.automatedTest = spec
      n++
    }
  }
  fs.writeFileSync(rawFile, JSON.stringify(data, null, 2))
  console.log(`Marked ${n} case(s) Automated in ${moduleId}.json`)
  build()
}

const cmd = process.argv[2]
if (cmd === 'build') build()
else if (cmd === 'mark-automated') markAutomated()
else {
  console.log('usage: qa-testcases.mjs build | mark-automated <module> <KEY...> --spec <path>')
  process.exit(1)
}
