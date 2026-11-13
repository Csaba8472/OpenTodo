// App sign-in's token logic (OpenSpec change native-app-foundation, design D5; specs
// account-access "App sign-in through the system browser" and "App sessions").
import { browserErrors, codeFrom, REDIRECT, Session, SignInError, signInRequest, type Vault } from '../src/session'

const SERVER = 'https://todo.example.com'

function memoryVault(): Vault & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    get: async (k) => values.get(k) ?? null,
    set: async (k, v) => { if (v === null) values.delete(k); else values.set(k, v) },
  }
}

interface Call { url: string; method: string; auth: string | null; credentials?: RequestCredentials; body?: Record<string, string> }

/** A fake server: the token route rotates refresh tokens; `routes` answers the rest. */
function fakeServer(routes: Record<string, (call: Call) => Response> = {}) {
  const calls: Call[] = []
  let n = 0
  const valid = new Set<string>()
  const state = { offline: false, refreshRefused: false, tokenStatus: 200 }
  const issue = () => {
    n++
    valid.add(`refresh-${n}`)
    return new Response(JSON.stringify({ access_token: `access-${n}`, token_type: 'Bearer', expires_in: 3600, refresh_token: `refresh-${n}`, scope: 'app' }))
  }
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, string>) : undefined
    const call: Call = { url, method: init?.method ?? 'GET', auth: new Headers(init?.headers).get('Authorization'), credentials: init?.credentials, body }
    calls.push(call)
    if (state.offline) throw new TypeError('Network request failed')
    if (url === `${SERVER}/api/v1/app/token` && body) {
      if (state.tokenStatus !== 200) return new Response('<html>bad gateway</html>', { status: state.tokenStatus })
      if (body.grant_type === 'authorization_code') {
        return body.code === 'good' ? issue() : new Response(JSON.stringify({ error: { code: 'invalid_grant', message: 'no' } }), { status: 400 })
      }
      if (state.refreshRefused || !valid.delete(body.refresh_token)) {
        return new Response(JSON.stringify({ error: { code: 'invalid_grant', message: 'no' } }), { status: 400 })
      }
      return issue()
    }
    const route = routes[url.replace(SERVER, '')]
    return route ? route(call) : new Response('{}', { status: 200 })
  }) as typeof fetch
  return { calls, fetchFn, state }
}

async function signedIn(server = fakeServer(), now = () => 1_000_000) {
  const vault = memoryVault()
  const session = new Session({ vault, fetch: server.fetchFn, now })
  const request = await signInRequest(SERVER, 'iPhone')
  await session.complete(SERVER, 'good', request)
  server.calls.length = 0
  return { session, vault, server }
}

describe('signInRequest', () => {
  it('opens /app/sign-in with an S256 challenge of a fresh verifier, a state and the device', async () => {
    const r = await signInRequest(SERVER, 'iPhone')
    const u = new URL(r.url)
    expect(`${u.origin}${u.pathname}`).toBe(`${SERVER}/app/sign-in`)
    expect(r.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(r.verifier))
    const want = Buffer.from(digest).toString('base64url')
    expect(u.searchParams.get('code_challenge')).toBe(want)
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(u.searchParams.get('state')).toBe(r.state)
    expect(u.searchParams.get('device')).toBe('iPhone')
    expect((await signInRequest(SERVER, 'iPhone')).verifier).not.toBe(r.verifier)
  })
})

describe('codeFrom', () => {
  it('reads the code of a redirect with the same state', () => {
    expect(codeFrom(`${REDIRECT}?code=abc&state=s1`, 's1')).toBe('abc')
    expect(codeFrom(`${REDIRECT}?state=s%2B1&code=a%3Db%3D`, 's+1')).toBe('a=b=')
    expect(codeFrom(`${REDIRECT}?code=a=b&state=s1#x`, 's1')).toBe('a=b')
  })

  it.each([
    ['another state', `${REDIRECT}?code=abc&state=s2`, 'failed'],
    ['no code', `${REDIRECT}?state=s1`, 'failed'],
    ['another address', `opentodo://elsewhere?code=abc&state=s1`, 'failed'],
    ['the address with more after it', `${REDIRECT}/x?code=abc&state=s1`, 'failed'],
    ['not a URL', 'nonsense', 'failed'],
    ['Cancel on the confirmation', `${REDIRECT}?error=access_denied&state=s1`, 'cancelled'],
  ])('refuses %s', (_name, url, problem) => {
    expect(() => codeFrom(url, 's1')).toThrow(new SignInError(problem as 'failed'))
  })
})

