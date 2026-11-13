// The React Native side of the platform port (design D3): visibility from AppState,
// the network from NetInfo, preferences in MMKV and the time zone from
// expo-localization, the database on op-sqlite. src/setup.ts installs it before any
// shared module loads.
import NetInfo from '@react-native-community/netinfo'
import { getCalendars, getLocales } from 'expo-localization'
import { fetch as streamFetch } from 'expo/fetch'
import { AppState } from 'react-native'
import { createMMKV } from 'react-native-mmkv'
import { installPlatform } from '@shared/platform'
import { session } from './appSession'
import { biometricBridge } from './biometric'
import { liveEventSource } from './live'
import { createPlatform, type Host } from './platform'
import { opSqlite } from './storage/opSqlite'

// The platform port's preferences: the device settings of the signed-in account.
const storage = createMMKV({ id: 'opentodo.prefs' })

/** Sign-out: the account's device settings go with its database (native-app "Local data on the phone"). */
export function clearDevicePrefs(): void {
  storage.clearAll()
}

export function reactNativeHost(): Host {
  return {
    appState: () => AppState.currentState ?? 'unknown',
    onAppState(fn) {
      const sub = AppState.addEventListener('change', fn)
      return () => sub.remove()
    },
    onConnected: (fn) => NetInfo.addEventListener((s) => fn(s.isConnected !== false)),
    storage: { getString: (k) => storage.getString(k), set: (k, v) => storage.set(k, v), remove: (k) => { storage.remove(k) } },
    timeZone: () => getCalendars()[0]?.timeZone ?? null,
    languages: () => getLocales().map((l) => l.languageTag),
    sql: opSqlite(),
    shell: (() => {
      const bridge = biometricBridge()
      return () => bridge
    })(),
  }
}

export function installAppPlatform(): void {
  installPlatform(createPlatform(reactNativeHost()))
}

/**
 * The live stream sync.ts opens (src/live.ts): over expo/fetch with the session's token,
 * closed when the app goes to the background and opened again in front. `inactive` (a
 * pulled-down Control Center, the app switcher) keeps it.
 */
export function installLiveStream(): void {
  ;(globalThis as { EventSource?: unknown }).EventSource = liveEventSource({
    fetch: session.fetchWith(streamFetch as unknown as typeof fetch),
    active: () => AppState.currentState !== 'background',
    onActive(fn) {
      const sub = AppState.addEventListener('change', (s) => { if (s === 'active' || s === 'background') fn(s === 'active') })
      return () => sub.remove()
    },
  })
}
