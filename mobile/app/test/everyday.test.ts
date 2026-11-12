/**
 * @jest-environment node
 */
// The everyday screens' logic (OpenSpec change native-app-everyday): the capture sheet's
// context rule and its parse (spec "Fast capture"), the date sheet's quick choices, the
// note reader's blocks, and the unwrapped account key that stays in memory only (D7).
import { createKeyRecord } from '@shared/crypto'
import { db, useDatabase as openDatabaseNamed } from '@shared/db'
import { currentKey, loadEncryptionState, unlock } from '@shared/e2ee'
import { resetModuleState } from '@shared/moduleState'
import { parse } from '@shared/nlp/parse'
import { installPlatform, platform } from '@shared/platform'
import { withContext } from '../src/screens/CaptureSheet'
import { nextWeekOf, weekendOf } from '../src/screens/WhenSheet'
import { sqliteDatabase } from '../src/storage/adapter'
import { blocksOf } from '../src/ui/Markdown'
import { nodeSqlite } from './storage/nodeSqlite'


afterEach(() => resetModuleState())

const TODAY = '2026-11-12' // a Thursday

describe('capture', () => {
  it('reads the spec example: title, project, tomorrow at 9:00, highest priority', () => {
    const r = parse('Call Anna tomorrow 9am #Work p1', { today: TODAY, languages: ['en'], projects: [{ id: 'w', name: 'Work' }] })
    expect(r.title).toBe('Call Anna')
    expect(r.projectId).toBe('w')
    expect(r.due).toEqual({ date: '2026-11-13', time: '09:00' })
    expect(r.priority).toBe(1)
    expect(r.chips.map((c) => c.kind).sort()).toEqual(['due', 'priority', 'project'])
  })

  it('gives a task its context unless the line says otherwise', () => {
    expect(withContext({ title: 'Buy milk' }, { projectId: 'g' }, TODAY)).toEqual({ title: 'Buy milk', project_id: 'g' })
    expect(withContext({ title: 'Buy milk' }, { today: true }, TODAY)).toEqual({ title: 'Buy milk', due: { date: TODAY } })
    expect(withContext({ title: 'Call', due: { date: '2026-11-20' } }, { today: true }, TODAY)).toEqual({ title: 'Call', due: { date: '2026-11-20' } })
    expect(withContext({ title: 'Read', start: 'someday' }, { today: true }, TODAY)).toEqual({ title: 'Read', start: 'someday' })
    expect(withContext({ title: 'Plan', project_id: 'h' }, { projectId: 'g' }, TODAY)).toEqual({ title: 'Plan', project_id: 'h' })
    expect(withContext({ title: 'Tag', labels: ['b'] }, { labelId: 'a' }, TODAY)).toEqual({ title: 'Tag', labels: ['a', 'b'] })
  })
})

describe('the date sheet', () => {
  it('offers this weekend and next week from the day it is', () => {
    expect(weekendOf(TODAY)).toBe('2026-11-14')
    expect(weekendOf('2026-11-14')).toBe('2026-11-21')
    expect(weekendOf('2026-11-15')).toBe('2026-11-21')
    expect(nextWeekOf(TODAY)).toBe('2026-11-16')
    expect(nextWeekOf('2026-11-16')).toBe('2026-11-23')
    expect(nextWeekOf('2026-11-15')).toBe('2026-11-16')
  })

  it('reads a typed date with the shared parser ("next fri 3pm")', () => {
    expect(parse('next fri 3pm', { today: TODAY, languages: ['en'], projects: [] }).due).toEqual({ date: '2026-11-20', time: '15:00' })
  })
})

describe('the note reader', () => {
  it('splits Markdown into blocks, and leaves a table to the web', () => {
    const md = ['# Trip', '', 'Pack **light**.', '', '- [ ] passport', '- [x] tickets', '  - seat 12A', '1. Rome', '', '> remember', '', '```', 'code', '```', '', '| a | b |', '|---|---|', '| 1 | 2 |', '', '---', 'End'].join('\n')
    expect(blocksOf(md).map((b) => b.kind)).toEqual(['heading', 'para', 'item', 'item', 'item', 'item', 'quote', 'code', 'table', 'rule', 'para'])
    const items = blocksOf(md).filter((b) => b.kind === 'item')
    expect(items.map((b) => (b.kind === 'item' ? [b.checked, b.depth, b.ordered] : null))).toEqual([[false, 0, null], [true, 0, null], [null, 1, null], [null, 0, '1.']])
  })
})

describe('the account key on the phone', () => {
  it('is kept in memory only: never in SQLite or the preferences, and a cold start asks again', async () => {
    const prefs = new Map<string, string>()
    const web = platform
    const sql = nodeSqlite()
    installPlatform({
      ...web,
      memoryOnlyKeys: true,
      database: (declared) => sqliteDatabase(declared, sql),
      prefs: { get: (k) => prefs.get(k) ?? null, set: (k, v) => { if (v === null) prefs.delete(k); else prefs.set(k, v); return true }, remove: (k) => { prefs.delete(k) }, onChange: () => () => undefined },
    })
    openDatabaseNamed('keys')
    const { record } = await createKeyRecord('correct horse battery')
    // The body parsed in this realm: Node's Response.json() builds its objects in another,
    // which the adapter (rightly) refuses as not plain; Hermes has one realm.
    const answer = JSON.stringify({ keys: record })
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => ({ ok: true, status: 200, statusText: 'OK', headers: new Headers({ 'Content-Type': 'application/json' }), json: async () => JSON.parse(answer) }) as Response)
    try {
      await expect(unlock('wrong passphrase', 'passphrase')).rejects.toThrow()
      expect(await currentKey()).toBeNull()

      await unlock('correct horse battery', 'passphrase')
      const key = await currentKey()
      expect(key).not.toBeNull()
      expect(key!.extractable).toBe(false)
      expect(await db.meta.get('e2ee.key')).toBeUndefined()
      const stored = JSON.stringify(await db.meta.toArray()) + JSON.stringify([...prefs])
      expect(stored).not.toMatch(/CryptoKey|"k":|"key_ops"/)

      // A cold start: the same database, and the start-up's loadEncryptionState
      // (src/accountSync.ts), which drops the copy in memory as a new process has none.
      resetModuleState()
      installPlatform({ ...web, memoryOnlyKeys: true, database: (declared) => sqliteDatabase(declared, sql) })
      openDatabaseNamed('keys')
      const state = await loadEncryptionState()
      expect(state).toMatchObject({ enabled: true, unlocked: false })
      expect(await currentKey()).toBeNull()
    } finally {
      fetchMock.mockRestore()
    }
  })
})
