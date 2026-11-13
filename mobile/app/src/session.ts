// App sign-in and the app's session (OpenSpec change native-app-foundation, design D5):
// an authorization code with PKCE through the system's authentication sheet, then an
// access token (one hour) and a refresh token that rotates on every use. The tokens
// live in the Keychain or Keystore (the vault), never in MMKV.
//
// The shared library asks for relative paths (`/api/v1/sync`) with the browser's
// cookies. In the app, `fetch` is this session's: a relative path goes to the signed-in
// server with the access token, refreshed before it expires and once more on a 401. A
// request to any other address goes out as it is, without the token.

/** Where the server sends the authentication sheet back to (`scheme` in app.config.ts). */
export const REDIRECT = 'opentodo://signed-in'

/** Refresh this long before the access token expires, so a request never carries a stale one. */
const REFRESH_EARLY_MS = 60_000

export interface Tokens {
  server: string
  access: string
  refresh: string
  /** Unix milliseconds. */
  expiresAt: number
}

/** The secure store for one value (expo-secure-store on the phone; tests pass a map). */
export interface Vault {
  get(key: string): Promise<string | null>
  set(key: string, value: string | null): Promise<void>
}

const TOKENS = 'opentodo.session'
/** A sign-out that could not reach the server: its refresh token, sent on the next connection. */
const PENDING_SIGN_OUT = 'opentodo.sign-out'

export type SignInProblem = 'cancelled' | 'failed' | 'demo'

export class SignInError extends Error {
  constructor(readonly problem: SignInProblem) {
    super(problem)
    this.name = 'SignInError'
  }
}

/**
 * Expo's fetch, installed as the global one, reports a request that got no answer as a
 * plain Error ("fetch failed: …"); a browser throws a TypeError, which the shared code
 * and this file read as "offline". This makes the phone's transports say it the same way.
 */
export function browserErrors(transport: typeof fetch): typeof fetch {
  return async (input, init) => {
    try {
      return await transport(input, init)
    } catch (err) {
      if (err instanceof TypeError || (err instanceof Error && err.name === 'AbortError')) throw err
      throw new TypeError(err instanceof Error ? err.message : String(err), { cause: err })
    }
  }
}

function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function random(n: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(n)))
}

export interface SignInRequest {
  url: string
  verifier: string
  state: string
}

/** The sign-in page to open in the sheet, with a new verifier and state (RFC 7636, S256). */
export async function signInRequest(server: string, device: string): Promise<SignInRequest> {
  const verifier = random(32)
  const state = random(16)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const q = new URLSearchParams({ code_challenge: base64url(new Uint8Array(digest)), code_challenge_method: 'S256', state, device })
  return { url: `${server}/app/sign-in?${q}`, verifier, state }
}

/** A query string's values; React Native's URL reads only http(s) addresses, so not through it. */
function queryOf(s: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const pair of s.split('&')) {
    if (!pair) continue
    const eq = pair.indexOf('=')
    const decode = (v: string) => { try { return decodeURIComponent(v.replace(/\+/g, ' ')) } catch { return '' } }
    const key = decode(eq < 0 ? pair : pair.slice(0, eq))
    if (!values.has(key)) values.set(key, eq < 0 ? '' : decode(pair.slice(eq + 1)))
  }
  return values
}

/** The code from the sheet's redirect; a cancel, another state or a stray URL is refused. */
export function codeFrom(redirect: string, state: string): string {
  const q = redirect.indexOf('?')
  if (q < 0 || redirect.slice(0, q) !== REDIRECT) throw new SignInError('failed')
  const params = queryOf(redirect.slice(q + 1).split('#')[0])
  if (params.get('state') !== state) throw new SignInError('failed')
  if (params.get('error') === 'access_denied') throw new SignInError('cancelled')
  const code = params.get('code')
  if (!code) throw new SignInError('failed')
  return code
}

interface TokenAnswer {
  access_token: string
  refresh_token: string
  expires_in: number
}

class RefreshRefused extends Error {}

