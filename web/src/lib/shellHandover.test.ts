// @vitest-environment happy-dom
// The shells' last release (native-app-handover 3.2, "Unsent change in the shell"): with an
// unsent op, the notice waits until a sync round has sent it; outside such a shell, or once
// shown, it never comes.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { mutate, resetDeviceId } from './ops'

const sent = vi.hoisted(() => ({ rounds: 0 }))
vi.mock('./sync', async (orig) => ({
  ...(await orig<typeof import('./sync')>()),
  // A round that reaches the server: the outbox is sent and emptied.
  syncNow: async () => { sent.rounds++; await db.outbox.clear() },
}))

import { handoverDue, handoverShown } from './shellHandover'

function installShell(capabilities: string[]) {
  ;(window as unknown as { opentodoShell?: unknown }).opentodoShell = { bridge: 1, platform: 'android', app: '1.5.0', capabilities }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  sent.rounds = 0
})

afterEach(() => {
  delete (window as unknown as { opentodoShell?: unknown }).opentodoShell
})

describe('the shell handover notice', () => {
  it('sends an unsent op before it is due, and is due once', async () => {
    installShell(['reminders', 'handover'])
    await mutate('task', 't1', { title: 'Written in the shell' })
    expect(await db.outbox.count()).toBeGreaterThan(0)
    expect(await handoverDue({ wait: async () => undefined })).toBe(true)
    expect(sent.rounds).toBe(1)
    expect(await db.outbox.count()).toBe(0)
    await handoverShown()
    expect(await handoverDue({ wait: async () => undefined })).toBe(false)
  })

  it('waits for the network before sending', async () => {
    installShell(['handover'])
    await mutate('task', 't1', { title: 'Offline' })
    const waits: number[] = []
    expect(await handoverDue({ wait: async () => { waits.push(sent.rounds) } })).toBe(true)
    expect(waits).toEqual([0])
  })

  it('never comes in a shell without the flag, or in a browser', async () => {
    installShell(['reminders'])
    expect(await handoverDue()).toBe(false)
    delete (window as unknown as { opentodoShell?: unknown }).opentodoShell
    expect(await handoverDue()).toBe(false)
  })
})