describe('Session', () => {
  it('exchanges the code with the verifier and the state, and keeps the tokens in the vault', async () => {
    const server = fakeServer()
    const vault = memoryVault()
    const session = new Session({ vault, fetch: server.fetchFn, now: () => 0 })
    const request = await signInRequest(SERVER, 'iPhone')
    await session.complete(SERVER, 'good', request)
    expect(server.calls[0].body).toEqual({ grant_type: 'authorization_code', code: 'good', code_verifier: request.verifier, state: request.state })
    expect(JSON.parse(vault.values.get('opentodo.session')!)).toEqual({ server: SERVER, access: 'access-1', refresh: 'refresh-1', expiresAt: 3_600_000 })

    const again = new Session({ vault, fetch: server.fetchFn })
    expect(await again.load()).toBe(SERVER)
  })

  it.each([
    ['a refused code', 'bad', undefined, 'failed'],
    ['a demo instance', 'good', 403, 'demo'],
  ])('reports %s', async (_name, code, status, problem) => {
    const routes = {}
    const server = fakeServer(routes)
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) =>
      status ? new Response(JSON.stringify({ error: { code: 'demo_restricted', message: 'demo' } }), { status }) : server.fetchFn(input, init)) as typeof fetch
    const session = new Session({ vault: memoryVault(), fetch: fetchFn })
    await expect(session.complete(SERVER, code, await signInRequest(SERVER, 'iPhone'))).rejects.toThrow(new SignInError(problem as 'failed'))
    expect(session.server).toBeNull()
  })

  it('sends a relative path to the server with the token and no cookies', async () => {
    const { session, server } = await signedIn()
    await session.fetch('/api/v1/sync', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect(server.calls).toEqual([{ url: `${SERVER}/api/v1/sync`, method: 'POST', auth: 'Bearer access-1', credentials: 'omit', body: {} }])
  })

  it('never sends the token to another address, and sends nothing of its own before sign-in', async () => {
    const { session, server } = await signedIn()
    await session.fetch('https://maps.example.org/tiles/1')
    await session.fetch('https://todo.example.com.evil.org/api/v1/me')
    expect(server.calls.map((c) => c.auth)).toEqual([null, null])

    const signedOut = new Session({ vault: memoryVault(), fetch: server.fetchFn })
    server.calls.length = 0
    await signedOut.fetch(`${SERVER}/api/v1/health`)
    expect(server.calls).toEqual([expect.objectContaining({ url: `${SERVER}/api/v1/health`, auth: null })])
  })

  it('refreshes a token about to expire before the request, and stores the new pair', async () => {
    let now = 1_000_000
    const { session, server, vault } = await signedIn(fakeServer(), () => now)
    now += 3_600_000 - 30_000
    await session.fetch('/api/v1/me')
    expect(server.calls.map((c) => [c.url.replace(SERVER, ''), c.body?.refresh_token ?? c.auth])).toEqual([
      ['/api/v1/app/token', 'refresh-1'],
      ['/api/v1/me', 'Bearer access-2'],
    ])
    expect(JSON.parse(vault.values.get('opentodo.session')!).refresh).toBe('refresh-2')
  })

  it('refreshes once on a 401 and sends the request again', async () => {
    let rejected = false
    const server = fakeServer({ '/api/v1/me': (c) => (c.auth === 'Bearer access-1' ? ((rejected = true), new Response('{}', { status: 401 })) : new Response('{"user":{}}')) })
    const { session } = await signedIn(server)
    const res = await session.fetch('/api/v1/me')
    expect(rejected).toBe(true)
    expect(res.status).toBe(200)
    expect(server.calls.map((c) => c.auth ?? c.body?.grant_type)).toEqual(['Bearer access-1', 'refresh_token', 'Bearer access-2'])
  })

  it('sends a refresh token once when several requests find the token stale', async () => {
    let now = 1_000_000
    const { session, server } = await signedIn(fakeServer(), () => now)
    now += 3_600_000
    await Promise.all([session.fetch('/api/v1/a'), session.fetch('/api/v1/b'), session.fetch('/api/v1/c')])
    expect(server.calls.filter((c) => c.url.endsWith('/app/token'))).toHaveLength(1)
    expect(server.calls.filter((c) => c.auth === 'Bearer access-2')).toHaveLength(3)
  })

  it('signs out when the server refuses the refresh token (revoked, or reused)', async () => {
    const server = fakeServer({ '/api/v1/me': () => new Response('{}', { status: 401 }) })
    const { session, vault } = await signedIn(server)
    server.state.refreshRefused = true
    const ended = jest.fn()
    session.onSignedOut(ended)
    const res = await session.fetch('/api/v1/me')
    expect(res.status).toBe(401)
    expect(ended).toHaveBeenCalledTimes(1)
    expect(session.server).toBeNull()
    expect(vault.values.has('opentodo.session')).toBe(false)
  })

  it.each([
    ['no answer', (s: ReturnType<typeof fakeServer>) => { s.state.offline = true }],
    ['a failing token route', (s: ReturnType<typeof fakeServer>) => { s.state.tokenStatus = 502 }],
  ])('keeps the tokens when a refresh gets %s', async (_name, breakIt) => {
    let now = 1_000_000
    const { session, server, vault } = await signedIn(fakeServer(), () => now)
    now += 3_600_000
    breakIt(server)
    await expect(session.fetch('/api/v1/me')).rejects.toBeInstanceOf(TypeError)
    expect(session.server).toBe(SERVER)
    expect(JSON.parse(vault.values.get('opentodo.session')!).refresh).toBe('refresh-1')
  })

  it('does not restore a grant when an in-flight refresh finishes after sign-out', async () => {
    let now = 1_000_000
    const server = fakeServer()
    let finish!: (response: Response) => void
    let started!: () => void
    const waiting = new Promise<void>((resolve) => { started = resolve })
    const vault = memoryVault()
    const raw: typeof fetch = async (input, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, string>
      if (body.grant_type === 'refresh_token') { started(); return new Promise((resolve) => { finish = resolve }) }
      return server.fetchFn(input, init)
    }
    const session = new Session({ vault, fetch: raw, now: () => now })
    await session.complete(SERVER, 'good', await signInRequest(SERVER, 'iPhone'))
    now += 3_600_000
    const request = session.fetch('/api/v1/me')
    await waiting
    await session.signOut()
    finish(new Response(JSON.stringify({ access_token: 'late-access', refresh_token: 'late-refresh', expires_in: 3600 })))
    await request
    expect(session.server).toBeNull()
    expect(vault.values.has('opentodo.session')).toBe(false)
    expect(server.calls.some((c) => c.auth === 'Bearer late-access')).toBe(false)
  })

  it('ends the grant on the server at sign-out', async () => {
    const { session, server, vault } = await signedIn()
    await session.signOut()
    expect(server.calls).toEqual([expect.objectContaining({ url: `${SERVER}/api/v1/app/sign-out`, method: 'POST', auth: 'Bearer access-1' })])
    expect(vault.values.size).toBe(0)
  })

  it('ends the grant on the server even when the vault cannot be written', async () => {
    const { session, server, vault } = await signedIn()
    vault.set = async () => { throw new Error('A required entitlement isn’t present.') }
    await expect(session.signOut()).rejects.toThrow('entitlement')
    expect(server.calls.map((c) => c.url)).toEqual([`${SERVER}/api/v1/app/sign-out`])
    expect(session.server).toBeNull()
  })

  it('ends the grant on the next connection after a sign-out offline', async () => {
    const { session, server, vault } = await signedIn()
    server.state.offline = true
    await session.signOut()
    expect(session.server).toBeNull()
    expect(vault.values.has('opentodo.session')).toBe(false)

    await session.retrySignOut() // still offline: kept
    expect(vault.values.has('opentodo.sign-out')).toBe(true)

    server.state.offline = false
    server.calls.length = 0
    await session.retrySignOut()
    expect(server.calls.map((c) => c.auth ?? c.body?.refresh_token)).toEqual(['refresh-1', 'Bearer access-2'])
    expect(server.calls[1].url).toBe(`${SERVER}/api/v1/app/sign-out`)
    expect(vault.values.size).toBe(0)
  })

  it('drops a pending sign-out whose grant the server already ended', async () => {
    const { session, server, vault } = await signedIn()
    server.state.offline = true
    await session.signOut()
    server.state.offline = false
    server.state.refreshRefused = true
    await session.retrySignOut()
    expect(vault.values.size).toBe(0)
  })

  it("reports Expo's network failure as a browser does, and passes an abort on", async () => {
    // Expo's global fetch throws a plain Error ("fetch failed: …") when nothing answers.
    const failing = browserErrors(async () => { throw new Error('fetch failed: java.io.IOException: unexpected end of stream') })
    await expect(failing('/x')).rejects.toBeInstanceOf(TypeError)
    const aborted = new Error('aborted')
    aborted.name = 'AbortError'
    await expect(browserErrors(async () => { throw aborted })('/x')).rejects.toBe(aborted)
  })
})
