// @vitest-environment happy-dom
// A consent is the whole page (account-access "Signed in on the web already"): the
// OpenTodo app's sign-in sheet shows only the confirmation, not the account's
// lists behind it, and the app opens in the same page once it is answered.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { click, render, waitFor } from '../ui/test-utils'

const me = { id: 'u1', email: 'me@example.com', name: 'Me', role: 'owner', createdAt: 1 }
const request = 'client_id=opentodo-app&code_challenge=abc&code_challenge_method=S256&state=s1&device=Android'

afterEach(() => {
  vi.doUnmock('../lib/sync')
  vi.unstubAllGlobals()
  history.pushState(null, '', '/')
})

describe('the app sign-in sheet', { timeout: 30000 }, () => {
  it('shows only the confirmation, and the app after it is answered', async () => {
    vi.resetModules()
    vi.doMock('../lib/sync', async (orig) => ({ ...(await orig<typeof import('../lib/sync')>()), startSync: vi.fn(), stopSync: vi.fn() }))
    history.pushState(null, '', '/?oauth_consent=' + encodeURIComponent(request))
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/v1/auth/status')) {
        return new Response(JSON.stringify({ authenticated: true, user: me, setupRequired: false, signupAllowed: false, version: 'test' }), { status: 200 })
      }
      // An answer that does not go back to the app closes the confirmation (AppSignIn's onDone).
      if (String(url).includes('/api/v1/me/app-sign-in') && init?.method === 'POST') {
        return new Response(JSON.stringify({ redirect: 'https://elsewhere.example/' }), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    }))
    const { App } = await import('./App')
    const r = await render(<App />)
    const q = (sel: string) => document.querySelector<HTMLElement>(sel)
    await waitFor(() => q('[data-testid="app-sign-in"]') !== null, 'the confirmation')
    expect(q('main')).toBeNull()

    await click([...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Cancel')!)
    await waitFor(() => q('main') !== null, 'the app')
    expect(q('[data-testid="app-sign-in"]')).toBeNull()
    await r.unmount()
  })
})
