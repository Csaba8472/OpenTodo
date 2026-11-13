// Capture (native-app-everyday D2): a sheet with the field focused, the shared quick-add
// parser on every keystroke (its spans tinted inline, a chip for each attribute, a tap on
// a chip leaves that phrase as text), and Return adding the task with a light haptic while
// the sheet stays open for the next. The task takes the screen's context (Today's date,
// the open project, the open label) unless the line says otherwise, as the web's
// withDefaults does. Works offline: the task is an op in the outbox.
import { logicalToday } from '@shared/dates'
import { db } from '@shared/db'
import { createLabel } from '@shared/labels'
import { createTask } from '@shared/ops'
import { liveDismissals, parse, rebaseDismissed, type Chip, type ParseResult } from '@shared/nlp/parse'
import { dismissChip, toTaskInput, type QuickAddInput } from '@shared/nlp/quickadd'
import type { Span } from '@shared/nlp/tokenize'
import { platform } from '@shared/platform'
import { priorityName } from '@shared/priority'
import type { Due, Label, Priority, Project } from '@shared/types'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import * as Haptics from 'expo-haptics'
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePickers } from '../nav/pickers'
import type { CaptureContext, RootParams } from '../nav/types'
import { t } from '../ui/i18n'
import { Icon, type IconName } from '../ui/Icon'
import { useColors, type, type Colors } from '../ui/theme'
import { around, TARGET } from '../ui/target'

const CHIP_ICON: Partial<Record<Chip['kind'], IconName>> = { due: 'schedule', deadline: 'deadline', project: 'project', label: 'label', priority: 'priority', recurrence: 'repeat', reminder: 'reminder', estimate: 'time' }

/** The screen's defaults under what the line typed (QuickAddSheet's withDefaults). */
export function withContext(input: QuickAddInput, ctx: CaptureContext, today: string): QuickAddInput & { project_id?: string | null } {
  const { labels: typed, ...rest } = input
  const defaults: { due?: { date: string }; project_id?: string } = {}
  if (ctx.today && !rest.due && !rest.deadline && !rest.start) defaults.due = { date: today }
  if (ctx.projectId) defaults.project_id = ctx.projectId
  const labels = [...new Set([...(ctx.labelId ? [ctx.labelId] : []), ...(typed ?? [])])]
  return { ...defaults, ...rest, ...(labels.length ? { labels } : {}) }
}

/** The line as styled pieces: the parser's spans tinted, the rest as typed. */
function pieces(line: string, chips: readonly Chip[]): { text: string; chip: boolean }[] {
  const spans = chips.flatMap((ch) => ch.spans).sort((a, b) => a.start - b.start)
  const out: { text: string; chip: boolean }[] = []
  let at = 0
  for (const s of spans) {
    if (s.start < at) continue
    if (s.start > at) out.push({ text: line.slice(at, s.start), chip: false })
    out.push({ text: line.slice(s.start, s.end), chip: true })
    at = s.end
  }
  if (at < line.length) out.push({ text: line.slice(at), chip: false })
  return out
}

function chipLabel(ch: Chip, projects: ReadonlyMap<string, Project>): string {
  const typed = ch.spans.map((s) => s.text).join(' ')
  if (ch.kind === 'project') return projects.get(String(ch.value))?.name ?? typed
  if (ch.kind === 'label') return String(ch.value)
  return typed
}

function ChipView({ chip, label, c, onPress }: { chip: Chip; label: string; c: Colors; onPress(): void }) {
  return (
    <Pressable accessibilityHint={t('Removes it from the task')} accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={styles.chipTarget}>
      <View style={[styles.chip, { backgroundColor: c.chip }]}>
        {CHIP_ICON[chip.kind] && <Icon color={c.accent} name={CHIP_ICON[chip.kind]!} size={14} />}
        <Text style={[styles.chipText, { color: c.text }]}>{label}</Text>
        <Icon color={c.muted} name="close" size={12} />
      </View>
    </Pressable>
  )
}

