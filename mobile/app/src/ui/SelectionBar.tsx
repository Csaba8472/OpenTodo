// Edit mode (native-app-everyday D3): Select in the navigation bar turns the rows into a
// multi-selection, and a toolbar at the bottom completes, schedules, moves or deletes the
// selected tasks, each as one batch with Undo.
import { localDate } from '@shared/dates'
import { useNavigation } from '@react-navigation/native'
import { useCallback, useLayoutEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { completeMany, moveMany, scheduleMany, trashMany } from '../data/actions'
import { usePickers } from '../nav/pickers'
import { useTabBarInset } from './insets'
import { TARGET } from './target'
import { t } from './i18n'
import { Icon, type IconName } from './Icon'
import { useColors, type } from './theme'

export interface Selection {
  selecting: boolean
  selected: ReadonlySet<string>
  toggle(id: string): void
  done(): void
}

/** The screen's selection, with Select and Done at the start of its navigation bar. */
export function useSelection(): Selection {
  const nav = useNavigation()
  const c = useColors()
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const done = useCallback(() => { setSelecting(false); setSelected(new Set()) }, [])
  const toggle = useCallback((id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n }), [])

  // iOS: Select and Done as text at the start of the bar. Android: an action icon at the
  // end of the app bar (Material), the add button being the floating one.
  useLayoutEffect(() => {
    const button = () => (
      <Pressable accessibilityLabel={selecting ? t('Done') : t('Select')} accessibilityRole="button" onPress={selecting ? done : () => setSelecting(true)} style={styles.headerButton}>
        {Platform.OS === 'ios'
          ? <Text style={{ color: c.accent, fontSize: type.body }}>{selecting ? t('Done') : t('Select')}</Text>
          : <Icon color={selecting ? c.accent : c.text} name={selecting ? 'check' : 'select'} />}
      </Pressable>
    )
    nav.setOptions(Platform.OS === 'ios' ? { headerLeft: button } : { headerRight: button })
  }, [nav, selecting, c.accent, c.text, done])

  return { selecting, selected, toggle, done }
}

function Tool({ icon, label, disabled, onPress }: { icon: IconName; label: string; disabled: boolean; onPress(): void }) {
  const c = useColors()
  const color = disabled ? c.muted : c.accent
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={styles.tool}>
      <Icon color={color} name={icon} />
      <Text style={[styles.toolLabel, { color }]}>{label}</Text>
    </Pressable>
  )
}

export function SelectionBar({ selection }: { selection: Selection }) {
  const c = useColors()
  const insets = useSafeAreaInsets()
  const tabBar = useTabBarInset()
  const pickers = usePickers()
  if (!selection.selecting) return null
  const ids = [...selection.selected]
  const none = ids.length === 0
  const run = async (fn: () => Promise<void>) => { await fn(); selection.done() }
  return (
    <View style={[styles.bar, { backgroundColor: c.card, borderTopColor: c.separator, paddingBottom: 8 + (tabBar || insets.bottom) }]}>
      <Tool disabled={none} icon="check" label={t('Complete')} onPress={() => { void run(() => completeMany(ids)) }} />
      <Tool disabled={none} icon="schedule" label={t('Schedule')} onPress={() => { void (async () => {
        const due = await pickers.when(null)
        if (due !== undefined) await run(() => scheduleMany(ids, due ? localDate(due) : null))
      })() }} />
      <Tool disabled={none} icon="move" label={t('Move')} onPress={() => { void (async () => {
        const project = await pickers.project(null)
        if (project !== undefined) await run(() => moveMany(ids, project))
      })() }} />
      <Tool disabled={none} icon="delete" label={t('Delete')} onPress={() => { void run(() => trashMany(ids)) }} />
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  headerButton: { minWidth: TARGET, minHeight: TARGET, alignItems: 'center', justifyContent: 'center' },
  tool: { alignItems: 'center', gap: 2, minWidth: 64, paddingVertical: 4 },
  toolLabel: { fontSize: type.caption },
})
