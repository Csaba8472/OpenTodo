// The phone outside the app (OpenSpec change native-app-handover D1 to D3): the widget's
// Today snapshot and the reminders as local notifications, published a second after the
// last change that touches them (a local write or a sync's), and what the phone hands
// back: notification buttons pressed while the app was closed, and shares from other
// apps. A new in-app notification (a mention, an assignment) becomes a local
// notification while the app is not in front; the server cannot push to the app (D4).
import { db, getMeta, setMeta } from '@shared/db'
import { todaySnapshot, upcomingReminders } from '@shared/deviceSnapshot'
import { encryptionSnapshot, onEncryptionChange } from '@shared/e2ee'
import { completeTask, createTask } from '@shared/ops'
import { dismissReminder, snoozeReminder } from '@shared/reminders'
import { isEmptyShare, parseShare, proposedDescription, proposedOrigin, proposedTitle, titleFromFiles } from '@shared/share'
import { onSyncStatus, syncSnapshot } from '@shared/sync'
import type { AppNotification, AssignedPayload, MentionedPayload } from '@shared/types'
import { AppState, PermissionsAndroid, Platform } from 'react-native'
import { container, type QueuedShare } from '../modules/opentodo-shared-container'
import { attachable, attachShared, fileNames, uploadPending } from './sharedFiles'
import type { SqliteDatabase } from './storage/adapter'
import { t } from './ui/i18n'

/** The stores the widget and the reminders read (not meta: notifyNew writes there). */
const WATCHED = new Set(['tasks', 'reminders', 'userPrefs', 'memberships', 'notifications'])
const DEBOUNCE_MS = 1000
/** Up to here the in-app notifications were shown, or seen in the app. */
const META_NOTIFIED = 'device:notifiedUntil'
/** iOS keeps 64 pending notifications; the app keeps 60 of them (D3). */
export const REMINDER_WINDOW = 60

/** Publishes the widget's snapshot and the reminder schedule from the local store now. */
export async function publishDevice(now = Date.now()): Promise<void> {
  if (!container.available) return
  container.publishWidget(await todaySnapshot(now))
  // A locked account (every cold start of an encrypted one, every background run) keeps
  // the schedule it had: its notifications carry no titles, and it would empty otherwise.
  const enc = encryptionSnapshot()
  if (enc.enabled && !enc.unlocked) return
  // Titles stay on the phone (local notifications); an encrypted account's never show.
  container.scheduleReminders((await upcomingReminders(now, { titles: true })).slice(0, REMINDER_WINDOW))
}

/** Writes the notification buttons pressed since the last call as ops (Complete, Snooze 10 min). */
export async function applyQueuedActions(): Promise<number> {
  const actions = container.takeActions()
  for (const a of actions) {
    try {
      if (a.action === 'snooze') await snoozeReminder(a.id, '10m', a.at)
      else {
        const r = await db.reminders.get(a.id)
        const task = r ? await db.tasks.get(r.task_id) : undefined
        if (task && !task.deleted_at && !task.completed_at) await completeTask(task.id, { now: a.at })
        else if (r) await dismissReminder(a.id, a.at)
      }
    } catch {
      // A reminder this device no longer has: nothing to write.
    }
  }
  return actions.length
}

/** The task a share makes: the shared rules of the web's capture screen (share.ts). */
export function shareTask(share: QueuedShare): { title: string; description: string; origin: ReturnType<typeof proposedOrigin> } | null {
  const payload = parseShare(new URLSearchParams({ title: share.title, text: share.text, url: share.url }))
  if (isEmptyShare(payload) && share.files.length === 0) return null
  const title = (isEmptyShare(payload) ? '' : proposedTitle(payload)) || titleFromFiles(share.files) || t('Shared')
  return { title, description: proposedDescription(payload), origin: proposedOrigin(payload) }
}

/** Turns the shares that arrived since the last call into Inbox tasks, with their files. */
export async function applyQueuedShares(): Promise<string[]> {
  const ids: string[] = []
  const shares = container.takeShares()
  const files = shares.some((s) => s.files.length) && (await attachable())
  for (const share of shares) {
    const task = shareTask(share)
    if (!task) continue
    const named = share.files.length && !files ? fileNames(share.files) : ''
    const description = [task.description, named].filter(Boolean).join('\n\n')
    const id = await createTask({ title: task.title, description, origin: task.origin ?? undefined })
    if (share.files.length && files) await attachShared(id, share.files)
    else for (const f of share.files) container.removeFile(f.path)
    ids.push(id)
  }
  void uploadPending().catch(() => undefined)
  return ids
}

