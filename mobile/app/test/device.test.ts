/**
 * @jest-environment node
 */
// The phone outside the app (OpenSpec change native-app-handover), with the shared
// container mocked: the widget's snapshot is the shared fixture's, the reminders keep a
// window of 60, a locked account keeps its schedule, the notification buttons and shares
// become ops, and in-app notifications become local ones once.
import { db, getMeta, setMeta, useDatabase as openDatabaseNamed } from '@shared/db'
import * as ops from '@shared/ops'
import { resetModuleState } from '@shared/moduleState'
import { installPlatform, platform } from '@shared/platform'
import { setCurrentUserId } from '@shared/sharing'
import type { AppNotification, Reminder, Task } from '@shared/types'
import fixture from '../../../web/src/lib/testdata/widgetSnapshot.json'
import type { QueuedAction, QueuedShare } from '../modules/opentodo-shared-container'
import { sqliteDatabase } from '../src/storage/adapter'
import { nodeSqlite } from './storage/nodeSqlite'

const mockPublished: unknown[] = []
const mockScheduled: unknown[][] = []
const mockNotified: unknown[] = []
let mockActions: QueuedAction[] = []
let mockShares: QueuedShare[] = []

jest.mock('../modules/opentodo-shared-container', () => ({
  container: {
    available: true,
    publishWidget: (s: unknown) => { mockPublished.push(s) },
    scheduleReminders: (r: unknown[]) => { mockScheduled.push(r); return 'granted' },
    notify: (n: unknown) => { mockNotified.push(n); return true },
    takeActions: () => [...mockActions],
    ackAction: (id: string, at: number) => { mockActions = mockActions.filter((a) => a.id !== id || a.at !== at) },
    takeShares: () => [...mockShares],
    ackShare: (id: string) => { mockShares = mockShares.filter((s) => s.id !== id) },
    fileSha256: async () => null,
    removeFile: () => undefined,
  },
}))

// Imported after the mock, which jest hoists above the imports.
import { applyQueuedActions, applyQueuedShares, notificationText, notifyNew, publishDevice, REMINDER_WINDOW, shareTask } from '../src/device'

const NOW = fixture.now
const row = (t: Partial<Task>): Task => ({ project_id: null, completed_at: null, deleted_at: null, priority: 4, due: null, ...t }) as unknown as Task
const reminder = (id: string, taskId: string, fireAt: number): Reminder =>
  ({ id, task_id: taskId, kind: 'absolute', offset_minutes: null, fire_at: fireAt, delivered_at: null, dismissed_at: null, created_at: 0, deleted_at: null }) as unknown as Reminder

beforeEach(() => {
  const prefs = new Map<string, string>()
  const sql = nodeSqlite()
  installPlatform({
    ...platform,
    memoryOnlyKeys: true,
    database: (declared) => sqliteDatabase(declared, sql),
    prefs: { get: (k) => prefs.get(k) ?? null, set: (k, v) => { if (v === null) prefs.delete(k); else prefs.set(k, v); return true }, remove: (k) => { prefs.delete(k) }, onChange: () => () => undefined },
  })
  openDatabaseNamed('device')
  mockPublished.length = 0
  mockScheduled.length = 0
  mockNotified.length = 0
  mockActions = []
  mockShares = []
})

afterEach(() => resetModuleState())

