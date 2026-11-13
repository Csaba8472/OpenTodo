// The first screen: the server's address, its check (native-app "Server compatibility")
// and sign-in through the system's authentication sheet (design D5), in one step. After
// the update from the web-view app, its stored address is filled in (native-app-handover
// D7): its web sign-in cannot carry over, so the screen says why it asks once more.
import { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { container } from '../modules/opentodo-shared-container'
import { checkServer, UPDATE_GUIDE } from './server'
import { SignInError, type SignInProblem } from './session'
import { signIn, type Account } from './signIn'
import { useColors } from './ui/theme'

const SIGN_IN_MESSAGES: Record<Exclude<SignInProblem, 'cancelled'>, string> = {
  failed: 'Sign-in didn’t finish. Try again.',
  demo: 'The app can’t sign in to a demo server.',
}

type Problem = { message: string; update?: boolean }

export function ServerScreen({ onSignedIn }: { onSignedIn: (account: Account) => void }) {
  const c = useColors()
  const [carried] = useState(() => container.shellServer() ?? '')
  const [address, setAddress] = useState(carried)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)

  const submit = async () => {
    if (busy || !address.trim()) return
    setBusy(true)
    setProblem(null)
    try {
      const check = await checkServer(address)
      if (!check.ok) {
        setProblem({ message: check.message, update: check.problem === 'needs-update' })
        return
      }
      onSignedIn(await signIn(check.url))
    } catch (err) {
      const p = err instanceof SignInError ? err.problem : 'failed'
      if (p !== 'cancelled') setProblem({ message: SIGN_IN_MESSAGES[p] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.screen, { backgroundColor: c.bg }]}>
      <View style={styles.body}>
        <Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>Your server</Text>
        <TextInput
          accessibilityLabel="Server address"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={!carried}
          editable={!busy}
          inputMode="url"
          keyboardType="url"
          onChangeText={(s) => { setAddress(s); setProblem(null) }}
          onSubmitEditing={submit}
          placeholder="todo.example.com"
          placeholderTextColor={c.muted}
          returnKeyType="go"
          style={[styles.field, { backgroundColor: c.field, color: c.text }]}
          textContentType="URL"
          value={address}
        />
        {carried && address === carried && !problem && (
          <Text style={[styles.note, { color: c.muted }]}>Sign in once more: the new app can’t use the old app’s sign-in.</Text>
        )}
        {problem && (
          <View accessibilityLiveRegion="polite">
            <Text style={[styles.note, { color: c.danger }]}>{problem.message}</Text>
            {problem.update && (
              <Text accessibilityRole="link" onPress={() => Linking.openURL(UPDATE_GUIDE)} style={[styles.note, { color: c.accent }]}>
                How to update the server
              </Text>
            )}
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy || !address.trim() }}
          disabled={busy || !address.trim()}
          onPress={submit}
          style={({ pressed }) => [styles.button, { backgroundColor: c.accent, opacity: pressed || !address.trim() ? 0.6 : 1 }]}
        >
          {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Continue</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  title: { fontSize: 34, fontWeight: '700', marginBottom: 8 },
  field: { borderRadius: 12, fontSize: 17, paddingHorizontal: 16, paddingVertical: 14 },
  note: { fontSize: 15, lineHeight: 20 },
  button: { alignItems: 'center', borderRadius: 12, marginTop: 8, paddingVertical: 15 },
  buttonText: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
})