/** What a local notification says for an in-app notification, or null for kinds the phone leaves to the app. */
export function notificationText(n: AppNotification): { title: string; body: string; taskId?: string } | null {
  const plain = (s: string) => s.replace(/<\/?b\d?>/g, '')
  if (n.kind === 'mentioned') {
    const p = n.payload as MentionedPayload
    const v = { actor: p.actorName || t('Someone'), task: p.taskTitle || t('a task') }
    const line = p.source === 'note' ? t('<b>{actor}</b> mentioned you in the notes of <b2>{task}</b2>', v) : t('<b>{actor}</b> mentioned you on <b2>{task}</b2>', v)
    return { title: plain(line), body: p.excerpt ?? '', taskId: p.taskId }
  }
  if (n.kind === 'assigned') {
    const p = n.payload as AssignedPayload
    const line = p.turn
      ? t('It’s your turn: <b>{task}</b>', { task: p.taskTitle || t('a task') })
      : t('<b>{actor}</b> assigned you <b2>{task}</b2>', { actor: p.actorName || t('Someone'), task: p.taskTitle || t('a task') })
    return { title: plain(line), body: p.projectName ?? '', taskId: p.taskId }
  }
  return null
}

/**
 * Shows the unread in-app notifications that arrived since the last call, while the app is
 * not in front. The first call only marks where the phone starts, so signing in does not
 * replay the account's history.
 */
export async function notifyNew(inFront = AppState.currentState === 'active'): Promise<number> {
  const until = await getMeta<number | null>(META_NOTIFIED, null)
  const all = await db.notifications.toArray()
  const latest = all.reduce((m, n) => Math.max(m, n.createdAt), until ?? 0)
  if (until === null || inFront) {
    if (latest !== until) await setMeta(META_NOTIFIED, latest)
    return 0
  }
  let shown = 0
  for (const n of all.filter((x) => x.createdAt > until && x.readAt === null).sort((a, b) => a.createdAt - b.createdAt)) {
    const text = notificationText(n)
    if (text && container.notify({ id: n.id, ...text })) shown++
  }
  if (latest !== until) await setMeta(META_NOTIFIED, latest)
  return shown
}

/** Asks for the notification permission once (Android 13 and later; iOS asks in the module). */
export async function askNotifications(): Promise<void> {
  if (Platform.OS !== 'android' || Platform.Version < 33) return
  const asked = await getMeta<boolean>('device:notificationsAsked', false)
  if (asked) return
  await setMeta('device:notificationsAsked', true)
  await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS').catch(() => undefined)
  await publishDevice()
}

/**
 * Signed in: publishes on every change that touches Today or the reminders, drains what
 * the phone queued at start, on coming to the front and when a share arrives, and
 * schedules the background refresh. Returns the stop.
 */
export function startDevice(): () => void {
  if (!container.available) return () => {}
  let timer: ReturnType<typeof setTimeout> | null = null
  const publish = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void publishDevice().catch(() => undefined)
      void notifyNew().catch(() => undefined)
    }, DEBOUNCE_MS)
  }
  const drain = () => {
    void applyQueuedActions().catch(() => undefined)
    void applyQueuedShares().catch(() => undefined)
  }
  const offChange = (db as unknown as SqliteDatabase).onChange((changed) => {
    if ([...changed].some((s) => WATCHED.has(s))) publish()
  })
  const offEnc = onEncryptionChange(publish)
  // A shared file's bytes go once its row is on the server: after an exchange that sent it.
  let sending = false
  const offSync = onSyncStatus(() => {
    const s = syncSnapshot()
    if (s.state !== 'idle' || s.pending > 0 || sending) return
    sending = true
    void uploadPending().catch(() => undefined).finally(() => { sending = false })
  })
  const offShare = container.on('onShare', drain)
  const offAction = container.on('onAction', drain)
  const sub = AppState.addEventListener('change', (s) => { if (s === 'active') { drain(); publish() } })
  // The day turns over at the logical day start even when nothing changes.
  const tick = setInterval(publish, 15 * 60 * 1000)
  drain()
  publish()
  container.startRefresh()
  void askNotifications().catch(() => undefined)
  return () => { offChange(); offEnc(); offSync(); offShare(); offAction(); sub.remove(); clearInterval(tick); if (timer) clearTimeout(timer) }
}
