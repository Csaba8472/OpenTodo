// @vitest-environment happy-dom
// The OpenTodo app's sign-in (OpenSpec change native-app-foundation, design D5):
// the confirmation names the device and only Confirm asks for a code; the
// signed-in apps are listed with the sessions and can be signed out.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { click, mockFetch, render, waitFor } from '../ui/test-utils'
import { AppSignIn } from './AppSignIn'
import { AppSessions } from './AppSessions'
import { OAuthConsent } from './OAuthConsent'

afterEach(() => { vi.unstubAllGlobals() })

const query = 'code_challenge=abc&code_challenge_method=S256&state=s1&device=iPhone'
const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!

describe('AppSignIn', () => {
  it('names the device and sends the code to the app only on Confirm', async () => {
    const posts: unknown[] = []
    mockFetch((method, path, init) => {
      if (method !== 'POST' || path !== '/api/v1/me/app-sign-in') return undefined
      posts.push(JSON.parse(String(init?.body)))
      return { redirect: 'opentodo://signed-in?code=c&state=s1' }
    })
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const { unmount } = await render(<AppSignIn query={query} onDone={() => {}} />)
    const dialog = () => document.querySelector<HTMLElement>('[data-testid="app-sign-in"]')
    await waitFor(() => dialog() !== null, 'the confirmation')
    expect(dialog()!.textContent).toContain('Sign in to the OpenTodo app on iPhone?')
    expect(posts).toEqual([])
    await click(button('Sign in'))
    await waitFor(() => assign.mock.calls.length === 1, 'the redirect')
    expect(posts).toEqual([{ query, allow: true }])
    expect(assign).toHaveBeenCalledWith('opentodo://signed-in?code=c&state=s1')
    await unmount()
  })

  it('never opens an address other than the app’s', async () => {
    mockFetch((method, path) => (method === 'POST' && path === '/api/v1/me/app-sign-in' ? { redirect: 'https://evil.example/?code=c' } : undefined))
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const onDone = vi.fn()
    const { unmount } = await render(<AppSignIn query={query} onDone={onDone} />)
    await click(button('Sign in'))
    await waitFor(() => onDone.mock.calls.length === 1, 'closed')
    expect(assign).not.toHaveBeenCalled()
    await unmount()
  })

  it('is what the consent host shows for the app’s client, and only for it', async () => {
    let mcpReads = 0
    mockFetch((method, path) => {
      if (method === 'GET' && path.startsWith('/api/v1/me/mcp-consent')) mcpReads++
      return undefined
    })
    const { unmount } = await render(<OAuthConsent query={`client_id=opentodo-app&${query}`} onDone={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-testid="app-sign-in"]'), 'the app confirmation')
    expect(mcpReads).toBe(0)
    await unmount()
  })
})

describe('the sign-in return', () => {
  it('returns a signed-in browser to this server’s /app/sign-in, and nowhere else', async () => {
    for (const [next, followed] of [[`${window.location.origin}/app/sign-in?${query}`, true], ['https://evil.example/app/sign-in', false]] as const) {
      window.history.replaceState(null, '', `/?oauth=${encodeURIComponent(next)}`)
      // The address is read when the module loads, as when the page opens with it.
      vi.resetModules()
      const { useOauthAuthorizeReturn, useReturnPending } = await import('./oauthReturn')
      let pending: boolean | null = null
      function Return() { useOauthAuthorizeReturn(true); pending = useReturnPending(); return null }
      const replaceLocation = vi.fn()
      vi.stubGlobal('location', { ...window.location, origin: window.location.origin, href: window.location.href, search: window.location.search, replace: replaceLocation })
      const { unmount } = await render(<Return />)
      if (followed) {
        // Replaced as it is, the parameter still in the address: a reload meanwhile returns again.
        await waitFor(() => replaceLocation.mock.calls.length === 1, 'the return')
        expect(replaceLocation).toHaveBeenCalledWith(next)
        expect(window.location.search).toContain('oauth=')
        expect(pending).toBe(true)
      } else {
        await waitFor(() => pending === false, 'the return dropped')
        expect(replaceLocation).not.toHaveBeenCalled()
      }
      await unmount()
      vi.unstubAllGlobals()
    }
  })
})

describe('AppSessions', () => {
  it('lists each signed-in app with its last use and signs one out', async () => {
    const now = Date.UTC(2026, 10, 10, 12)
    const revoke = vi.fn(async () => {})
    const load = async () => [
      { id: 'g1', device: 'iPhone', createdAt: now - 86_400_000, lastUsedAt: now - 60_000 },
      { id: 'g2', device: '', createdAt: now - 86_400_000, lastUsedAt: now - 3_600_000 },
    ]
    const { unmount } = await render(<AppSessions load={load} revoke={revoke} now={now} />)
    const rows = () => document.querySelector<HTMLElement>('[data-testid="app-sessions"]')
    await waitFor(() => rows() !== null, 'the rows')
    expect(rows()!.textContent).toContain('OpenTodo app · iPhone')
    expect(rows()!.textContent).toContain('Used ')
    await click(document.querySelector<HTMLElement>('[aria-label="Actions for OpenTodo app · iPhone"]')!)
    await waitFor(() => !!button('Sign out'), 'the menu')
    await click(button('Sign out'))
    await waitFor(() => !rows()!.textContent!.includes('iPhone'), 'the row removed')
    expect(revoke).toHaveBeenCalledWith('g1')
    expect(rows()!.textContent).toContain('OpenTodo app')
    await unmount()
  })

  it('shows nothing while no app is signed in', async () => {
    const { unmount } = await render(<AppSessions load={async () => []} />)
    expect(document.querySelector('[data-testid="app-sessions"]')).toBeNull()
    await unmount()
  })
})
