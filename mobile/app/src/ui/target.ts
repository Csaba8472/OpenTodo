// Touch targets (design D8): at least 48 dp, as Android's accessibility checks and Apple's
// 44 pt ask, around controls drawn smaller. The negative margin keeps the drawn control
// where it was; inside a navigation bar or a horizontal strip, which clip their children
// (and their touches) on Android, a control takes the full 48 dp instead (TARGET).
import type { ViewStyle } from 'react-native'

export const TARGET = 48

/** A 48 dp target centred on a control `size` dp across. */
export function around(size: number): ViewStyle {
  const m = -(TARGET - size) / 2
  return { minWidth: TARGET, minHeight: TARGET, margin: m, alignItems: 'center', justifyContent: 'center' }
}
