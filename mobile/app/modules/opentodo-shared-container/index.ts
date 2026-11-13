// The shared container (OpenSpec change native-app-handover, D1): what the app hands to
// the parts of the phone that run without it, and what they hand back.
// - The widget snapshot (deviceSnapshot.ts `ShellWidgetData`), stored where the widgets read
//   it (the App Group on iOS, SharedPreferences on Android), and the widgets reloaded.
// - The reminders as local notifications with Complete and Snooze; a pressed button is
//   queued here and the app writes it as an op (src/background.ts).
// - Shares from another app, queued by the share extension or the Android share sheet.
// - The background refresh's schedule, and the address the web-view shell stored.
// Without the native module (Jest, a build without it) every call does nothing.
import { requireOptionalNativeModule, type EventSubscription } from 'expo'

/** Whether the device may show the reminders: `exact-denied` fires them, a little late. */
export type ReminderPermission = 'granted' | 'denied' | 'exact-denied'

/** A notification button the user pressed while the app was not in the foreground. */
export interface QueuedAction {
  id: string
  action: 'done' | 'snooze'
  at: number
}

/** A share from another app: a file is a path in the app's own storage. */
export interface QueuedShare {
  /** Stable UUID, retained until the task and its files have been saved. */
  id?: string
  title: string
  text: string
  url: string
  files: { path: string; name: string; type: string; size: number }[]
  at: number
}

/** A local notification for an in-app notification (a mention, an assignment). */
export interface DeviceNotification {
  id: string
  title: string
  body: string
  taskId?: string
}

interface Native {
  publishWidget(json: string): void
  scheduleReminders(json: string): ReminderPermission | Promise<ReminderPermission>
  notify(json: string): boolean | Promise<boolean>
  takeActions(): string
  ackAction(id: string, at: number): void
  takeShares(): string
  ackShare(id: string): void
  shellServer(): string | null
  startRefresh(): void
  /** iOS: the background refresh that launched the app, before the JavaScript listened. */
  pendingRefresh?(): boolean
  refreshDone?(): void
  writeFile(parts: string[]): string | null | Promise<string | null>
  fileSha256(path: string): string | null
  removeFile(path: string): void
  clear(): void
  addListener(event: 'onShare' | 'onAction' | 'onRefresh', fn: () => void): EventSubscription
}

const native = requireOptionalNativeModule<Native>('OpenTodoSharedContainer')

function list<T>(json: string | undefined): T[] {
  try {
    const out: unknown = JSON.parse(json ?? '[]')
    return Array.isArray(out) ? (out as T[]) : []
  } catch {
    return []
  }
}

export const container = {
  available: native !== null,
  publishWidget: (snapshot: unknown) => native?.publishWidget(JSON.stringify(snapshot)),
  scheduleReminders: async (reminders: unknown[]): Promise<ReminderPermission> => (await native?.scheduleReminders(JSON.stringify(reminders))) ?? 'denied',
  notify: async (n: DeviceNotification): Promise<boolean> => (await native?.notify(JSON.stringify(n))) ?? false,
  takeActions: () => list<QueuedAction>(native?.takeActions()),
  ackAction: (id: string, at: number) => native?.ackAction(id, at),
  takeShares: () => list<QueuedShare>(native?.takeShares()),
  ackShare: (id: string) => native?.ackShare(id),
  shellServer: () => native?.shellServer() ?? null,
  startRefresh: () => native?.startRefresh(),
  pendingRefresh: () => native?.pendingRefresh?.() ?? false,
  refreshDone: () => native?.refreshDone?.(),
  /** The hex SHA-256 of a shared file in the app's storage, or null when it cannot be read. */
  writeFile: async (parts: string[]): Promise<string | null> => (await native?.writeFile(parts)) ?? null,
  fileSha256: async (path: string): Promise<string | null> => native?.fileSha256(path) ?? null,
  removeFile: (path: string) => native?.removeFile(path),
  /** Sign-out: no snapshot, no reminders, no queue, no refresh. */
  clear: () => native?.clear(),
  /** A share or a notification button arrived while the app runs; `onRefresh`: iOS woke the app to refresh. */
  on: (event: 'onShare' | 'onAction' | 'onRefresh', fn: () => void): (() => void) => {
    const sub = native?.addListener(event, fn)
    return () => sub?.remove()
  },
}
