// The add button (native-app-everyday D2): the floating action button on Android, at
// Material 3's size, shape and elevation; on iOS a button in the navigation bar. Both open
// the capture sheet with the screen's context (Today's date, the open project or label).
import { useNavigation, type NavigationProp } from '@react-navigation/native'
import { useLayoutEffect } from 'react'
import { Platform, Pressable, StyleSheet } from 'react-native'
import type { CaptureContext, RootParams } from '../nav/types'
import { t } from './i18n'
import { Icon } from './Icon'
import { useTabBarInset } from './insets'
import { useColors } from './theme'

/** Sets the iOS bar button and returns the Android FAB (null on iOS) for the screen to draw. */
export function useAddButton(context: CaptureContext): React.ReactNode {
  const nav = useNavigation<NavigationProp<RootParams>>()
  const c = useColors()
  const bottom = useTabBarInset() + 16
  const open = () => nav.navigate('Capture', { context })
  const key = JSON.stringify(context)

  useLayoutEffect(() => {
    if (Platform.OS !== 'ios') return
    nav.setOptions({
      headerRight: () => (
        <Pressable accessibilityLabel={t('Add task')} accessibilityRole="button" hitSlop={10} onPress={open}>
          <Icon color={c.accent} name="add" size={24} />
        </Pressable>
      ),
    })
    // `open` follows `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, key, c.accent])

  if (Platform.OS === 'ios') return null
  return (
    <Pressable
      accessibilityLabel={t('Add task')}
      accessibilityRole="button"
      android_ripple={{ color: c.onAccent, borderless: false }}
      onPress={open}
      style={[styles.fab, { backgroundColor: c.chip, bottom }]}
    >
      <Icon color={c.text} name="add" size={26} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // Material 3: 56 dp, a 16 dp corner, level 3 elevation, 16 dp from the edges.
  fab: { position: 'absolute', right: 16, width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', elevation: 6, overflow: 'hidden' },
})
