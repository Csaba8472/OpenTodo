// @vitest-environment happy-dom
// A consent comes before the first-run screens (native-app-foundation D5): the
// OpenTodo app's sign-in sheet opens the web app with `?oauth_consent=`, and the
// owner's welcome note and the start guide covered the confirmation there. They
// wait until it is answered.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The host reads the request from the address when it loads, before these imports.
vi.hoisted(() => {
  window.history.replaceState(null, '', '/?oauth_consent=' + encodeURIComponent('client_id=opentodo-app&code_challenge=abc&code_challenge_method=S256&state=s1&device=iPhone'))
})
const syncState = vi.hoisted(() => ({ lastSyncedAt: 1 as number | null }))
vi.mock('../lib/sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/sync')>()),
  useSyncStatus: () => ({ state: 'idle', pending: 0, lastSyncedAt: syncState.lastSyncedAt, error: null, live: false, rejected: null }),
}))
import { db } from '../lib/db'
import { resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { click, flush, mockFetch, render, waitFor } from '../ui/test-utils'
import { FirstRunGuide } from './FirstRun'
import { navigate } from './router'
import { OAuthConsentHost } from './OAuthConsentHost'
import { TaskListView } from './TaskListView'
import { WelcomeDialog } from './WelcomeDialog'

const owner: User = { id: 'u1', email: 'ada@example.com', name: 'Ada', role: 'owner', createdAt: Date.now() - 60_000 }

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  navigate({ view: 'inbox' })
})

const q = (sel: string) => document.querySelector<HTMLElement>(sel)
const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!

describe('a pending consent', () => {
  it('holds back the welcome note and the start guide until it is answered', async () => {
    expect(window.location.search).toBe('')
    // An answer that does not go back to the app closes the confirmation (AppSignIn's onDone).
    mockFetch((method, path) => (method === 'POST' && path === '/api/v1/me/app-sign-in' ? { redirect: 'https://elsewhere.example/' } : undefined))
    const r = await render(<><TaskListView route={{ view: 'inbox' }} /><WelcomeDialog user={owner} /><FirstRunGuide user={owner} /><OAuthConsentHost /></>)
    await waitFor(() => q('[data-testid="app-sign-in"]') !== null, 'the confirmation')
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- the note and the guide announce no "decided"; give them the time to (wrongly) open
    await flush(150)
    expect(q('[data-testid="welcome"]')).toBeNull()
    expect(q('[data-first-run]')).toBeNull()

    await click(button('Sign in'))
    await waitFor(() => q('[data-testid="app-sign-in"]') === null, 'the confirmation closed')
    await waitFor(() => q('[data-testid="welcome"]') !== null, 'the welcome note')
    await r.unmount()
  })
})
