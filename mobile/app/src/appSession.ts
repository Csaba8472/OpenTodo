// The app's one session (design D5) over the Keychain or Keystore. Kept apart from
// src/signIn.ts, which opens the database: src/setup.ts installs the session's fetch
// before any shared module loads, and db.ts must not load before the platform port.
import * as SecureStore from 'expo-secure-store'
import { Session, type Vault } from './session'

// Readable after the first unlock, so a background refresh can use the tokens.
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }

export const vault: Vault = {
  get: (k) => SecureStore.getItemAsync(k, options),
  set: (k, v) => (v === null ? SecureStore.deleteItemAsync(k, options) : SecureStore.setItemAsync(k, v, options)),
}

export const session = new Session({ vault, fetch: globalThis.fetch.bind(globalThis) })

/** Every request of the app, the shared library's included, goes through the session. */
export function installSessionFetch(): void {
  globalThis.fetch = session.fetch
}
