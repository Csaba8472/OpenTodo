// Mounts the OAuth consent screen (mcp-oauth D5) when the app was opened with
// `?oauth_consent=<authorize request>`. The parameter is read when this module
// loads, before the router or sign-in touch the address, and removed from it;
// the screen itself is loaded only then, so the first load does not carry it.
// While it is open, the owner's welcome and the start guide wait (they cover it
// otherwise, and the sign-in sheet of the OpenTodo app showed the guide instead).
import { lazy, Suspense } from 'react'
import { createStore } from '../lib/store'
import { useReturnPending } from './oauthReturn'

const OAuthConsent = lazy(() => import('./OAuthConsent').then((m) => ({ default: m.OAuthConsent })))

/** Takes `oauth_consent` out of the current address and returns it. */
export function takeConsentQuery(): string | null {
  if (typeof window === 'undefined') return null
  const here = new URL(window.location.href)
  const q = here.searchParams.get('oauth_consent')
  if (q !== null) {
    here.searchParams.delete('oauth_consent')
    window.history.replaceState(window.history.state, '', here.pathname + here.search + here.hash)
  }
  return q
}

const pending = createStore<string | null>('oauthConsent', takeConsentQuery())

/**
 * Whether a consent (or the app's sign-in confirmation) is waiting for an answer, or the
 * browser is about to go back to one after signing in (oauthReturn).
 */
export function useConsentPending(): boolean {
  const returning = useReturnPending()
  return pending.use() !== null || returning
}

/** Shows the consent screen for a pending authorize request, if the app was opened with one. */
export function OAuthConsentHost() {
  const query = pending.use()
  if (!query) return null
  return <Suspense fallback={null}><OAuthConsent query={query} onDone={() => pending.set(null)} /></Suspense>
}