export function CaptureSheet({ route, navigation }: NativeStackScreenProps<RootParams, 'Capture'>) {
  const c = useColors()
  const insets = useSafeAreaInsets()
  // The quick-add widget opens it with no context: a task for the Inbox.
  const context = route.params?.context ?? {}
  const field = useRef<ComponentRef<typeof TextInput>>(null)
  const [line, setLine] = useState('')
  const [dismissed, setDismissed] = useState<Span[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  const [added, setAdded] = useState(0)
  // Set from the toolbar: they win over the line and the context, as a typed attribute does.
  const [picked, setPicked] = useState<{ due?: Due | null; project_id?: string | null; labels?: string[]; priority?: Priority }>({})
  const pickers = usePickers()
  const today = logicalToday()

  useEffect(() => {
    void Promise.all([db.projects.toArray(), db.labels.toArray()]).then(([p, l]) => {
      setProjects(p.filter((x) => !x.deleted_at && !x.archived))
      setLabels(l.filter((x) => !x.deleted_at))
    })
  }, [])

  const parsed: ParseResult | null = useMemo(() => {
    if (!line.trim()) return null
    return parse(line, { today, languages: platform.languages(), projects, dismissed: liveDismissals(line, dismissed) })
  }, [line, today, projects, dismissed])
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  const onChange = (next: string) => {
    setDismissed((d) => rebaseDismissed(line, next, d))
    setLine(next)
  }

  const add = async () => {
    if (!parsed?.title.trim() && !line.trim()) return
    const input = parsed?.title ? await toTaskInput(parsed, { labels, createLabel: (name) => createLabel({ name }) }) : { title: line.trim() }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setLine('')
    setDismissed([])
    setAdded((n) => n + 1)
    const task = withContext(input, context, today)
    const { labels: extra, ...rest } = picked
    await createTask({ ...task, ...rest, ...(extra ? { labels: [...new Set([...(task.labels ?? []), ...extra])] } : {}), due: 'due' in picked ? picked.due ?? undefined : task.due })
    setPicked({})
    field.current?.focus()
  }

  const priorities: Priority[] = [1, 2, 3, 4]
  // A picker opens with the keyboard down: on Android a sheet opened over the keyboard
  // stays at full height, under the status bar, once the keyboard goes. It comes back after.
  const picking = async <T,>(open: () => Promise<T>): Promise<T> => {
    Keyboard.dismiss()
    try {
      return await open()
    } finally {
      field.current?.focus()
    }
  }
  const tools: { icon: IconName; label: string; on: boolean; run(): Promise<void> }[] = [
    { icon: 'schedule', label: t('Date'), on: 'due' in picked, run: async () => { const due = await picking(() => pickers.when(picked.due ?? null)); if (due !== undefined) setPicked((p) => ({ ...p, due })) } },
    { icon: 'project', label: t('Project'), on: 'project_id' in picked, run: async () => { const id = await picking(() => pickers.project(picked.project_id ?? null)); if (id !== undefined) setPicked((p) => ({ ...p, project_id: id })) } },
    { icon: 'label', label: t('Labels'), on: !!picked.labels?.length, run: async () => { const ids = await picking(() => pickers.labels(picked.labels ?? [])); if (ids) setPicked((p) => ({ ...p, labels: ids })) } },
    { icon: 'priority', label: picked.priority ? priorityName(picked.priority) : t('Priority'), on: !!picked.priority, run: async () => { setPicked((p) => ({ ...p, priority: priorities[((p.priority ?? 4) % 4)] })) } },
  ]

  return (
    <View style={[styles.sheet, { backgroundColor: c.card, paddingBottom: insets.bottom + 8 }]}>
      <TextInput
        ref={field}
        accessibilityLabel={t('Add a task')}
        autoFocus
        blurOnSubmit={false}
        // Wraps at large text sizes; Return still adds (submitBehavior).
        multiline
        onChangeText={onChange}
        onSubmitEditing={() => { void add() }}
        placeholder={t('Add a task…')}
        placeholderTextColor={c.muted}
        returnKeyType="done"
        style={[styles.field, { color: c.text }]}
        submitBehavior="submit"
      >
        {pieces(line, parsed?.chips ?? []).map((piece, i) => (
          <Text key={i} style={piece.chip ? { color: c.accent, backgroundColor: c.chip } : undefined}>{piece.text}</Text>
        ))}
      </TextInput>
      {parsed && parsed.chips.length > 0 && (
        <ScrollView contentContainerStyle={styles.chips} horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} style={styles.strip}>
          {parsed.chips.map((ch) => (
            <ChipView c={c} chip={ch} key={ch.key} label={chipLabel(ch, byId)} onPress={() => setDismissed((d) => dismissChip(d, ch))} />
          ))}
        </ScrollView>
      )}
      <View accessibilityRole="toolbar" style={styles.tools}>
        {tools.map((tool) => (
          <Pressable accessibilityLabel={tool.label} accessibilityRole="button" accessibilityState={{ selected: tool.on }} key={tool.icon} onPress={() => { void tool.run() }} style={[styles.tool, tool.on && { backgroundColor: c.chip }]}>
            <Icon color={tool.on ? c.accent : c.muted} name={tool.icon} size={20} />
          </Pressable>
        ))}
      </View>
      <View style={styles.footer}>
        <Text accessibilityLiveRegion="polite" style={[styles.added, { color: c.muted }]}>{added > 0 ? t('Added') : ''}</Text>
        <Pressable accessibilityRole="button" disabled={!line.trim()} onPress={() => { void add() }} style={[styles.addButton, { backgroundColor: line.trim() ? c.accent : c.field }]}>
          <Text style={{ color: line.trim() ? c.onAccent : c.muted, fontSize: type.callout, fontWeight: '600' }}>{t('Add')}</Text>
        </Pressable>
        <Pressable accessibilityLabel={t('Close')} accessibilityRole="button" onPress={() => navigation.goBack()} style={around(22)}>
          <Icon color={c.muted} name="close" />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  sheet: { flex: 1, paddingHorizontal: 20, paddingTop: 20, gap: 10 },
  field: { fontSize: type.title, minHeight: 44 },
  // A strip as tall as its chips: a horizontal scroll view fills the column otherwise.
  strip: { flexGrow: 0 },
  chips: { gap: 8, alignItems: 'center' },
  chipTarget: { minHeight: TARGET, justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: type.subhead },
  tools: { flexDirection: 'row', gap: 4 },
  tool: { width: TARGET, height: TARGET, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  added: { flex: 1, fontSize: type.subhead },
  addButton: { borderRadius: TARGET / 2, paddingHorizontal: 20, minHeight: TARGET, justifyContent: 'center' },
})
