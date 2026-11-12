// Unlock an encrypted account (native-app-everyday D7): the passphrase, after sign-in and
// at every cold start. The shared code derives the key (lib/e2ee on quick-crypto) and the
// app keeps the unwrapped key in memory only (the platform port's memoryOnlyKeys). A wrong
// passphrase says so, and nothing is decrypted or written.
import { unlock, UnlockThrottledError } from '@shared/e2ee'
import { requestSync } from '@shared/sync'
import { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { signOut } from '../signIn'
import { t } from '../ui/i18n'
import { Icon } from '../ui/Icon'
import { useColors, type } from '../ui/theme'

export function UnlockScreen() {
  const c = useColors()
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!secret || busy) return
    setBusy(true)
    setError(null)
    try {
      await unlock(secret, 'passphrase')
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
          autoFocus
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
        <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: !secret }} disabled={!secret || busy} onPress={() => { void submit() }} style={[styles.button, { backgroundColor: c.accent, opacity: secret ? 1 : 0.5 }]}>
          {busy ? <ActivityIndicator color={c.onAccent} /> : <Text style={[styles.buttonText, { color: c.onAccent }]}>{t('Unlock')}</Text>}
        </Pressable>
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
})