/** POST /api/v1/app/token; a refused grant is RefreshRefused, no answer is fetch's own error. */
async function token(fetchFn: typeof fetch, server: string, body: Record<string, string>, now: number): Promise<Tokens> {
  const res = await fetchFn(`${server}/api/v1/app/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const code = await res.json().then((b: { error?: { code?: string } }) => b?.error?.code, () => undefined)
    if (code === 'demo_restricted') throw new SignInError('demo')
    if (code === 'invalid_grant') throw new RefreshRefused()
    throw new SignInError('failed')
  }
  const t = (await res.json()) as TokenAnswer
  return { server, access: t.access_token, refresh: t.refresh_token, expiresAt: now + t.expires_in * 1000 }
}

export interface SessionOptions {
  vault: Vault
  /** The runtime's fetch; the session's own requests and every request that is not to the server go through it. */
  fetch: typeof fetch
  now?: () => number
}

export class Session {
  private tokens: Tokens | null = null
  private refreshing: Promise<Tokens | null> | null = null
  private readonly listeners = new Set<() => void>()
  private readonly vault: Vault
  private readonly raw: typeof fetch
  private readonly now: () => number

  constructor(opts: SessionOptions) {
    this.vault = opts.vault
    this.raw = browserErrors(opts.fetch)
    this.now = opts.now ?? Date.now
  }

  /** Reads the stored tokens; the signed-in server, or null. */
  async load(): Promise<string | null> {
    const s = await this.vault.get(TOKENS)
    try {
      this.tokens = s ? (JSON.parse(s) as Tokens) : null
    } catch {
      this.tokens = null
    }
    return this.tokens?.server ?? null
  }

  get server(): string | null {
    return this.tokens?.server ?? null
  }

  /** Called when the server ended the session (revoked, signed out everywhere, a reused refresh token). */
  onSignedOut(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  /** Exchanges the sheet's code for the session's first tokens. */
  async complete(server: string, code: string, request: SignInRequest): Promise<void> {
    let t: Tokens
    try {
      t = await token(this.raw, server, { grant_type: 'authorization_code', code, code_verifier: request.verifier, state: request.state }, this.now())
    } catch (err) {
      throw err instanceof SignInError ? err : new SignInError('failed')
    }
    await this.save(t)
  }

  /** The app's fetch (see the file comment). */
  readonly fetch: typeof fetch = (input, init) => this.send(this.raw, input, init)

  /** The same, over another transport: the live stream's, which can read a body as it arrives. */
  fetchWith(transport: typeof fetch): typeof fetch {
    const t = browserErrors(transport)
    return (input, init) => this.send(t, input, init)
  }

  private async send(transport: typeof fetch, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = this.target(input)
    if (!url) return transport(input, init)
    let t = this.tokens
    if (t && t.expiresAt - this.now() < REFRESH_EARLY_MS) t = await this.refresh(t)
    if (!t) return transport(url, init)
    const res = await transport(url, this.authorized(init, t.access))
    if (res.status !== 401) return res
    const next = await this.refresh(t)
    return next ? transport(url, this.authorized(init, next.access)) : res
  }

  /**
   * Signs out: the server ends the grant now, or on the next connection when it cannot
   * be reached (`retrySignOut`). The tokens are gone from the phone either way.
   */
  async signOut(): Promise<void> {
    const t = this.tokens
    // Gone from memory at once; the server is told before the vault is cleared, so a
    // vault that fails (the Keychain without its entitlement) never keeps the grant alive.
    this.tokens = null
    if (t) {
      try {
        const res = await this.raw(`${t.server}/api/v1/app/sign-out`, this.authorized({ method: 'POST' }, t.access))
        if (res.status === 401) await this.endWithRefresh(t.server, t.refresh)
      } catch {
        await this.vault.set(PENDING_SIGN_OUT, JSON.stringify({ server: t.server, refresh: t.refresh }))
      }
    }
    await this.save(null)
  }

  /** Sends a sign-out that could not reach the server before; at launch and when back online. */
  async retrySignOut(): Promise<void> {
    const s = await this.vault.get(PENDING_SIGN_OUT)
    if (!s) return
    try {
      const { server, refresh } = JSON.parse(s) as { server: string; refresh: string }
      await this.endWithRefresh(server, refresh)
    } catch (err) {
      if (err instanceof TypeError) return // still offline: keep it for the next connection
    }
    await this.vault.set(PENDING_SIGN_OUT, null)
  }

  /** A grant whose access token has expired: refresh once, then end it with the new token. */
  private async endWithRefresh(server: string, refresh: string): Promise<void> {
    let t: Tokens
    try {
      t = await token(this.raw, server, { grant_type: 'refresh_token', refresh_token: refresh }, this.now())
    } catch (err) {
      if (err instanceof RefreshRefused || err instanceof SignInError) return // already ended
      throw err
    }
    await this.raw(`${server}/api/v1/app/sign-out`, this.authorized({ method: 'POST' }, t.access))
  }

  /** The absolute URL of a request to the signed-in server, or null for anything else. */
  private target(input: RequestInfo | URL): string | null {
    const t = this.tokens
    if (!t) return null
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (href.startsWith('/')) return `${t.server}${href}`
    return href === t.server || href.startsWith(`${t.server}/`) ? href : null
  }

  private authorized(init: RequestInit | undefined, access: string): RequestInit {
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${access}`)
    // The app has no cookies for the server; a session cookie must never stand in for the token.
    return { ...init, headers, credentials: 'omit' }
  }

  /**
   * One refresh at a time: requests that find the token stale wait for the same one,
   * because a refresh token sent twice revokes the whole grant. The new pair is stored
   * before it is used. A refused grant signs out; no answer keeps the tokens.
   */
  private refresh(stale: Tokens): Promise<Tokens | null> {
    if (this.tokens !== stale) return Promise.resolve(this.tokens)
    this.refreshing ??= (async () => {
      try {
        const t = await token(this.raw, stale.server, { grant_type: 'refresh_token', refresh_token: stale.refresh }, this.now())
        await this.save(t)
        return t
      } catch (err) {
        // The token route failed without refusing (a 5xx, a proxy page): no answer, as for the network.
        if (err instanceof SignInError) throw new TypeError('the token refresh failed')
        if (!(err instanceof RefreshRefused)) throw err
        await this.save(null)
        for (const fn of [...this.listeners]) fn()
        return null
      } finally {
        this.refreshing = null
      }
    })()
    return this.refreshing
  }

  private async save(t: Tokens | null): Promise<void> {
    this.tokens = t
    await this.vault.set(TOKENS, t ? JSON.stringify(t) : null)
  }
}
