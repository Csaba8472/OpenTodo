// What the web app hands a native shell while it runs there (OpenSpec change
// native-shells, design D4 and D6): the next 7 days of reminders for the
// device-scheduled notifications, and the Today list for the widgets. Both are
// computed from the local store on every change, debounced, and republished empty
// or as counts when the account is locked or the user signs out (the store empties).
// Outside a shell nothing here runs.
import { liveQuery, type Subscription } from 'dexie'
import { META_INCLUDE_TITLES, shellReminders, shellWidget, todaySnapshot, upcomingReminders } from './deviceSnapshot'
import { db, getMeta, setMeta } from './db'
import { onEncryptionChange } from './e2ee'
import { publishGeofences } from './geofences'
import { has, publishWidget, scheduleReminders, shell, type ShellPermission } from './shell'

/** The device's "notifications through the app" switch (Settings → Notifications in a shell). */
export const META_SHELL_NOTIFICATIONS = 'shell:notifications'
const META_INCLUDE = META_INCLUDE_TITLES

const DEBOUNCE_MS = 500

export { shellReminders, shellWidget }

/** Whether notifications carry task titles on this device (shared with web push). */
export async function shellTitlesEnabled(): Promise<boolean> {
  return getMeta<boolean>(META_INCLUDE, false)
}

/** Sets whether notifications carry task titles; the publisher re-sends the schedule. */
export async function setShellTitles(on: boolean): Promise<void> {
  await setMeta(META_INCLUDE, on)
}

/** Whether the device's notifications go through the shell. */
export async function shellNotificationsEnabled(): Promise<boolean> {
  return getMeta<boolean>(META_SHELL_NOTIFICATIONS, false)
}

/** Turns the shell's notifications on or off; returns the permission the shell reports (null without a shell). */
export async function setShellNotifications(on: boolean): Promise<ShellPermission | null> {
  if (!has('reminders')) return null
  await setMeta(META_SHELL_NOTIFICATIONS, on)
  if (!on) {
    await scheduleReminders([])
    return 'granted'
  }
  const permission = await publishReminders()
  if (permission === 'denied') await setMeta(META_SHELL_NOTIFICATIONS, false)
  return permission
}

/** Computes and hands over the schedule now; empty when off, locked or signed out. */
async function publishReminders(now = Date.now()): Promise<ShellPermission | null> {
  if (!(await shellNotificationsEnabled())) return scheduleReminders([])
  return scheduleReminders(await upcomingReminders(now))
}

/** Computes and hands over the widgets' Today list now. */
async function publishToday(now = Date.now()): Promise<void> {
  publishWidget(await todaySnapshot(now))
}

let started = false

/** Starts the publishers when the page runs in a shell with `reminders` or `widgets`; a no-op otherwise. */
export function startShellPublishers(): () => void {
  if (started || !shell() || (!has('reminders') && !has('widgets') && !has('geofences'))) return () => {}
  started = true
  let timer: ReturnType<typeof setTimeout> | null = null
  const run = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      if (has('reminders')) void publishReminders().catch(() => undefined)
      if (has('widgets')) void publishToday().catch(() => undefined)
      // Location reminders (location-reminders D3): the armed regions, on every change and on the tick.
      if (has('geofences')) void publishGeofences().catch(() => undefined)
    }, DEBOUNCE_MS)
  }
  // Any change to tasks, reminders, places (a linked place's pin) or the meta table (the switches, the titles option).
  const sub: Subscription = liveQuery(() => Promise.all([db.tasks.count(), db.reminders.toArray(), db.tasks.toArray(), db.places.toArray(), db.meta.toArray()])).subscribe({ next: run, error: () => undefined })
  const offEnc = onEncryptionChange(run)
  // The day rolls over at the logical day start even when nothing changes.
  const tick = setInterval(run, 15 * 60 * 1000)
  return () => { sub.unsubscribe(); offEnc(); clearInterval(tick); if (timer) clearTimeout(timer); started = false }
}

