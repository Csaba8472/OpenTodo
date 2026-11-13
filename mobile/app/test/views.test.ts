/**
 * @jest-environment node
 */
// A saved view in the app (native-app-everyday 5.1; spec "Saved view"): opened from Browse,
// it lists the tasks the shared evaluator selects, the same set as on the web. The shared
// filter vectors (web/src/lib/filter/evaluate.vectors.json, also run by the web and by
// internal/filter) go into the phone's database, and every case runs as a saved view
// through the app's read (src/data/views.ts). Tracked minutes are not read on the
// phone, so the cases that ask for them are left to the web.
import { db, useDatabase as openDatabaseNamed } from '@shared/db'
import { resetModuleState } from '@shared/moduleState'
import { installPlatform, platform } from '@shared/platform'
import type { FieldDef, Label, Project, Task, View } from '@shared/types'
import vectors from '../../../web/src/lib/filter/evaluate.vectors.json'
import { savedViewSections } from '../src/data/views'
import { sqliteDatabase } from '../src/storage/adapter'
import { nodeSqlite } from './storage/nodeSqlite'

afterAll(() => resetModuleState())

function task(row: Record<string, unknown>, i: number): Task {
  const fields: Record<string, unknown> = {}
  const base: Record<string, unknown> = {
    title: '', description: '', labels: [], priority: 4, due: null, project_id: null, section_id: null, parent_id: null, start: null,
    deadline: null, evening: false, day_part: null, completed_at: null, deleted_at: null, created_at: 1792454400000, habit: false,
    origin: null, energy: '', blocked_by: [], position: i, assignee_id: null,
  }
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith('fields.')) fields[k.slice(7)] = v
    else base[k] = v
  }
  return { ...base, fields } as unknown as Task
}

const ASKS_TRACKED = /\btracked\b/

describe('saved views on the phone (the shared filter vectors)', () => {
  beforeAll(async () => {
    const web = platform
    installPlatform({ ...web, database: (declared) => sqliteDatabase(declared, nodeSqlite()) })
    openDatabaseNamed('views')
    await db.projects.bulkPut((vectors.projects as unknown as Project[]).map((p, i) => Object.assign({ archived: false, position: i }, p)))
    await db.labels.bulkPut((vectors.labels as unknown as Label[]).map((l, i) => Object.assign({ position: i }, l)))
    await db.fields.bulkPut(vectors.fields as unknown as FieldDef[])
    await db.tasks.bulkPut(vectors.tasks.map((r, i) => task(r as Record<string, unknown>, i)))
  })

  // A saved view always has a query (runView refuses an empty one, on the web too).
  const cases = vectors.cases.filter((c) => c.query.trim() && !ASKS_TRACKED.test(c.query))
  it('has the cases', () => expect(cases.length).toBeGreaterThanOrEqual(45))

  for (const c of cases) {
    it(c.query || '(empty)', async () => {
      const view = { id: 'v', name: 'View', query: c.query, position: 0, deleted_at: null } as unknown as View
      const r = await savedViewSections(view, vectors.today, { me: vectors.me, members: vectors.members })
      if ('error' in r) throw new Error(r.error)
      expect(r.flatMap((s) => s.tasks.map((t) => t.id)).sort()).toEqual([...c.ids].sort())
    })
  }
})