describe('the widget snapshot', () => {
  it('is the shared fixture, from the phone database', async () => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask', 'nextTick'] })
    try {
      await db.tasks.bulkPut(fixture.tasks.map((t) => row(t as unknown as Partial<Task>)))
      await publishDevice(NOW)
      expect(mockPublished).toEqual([fixture.snapshot])
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('the reminders', () => {
  it('keeps the next 60, earliest first, with their titles', async () => {
    await db.tasks.put(row({ id: 't', title: 'Call the dentist' }))
    await db.reminders.bulkPut(Array.from({ length: 70 }, (_, i) => reminder(`r${i}`, 't', NOW + (70 - i) * 60_000)))
    await publishDevice(NOW)
    const list = mockScheduled[0] as { id: string; fireAt: number; title?: string }[]
    expect(list).toHaveLength(REMINDER_WINDOW)
    expect(list[0]).toEqual({ id: 'r69', taskId: 't', fireAt: NOW + 60_000, title: 'Call the dentist' })
    expect(list.map((r) => r.fireAt)).toEqual([...list.map((r) => r.fireAt)].sort((a, b) => a - b))
  })

  it('drops a reminder of a completed task at the next publish', async () => {
    await db.tasks.put(row({ id: 't', title: 'Call' }))
    await db.reminders.put(reminder('r', 't', NOW + 60_000))
    await publishDevice(NOW)
    await db.tasks.update('t', { completed_at: NOW })
    await publishDevice(NOW)
    expect(mockScheduled.map((l) => l.length)).toEqual([1, 0])
  })
})

describe('the notification buttons', () => {
  it('Complete completes the task and Snooze moves the reminder ten minutes on', async () => {
    await setCurrentUserId('u1')
    await db.tasks.bulkPut([row({ id: 'a', title: 'A' }), row({ id: 'b', title: 'B' })])
    await db.reminders.bulkPut([reminder('ra', 'a', NOW), reminder('rb', 'b', NOW)])
    mockActions = [{ id: 'ra', action: 'done', at: NOW + 1000 }, { id: 'rb', action: 'snooze', at: NOW + 2000 }]
    expect(await applyQueuedActions()).toBe(2)
    expect((await db.tasks.get('a'))?.completed_at).toBe(NOW + 1000)
    expect((await db.reminders.get('rb'))?.fire_at).toBe(NOW + 2000 + 10 * 60_000)
    expect(mockActions).toHaveLength(0)
    // Ops in the outbox, sent at the next sync.
    expect(await db.outbox.count()).toBeGreaterThan(0)
  })
})

it('retains a notification action after a failed write and retries it', async () => {
  await setCurrentUserId('u1')
  await db.tasks.put(row({ id: 'a', title: 'A' }))
  await db.reminders.put(reminder('ra', 'a', NOW))
  mockActions = [{ id: 'ra', action: 'done', at: NOW }]
  const failed = jest.spyOn(ops, 'completeTask').mockRejectedValueOnce(new Error('disk full'))
  await expect(applyQueuedActions()).rejects.toThrow('disk full')
  expect(mockActions).toHaveLength(1)
  failed.mockRestore()
  await applyQueuedActions()
  expect(mockActions).toHaveLength(0)
  expect((await db.tasks.get('a'))?.completed_at).toBe(NOW)
})

it('acknowledges stale notification actions without creating a reminder', async () => {
  mockActions = [{ id: 'another-account', action: 'snooze', at: NOW }]
  await applyQueuedActions()
  expect(await db.reminders.count()).toBe(0)
  expect(mockActions).toHaveLength(0)
})

describe('shares', () => {
  it('a page becomes its title, with the link in the notes', () => {
    expect(shareTask({ title: 'An article', text: '', url: 'https://example.com/a', files: [], at: NOW })).toMatchObject({ title: 'An article', description: 'https://example.com/a' })
  })

  it('a picture alone is named after its file', () => {
    expect(shareTask({ title: '', text: '', url: '', files: [{ path: '/x', name: 'receipt.png', type: 'image/png', size: 9 }], at: NOW })?.title).toBe('receipt')
  })

  it('becomes an Inbox task', async () => {
    await setCurrentUserId('u1')
    mockShares = [{ id: '00000000-0000-4000-8000-000000000001', title: 'An article', text: '', url: 'https://example.com/a', files: [], at: NOW }]
    const [id] = await applyQueuedShares()
    expect(await db.tasks.get(id)).toMatchObject({ title: 'An article', project_id: null })
    expect(mockShares).toHaveLength(0)
    expect(await applyQueuedShares()).toEqual([])
    expect(await db.tasks.count()).toBe(1)
  })

  it('keeps a share when writing its task fails, then retries it once', async () => {
    await setCurrentUserId('u1')
    mockShares = [{ id: '00000000-0000-4000-8000-000000000002', title: 'Keep me', text: '', url: '', files: [], at: NOW }]
    const failed = jest.spyOn(ops, 'mutateMany').mockRejectedValueOnce(new Error('disk full'))
    await expect(applyQueuedShares()).rejects.toThrow('disk full')
    expect(mockShares).toHaveLength(1)
    failed.mockRestore()
    await applyQueuedShares()
    expect(mockShares).toHaveLength(0)
    expect(await db.tasks.count()).toBe(1)
  })
  it('leaves a locked account’s share in native storage', async () => {
    await setMeta('e2ee.enabled', true)
    mockShares = [{ id: '00000000-0000-4000-8000-000000000003', title: 'Private', text: '', url: '', files: [], at: NOW }]
    expect(await applyQueuedShares()).toEqual([])
    expect(mockShares).toHaveLength(1)
    expect(await db.tasks.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('retains an unreadable file’s share without creating another task on retry', async () => {
    await setCurrentUserId('u1')
    mockShares = [{ id: '00000000-0000-4000-8000-000000000004', title: '', text: '', url: '', files: [{ path: '/missing', name: 'receipt.png', type: 'image/png', size: 10 }], at: NOW }]
    await expect(applyQueuedShares()).rejects.toThrow('Shared file cannot be read')
    await expect(applyQueuedShares()).rejects.toThrow('Shared file cannot be read')
    expect(mockShares).toHaveLength(1)
    expect(await db.tasks.count()).toBe(1)
  })

})

describe('in-app notifications', () => {
  const mention = (id: string, createdAt: number): AppNotification => ({
    id, kind: 'mentioned', createdAt, readAt: null,
    payload: { recipientId: 'u1', actorId: 'u2', actorName: 'Ada', commentId: 'c', taskId: 't', taskTitle: 'Plan the trip', excerpt: 'Look at this', at: createdAt },
  }) as AppNotification

  it('says who mentioned the user on which task', () => {
    expect(notificationText(mention('n', NOW))).toEqual({ title: 'Ada mentioned you on Plan the trip', body: 'Look at this', taskId: 't' })
  })

  it('shows each new one once, never the history at sign-in, and none while the app is in front', async () => {
    await db.notifications.put(mention('old', NOW - 1000))
    expect(await notifyNew(false)).toBe(0)
    await db.notifications.put(mention('new', NOW))
    expect(await notifyNew(true)).toBe(0)
    await db.notifications.put(mention('newer', NOW + 1000))
    expect(await notifyNew(false)).toBe(1)
    expect(await notifyNew(false)).toBe(0)
    expect(mockNotified).toEqual([expect.objectContaining({ id: 'newer' })])
    expect(await getMeta<number>('device:notifiedUntil', 0)).toBe(NOW + 1000)
  })
})
