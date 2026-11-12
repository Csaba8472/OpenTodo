// The live stream for the shared sync (OpenSpec change native-app-foundation, design
// D6). sync.ts listens for wake-ups through `EventSource`, which React Native does not
// have: this one reads the server's event stream over expo/fetch, whose body arrives as
// it is written, with the session's token.
//
// On a phone the stream follows the app: when the app leaves the front it sends what
// is waiting in the outbox, then closes the stream; when it comes back the stream opens
// again and says so (`onopen`), and sync pulls at once. A stream that ends or fails
// while the app is in front is an error, as in a browser, and sync reconnects with backoff.

type Listener = (event: { type: string; data: string }) => void

export interface LiveHost {
  /** The session's fetch over a transport that streams the body. */
  fetch: typeof fetch
  active(): boolean
  onActive(fn: (active: boolean) => void): () => void
}

/** What runs before the stream closes in the background: the outbox goes first. */
let drain: () => Promise<void> = async () => undefined

export function setDrain(fn: () => Promise<void>): void {
  drain = fn
}

export function liveEventSource(host: LiveHost) {
  return class AppEventSource {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSED = 2
    readonly CONNECTING = 0
    readonly OPEN = 1
    readonly CLOSED = 2

    readyState = 0
    onopen: (() => void) | null = null
    onerror: (() => void) | null = null
    onmessage: Listener | null = null

    private readonly listeners = new Map<string, Set<Listener>>()
    private abort: AbortController | null = null
    private readonly offActive: () => void

    constructor(readonly url: string) {
      this.offActive = host.onActive((active) => {
        if (active) this.connect()
        else void drain().catch(() => undefined).then(() => { if (!host.active()) this.pause() })
      })
      if (host.active()) this.connect()
    }

    addEventListener(type: string, fn: Listener): void {
      let set = this.listeners.get(type)
      if (!set) this.listeners.set(type, (set = new Set()))
      set.add(fn)
    }

    removeEventListener(type: string, fn: Listener): void {
      this.listeners.get(type)?.delete(fn)
    }

    close(): void {
      this.readyState = 2
      this.offActive()
      this.abort?.abort()
      this.abort = null
    }

    /** In the background: closed without an error, opened again in front. */
    private pause(): void {
      if (this.readyState === 2) return
      this.abort?.abort()
      this.abort = null
      this.readyState = 0
    }

    private connect(): void {
      if (this.readyState === 2 || this.abort) return
      const abort = new AbortController()
      this.abort = abort
      void this.read(abort).catch(() => this.fail(abort))
    }

    private fail(abort: AbortController): void {
      // A pause or a close aborted it on purpose.
      if (abort.signal.aborted || this.abort !== abort) return
      this.abort = null
      this.readyState = 0
      this.onerror?.()
    }

    private async read(abort: AbortController): Promise<void> {
      const res = await host.fetch(this.url, { headers: { Accept: 'text/event-stream' }, signal: abort.signal })
      if (!res.ok || !res.body) throw new Error(`live stream: ${res.status}`)
      if (this.abort !== abort) return
      this.readyState = 1
      this.onopen?.()
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      const parse = eventParser((type, data) => this.dispatch(type, data))
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        parse(decoder.decode(value, { stream: true }))
      }
      throw new Error('live stream: ended')
    }

    private dispatch(type: string, data: string): void {
      if (this.readyState !== 1) return
      const event = { type, data }
      if (type === 'message') this.onmessage?.(event)
      for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event)
    }
  }
}

/**
 * The event stream format (HTML's "server-sent events"): `event:` and `data:` lines, a
 * blank line ends an event, a line starting with `:` is a comment (the server's ping).
 * Takes text in pieces of any size.
 */
export function eventParser(emit: (type: string, data: string) => void): (chunk: string) => void {
  let buffer = ''
  let type = ''
  let data: string[] = []
  return (chunk) => {
    buffer += chunk
    let i: number
    while ((i = buffer.search(/\r\n|\r|\n/)) >= 0) {
      // A CR at the end may be the first half of a CRLF still on its way.
      if (i === buffer.length - 1 && buffer[i] === '\r') break
      const line = buffer.slice(0, i)
      buffer = buffer.slice(i + (buffer.startsWith('\r\n', i) ? 2 : 1))
      if (line === '') {
        if (data.length) emit(type || 'message', data.join('\n'))
        type = ''
        data = []
        continue
      }
      if (line.startsWith(':')) continue
      const colon = line.indexOf(':')
      const field = colon < 0 ? line : line.slice(0, colon)
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
      if (field === 'event') type = value
      else if (field === 'data') data.push(value)
    }
  }
}
