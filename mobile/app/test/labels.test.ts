/**
 * @jest-environment node
 */
// A label's actions on the phone (native-app-labels): rename refuses a taken name and
// changes nothing; delete says how many tasks lose the label, then removes it from them,
// and the tasks stay.
import { db, useDatabase as openDatabaseNamed } from '@shared/db'
import { createLabel } from '@shared/labels'
import { resetModuleState } from '@shared/moduleState'
import { installPlatform, platform } from '@shared/platform'
import type { Task } from '@shared/types'
import { Alert, type AlertButton } from 'react-native'
import { confirmDelete, deleteMessage, renameTo } from '../src/data/labelActions'
import { sqliteDatabase } from '../src/storage/adapter'
import { nodeSqlite } from './storage/nodeSqlite'

const task = (id: string, labels: string[]): Task => ({ id, title: id, project_id: null, completed_at: null, deleted_at: null, priority: 4, due: null, labels }) as unknown as Task

beforeEach(() => {
  const prefs = new Map<string, string>()
  const sql = nodeSqlite()
  installPlatform({
    ...platform,
    memoryOnlyKeys: true,
    database: (declared) => sqliteDatabase(declared, sql),
    prefs: { get: (k) => prefs.get(k) ?? null, set: (k, v) => { if (v === null) prefs.delete(k); else prefs.set(k, v); return true }, remove: (k) => { prefs.delete(k) }, onChange: () => () => undefined },
  })
  openDatabaseNamed('labels')
})

afterEach(() => {
  jest.restoreAllMocks()
  resetModuleState()
})

describe('renaming a label', () => {
  it('takes a new name', async () => {
    const id = await createLabel({ name: 'errand' })
    const label = (await db.labels.get(id))!
    expect(await renameTo(label, 'Errands')).toBe(true)
    expect((await db.labels.get(id))?.name).toBe('Errands')
  })

  it('refuses a name another label has, and changes nothing', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    const a = await createLabel({ name: 'home' })
    await createLabel({ name: 'work' })
    expect(await renameTo((await db.labels.get(a))!, 'Work')).toBe(false)
    expect((await db.labels.get(a))?.name).toBe('home')
    expect(alert).toHaveBeenCalledWith('Rename label', expect.stringMatching(/Another label has this name/))
  })
})

describe('deleting a label', () => {
  it('says how many tasks lose it, then removes it from them, and the tasks stay', async () => {
    const id = await createLabel({ name: 'errand' })
    const keep = await createLabel({ name: 'home' })
    await db.tasks.bulkPut([task('a', [id, keep]), task('b', [id]), task('c', [keep])])
    expect(await deleteMessage(id)).toBe('It is removed from 2 tasks. The tasks themselves stay.')
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    await confirmDelete((await db.labels.get(id))!)
    const buttons = alert.mock.calls[0][2] as AlertButton[]
    buttons.find((b) => b.style === 'destructive')!.onPress!()
    await new Promise((r) => setTimeout(r, 50))
    expect((await db.labels.get(id))?.deleted_at).toEqual(expect.any(Number))
    expect((await db.tasks.get('a'))?.labels).toEqual([keep])
    expect((await db.tasks.get('b'))?.labels).toEqual([])
    expect(await db.tasks.count()).toBe(3)
    expect(await deleteMessage(keep)).toBe('It is removed from 2 tasks. The tasks themselves stay.')
  })

  it('says when no task carries it', async () => {
    expect(await deleteMessage(await createLabel({ name: 'unused' }))).toBe('No task carries it.')
  })
})
