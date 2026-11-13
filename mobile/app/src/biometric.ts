// Biometric unlock of an encrypted account (OpenSpec change native-app-handover D5): the
// shared e2ee (enableBiometricUnlock, unlockWithBiometrics, forgetBiometric) asks the
// platform port's shell bridge, as the web-view shells answered it. Here the bridge has
// only that capability: the raw account key in expo-secure-store behind the device's
// biometrics (the Keystore or the Keychain, `requireAuthentication`), which the system
// invalidates when a fingerprint or face is added. Never backed up, this device only.
import type { OpenTodoShell } from '@shared/shell'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

const KEY = 'opentodo.biometricKey'

const options: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
}

/** Set when the last read found the key gone: invalidated by a biometric change. */
let invalidated = false

/** Whether the last biometric read failed because the system invalidated the key (not a cancel). */
export function keyInvalidated(): boolean {
  return invalidated
}

/** The bridge, or undefined on a device without enrolled biometrics. */
export function biometricBridge(): OpenTodoShell | undefined {
  if (!SecureStore.canUseBiometricAuthentication()) return undefined
  return {
    bridge: 1,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    app: 'native',
    capabilities: ['biometric'],
    async biometricStore(keyB64) {
      try {
        await SecureStore.setItemAsync(KEY, keyB64, options)
        invalidated = false
        return true
      } catch {
        return false
      }
    },
    async biometricRead() {
      try {
        const key = await SecureStore.getItemAsync(KEY, options)
        invalidated = key === null
        return key
      } catch {
        // Cancelled, locked out or no hardware now: the passphrase, with biometrics kept.
        invalidated = false
        return null
      }
    },
    biometricForget() {
      void SecureStore.deleteItemAsync(KEY).catch(() => undefined)
    },
  }
}
