// The app's root: the account from the last launch, else the server screen. Signed in,
// the account's screen (Today, task 4.6); a session the server ended returns here with
// nothing of the account left on the phone (account-access "App sessions").
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { session } from './appSession'
import { ServerScreen } from './ServerScreen'
import { forgetLocal, restoreAccount, signOut, type Account } from './signIn'
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

  if (state.phase === 'starting') {
    return <View style={[styles.center, { backgroundColor: c.bg }]}><ActivityIndicator /></View>
  }
  if (state.phase === 'signed-out') {
    return <ServerScreen onSignedIn={(account) => setState({ phase: 'signed-in', account })} />
  }
  return (
    <View style={[styles.center, { backgroundColor: c.bg }]}>
      <Text style={[styles.server, { color: c.muted }]}>{new URL(state.account.server).host}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => { void signOut().finally(() => setState({ phase: 'signed-out' })) }}
      >
        <Text style={[styles.link, { color: c.accent }]}>Sign out</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  server: { fontSize: 15 },
  link: { fontSize: 17 },
})
