// The date sheet (native-app-everyday D5): quick choices (Today, Tomorrow, This weekend,
// Next week, No date), a line read by the shared parser ("next fri 3pm"), the system
// calendar and time (Material dialogs on Android, SwiftUI on iOS), and Repeat with the
// shared presets or a rule typed and checked by the shared parser. Done answers the
// screen that opened it (src/nav/pickers.ts).
import { addDaysISO, describeDue, logicalToday } from '@shared/dates'
import { parse } from '@shared/nlp/parse'
import { platform } from '@shared/platform'
import { parseRule, RULE_SUGGESTIONS } from '@shared/recurrence'
import type { Due } from '@shared/types'
import { DatePickerDialog, Host as ComposeHost, TimePickerDialog } from '@expo/ui/jetpack-compose'
import { DatePicker, Host as SwiftHost } from '@expo/ui/swift-ui'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useEffect, useMemo, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { answer } from '../nav/sheets'
import type { RootParams } from '../nav/types'
import { t } from '../ui/i18n'
import { Icon, type IconName } from '../ui/Icon'
import { useColors, type, type Colors } from '../ui/theme'
import { TARGET } from '../ui/target'

export interface WhenAnswer { due: Due | null; recurrence?: string | null }

const pad = (n: number) => String(n).padStart(2, '0')
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dateOf = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }

/** Saturday of this week, or next Saturday when today is the weekend already. */
export function weekendOf(today: string): string {
  const day = dateOf(today).getDay()
  return addDaysISO(today, day === 6 ? 7 : day === 0 ? 6 : 6 - day)
}

/** Monday of next week. */
export function nextWeekOf(today: string): string {
  const day = dateOf(today).getDay()
  return addDaysISO(today, ((8 - day) % 7) || 7)
}

function Row({ icon, label, detail, c, onPress, selected }: { icon: IconName; label: string; detail?: string; c: Colors; onPress(): void; selected?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} android_ripple={{ color: c.field }} onPress={onPress} style={styles.row}>
      <Icon color={selected ? c.accent : c.muted} name={icon} />
      <Text style={[styles.rowLabel, { color: c.text }]}>{label}</Text>
      {detail && <Text style={[styles.rowDetail, { color: c.muted }]}>{detail}</Text>}
    </Pressable>
  )
}

