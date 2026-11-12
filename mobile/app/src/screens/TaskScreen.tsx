// A task's detail (native-app-everyday D4): pushed onto the tab's stack. The title and the
// notes are edited in place; the notes as Markdown text, written as `description`, which
// the shared op path folds into the note's document (ops.ts), so an edit on the web at
// the same time converges. When, Deadline, Project, Labels, Priority, Reminders and Repeat
// show only when set, with one row to add the others; subtasks, attachments and comments
// follow. Every change is an op at once: there is no Save button.
import { createComment } from '@shared/comments'
import { db } from '@shared/db'
import { describeDue, logicalToday } from '@shared/dates'
import { createSubtask, saveNote, setRecurrence, updateTask } from '@shared/ops'
import { priorityName } from '@shared/priority'
import type { Attachment, Comment, Label, Priority, Project, Task } from '@shared/types'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useEffect, useRef, useState } from 'react'
import { ActionSheetIOS, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { session } from '../appSession'
import { complete, schedule, setPriority, trash } from '../data/actions'
import { useRead } from '../data/useRead'
import { usePickers } from '../nav/pickers'
import type { StackParams } from '../nav/types'
import { t } from '../ui/i18n'
import { Icon, type IconName } from '../ui/Icon'
import { useTabBarInset } from '../ui/insets'
import { useColors, type, type Colors } from '../ui/theme'

interface Detail {
  task: Task | null
  project: Project | null
  labels: Label[]
  subtasks: Task[]
  comments: Comment[]
  attachments: Attachment[]
}

async function read(id: string): Promise<Detail> {
  const task = (await db.tasks.get(id)) ?? null
  if (!task || task.deleted_at) return { task: null, project: null, labels: [], subtasks: [], comments: [], attachments: [] }
  const [project, labels, subtasks, comments, attachments] = await Promise.all([
    task.project_id ? db.projects.get(task.project_id) : undefined,
    db.labels.bulkGet(task.labels),
    db.tasks.where('parent_id').equals(id).toArray(),
    db.comments.where('task_id').equals(id).toArray(),
    db.attachments.where('task_id').equals(id).filter((a) => !a.comment_id && !a.deleted_at).toArray(),
  ])
  return {
    task,
    project: project ?? null,
    labels: labels.filter((l): l is Label => !!l && !l.deleted_at),
    subtasks: subtasks.filter((s) => !s.deleted_at).sort((a, b) => a.position - b.position),
    comments: comments.filter((c) => !c.deleted_at).sort((a, b) => a.created_at - b.created_at),
    attachments,
  }
}

type Field = 'when' | 'deadline' | 'project' | 'labels' | 'priority' | 'reminders' | 'repeat'

function FieldRow({ icon, label, value, c, onPress }: { icon: IconName; label: string; value: string; c: Colors; onPress(): void }) {
  return (
    <Pressable accessibilityHint={label} accessibilityLabel={`${label}: ${value}`} accessibilityRole="button" android_ripple={{ color: c.field }} onPress={onPress} style={[styles.field, { borderBottomColor: c.separator }]}>
      <Icon color={c.muted} name={icon} />
      <Text style={[styles.fieldLabel, { color: c.muted }]}>{label}</Text>
      <Text numberOfLines={2} style={[styles.fieldValue, { color: c.text }]}>{value}</Text>
      <Icon color={c.separator} name="chevron" size={16} />
    </Pressable>
  )
}

function Heading({ text, c }: { text: string; c: Colors }) {
  return <Text accessibilityRole="header" style={[styles.heading, { color: c.muted }]}>{text}</Text>
}

/** A choice among `options`, the platform's own: an action sheet on iOS, a dialog list on Android. */
function choose(title: string, options: { label: string; run(): void }[]): void {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions({ title, options: [...options.map((o) => o.label), t('Cancel')], cancelButtonIndex: options.length }, (i) => options[i]?.run())
    return
  }
  Alert.alert(title, undefined, [...options.map((o) => ({ text: o.label, onPress: o.run })), { text: t('Cancel'), style: 'cancel' as const }], { cancelable: true })
}

