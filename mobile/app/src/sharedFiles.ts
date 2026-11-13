// Files shared into the app (native-app-handover, "Share into the app"): each becomes an
// attachment of the share's task. The row is written with mutate() at once, as the web's
// planFiles writes it, so the task lists the file offline; the bytes stay in the app's
// own storage until an upload succeeds (at the share, on coming to the front and at each
// background refresh). The app cannot encrypt a file yet (React Native's Blob gives no
// bytes to JavaScript), so on an encrypted account, or when the server takes no files,
// the task's notes name the files instead.
import { cleanName, limits } from '@shared/attachments'
import { getMeta, setMeta } from '@shared/db'
import { encryptionSnapshot } from '@shared/e2ee'
import { uuid } from '@shared/ids'
import { mutateMany, type Change } from '@shared/ops'
import { currentUserId } from '@shared/sharing'
import { container, type QueuedShare } from '../modules/opentodo-shared-container'
import { session } from './appSession'

type SharedFile = QueuedShare['files'][number]

const META_UPLOADS = 'device:pendingUploads'

interface PendingUpload {
  id: string
  path: string
}

/** Whether shared files can become attachments here, and why not otherwise. */
export async function attachable(): Promise<boolean> {
  if (encryptionSnapshot().enabled) return false
  const l = await limits()
  return !l || l.enabled
}

/** The line a task's notes get for files that could not be attached. */
export function fileNames(files: readonly SharedFile[]): string {
  return files.map((f) => `- ${f.name}`).join('\n')
}

/** Writes an attachment row per file and uploads them; files over the server's limit are left out. */
export async function attachShared(taskId: string, files: readonly SharedFile[], now = Date.now()): Promise<void> {
  // A row without its author is refused by the server, and holds up the outbox behind it.
  const author = await currentUserId()
  if (!author) return
  const l = await limits()
  const changes: Change[] = []
  const pending = await getMeta<PendingUpload[]>(META_UPLOADS, [])
  for (const [i, f] of files.entries()) {
    if (l && f.size > l.max_file_bytes) continue
    const sha256 = await container.fileSha256(f.path)
    if (!sha256) continue
    const id = uuid()
    changes.push({ entity: 'attachment', entityId: id, patch: {
      task_id: taskId, author_id: author, comment_id: null, name: cleanName(f.name), mime: f.type || 'application/octet-stream',
      size: f.size, sha256, url: null, encrypted: false, created_at: now + i, uploaded_at: null, deleted_at: null,
    } })
    pending.push({ id, path: f.path })
  }
  if (!changes.length) return
  await mutateMany(changes)
  await setMeta(META_UPLOADS, pending)
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

const transport: typeof fetch = async (input, init) => {
  const headers: Record<string, string> = {}
  new Headers(init?.headers).forEach((v, k) => { headers[k] = v })
  const res = await xhr('PUT', String(input), { body: init?.body as Blob, headers })
  return new Response(null, { status: res.status })
}

/** Sends every file still waiting; a refused file (too large, gone) is dropped. */
export async function uploadPending(): Promise<number> {
  const pending = await getMeta<PendingUpload[]>(META_UPLOADS, [])
  if (!pending.length || !session.server) return 0
  const left: PendingUpload[] = []
  let sent = 0
  for (const p of pending) {
    const file = await xhr('GET', `file://${p.path}`, { blob: true }).catch(() => null)
    // A file that is gone cannot be sent: the row stays without its bytes, as on the web.
    if (!file?.blob || file.status >= 400) continue
    try {
      const res = await session.fetchWith(transport)(`${session.server}/api/v1/attachments/${encodeURIComponent(p.id)}/content`, {
        method: 'PUT', body: file.blob, headers: { 'Content-Type': 'application/octet-stream' },
      })
      if (res.status >= 500 || res.status === 401 || res.status === 404) { left.push(p); continue }
      if (res.ok) sent++
      container.removeFile(p.path)
    } catch {
      // Offline: try again later.
      left.push(p)
    }
  }
  await setMeta(META_UPLOADS, left)
  return sent
}
