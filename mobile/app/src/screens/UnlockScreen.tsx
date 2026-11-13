// Unlock an encrypted account (native-app-everyday D7): the passphrase, after sign-in and
// at every cold start. The shared code derives the key (lib/e2ee on quick-crypto) and the
// app keeps the unwrapped key in memory only (the platform port's memoryOnlyKeys). A wrong
// passphrase says so, and nothing is decrypted or written. With biometric unlock on
// (native-app-handover D5) the system's prompt comes first; after a passphrase unlock it
// is offered, and a key the system invalidated (a new fingerprint or face) is forgotten,
// so the offer comes back.
import { biometricUnlockState, enableBiometricUnlock, forgetBiometric, unlock, unlockWithBiometrics, UnlockThrottledError } from '@shared/e2ee'
import { requestSync } from '@shared/sync'
import { useEffect, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { keyInvalidated } from '../biometric'
import { signOut } from '../signIn'
import { t } from '../ui/i18n'
import { Icon } from '../ui/Icon'
import { useColors, type } from '../ui/theme'

export function UnlockScreen() {
  const c = useColors()
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [biometric, setBiometric] = useState({ available: false, enabled: false })
  const [remember, setRemember] = useState(true)

  const tryBiometric = async () => {
    setBusy(true)
    setError(null)
    try {
      if (await unlockWithBiometrics()) {
        requestSync(0)
        return
      }
      if (keyInvalidated()) {
        await forgetBiometric()
        setBiometric((b) => ({ ...b, enabled: false }))
        setError(t('Fingerprint or face did not unlock. Enter your passphrase; you can turn biometric unlock on again below.'))
      }
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void biometricUnlockState().then((state) => {
      setBiometric(state)
      if (state.enabled) void tryBiometric()
    })
  }, [])

  const submit = async () => {
    if (!secret || busy) return
    setBusy(true)
    setError(null)
    try {
      await unlock(secret, 'passphrase')
      // The system's prompt confirms it; a refusal leaves biometric unlock off.
      if (biometric.available && !biometric.enabled && remember) await enableBiometricUnlock(secret, 'passphrase').catch(() => false)
      setSecret('')
      requestSync(0)
    } catch (err) {
      setError(err instanceof UnlockThrottledError ? err.message : t('That passphrase is not right.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.screen, { backgroundColor: c.bg }]}>
      <View style={styles.body}>
        <Icon color={c.accent} name="lock" size={40} />
        <Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>{t('Unlock')}</Text>
        <TextInput
          accessibilityLabel={t('Passphrase')}
          autoCapitalize="none"
          autoComplete="password"
          autoCorrect={false}
          autoFocus={!biometric.enabled}
          onChangeText={(s) => { setSecret(s); setError(null) }}
          onSubmitEditing={() => { void submit() }}
          placeholder={t('Passphrase')}
          placeholderTextColor={c.muted}
          returnKeyType="go"
          secureTextEntry
          style={[styles.field, { backgroundColor: c.field, color: c.text }]}
          textContentType="password"
          value={secret}
        />
        {error && <Text accessibilityLiveRegion="assertive" style={[styles.note, { color: c.danger }]}>{error}</Text>}
        {biometric.available && !biometric.enabled && (
          <View style={styles.row}>
            <Text style={[styles.rowText, { color: c.text }]}>{t('Unlock with fingerprint or face next time')}</Text>
            <Switch accessibilityLabel={t('Unlock with fingerprint or face next time')} onValueChange={setRemember} value={remember} />
          </View>
        )}
        <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: !secret }} disabled={!secret || busy} onPress={() => { void submit() }} style={[styles.button, { backgroundColor: c.accent, opacity: secret ? 1 : 0.5 }]}>
          {busy ? <ActivityIndicator color={c.onAccent} /> : <Text style={[styles.buttonText, { color: c.onAccent }]}>{t('Unlock')}</Text>}
        </Pressable>
        {biometric.enabled && (
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void tryBiometric() }} style={styles.link}>
            <Text style={{ color: c.accent, fontSize: type.body }}>{t('Unlock with fingerprint or face')}</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={() => { void signOut() }} style={styles.link}>
          <Text style={{ color: c.accent, fontSize: type.body }}>{t('Sign out')}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  title: { fontSize: type.largeTitle, fontWeight: '700', marginBottom: 8 },
  field: { borderRadius: 12, fontSize: type.body, paddingHorizontal: 16, paddingVertical: 14 },
  note: { fontSize: type.subhead },
  button: { alignItems: 'center', borderRadius: 12, marginTop: 8, paddingVertical: 15 },
  buttonText: { fontSize: type.body, fontWeight: '600' },
  link: { alignItems: 'center', paddingVertical: 12 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 48 },
  rowText: { flex: 1, fontSize: type.body },
})
