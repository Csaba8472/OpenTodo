// A task's menu (native-app-everyday D3), opened by a long-press: the task as a preview at
// the top, then Schedule, Move, Priority, Labels, Duplicate, Copy link and Delete. A sheet
// rather than a menu anchored to the row, so long lists draw no native menu per row.
import { db } from '@shared/db'
import { describeDue, logicalToday } from '@shared/dates'
import { priorityName } from '@shared/priority'
import { updateTask } from '@shared/ops'
import type { Priority, Task } from '@shared/types'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import * as Clipboard from 'expo-clipboard'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { duplicateTask, move, schedule, setPriority, taskLink, trash } from '../data/actions'
import { usePickers } from '../nav/pickers'
import type { RootParams } from '../nav/types'
import { t } from '../ui/i18n'
import { Icon, type IconName } from '../ui/Icon'
import { useColors, type, type Colors } from '../ui/theme'
import { showToast } from '../ui/Toast'

function Item({ icon, label, c, danger, onPress, selected }: { icon: IconName; label: string; c: Colors; danger?: boolean; onPress(): void; selected?: boolean }) {
  const color = danger ? c.danger : c.text
  return (
    <Pressable accessibilityRole="menuitem" accessibilityState={{ selected }} android_ripple={{ color: c.field }} onPress={onPress} style={styles.item}>
      <Icon color={danger ? c.danger : c.muted} name={icon} />
      <Text style={[styles.label, { color }]}>{label}</Text>
      {selected && <Icon color={c.accent} name="check" />}
    </Pressable>
  )
}

export function TaskMenuSheet({ route, navigation }: NativeStackScreenProps<RootParams, 'TaskMenu'>) {
  const c = useColors()
  const insets = useSafeAreaInsets()
  const pickers = usePickers()
  const [task, setTask] = useState<Task | null>(null)
  const [project, setProject] = useState<string | null>(null)
  const [priorities, setPriorities] = useState(false)
  const today = logicalToday()

  useEffect(() => {
    void db.tasks.get(route.params.id).then(async (row) => {
      setTask(row ?? null)
      if (row?.project_id) setProject((await db.projects.get(row.project_id))?.name ?? null)
    })
  }, [route.params.id])

  if (!task) return <View style={{ backgroundColor: c.card, height: 200 }} />
  const close = () => navigation.goBack()
  // The sheet closes first, so a picker it opens is not stacked on top of it.
  const then = (fn: () => Promise<unknown>) => { close(); void fn() }
  const due = task.due ? describeDue(task.due, today) : null

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 8 }} style={{ backgroundColor: c.card }}>
      <View accessible accessibilityLabel={[task.title, due?.label, project].filter(Boolean).join(', ')} style={[styles.preview, { borderBottomColor: c.separator }]}>
        <Text style={[styles.title, { color: c.text }]}>{task.title}</Text>
        {(due || project) && <Text style={[styles.meta, { color: c.muted }]}>{[due?.label, project].filter(Boolean).join(' · ')}</Text>}
        {!!task.description && <Text numberOfLines={3} style={[styles.notes, { color: c.muted }]}>{task.description}</Text>}
      </View>
      {priorities ? (
        ([1, 2, 3, 4] as Priority[]).map((p) => (
          <Item c={c} icon="priority" key={p} label={priorityName(p)} onPress={() => then(() => setPriority(task.id, p))} selected={task.priority === p} />
        ))
      ) : (
        <>
          <Item c={c} icon="schedule" label={t('Schedule')} onPress={() => then(async () => { const d = await pickers.when(task.due, task.title); if (d !== undefined) await schedule(task.id, d) })} />
          <Item c={c} icon="move" label={t('Move')} onPress={() => then(async () => { const p = await pickers.project(task.project_id); if (p !== undefined) await move(task.id, p) })} />
          <Item c={c} icon="priority" label={t('Priority')} onPress={() => setPriorities(true)} />
          <Item c={c} icon="label" label={t('Labels')} onPress={() => then(async () => { const ids = await pickers.labels(task.labels); if (ids) await updateTask(task.id, { labels: ids }) })} />
          <Item c={c} icon="duplicate" label={t('Duplicate')} onPress={() => then(() => duplicateTask(task.id))} />
          <Item c={c} icon="link" label={t('Copy link')} onPress={() => then(async () => { await Clipboard.setStringAsync(taskLink(task.id)); showToast(t('Link copied')) })} />
          <Item c={c} danger icon="delete" label={t('Delete')} onPress={() => then(() => trash(task.id))} />
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  preview: { borderBottomWidth: StyleSheet.hairlineWidth, gap: 4, padding: 20 },
  title: { fontSize: type.headline, fontWeight: '600' },
  meta: { fontSize: type.subhead },
  notes: { fontSize: type.subhead },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 13, minHeight: 48 },
  label: { flex: 1, fontSize: type.body },
})
