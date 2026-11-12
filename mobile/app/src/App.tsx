// The app's root: the account from the last launch, else the server screen. Signed in,
// the account syncs (design D6) and Today shows; a session the server ended returns here
// with nothing of the account left on the phone (account-access "App sessions").
import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { startAccountSync } from './accountSync'
import { session } from './appSession'
import { ServerScreen } from './ServerScreen'
import { forgetLocal, restoreAccount, signOut, type Account } from './signIn'
import { TodayScreen } from './TodayScreen'
import { useColors } from './theme'

type State = { phase: 'starting' } | { phase: 'signed-out' } | { phase: 'signed-in'; account: Account }

export default function App() {
  const c = useColors()
  const [state, setState] = useState<State>({ phase: 'starting' })

  useEffect(() => {
    let live = true
    restoreAccount().then(
      (account) => live && setState(account ? { phase: 'signed-in', account } : { phase: 'signed-out' }),
      () => live && setState({ phase: 'signed-out' }),
    )
    const off = session.onSignedOut(() => {
      void forgetLocal().finally(() => live && setState({ phase: 'signed-out' }))
    })
    return () => { live = false; off() }
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
    screen = <TodayScreen onSignOut={() => { void signOut().finally(() => setState({ phase: 'signed-out' })) }} />
  }
  return <SafeAreaProvider>{screen}</SafeAreaProvider>
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
