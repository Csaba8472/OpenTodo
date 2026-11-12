// The OAuth authorize return (OpenSpec change mcp-oauth, design D5): a client sends
// the browser to /oauth/authorize, or the OpenTodo app to /app/sign-in
// (native-app-foundation D5), which need a session and therefore send a
// signed-out browser here with the address to come back to. Read once, when this
// module loads (before the router touches the URL), and followed only when it is
// one of these two addresses of this server — anything else is dropped. Until it is
// followed or dropped, the first-run screens wait (OAuthConsentHost's
// useConsentPending): a tap on them changed the route and cancelled the return in
// Safari, so the app's sign-in sheet stayed on the Inbox.
import { useEffect } from 'react'
import { createStore } from '../lib/store'

const pending = createStore<string | null>('oauthReturn', typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('oauth'))

/** Whether the browser is about to go back to an authorize address. */
export function useReturnPending(): boolean {
  return pending.use() !== null
}

/**
 * After sign-in, returns the browser to `/oauth/authorize` or `/app/sign-in` when the app
 * was opened with `?oauth=`. The page is replaced with the address as it is: the
 * parameter stays until the page leaves, so a reload in between (Safari cancels the
 * lazy chunks still loading when the navigation starts, and a failed chunk reloads the
 * page) comes back here and returns again, and Back never lands on this page.
 */
export function useOauthAuthorizeReturn(ready: boolean): void {
  const next = pending.use()
  useEffect(() => {
    if (!ready || !next) return
    let authorize: URL | null
    try {
      authorize = new URL(next, window.location.origin)
    } catch {
      authorize = null
    }
    if (authorize && authorize.origin === window.location.origin && (authorize.pathname === '/oauth/authorize' || authorize.pathname === '/app/sign-in')) {
      window.location.replace(authorize.toString())
      return
    }
    const here = new URL(window.location.href)
    here.searchParams.delete('oauth')
    window.history.replaceState({}, '', here.pathname + here.search + here.hash)
    pending.set(null)
  }, [ready, next])
}
