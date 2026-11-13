// node --test scripts/release/app-gate.test.mjs (make repo-check)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appJobs, budgetRows, report } from './app-gate.mjs'

const summary = `| Metric | Budget | Median | Range |
|---|---|---|---|
| Cold start to Today drawn | ≤ 1000 ms | 2068 (over) | 1966–2230 |
| … launch to first JavaScript |  | 1606 | 1464–1748 |
| Opening Inbox | ≤ 300 ms | 32.8 (within) | 22.4–98.5 |`

test('reads the budget rows of an app-perf summary', () => {
  assert.deepEqual(budgetRows(summary), [
    { metric: 'Cold start to Today drawn', budget: '≤ 1000 ms', median: '2068', verdict: 'over' },
    { metric: 'Opening Inbox', budget: '≤ 300 ms', median: '32.8', verdict: 'within' },
  ])
})

test('keeps the app jobs of a run', () => {
  assert.deepEqual(appJobs([{ name: 'app-native / App on Android (prebuild)', conclusion: 'success' }, { name: 'Go fuzz targets', conclusion: 'success' }]), [{ name: 'App on Android (prebuild)', conclusion: 'success' }])
})

test('reports each run, and says so when there is none', () => {
  assert.match(report([]), /No nightly runs/)
  const out = report([{ date: '2026-11-12', conclusion: 'success', url: 'u', jobs: [{ name: 'App on iOS', conclusion: 'failure' }], budgets: budgetRows(summary) }])
  assert.match(out, /✗ App on iOS: failure/)
  assert.match(out, /✗ Cold start to Today drawn: 2068 \(budget ≤ 1000 ms\)/)
  assert.match(out, /✓ Opening Inbox: 32.8/)
})

test('reports the Maestro step separately from the iOS build', () => {
  const jobs = appJobs([{ name: 'app-native / App on iOS', conclusion: 'success', steps: [{ name: 'Flows on the simulator (mobile/app/maestro)', conclusion: 'failure' }] }])
  assert.equal(jobs[0].maestro, 'failure')
  assert.match(report([{ date: '2026-11-13', conclusion: 'success', url: 'u', jobs, budgets: null }]), /Maestro: failure/)
})
