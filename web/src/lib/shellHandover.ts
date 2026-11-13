// The web-view shells' last release (OpenSpec change native-app-handover D7, task 3.2): a
// shell built with the handover flag lists the `handover` capability. The web app then
// sends everything it has not sent (the outbox and the held ops), waiting for a network
// when there is none, and only then tells the user, once per device, that the next update
// is the new app: the native app does not migrate this web view's storage, it downloads the
// account again after one sign-in.
import { db, getMeta, setMeta } from './db'
import { heldCount } from './limits'
import { has } from './shell'
import { syncNow } from './sync'

const META_SHOWN = 'shell:handoverShown'

/** Ops this device has not sent yet. */
export async function unsent(): Promise<number> {
  return (await db.outbox.count()) + (await heldCount())
}

/** Resolves once the browser says it is online (at once when it is). */
function online(win: Window = window): Promise<void> {
  if (win.navigator.onLine) return Promise.resolve()
  return new Promise((resolve) => win.addEventListener('online', () => resolve(), { once: true }))
}

/**
 * Whether the notice is due: in a shell with `handover`, not shown before, and nothing left
 * to send. Sends first: a sync round per try, after the network returns, until the outbox
 * is empty (a rejected op is held, and stays counted, so a refused one keeps it waiting).
 */
export async function handoverDue(opts: { tries?: number; wait?: () => Promise<void> } = {}): Promise<boolean> {
  if (!has('handover') || (await getMeta<boolean>(META_SHOWN, false))) return false
  const wait = opts.wait ?? (() => online())
  for (let i = 0; i < (opts.tries ?? 10); i++) {
    if ((await unsent()) === 0) return true
    await wait()
    await syncNow().catch(() => undefined)
  }
  return (await unsent()) === 0
}

/** The notice was read: never again on this device. */
export async function handoverShown(): Promise<void> {
  await setMeta(META_SHOWN, true)
}
