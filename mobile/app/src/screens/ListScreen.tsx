// A list screen's frame (native-app-everyday D1): the list under the native large title,
// the add button, and the edit mode's toolbar.
import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { useColors } from '../ui/theme'

export function ListScreen({ children, add, bar }: { children: ReactNode; add: ReactNode; bar: ReactNode }) {
  const c = useColors()
  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <View style={styles.list}>
        {children}
        {add}
      </View>
      {bar}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { flex: 1 },
})
