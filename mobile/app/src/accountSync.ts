// Sync in the app (OpenSpec change native-app-foundation, design D6): the shared engine
// as a browser tab runs it, under the app's own device id, over the account's database.
// The app pulls when it comes to the front (the platform port's visibility); in the
// background the live stream closes once the outbox is sent (src/live.ts).
import { loadEncryptionState, refreshFromServer } from '@shared/e2ee'
import { startSync, stopSyncAndWait, syncNow } from '@shared/sync'
import { setDrain } from './live'
import { accountWork } from './accountWork'

/**
 * Starts syncing the open account. The account's encryption mode is read first, as the
 * web app does before its first sync, so an encrypted account is never pulled into a
 * device that cannot read it (sync waits for the unlock then). Offline, the stored mode is used.
 */
export async function startAccountSync(): Promise<void> {
  const check = accountWork()
  await loadEncryptionState()
  check()
  await refreshFromServer().catch(() => undefined)
  check()
  setDrain(() => syncNow())
  startSync()
}

/** Stops syncing and waits for an exchange under way, before the account's data goes. */
export async function stopAccountSync(): Promise<void> {
  setDrain(async () => undefined)
  await stopSyncAndWait()
}
