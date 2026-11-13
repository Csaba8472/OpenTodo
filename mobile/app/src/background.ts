// The app's runs without a screen (native-app-handover D3, "Background refresh"): the
// system starts them (WorkManager on Android, BGAppRefreshTask on iOS) through the
// shared container, in the app's own JavaScript, whether or not the app is open.
// - The refresh: pull and push, the files waiting to upload, the widget, the reminders
//   and a local notification per new in-app notification.
// - The action: a notification button (Complete, Snooze) written as an op and sent.
import { loadEncryptionState } from '@shared/e2ee'
import { syncNow } from '@shared/sync'
import { AppState } from 'react-native'
import { applyQueuedActions, notifyNew, publishDevice } from './device'
import { uploadPending } from './sharedFiles'
import { restoreOnce } from './signIn'
import { bootLanguage } from './ui/i18n'

/** Each step is on its own: an offline pull still publishes, a failed publish still notifies. */
async function step(fn: () => Promise<unknown>): Promise<void> {
  await fn().catch(() => undefined)
}

export async function backgroundRefresh(): Promise<void> {
  if (!(await restoreOnce().catch(() => null))) return
  await step(bootLanguage)
  await step(applyQueuedActions)
  await step(loadEncryptionState)
  await step(syncNow)
  await step(uploadPending)
  await step(publishDevice)
  await step(() => notifyNew(AppState.currentState === 'active'))
}

export async function backgroundAction(): Promise<void> {
  if (!(await restoreOnce().catch(() => null))) return
  await step(applyQueuedActions)
  await step(loadEncryptionState)
  await step(syncNow)
  await step(publishDevice)
}
