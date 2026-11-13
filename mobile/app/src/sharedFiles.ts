// Files shared into the app (native-app-handover, "Share into the app"): each becomes an
// attachment of the share's task. The row is written with mutate() at once, as the web's
// planFiles writes it, so the task lists the file offline; the bytes stay in the app's
// own storage until an upload succeeds (at the share, on coming to the front and at each
// background refresh). Encrypted accounts use the shared OTAT1 envelope before the
// bytes reach the server; the originals are removed only after a successful upload.
import { cleanName, limits } from '@shared/attachments'
import { db, getMeta, setMeta } from '@shared/db'
import { currentKey, encryptionSnapshot } from '@shared/e2ee'
import { nameId } from '@shared/ids'
import { mutateMany, type Change } from '@shared/ops'
import { currentUserId } from '@shared/sharing'
import { container, type QueuedShare } from '../modules/opentodo-shared-container'
import { session } from './appSession'
import { accountWork } from './accountWork'
import { sealSharedFile } from './sharedFileCrypto'

type SharedFile = QueuedShare['files'][number]

const META_UPLOADS = 'device:pendingUploads'

interface PendingUpload {
  id: string
  path: string
  source?: string
}

/** Whether shared files can become attachments here, and why not otherwise. */
export async function attachable(): Promise<boolean> {
  const enc = encryptionSnapshot()
  if (enc.enabled && !enc.unlocked) return false
  const l = await limits()
  return !l || l.enabled
}

/** The line a task's notes get for files that could not be attached. */
export function fileNames(files: readonly SharedFile[]): string {
  return files.map((f) => `- ${f.name}`).join('\n')
}

/** Writes an attachment row per file and uploads them; a refused file stays queued for retry. */
export async function attachShared(taskId: string, files: readonly SharedFile[], now = Date.now()): Promise<void> {
  const check = accountWork()
  // A row without its author is refused by the server, and holds up the outbox behind it.
  const author = await currentUserId()
  check()
  if (!author) throw new Error('Sign in to add files.')
  const l = await limits()
  check()
  const key = encryptionSnapshot().enabled ? await currentKey() : undefined
  check()
  if (key === null) throw new Error('Unlock encryption to add files.')
  const changes: Change[] = []
  const pending = await getMeta<PendingUpload[]>(META_UPLOADS, [])
  check()
  for (const [i, f] of files.entries()) {
    const id = nameId('native-share-file', `${taskId}:${i}`)
    // The share keeps its id through a crash between saving its rows and acknowledging it.
    const existing = await db.attachments.get(id)
    check()
    if (existing) continue
    if (l && f.size > l.max_file_bytes) throw new Error('Shared file exceeds the server limit.')
    let stored = { path: f.path, size: f.size }
    if (key) {
      const file = await xhr('GET', `file://${f.path}`, { blob: true })
      check()
      if (!file.blob || file.status >= 400) throw new Error('Shared file cannot be read.')
      stored = await sealSharedFile(key, id, file.blob)
      check()
    }
    if (l && stored.size > l.max_file_bytes) {
      if (stored.path !== f.path) container.removeFile(stored.path)
      throw new Error('Encrypted shared file exceeds the server limit.')
    }
    const sha256 = await container.fileSha256(stored.path)
    check()
    if (!sha256) throw new Error('Shared file cannot be read.')
    changes.push({ entity: 'attachment', entityId: id, patch: {
      task_id: taskId, author_id: author, comment_id: null, name: cleanName(f.name), mime: f.type || 'application/octet-stream',
      size: stored.size, sha256, url: null, encrypted: !!key, created_at: now + i, uploaded_at: null, deleted_at: null,
    } })
    const prior = pending.findIndex((p) => p.id === id)
    if (prior >= 0) {
      const old = pending.splice(prior, 1)[0]
      if (old.path !== f.path) container.removeFile(old.path)
    }
    pending.push({ id, path: stored.path, source: f.path })
  }
  if (!changes.length) return
  // Keep the bytes reachable before publishing the rows. An interrupted write can retry;
  // an upload cannot start until the rows reach the server.
  check()
  await db.transaction('rw', db.meta, async () => {
    check()
    const ids = new Set(changes.map((c) => c.entityId))
    const live = await getMeta<PendingUpload[]>(META_UPLOADS, [])
    check()
    await setMeta(META_UPLOADS, [...live.filter((p) => !ids.has(p.id)), ...pending.filter((p) => ids.has(p.id))])
  })
  check()
  await mutateMany(changes)
  check()
  void uploadPending().catch(() => undefined)
}

/** A PUT of a file from the app's storage: XMLHttpRequest sends a file Blob, Expo's fetch does not. */
function xhr(method: 'GET' | 'PUT', url: string, opts: { body?: Blob; headers?: Record<string, string>; blob?: boolean } = {}): Promise<{ status: number; blob?: Blob }> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open(method, url)
    if (opts.blob) x.responseType = 'blob'
    for (const [k, v] of Object.entries(opts.headers ?? {})) x.setRequestHeader(k, v)
    x.onload = () => resolve({ status: x.status, blob: opts.blob ? (x.response as Blob) : undefined })
    x.onerror = () => reject(new TypeError('Network request failed'))
    x.send(opts.body ?? null)
  })
}

const transport = (check: () => void): typeof fetch => async (input, init) => {
  check()
  const headers: Record<string, string> = {}
  new Headers(init?.headers).forEach((v, k) => { headers[k] = v })
  const res = await xhr('PUT', String(input), { body: init?.body as Blob, headers })
  check()
  return new Response(null, { status: res.status })
}

/** Sends every file still waiting; failed uploads retain their original bytes for retry. */
let uploading: Promise<number> | null = null

export function uploadPending(): Promise<number> {
  uploading ??= sendPending().finally(() => { uploading = null })
  return uploading
}

async function sendPending(): Promise<number> {
  const check = accountWork()
  const server = session.server
  const pending = await getMeta<PendingUpload[]>(META_UPLOADS, [])
  check()
  if (!pending.length || !server) return 0
  const left: PendingUpload[] = []
  let sent = 0
  for (const p of pending) {
    const file = await xhr('GET', `file://${p.path}`, { blob: true }).catch(() => null)
    check()
    if (!file?.blob || file.status >= 400) { left.push(p); continue }
    try {
      const res = await session.fetchWith(transport(check))(`${server}/api/v1/attachments/${encodeURIComponent(p.id)}/content`, {
        method: 'PUT', body: file.blob, headers: { 'Content-Type': 'application/octet-stream' },
      })
      check()
      // The server committed the previous attempt but its response was lost.
      if (!res.ok && res.status !== 409) { left.push(p); continue }
      sent++
      container.removeFile(p.path)
      if (p.source && p.source !== p.path) container.removeFile(p.source)
    } catch {
      check()
      // Offline: try again later.
      left.push(p)
    }
  }
  check()
  await db.transaction('rw', db.meta, async () => {
    check()
    const attempted = new Map(pending.map((p) => [p.id, p.path]))
    const current = await getMeta<PendingUpload[]>(META_UPLOADS, [])
    check()
    const added = current.filter((p) => attempted.get(p.id) !== p.path)
    const changed = new Set(added.map((p) => p.id))
    await setMeta(META_UPLOADS, [...left.filter((p) => !changed.has(p.id)), ...added])
  })
  return sent
}
