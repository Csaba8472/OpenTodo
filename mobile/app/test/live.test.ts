// The app's live stream (design D6; native-app "Sync in the app").
import { eventParser, liveEventSource, setDrain, type LiveHost } from '../src/live'

describe('eventParser', () => {
  function parse(chunks: string[]) {
    const events: [string, string][] = []
    const feed = eventParser((type, data) => events.push([type, data]))
    for (const c of chunks) feed(c)
    return events
  }

  it('reads the server stream: a comment, named events, data on several lines', () => {
    expect(parse([': connected\n\nevent: ops\ndata: {"cursor":4}\n\n: ping\n\nevent: calendar\ndata: {}\n\ndata: a\ndata: b\n\n'])).toEqual([
      ['ops', '{"cursor":4}'],
      ['calendar', '{}'],
      ['message', 'a\nb'],
    ])
  })

  it('takes pieces split anywhere, CRLF split between two of them included', () => {
    const text = 'event: ops\r\ndata: {"cursor":12}\r\n\r\n'
    for (let at = 1; at < text.length; at++) {
      expect(parse([text.slice(0, at), text.slice(at)])).toEqual([['ops', '{"cursor":12}']])
    }
  })

  it('drops an event without data', () => {
    expect(parse(['event: ops\n\n'])).toEqual([])
  })
})

/** A stream body the test writes into, chunk by chunk. */
function controlledBody() {
  const queue: Uint8Array[] = []
  let waiting: ((r: ReadableStreamReadResult<Uint8Array>) => void) | null = null
  let ended = false
  const enc = new TextEncoder()
  return {
    write(s: string) {
      const v = enc.encode(s)
      if (waiting) { waiting({ done: false, value: v }); waiting = null } else queue.push(v)
    },
    end() {
      ended = true
      waiting?.({ done: true, value: undefined })
    },
    body: {
      getReader: () => ({
        read: () => new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) => {
          const v = queue.shift()
          if (v) resolve({ done: false, value: v })
          else if (ended) resolve({ done: true, value: undefined })
          else waiting = resolve
        }),
      }),
    },
  }
}

function fakeHost() {
  let active = true
  const listeners = new Set<(a: boolean) => void>()
  const streams: { url: string; signal: AbortSignal; stream: ReturnType<typeof controlledBody> }[] = []
  const host: LiveHost = {
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const stream = controlledBody()
      streams.push({ url: String(input), signal: init!.signal!, stream })
      return { ok: true, status: 200, body: stream.body } as unknown as Response
    }) as typeof fetch,
    active: () => active,
    onActive(fn) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
  }
  const setActive = (a: boolean) => { active = a; for (const fn of [...listeners]) fn(a) }
  return { host, streams, setActive }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('the app EventSource', () => {
  afterEach(() => setDrain(async () => undefined))

  it('opens, dispatches named events and reports an ended stream as an error', async () => {
    const { host, streams } = fakeHost()
    const ES = liveEventSource(host)
    const es = new ES('/api/v1/sync/events?device=d1')
    const opened = jest.fn()
    const failed = jest.fn()
    const ops = jest.fn()
    es.onopen = opened
    es.onerror = failed
    es.addEventListener('ops', (e) => ops(e.data))
    await tick()
    expect(streams[0].url).toBe('/api/v1/sync/events?device=d1')
    expect(opened).toHaveBeenCalledTimes(1)
    expect(es.readyState).toBe(1)

    streams[0].stream.write(': connected\n\nevent: ops\ndata: {"cursor":7}\n\n')
    await tick()
    expect(ops).toHaveBeenCalledWith('{"cursor":7}')

    streams[0].stream.end()
    await tick()
    expect(failed).toHaveBeenCalledTimes(1)
  })

  it('drains the outbox, then closes in the background without an error, and opens again in front', async () => {
    const { host, streams, setActive } = fakeHost()
    const order: string[] = []
    setDrain(async () => { order.push('drain') })
    const ES = liveEventSource(host)
    const es = new ES('/api/v1/sync/events')
    const failed = jest.fn()
    const opened = jest.fn(() => order.push('open'))
    es.onerror = failed
    es.onopen = opened
    await tick()

    setActive(false)
    await tick()
    expect(order).toEqual(['open', 'drain'])
    expect(streams[0].signal.aborted).toBe(true)
    expect(failed).not.toHaveBeenCalled()

    setActive(true)
    await tick()
    expect(streams).toHaveLength(2)
    expect(order).toEqual(['open', 'drain', 'open'])
    expect(es.readyState).toBe(1)
  })

  it('stays open when the app is back in front before the outbox drained', async () => {
    const { host, streams, setActive } = fakeHost()
    let finish = () => undefined as void
    setDrain(() => new Promise<void>((r) => { finish = r }))
    const es = new (liveEventSource(host))('/api/v1/sync/events')
    await tick()
    setActive(false)
    setActive(true)
    finish()
    await tick()
    expect(streams).toHaveLength(1)
    expect(streams[0].signal.aborted).toBe(false)
    es.close()
    expect(streams[0].signal.aborted).toBe(true)
  })

  it('waits for the front when it is created in the background', async () => {
    const { host, streams, setActive } = fakeHost()
    setActive(false)
    new (liveEventSource(host))('/api/v1/sync/events')
    await tick()
    expect(streams).toHaveLength(0)
    setActive(true)
    await tick()
    expect(streams).toHaveLength(1)
  })
})