export function WhenSheet({ route, navigation }: NativeStackScreenProps<RootParams, 'When'>) {
  const c = useColors()
  const insets = useSafeAreaInsets()
  const today = logicalToday()
  const [due, setDue] = useState<Due | null>(route.params.due)
  const [typed, setTyped] = useState('')
  const [repeat, setRepeat] = useState<string | null | undefined>(undefined)
  const [customRule, setCustomRule] = useState('')
  const [dialog, setDialog] = useState<'date' | 'time' | null>(null)
  const id = route.params.request

  // A sheet closed by a swipe answers "nothing chosen".
  useEffect(() => navigation.addListener('beforeRemove', () => answer(id, null)), [navigation, id])

  const done = (next: Due | null = due) => {
    const out: WhenAnswer = { due: next, ...(repeat !== undefined ? { recurrence: repeat } : {}) }
    answer(id, out)
    navigation.goBack()
  }

  const fromLine = useMemo(() => {
    if (!typed.trim()) return null
    return parse(typed, { today, languages: platform.languages(), projects: [] }).due
  }, [typed, today])
  const rule = customRule.trim() ? parseRule(customRule) : null

  const quick: { icon: IconName; label: string; date: string | null }[] = [
    { icon: 'today', label: t('Today'), date: today },
    { icon: 'schedule', label: t('Tomorrow'), date: addDaysISO(today, 1) },
    { icon: 'upcoming', label: t('This weekend'), date: weekendOf(today) },
    { icon: 'upcoming', label: t('Next week'), date: nextWeekOf(today) },
    { icon: 'close', label: t('No date'), date: null },
  ]
  const label = (d: string | null) => (d ? describeDue({ date: d }, today)?.label : undefined)
  const keepTime = (date: string): Due => (due?.time ? { ...due, date } : { date })

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 16 }} keyboardShouldPersistTaps="handled" style={{ backgroundColor: c.card }}>
      {route.params.title && <Text numberOfLines={1} style={[styles.title, { color: c.muted }]}>{route.params.title}</Text>}
      <TextInput
        accessibilityLabel={t('Date')}
        onChangeText={setTyped}
        onSubmitEditing={() => { if (fromLine) done(fromLine) }}
        placeholder={t('Type a date, e.g. {example}', { example: 'next fri 3pm' })}
        placeholderTextColor={c.muted}
        returnKeyType="done"
        style={[styles.typed, { backgroundColor: c.field, color: c.text }]}
        value={typed}
      />
      {fromLine && <Row c={c} detail={describeDue(fromLine, today)?.label} icon="check" label={t('Set')} onPress={() => done(fromLine)} selected />}
      {!typed && quick.map((q) => (
        <Row c={c} detail={label(q.date)} icon={q.icon} key={q.label} label={q.label} onPress={() => done(q.date ? keepTime(q.date) : null)} selected={q.date === (due?.date ?? null)} />
      ))}

      <View style={[styles.group, { borderTopColor: c.separator }]}>
        {Platform.OS === 'ios' ? (
          <SwiftHost matchContents>
            <DatePicker displayedComponents={['date']} onDateChange={(d) => setDue(keepTime(isoOf(d)))} selection={dateOf(due?.date ?? today)} />
          </SwiftHost>
        ) : (
          <Row c={c} detail={due ? describeDue({ date: due.date }, today)?.label : undefined} icon="upcoming" label={t('Pick a date')} onPress={() => setDialog('date')} />
        )}
        <View style={styles.row}>
          <Icon color={c.muted} name="time" />
          <Text style={[styles.rowLabel, { color: c.text }]}>{due?.time ? due.time : t('Time')}</Text>
          <Switch
            accessibilityLabel={t('Time')}
            onValueChange={(on) => { if (on) setDialog('time'); else if (due) setDue({ date: due.date }) }}
            style={Platform.OS === 'android' ? { height: TARGET, minWidth: TARGET } : undefined}
            thumbColor={Platform.OS === 'android' ? (due?.time ? c.accent : undefined) : undefined}
            trackColor={{ true: c.chip }}
            value={!!due?.time}
          />
        </View>
      </View>

      <View style={[styles.group, { borderTopColor: c.separator }]}>
        <Text style={[styles.heading, { color: c.muted }]}>{t('Repeat')}</Text>
        <ScrollView contentContainerStyle={styles.presets} horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} style={styles.strip}>
          {[null, ...RULE_SUGGESTIONS.slice(0, 7)].map((r) => (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: repeat === r }} key={r ?? 'none'} onPress={() => setRepeat(r)} style={styles.presetTarget}>
              <View style={[styles.preset, { backgroundColor: repeat === r ? c.chip : c.field }]}>
                <Text style={{ color: repeat === r ? c.accent : c.text, fontSize: type.subhead }}>{r ?? t('Does not repeat')}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
        <TextInput
          accessibilityLabel={t('Custom repeat')}
          onChangeText={(s) => { setCustomRule(s); const r = s.trim() ? parseRule(s) : null; if (r?.ok) setRepeat(r.canonical) }}
          placeholder={t('Custom…')}
          placeholderTextColor={c.muted}
          style={[styles.typed, { backgroundColor: c.field, color: c.text }]}
          value={customRule}
        />
        {rule && !rule.ok && <Text style={[styles.error, { color: c.danger }]}>{rule.error}</Text>}
      </View>

      <Pressable accessibilityRole="button" onPress={() => done()} style={[styles.done, { backgroundColor: c.accent }]}>
        <Text style={{ color: c.onAccent, fontSize: type.body, fontWeight: '600' }}>{t('Done')}</Text>
      </Pressable>

      {Platform.OS === 'android' && dialog === 'date' && (
        <ComposeHost>
          <DatePickerDialog
            color={c.accent}
            initialDate={due?.date ?? today}
            onDateSelected={(d) => { setDialog(null); setDue(keepTime(isoOf(d))) }}
            onDismissRequest={() => setDialog(null)}
          />
        </ComposeHost>
      )}
      {Platform.OS === 'android' && dialog === 'time' && (
        <ComposeHost>
          <TimePickerDialog
            color={c.accent}
            onDateSelected={(d) => { setDialog(null); setDue({ ...(due ?? { date: today }), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }) }}
            onDismissRequest={() => setDialog(null)}
          />
        </ComposeHost>
      )}
      {Platform.OS === 'ios' && dialog === 'time' && (
        <SwiftHost matchContents>
          <DatePicker displayedComponents={['hourAndMinute']} onDateChange={(d) => setDue({ ...(due ?? { date: today }), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` })} selection={new Date()} />
        </SwiftHost>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: type.subhead, paddingHorizontal: 20, paddingTop: 20 },
  typed: { borderRadius: 10, fontSize: type.body, marginHorizontal: 16, marginVertical: 10, minHeight: TARGET, paddingHorizontal: 14, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 13, minHeight: 48 },
  rowLabel: { flex: 1, fontSize: type.body },
  rowDetail: { fontSize: type.subhead },
  group: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6, paddingTop: 6 },
  heading: { fontSize: type.footnote, fontWeight: '600', paddingHorizontal: 20, paddingVertical: 6, textTransform: 'uppercase' },
  strip: { flexGrow: 0 },
  presets: { gap: 8, paddingHorizontal: 16 },
  presetTarget: { minHeight: TARGET, justifyContent: 'center' },
  preset: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  error: { fontSize: type.footnote, paddingHorizontal: 20 },
  done: { alignItems: 'center', borderRadius: 12, marginHorizontal: 16, marginTop: 16, paddingVertical: 14 },
})
