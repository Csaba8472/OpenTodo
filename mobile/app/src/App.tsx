// The app's root: the account from the last launch, else the server screen. Signed in,
// the account syncs (foundation D6); an encrypted account asks for its passphrase first
// (everyday D7), then the tabs (everyday D1). A session the server ended, or a sign-out
// in Settings, returns to the server screen with nothing of the account left on the phone.
import { useEncryption } from '@shared/e2ee'
import { useEffect, useState } from 'react'
import { ActivityIndicator, StatusBar, StyleSheet, useColorScheme, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { startAccountSync } from './accountSync'
import { session } from './appSession'
import { Navigator } from './nav/Navigator'
import { applyAppearance } from './screens/SettingsScreen'
import { UnlockScreen } from './screens/UnlockScreen'
import { ServerScreen } from './ServerScreen'
import { forgetLocal, onSignOut, restoreAccount, type Account } from './signIn'
import { bootLanguage } from './ui/i18n'
import { useColors } from './ui/theme'

type State = { phase: 'starting' } | { phase: 'signed-out' } | { phase: 'signed-in'; account: Account }

function SignedIn() {
  const enc = useEncryption()
  if (enc.enabled && !enc.unlocked) return <UnlockScreen />
  return <Navigator />
}

export default function App() {
  const c = useColors()
  const dark = useColorScheme() === 'dark'
  const [state, setState] = useState<State>({ phase: 'starting' })

  useEffect(() => {
    let live = true
    applyAppearance()
    void bootLanguage().then(() => restoreAccount()).then(
      (account) => live && setState(account ? { phase: 'signed-in', account } : { phase: 'signed-out' }),
      () => live && setState({ phase: 'signed-out' }),
    )
    const offServer = session.onSignedOut(() => {
      void forgetLocal().finally(() => live && setState({ phase: 'signed-out' }))
    })
    const offHere = onSignOut(() => live && setState({ phase: 'signed-out' }))
    return () => { live = false; offServer(); offHere() }
  }, [])

  const signedIn = state.phase === 'signed-in' ? state.account : null
  useEffect(() => {
    if (signedIn) void startAccountSync()
  }, [signedIn])

  let screen
  if (state.phase === 'starting') {
    screen = <View style={[styles.center, { backgroundColor: c.bg }]}><ActivityIndicator /></View>
  } else if (state.phase === 'signed-out') {
    screen = <ServerScreen onSignedIn={(account) => setState({ phase: 'signed-in', account })} />
  } else {
    screen = <SignedIn />
  }
  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      <SafeAreaProvider>{screen}</SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
