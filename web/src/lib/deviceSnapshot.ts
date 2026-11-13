// What a device shows outside the app (OpenSpec changes native-shells D4 and D6,
// native-app-handover D1 to D3): the next 7 days of reminders it schedules as local
// notifications, and the Today list its widget shows. The web app hands both to a
// web-view shell (shellPublish.ts); the native app writes them to the shared container
// itself. The JSON is the one the Swift and Kotlin widgets read.
import { localDueOf, logicalToday } from './dates'
import { todayAssigneeFilter, todayList, type TodayAssigneeFilter } from './dayLists'
import { db, getMeta } from './db'
import { encryptionSnapshot } from './e2ee'
import { currentUserId } from './sharing'
import type { Reminder, Task } from './types'

/** One reminder to schedule: the next 7 days, title only when allowed. */
export interface ShellReminder {
  id: string
  taskId: string
  fireAt: number
  title?: string
}

/** The Today list the widgets show; titles only while the account is readable. */
export interface ShellWidgetData {
  updatedAt: number
  locked: boolean
  count: number
  overdue: number
  tasks: { id: string; title?: string; time?: string; priority: number; overdue: boolean }[]
}

/** Shared with web push: whether notifications carry task titles. */
export const META_INCLUDE_TITLES = 'push:includeContent'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const WIDGET_MAX = 50

/** The reminders to schedule: live, not dismissed, firing in the next 7 days. */
export function shellReminders(reminders: readonly Reminder[], tasks: readonly Task[], now: number, opts: { titles: boolean; encrypted: boolean }): ShellReminder[] {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const out: ShellReminder[] = []
  for (const r of reminders) {
    if (r.deleted_at || r.fire_at == null || r.fire_at < now || r.fire_at > now + WEEK_MS) continue
    if (r.dismissed_at != null && r.dismissed_at >= r.fire_at) continue
    const task = byId.get(r.task_id)
    if (!task || task.deleted_at || task.completed_at) continue
    const item: ShellReminder = { id: r.id, taskId: r.task_id, fireAt: r.fire_at }
    if (opts.titles && !opts.encrypted && task.title) item.title = task.title
    out.push(item)
  }
  return out.sort((a, b) => a.fireAt - b.fireAt)
}

/** The widgets' Today list: titles only while the account is readable on this device, counts otherwise. */
export function shellWidget(tasks: readonly Task[], today: string, now: number, locked: boolean, hide?: TodayAssigneeFilter | null): ShellWidgetData {
  const list = todayList(tasks.filter((task) => !task.deleted_at && !task.completed_at), today, hide)
  const rows = list.slice(0, WIDGET_MAX).map((task) => {
    const due = localDueOf(task.due)
    const overdue = !!due && due.date < today
    return {
      id: task.id,
      ...(locked ? {} : { title: task.title }),
      ...(due?.time && !locked ? { time: due.time } : {}),
      priority: task.priority,
      overdue,
    }
  })
  return { updatedAt: now, locked, count: list.length, overdue: rows.filter((r) => r.overdue).length, tasks: locked ? [] : rows }
}

/** The local store's Today list for the widgets now. */
export async function todaySnapshot(now = Date.now()): Promise<ShellWidgetData> {
  const enc = encryptionSnapshot()
  const [tasks, prefs, memberships, me] = await Promise.all([db.tasks.toArray(), db.userPrefs.get('me'), db.memberships.toArray(), currentUserId()])
  const hide = todayAssigneeFilter(prefs, memberships, me)
  return shellWidget(tasks, logicalToday(undefined, now), now, enc.enabled && !enc.unlocked, hide)
}

/**
 * The local store's reminders to schedule now; none while the account is locked. Titles
 * follow the push setting unless `titles` says otherwise (the native app's notifications
 * never leave the phone); an encrypted account's never show.
 */
export async function upcomingReminders(now = Date.now(), opts: { titles?: boolean } = {}): Promise<ShellReminder[]> {
  const enc = encryptionSnapshot()
  if (enc.enabled && !enc.unlocked) return []
  const [reminders, tasks, titles] = await Promise.all([db.reminders.toArray(), db.tasks.toArray(), opts.titles ?? getMeta<boolean>(META_INCLUDE_TITLES, false)])
  return shellReminders(reminders, tasks, now, { titles, encrypted: enc.enabled })
}
