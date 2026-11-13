/**
 * @jest-environment node
 */
// Reordering converges (native-app-everyday 2.3; spec "Reorder converges"): the app drags a
// task to the top of a project (the shared moveTask, as the drag handle writes it) while
// another device moves a different task of the same project; once each has the other's
// ops, both show the same order. Two databases on the app's adapter, two device ids.
import { db, useDatabase as openDatabaseNamed, type OutboxOp } from '@shared/db'
import { resetModuleState } from '@shared/moduleState'
import { moveTask } from '@shared/move'
import { applyOps, createProject, createTask, resetDeviceId } from '@shared/ops'
import { compareByPosition } from '@shared/ordering'
import { installPlatform, platform } from '@shared/platform'
import type { Op } from '@shared/types'
import { sqliteDatabase } from '../src/storage/adapter'
import { nodeSqlite } from './storage/nodeSqlite'

afterAll(() => resetModuleState())

let prefs = new Map<string, string>()
const files = new Map<string, ReturnType<typeof nodeSqlite>>()

/** Switches to a device: its own database file and its own device id (kept in its preferences). */
function device(name: string, store: Map<string, string>) {
  prefs = store
  const web = platform
  if (!files.has(name)) files.set(name, nodeSqlite())
  const sql = files.get(name)!
  installPlatform({
    ...web,
    database: (declared) => sqliteDatabase(declared, sql),
    prefs: { get: (k) => prefs.get(k) ?? null, set: (k, v) => { if (v === null) prefs.delete(k); else prefs.set(k, v); return true }, remove: (k) => { prefs.delete(k) }, onChange: () => () => undefined },
  })
  resetDeviceId()
  openDatabaseNamed(`reorder-${name}`)
}

/** Takes the device's unsent ops, as a sync would send them. */
async function send(): Promise<Op[]> {
  const ops = (await db.outbox.toArray()) as OutboxOp[]
  await db.outbox.clear()
  return ops.map(({ local: _local, ...op }) => op)
}

async function order(projectId: string): Promise<string[]> {
  const tasks = await db.tasks.where('project_id').equals(projectId).toArray()
  return tasks.filter((t) => !t.deleted_at).sort(compareByPosition).map((t) => t.title)
}

describe('reordering a project on two devices', () => {
  it('ends in the same order on both', async () => {
    const phone = new Map<string, string>()
    const web = new Map<string, string>()

    device('phone', phone)
    const pid = await createProject({ name: 'Groceries' })
    const ids: Record<string, string> = {}
    for (const title of ['Milk', 'Eggs', 'Bread', 'Apples']) ids[title] = await createTask({ title, project_id: pid })
    const created = await send()

    device('web', web)
    await applyOps(created)
    expect(await order(pid)).toEqual(['Milk', 'Eggs', 'Bread', 'Apples'])

    // At the same time: the phone drags Apples to the top, the web moves Milk to the bottom.
    device('phone', phone)
    expect(await moveTask(ids.Apples, { parent_id: null, section_id: null, at: 0 })).toBe(true)
    const fromPhone = await send()
    device('web', web)
    expect(await moveTask(ids.Milk, { parent_id: null, section_id: null, at: 3 })).toBe(true)
    const fromWeb = await send()

    await applyOps(fromPhone)
    const onWeb = await order(pid)
    device('phone', phone)
    await applyOps(fromWeb)
    const onPhone = await order(pid)

    expect(onPhone).toEqual(onWeb)
    expect(onPhone[0]).toBe('Apples')
    expect(onPhone[onPhone.length - 1]).toBe('Milk')
  })
})
