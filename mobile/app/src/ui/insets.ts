// The space the tab bar takes at the bottom of a tab's screen. Android's native tabs
// draw the Material bottom navigation (80 dp, above the system's navigation inset) over
// the screen, so content and the floating add button keep clear of it; on iOS the scroll
// views adjust for the tab bar themselves (contentInsetAdjustmentBehavior).
import { Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export const ANDROID_TAB_BAR = 80

export function useTabBarInset(): number {
  const insets = useSafeAreaInsets()
  return Platform.OS === 'android' ? ANDROID_TAB_BAR + insets.bottom : 0
}
