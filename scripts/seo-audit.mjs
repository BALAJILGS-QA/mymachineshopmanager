#!/usr/bin/env node
// SEO audit — crawls the site's own /sitemap.xml and checks each public page for
// the on-page SEO essentials, then prints a readable report. Zero dependencies
// (Node 18+ global fetch + regex parsing).
//
// Usage:
//   npm run seo:audit                     # audits http://localhost:3000
//   npm run seo:audit -- https://your-domain.tld
//
// Requires a running server (dev or prod build). Exits non-zero if any page has
// a CRITICAL issue (missing title / description / canonical / H1, or >1 H1),
// so it can gate CI. Warnings (OG/Twitter/JSON-LD/keywords/alt) do not fail.

const BASE = (process.argv[2] || process.env.SEO_AUDIT_URL || 'http://localhost:3000').replace(
  /\/+$/,
  '',
)

const FALLBACK_PATHS = [
  '/',
  '/features',
  '/industries',
  '/about',
  '/contact',
  '/blog',
  '/signup',
  '/login',
]

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
}

async function get(url) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'msm-seo-audit/1.0' } })
    return { status: res.status, text: await res.text(), headers: res.headers }
  } catch (e) {
    return { status: 0, text: '', headers: new Headers(), error: String(e) }
  }
}

function countMatches(re, html) {
  return (html.match(re) || []).length
}
function attr(html, re) {
  const m = html.match(re)
  return m ? m[1].trim() : null
}

async function collectUrls() {
  const sm = await get(`${BASE}/sitemap.xml`)
  if (sm.status === 200) {
    const locs = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    if (locs.length) return { urls: locs, source: 'sitemap.xml' }
  }
  return { urls: FALLBACK_PATHS.map((p) => `${BASE}${p}`), source: 'fallback list' }
}

function auditHtml(html) {
  const issues = []
  const warns = []

  const title = attr(html, /<title[^>]*>([^<]*)<\/title>/i)
  if (!title) issues.push('missing <title>')
  else if (title.length > 65) warns.push(`title ${title.length} chars (>65)`)

  const desc = attr(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
  if (!desc) issues.push('missing meta description')
  else if (desc.length > 170) warns.push(`description ${desc.length} chars (>170)`)

  const canonical = attr(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i)
  if (!canonical) issues.push('missing canonical')

  const h1 = countMatches(/<h1[\s>]/gi, html)
  if (h1 === 0) issues.push('no <h1>')
  else if (h1 > 1) issues.push(`${h1} <h1> tags (expected 1)`)

  if (!/<meta[^>]+property=["']og:title["']/i.test(html)) warns.push('no og:title')
  if (!/<meta[^>]+name=["']twitter:card["']/i.test(html)) warns.push('no twitter:card')
  if (!/<script[^>]+type=["']application\/ld\+json["']/i.test(html))
    warns.push('no JSON-LD structured data')

  // Images missing alt (rough: <img ...> without an alt attribute).
  const imgs = html.match(/<img\b[^>]*>/gi) || []
  const noAlt = imgs.filter((t) => !/\balt=/.test(t)).length
  if (noAlt) warns.push(`${noAlt} <img> without alt`)

  return { title, canonical, issues, warns }
}

async function main() {
  console.log(c.bold(`\nSEO audit → ${BASE}\n`))
  const { urls, source } = await collectUrls()
  console.log(c.dim(`Discovered ${urls.length} URL(s) via ${source}\n`))

  // robots + sitemap presence.
  const robots = await get(`${BASE}/robots.txt`)
  const sitemap = await get(`${BASE}/sitemap.xml`)
  console.log(c.bold('Site files'))
  console.log(
    `  robots.txt   ${robots.status === 200 && /sitemap:/i.test(robots.text) ? c.green('ok (Sitemap: present)') : c.red('MISSING / no Sitemap line')}`,
  )
  console.log(
    `  sitemap.xml  ${sitemap.status === 200 && /<urlset/i.test(sitemap.text) ? c.green('ok (<urlset>)') : c.red('MISSING / invalid')}\n`,
  )

  const seenTitles = new Map()
  const seenDescs = new Map()
  let critical = 0

  console.log(c.bold('Pages'))
  for (const rawUrl of urls) {
    // Test the server at BASE regardless of the origin the sitemap declares
    // (the sitemap uses the canonical/production URL, which may differ from the
    // host being audited — e.g. localhost or a preview deployment).
    let path = '/'
    try {
      path = new URL(rawUrl).pathname || '/'
    } catch {
      path = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`
    }
    const url = `${BASE}${path}`
    const res = await get(url)
    if (res.status !== 200) {
      console.log(`  ${c.red('✗')} ${path} ${c.red(`HTTP ${res.status}`)}`)
      critical++
      continue
    }
    const { title, canonical, issues, warns } = auditHtml(res.text)
    if (title) seenTitles.set(title, [...(seenTitles.get(title) || []), path])
    const descKey = canonical || path
    seenDescs.set(descKey, path)

    if (issues.length) {
      critical += issues.length
      console.log(`  ${c.red('✗')} ${path}`)
      issues.forEach((i) => console.log(`      ${c.red('• ' + i)}`))
      warns.forEach((w) => console.log(`      ${c.yellow('• ' + w)}`))
    } else if (warns.length) {
      console.log(`  ${c.yellow('!')} ${path}`)
      warns.forEach((w) => console.log(`      ${c.yellow('• ' + w)}`))
    } else {
      console.log(`  ${c.green('✓')} ${path}`)
    }
  }

  // Duplicate titles across pages.
  const dupes = [...seenTitles.entries()].filter(([, paths]) => paths.length > 1)
  if (dupes.length) {
    console.log(`\n${c.bold('Duplicate titles')}`)
    dupes.forEach(([t, paths]) => console.log(`  ${c.yellow('!')} "${t}" → ${paths.join(', ')}`))
    critical += dupes.length
  }

  console.log(
    `\n${critical === 0 ? c.green(c.bold('PASS — no critical SEO issues')) : c.red(c.bold(`FAIL — ${critical} critical issue(s)`))}\n`,
  )
  process.exit(critical === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(c.red(`\nAudit failed to run: ${e}\n`))
  console.error(c.dim('Is the server running? Start it with `npm run dev` or `npm run start`.'))
  process.exit(2)
})
