// The one toast (design D3, D4): what just happened and Undo, above the tab bar, for a few
// seconds. Every destructive or list-leaving action of the app goes through `showToast`
// with the shared undo entry, so Undo is the web's (lib/undo's undoBatch).
import { undoBatch } from '@shared/undo'
import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { t } from './i18n'
import { useColors, type } from './theme'
import { TARGET } from './target'

export const TOAST_MS = 5000

interface Toast { key: number; label: string; undo: string | null; onUndone?: () => void }

let show: ((t: Toast) => void) | null = null
let seq = 0

/** Shows `label`, with Undo when `undo` names an undo entry. */
export function showToast(label: string, undo: string | null = null, onUndone?: () => void): void {
  if (!label) return
  show?.({ key: ++seq, label, undo, onUndone })
  AccessibilityInfo.announceForAccessibility(label)
}

/** Mounted once at the root, above the tabs; `bottom` is the tab bar's height. */
export function ToastHost({ bottom }: { bottom: number }) {
  const c = useColors()
  const insets = useSafeAreaInsets()
  const [toast, setToast] = useState<Toast | null>(null)
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    show = (next) => setToast(next)
    return () => { show = null }
  }, [])

  useEffect(() => {
    if (!toast) return
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start()
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast((cur) => (cur?.key === toast.key ? null : cur)))
    }, TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast, opacity])

  if (!toast) return null
  const undo = async () => {
    setToast(null)
    if (toast.undo) await undoBatch(toast.undo).catch(() => undefined)
    toast.onUndone?.()
  }
  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { bottom: bottom + insets.bottom + 12, opacity }]}>
      <View accessibilityLiveRegion="polite" style={[styles.toast, { backgroundColor: c.text }]}>
        <Text numberOfLines={2} style={[styles.label, { color: c.bg }]}>{toast.label}</Text>
        {toast.undo && (
          <Pressable accessibilityRole="button" onPress={() => { void undo() }} style={{ minHeight: TARGET, justifyContent: 'center', marginVertical: -12 }}>
            <Text style={[styles.undo, { color: c.inverseAccent }]}>{t('Undo')}</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  label: { flex: 1, fontSize: type.subhead },
  undo: { fontSize: type.subhead, fontWeight: '600' },
})
