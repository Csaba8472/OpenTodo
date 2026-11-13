#!/usr/bin/env node
// The native app's go/no-go evidence (OpenSpec change native-app-handover D7, RELEASING.md
// "The native app's go/no-go gate"): the last nightly runs of the default branch, each with
// its app jobs (the iOS and Android builds and flows, the performance run) and the app's
// performance budgets from the run's app-perf summary. The owner reads it when signing off
// the gate; it decides nothing itself.
//
//   make app-gate                       # this repository's origin, the last three nightlies
//   node scripts/release/app-gate.mjs --repo OpenTodoApp/OpenTodo --runs 5
//
// Needs the GitHub CLI (gh), signed in. No dependency.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The budget rows of an app-perf summary.md: metric, budget, median and whether it is within. */
export function budgetRows(summary) {
  const rows = []
  for (const line of summary.split('\n')) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.length < 3 || !cells[1].startsWith('≤')) continue
    const verdict = /\((within|over)\)/.exec(cells[2])?.[1] ?? 'unknown'
    rows.push({ metric: cells[0], budget: cells[1], median: cells[2].replace(/\s*\((within|over)\)/, ''), verdict })
  }
  return rows
}

/** The app's jobs of a nightly run, as `name: conclusion`. */
export function appJobs(jobs) {
  return jobs.filter((j) => j.name.startsWith('app-native /')).map((j) => {
    const maestro = j.steps?.find((s) => /Flows on the simulator|Maestro/i.test(s.name))
    return { name: j.name.replace(/^app-native \/ /, ''), conclusion: j.conclusion ?? j.status, ...(maestro ? { maestro: maestro.conclusion ?? maestro.status } : {}) }
  })
}

/** The report, one block per run. */
export function report(runs) {
  if (!runs.length) return 'No nightly runs of the default branch yet: the gate has nothing to show.\n'
  return runs.map((r) => {
    const lines = [`Nightly ${r.date} (${r.conclusion}) ${r.url}`]
    for (const j of r.jobs) {
      lines.push(`  ${j.conclusion === 'success' ? '✓' : '✗'} ${j.name}: ${j.conclusion}`)
      if (/App on iOS/.test(j.name) || j.maestro !== undefined) lines.push(`    ${j.maestro === 'success' ? '✓' : '✗'} Maestro: ${j.maestro ?? 'not recorded'}`)
    }
    if (!r.jobs.length) lines.push('  no app jobs in this run')
    if (r.budgets === null) lines.push('  app-perf: no summary in this run')
    for (const b of r.budgets ?? []) lines.push(`  ${b.verdict === 'within' ? '✓' : '✗'} ${b.metric}: ${b.median} (budget ${b.budget})`)
    return lines.join('\n')
  }).join('\n\n') + '\n'
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
}

function main() {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(name)
    return i > 0 ? process.argv[i + 1] : fallback
  }
  const repo = arg('--repo', JSON.parse(gh(['repo', 'view', '--json', 'nameWithOwner'])).nameWithOwner)
  const count = Number(arg('--runs', '3'))
  const branch = JSON.parse(gh(['repo', 'view', repo, '--json', 'defaultBranchRef'])).defaultBranchRef.name
  const listed = JSON.parse(gh(['run', 'list', '-R', repo, '--workflow', 'nightly.yml', '--branch', branch, '--status', 'completed', '--limit', String(count), '--json', 'databaseId,conclusion,createdAt,url']))
  const runs = listed.map((r) => {
    const jobs = appJobs(JSON.parse(gh(['run', 'view', String(r.databaseId), '-R', repo, '--json', 'jobs'])).jobs)
    let budgets = null
    const dir = mkdtempSync(join(tmpdir(), 'app-gate-'))
    try {
      gh(['run', 'download', String(r.databaseId), '-R', repo, '-n', 'app-perf', '-D', dir])
      budgets = budgetRows(readFileSync(join(dir, 'summary.md'), 'utf8'))
    } catch {
      // No app-perf artifact in this run (expired, or the job did not run).
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    return { date: r.createdAt.slice(0, 10), conclusion: r.conclusion, url: r.url, jobs, budgets }
  })
  process.stdout.write(`The app's last ${runs.length} nightly runs on ${repo} (${branch}):\n\n${report(runs)}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