export function TaskScreen({ route, navigation }: NativeStackScreenProps<StackParams, 'Task'>) {
  const c = useColors()
  const bottom = useTabBarInset()
  const pickers = usePickers()
  const id = route.params.id
  const detail = useRead(() => read(id), ['tasks', 'projects', 'labels', 'comments', 'attachments'], `task:${id}`)
  const task = detail?.task
  const [title, setTitle] = useState<string | null>(null)
  const [notes, setNotes] = useState<string | null>(null)
  const [subtask, setSubtask] = useState('')
  const [comment, setComment] = useState('')
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const today = logicalToday()

  // The title moves into the bar once the page's own title has scrolled away.
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => { navigation.setOptions({ title: scrolled ? task?.title ?? '' : '' }) }, [navigation, task?.title, scrolled])
  useEffect(() => () => { if (noteTimer.current) clearTimeout(noteTimer.current) }, [])

  if (!detail) return <View style={{ flex: 1, backgroundColor: c.grouped }} />
  if (!task) return <View style={[styles.gone, { backgroundColor: c.grouped }]}><Text style={{ color: c.muted, fontSize: type.body }}>{t('This task was deleted.')}</Text></View>

  const saveTitle = () => {
    const next = (title ?? task.title).trim()
    if (next && next !== task.title) void updateTask(id, { title: next })
    setTitle(null)
  }
  // Notes are written a moment after the typing stops, and when the field is left.
  const saveNotes = (text: string, now = false) => {
    setNotes(text)
    if (noteTimer.current) clearTimeout(noteTimer.current)
    const write = () => { if (text !== (task.description ?? '')) void saveNote('task', id, { description: text }) }
    if (now) write()
    else noteTimer.current = setTimeout(write, 800)
  }

  const set: Record<Field, string | null> = {
    when: task.due ? describeDue(task.due, today)?.label ?? task.due.date : null,
    deadline: task.deadline ? describeDue({ date: task.deadline }, today)?.label ?? task.deadline : null,
    project: detail.project?.name ?? null,
    labels: detail.labels.length ? detail.labels.map((l) => l.name).join(', ') : null,
    priority: task.priority < 4 ? priorityName(task.priority) : null,
    reminders: null,
    repeat: task.recurrence ?? null,
  }
  const edit: Record<Field, () => Promise<void>> = {
    when: async () => {
      const a = await pickers.schedule(task.due, task.title)
      if (!a) return
      await schedule(id, a.due)
      if (a.recurrence !== undefined) await setRecurrence(id, a.recurrence)
    },
    deadline: async () => { const d = await pickers.when(task.deadline ? { date: task.deadline } : null, t('Deadline')); if (d !== undefined) await updateTask(id, { deadline: d?.date ?? null }) },
    project: async () => { const p = await pickers.project(task.project_id); if (p !== undefined) await updateTask(id, { project_id: p }) },
    labels: async () => { const ids = await pickers.labels(task.labels); if (ids) await updateTask(id, { labels: ids }) },
    priority: async () => choose(t('Priority'), ([1, 2, 3, 4] as Priority[]).map((p) => ({ label: priorityName(p), run: () => { void setPriority(id, p) } }))),
    reminders: async () => { await Linking.openURL(`${session.server}/task/${encodeURIComponent(id)}`) },
    repeat: async () => { const a = await pickers.schedule(task.due, task.title); if (a?.recurrence !== undefined) await setRecurrence(id, a.recurrence) },
  }
  const FIELDS: { key: Field; icon: IconName; label: string }[] = [
    { key: 'when', icon: 'schedule', label: t('When') },
    { key: 'deadline', icon: 'deadline', label: t('Deadline') },
    { key: 'project', icon: 'project', label: t('Project') },
    { key: 'labels', icon: 'label', label: t('Labels') },
    { key: 'priority', icon: 'priority', label: t('Priority') },
    { key: 'repeat', icon: 'repeat', label: t('Repeat') },
  ]
  const unset = FIELDS.filter((f) => !set[f.key])
  const doneCount = detail.subtasks.filter((s) => s.completed_at).length

  return (
    <ScrollView
      contentContainerStyle={[styles.page, { paddingBottom: 48 + bottom }]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      // A tap on a row while the keyboard is up acts at once instead of only closing it.
      keyboardShouldPersistTaps="handled"
      onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 56)}
      scrollEventThrottle={100}
      style={{ backgroundColor: c.grouped }}
    >
      <View style={[styles.card, { backgroundColor: c.card }]}>
        <View style={styles.titleRow}>
          <Pressable
            accessibilityLabel={task.completed_at ? t('Reopen') : t('Complete')}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: !!task.completed_at }}
            hitSlop={12}
            onPress={() => { void complete(id, !task.completed_at) }}
            style={[styles.circle, { borderColor: task.completed_at ? c.accent : c.muted }, task.completed_at ? { backgroundColor: c.accent } : null]}
          >
            {!!task.completed_at && <Icon color={c.onAccent} name="check" size={14} />}
          </Pressable>
          <TextInput
            accessibilityLabel={t('Title')}
            multiline
            onBlur={saveTitle}
            onChangeText={setTitle}
            scrollEnabled={false}
            style={[styles.title, { color: c.text }]}
            submitBehavior="blurAndSubmit"
            value={title ?? task.title}
          />
        </View>
        <TextInput
          accessibilityLabel={t('Notes')}
          multiline
          onBlur={() => saveNotes(notes ?? task.description ?? '', true)}
          onChangeText={(s) => saveNotes(s)}
          placeholder={t('Notes')}
          placeholderTextColor={c.muted}
          scrollEnabled={false}
          style={[styles.notes, { color: c.text }]}
          value={notes ?? task.description ?? ''}
        />
      </View>

      <View style={[styles.card, { backgroundColor: c.card }]}>
        {FIELDS.filter((f) => set[f.key]).map((f) => (
          <FieldRow c={c} icon={f.icon} key={f.key} label={f.label} onPress={() => { void edit[f.key]() }} value={set[f.key]!} />
        ))}
        {unset.length > 0 && (
          <Pressable
            accessibilityRole="button"
            android_ripple={{ color: c.field }}
            onPress={() => choose(t('Add'), unset.map((f) => ({ label: f.label, run: () => { void edit[f.key]() } })))}
            style={styles.field}
          >
            <Icon color={c.accent} name="add" />
            <Text style={[styles.fieldLabel, { color: c.accent }]}>{t('Add…')}</Text>
          </Pressable>
        )}
      </View>

      <Heading c={c} text={detail.subtasks.length ? t('Subtasks {done}/{all}', { done: doneCount, all: detail.subtasks.length }) : t('Subtasks')} />
      <View style={[styles.card, { backgroundColor: c.card }]}>
        {detail.subtasks.map((s) => (
          <Pressable accessibilityRole="button" key={s.id} onPress={() => navigation.push('Task', { id: s.id })} style={[styles.field, { borderBottomColor: c.separator }]}>
            <Pressable
              accessibilityLabel={s.completed_at ? t('Reopen') : t('Complete')}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !!s.completed_at }}
              hitSlop={10}
              onPress={() => { void complete(s.id, !s.completed_at) }}
              style={[styles.small, { borderColor: s.completed_at ? c.accent : c.muted }, s.completed_at ? { backgroundColor: c.accent } : null]}
            >
              {!!s.completed_at && <Icon color={c.onAccent} name="check" size={11} />}
            </Pressable>
            <Text style={[styles.fieldValue, { color: s.completed_at ? c.muted : c.text, textAlign: 'left' }]}>{s.title}</Text>
          </Pressable>
        ))}
        <View style={styles.field}>
          <Icon color={c.accent} name="add" />
          <TextInput
            accessibilityLabel={t('Add a subtask')}
            onChangeText={setSubtask}
            onSubmitEditing={() => { const v = subtask.trim(); if (v) { void createSubtask(id, v); setSubtask('') } }}
            placeholder={t('Add a subtask')}
            placeholderTextColor={c.muted}
            returnKeyType="done"
            style={[styles.inline, { color: c.text }]}
            submitBehavior="submit"
            value={subtask}
          />
        </View>
      </View>

      {detail.attachments.length > 0 && (
        <>
          <Heading c={c} text={t('Attachments')} />
          <View style={[styles.card, { backgroundColor: c.card }]}>
            {detail.attachments.map((a) => (
              <Pressable
                accessibilityRole="link"
                key={a.id}
                onPress={() => { void Linking.openURL(a.url ?? `${session.server}/api/v1/attachments/${encodeURIComponent(a.id)}/content`) }}
                style={[styles.field, { borderBottomColor: c.separator }]}
              >
                <Icon color={c.muted} name="attachment" />
                <Text numberOfLines={1} style={[styles.fieldValue, { color: c.text, textAlign: 'left' }]}>{a.name}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Heading c={c} text={t('Comments')} />
      <View style={[styles.card, { backgroundColor: c.card }]}>
        {detail.comments.map((cm) => (
          <View key={cm.id} style={[styles.comment, { borderBottomColor: c.separator }]}>
            <Text style={{ color: c.text, fontSize: type.body }}>{cm.body}</Text>
            <Text style={{ color: c.muted, fontSize: type.footnote }}>{new Date(cm.created_at).toLocaleString()}</Text>
          </View>
        ))}
        <View style={styles.field}>
          <Icon color={c.muted} name="comment" />
          <TextInput
            accessibilityLabel={t('Add a comment')}
            multiline
            onChangeText={setComment}
            placeholder={t('Add a comment')}
            placeholderTextColor={c.muted}
            style={[styles.inline, { color: c.text }]}
            value={comment}
          />
          {!!comment.trim() && (
            <Pressable accessibilityRole="button" onPress={() => { void createComment({ taskId: id, body: comment }).then(() => setComment('')) }}>
              <Text style={{ color: c.accent, fontSize: type.body, fontWeight: '600' }}>{t('Send')}</Text>
            </Pressable>
          )}
        </View>
      </View>

      <Pressable accessibilityRole="button" onPress={() => { void trash(id).then(() => navigation.goBack()) }} style={[styles.card, styles.delete, { backgroundColor: c.card }]}>
        <Text style={{ color: c.danger, fontSize: type.body }}>{t('Delete task')}</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 8, paddingBottom: 48 },
  gone: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 12, overflow: 'hidden' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingTop: 14 },
  circle: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, marginTop: 4, alignItems: 'center', justifyContent: 'center' },
  small: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: type.title, fontWeight: '600', padding: 0 },
  notes: { fontSize: type.body, minHeight: 64, paddingHorizontal: 16, paddingBottom: 14, paddingTop: 8, textAlignVertical: 'top' },
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'transparent' },
  fieldLabel: { fontSize: type.body },
  fieldValue: { flex: 1, fontSize: type.body, textAlign: 'right' },
  inline: { flex: 1, fontSize: type.body, padding: 0 },
  heading: { fontSize: type.footnote, fontWeight: '600', paddingHorizontal: 16, paddingTop: 12, textTransform: 'uppercase' },
  comment: { gap: 4, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  delete: { alignItems: 'center', marginTop: 16, paddingVertical: 14 },
})
