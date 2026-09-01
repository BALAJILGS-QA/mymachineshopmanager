#!/usr/bin/env node
// One-command release pipeline:
//   local changes -> build -> commit -> push dev -> fast-forward main
//   -> push main  (Vercel auto-deploys production from main)
//
// Usage:
//   npm run deploy -- "commit message"
//   node scripts/deploy.mjs "commit message"
//
// Deployment itself is Vercel's git integration: pushing `main` triggers the
// production build (framework: nextjs, see vercel.json). There is no CLI
// deploy step here — watch the Vercel dashboard for the build.
//
// Requirements on the machine that runs this:
//   * git credentials with push access to origin
//   * the Vercel project connected to this repo, deploying from `main`
//
// Safety: every command runs via spawnSync with an argument array (no shell),
// so nothing is string-interpolated into a shell — no command injection.
import { spawnSync } from 'node:child_process'

const MSG = process.argv.slice(2).join(' ').trim() || `Release ${new Date().toISOString()}`
const DEV = 'dev'
const MAIN = 'main'
const isWin = process.platform === 'win32'
const NPM = isWin ? 'npm.cmd' : 'npm'

// On Windows, npm/npx are .cmd shims that Node refuses to spawn without a shell.
// git is a real .exe, so it never needs the shell. Args are static or passed as
// an array to git only, so enabling the shell here introduces no injection risk.
const needsShell = (bin) => isWin && bin.endsWith('.cmd')

function run(bin, args) {
  console.log(`\n$ ${bin} ${args.join(' ')}`)
  const r = spawnSync(bin, args, { stdio: 'inherit', shell: needsShell(bin) })
  if (r.error) throw r.error
  if (r.status !== 0) {
    throw new Error(`${bin} ${args.join(' ')} exited with code ${r.status}`)
  }
}
function capture(bin, args) {
  const r = spawnSync(bin, args, { encoding: 'utf8', shell: needsShell(bin) })
  return (r.stdout || '').trim()
}
function step(n, label) {
  console.log(`\n==> ${n}. ${label}`)
}

try {
  console.log(`Starting on branch: ${capture('git', ['rev-parse', '--abbrev-ref', 'HEAD'])}`)

  // 1. Type-check + production build (fail fast before touching git).
  step(1, 'Build (next build)')
  run(NPM, ['run', 'build'])

  // 2. Move to dev (create if missing) and commit any changes.
  step(2, `Commit changes onto ${DEV}`)
  const hasDev = capture('git', ['branch', '--list', DEV])
  run('git', ['checkout', ...(hasDev ? [DEV] : ['-b', DEV])])
  run('git', ['add', '-A'])
  if (capture('git', ['status', '--porcelain'])) {
    run('git', ['commit', '-m', MSG])
  } else {
    console.log('No changes to commit — releasing current HEAD.')
  }

  // 3. Push dev.
  step(3, `Push ${DEV}`)
  run('git', ['push', '-u', 'origin', DEV])

  // 4. Fast-forward main to dev and push.
  step(4, `Fast-forward ${MAIN} -> ${DEV} and push`)
  run('git', ['checkout', MAIN])
  run('git', ['merge', '--ff-only', DEV])
  run('git', ['push', 'origin', MAIN])

  // 5. Deployment is Vercel's git integration — pushing main triggers the
  //    production build. No CLI deploy step.
  console.log(
    '\nPushed to main — Vercel is building the production deployment.' +
      '\nTrack it in the Vercel dashboard (Deployments).',
  )
} catch (err) {
  console.error('\nPipeline failed:', err.message)
  console.error('Fix the issue and re-run. No further steps were executed.')
  process.exit(1)
}
