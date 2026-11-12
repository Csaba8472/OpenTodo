// A task row (native-app-everyday D3, D8): the circle, the title (growing, never cut short),
// and at most one line under it: the date, the project outside its own list, and one icon
// each for priority, repeat and notes. A full swipe right completes; a swipe left shows
// Schedule and Delete (Schedule and Move in the Inbox); a long-press opens the task's menu.
// Every swipe action is an accessibility action of the row too.
import { describeDue } from '@shared/dates'
import { priorityName } from '@shared/priority'
import type { Project, Task } from '@shared/types'
import { memo, useRef } from 'react'
import { Platform, Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native'
import Swipeable, { SwipeDirection, type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable'
import { t } from './i18n'
import { Icon, type IconName } from './Icon'
import { useColors, type, type Colors } from './theme'

export type RowAction = 'complete' | 'schedule' | 'delete' | 'move'

export interface TaskRowProps {
  task: Task
  /** Drawn completed: within the grace period after a completion. */
  done?: boolean
  /** The project's name is left out inside its own list. */
  projectId?: string | null
  projects: ReadonlyMap<string, Project>
  today: string
  inbox?: boolean
  /** Today: a date that is today says nothing (only a time does). */
  hideToday?: boolean
  /** Edit mode: a selection circle instead of the checkbox, and no swipes. */
  selecting?: boolean
  selected?: boolean
  onPress(task: Task): void
  onLongPress(task: Task): void
  onAction(task: Task, action: RowAction): void
}

const PRIORITY_TONE = (c: Colors, p: number) => (p === 1 ? c.danger : p === 2 ? c.warning : c.accent)

function Action({ icon, label, color, c, onPress }: { icon: IconName; label: string; color: string; c: Colors; onPress(): void }) {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={[styles.action, { backgroundColor: color }]}>
      <Icon color={c.onAccent} name={icon} />
      <Text style={[styles.actionLabel, { color: c.onAccent }]}>{label}</Text>
    </Pressable>
  )
}

function TaskRowView(p: TaskRowProps) {
  const c = useColors()
  const swipe = useRef<SwipeableMethods>(null)
  const { task } = p
  // Within the grace period, or a completed task's own row (the Logbook).
  const done = p.done || !!task.completed_at
  const described = task.due ? describeDue(task.due, p.today) : null
  const due = described && p.hideToday && described.tone === 'today' && !task.due?.time ? null : described
  const project = task.project_id && task.project_id !== p.projectId ? p.projects.get(task.project_id)?.name : undefined
  const second: IconName = p.inbox ? 'move' : 'delete'

  const meta: string[] = []
  if (due) meta.push(due.label)
  if (project) meta.push(project)
  if (task.priority < 4) meta.push(priorityName(task.priority))
  const label = [task.title, ...meta, task.recurrence ? t('Repeats') : null, done ? t('Completed') : null].filter(Boolean).join(', ')

  const actions = [
    { name: 'complete', label: done ? t('Reopen') : t('Complete') },
    { name: 'schedule', label: t('Schedule') },
    p.inbox ? { name: 'move', label: t('Move') } : { name: 'delete', label: t('Delete') },
  ]
  const onA11y = (e: AccessibilityActionEvent) => {
    const name = e.nativeEvent.actionName
    if (name === 'activate') p.onPress(task)
    else if (name === 'longpress') p.onLongPress(task)
    else p.onAction(task, name as RowAction)
  }

  const body = (
    <Pressable
      accessibilityActions={p.selecting ? undefined : actions}
      accessibilityLabel={label}
      accessibilityRole={p.selecting ? 'checkbox' : 'button'}
      accessibilityState={p.selecting ? { checked: !!p.selected } : undefined}
      delayLongPress={350}
      onAccessibilityAction={onA11y}
      onLongPress={p.selecting ? undefined : () => p.onLongPress(task)}
      onPress={() => p.onPress(task)}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed && Platform.OS === 'ios' ? c.field : c.bg }]}
      android_ripple={{ color: c.field }}
    >
      <Pressable
        accessibilityElementsHidden
        disabled={p.selecting}
        hitSlop={12}
        importantForAccessibility="no-hide-descendants"
        onPress={() => p.onAction(task, 'complete')}
        style={[
          styles.circle,
          { borderColor: p.selected || done ? c.accent : task.priority < 4 ? PRIORITY_TONE(c, task.priority) : c.muted },
          (p.selected || done) && { backgroundColor: c.accent },
        ]}
      >
        {(p.selected || done) && <Icon color={c.onAccent} name="check" size={14} />}
      </Pressable>
      <View style={styles.text}>
        <Text style={[styles.title, { color: done ? c.muted : c.text }, done && styles.struck]}>{task.title}</Text>
        {(meta.length > 0 || task.recurrence || task.description) && (
          <View style={styles.meta}>
            {due && <Text style={[styles.metaText, { color: due.tone === 'overdue' ? c.danger : due.tone === 'today' ? c.accent : c.muted }]}>{due.label}</Text>}
            {project && <Text numberOfLines={1} style={[styles.metaText, styles.shrink, { color: c.muted }]}>{project}</Text>}
            {task.priority < 4 && <Icon color={PRIORITY_TONE(c, task.priority)} name="priority" size={13} />}
            {!!task.recurrence && <Icon color={c.muted} name="repeat" size={13} />}
            {!!task.description && <Icon color={c.muted} name="notes" size={13} />}
          </View>
        )}
      </View>
    </Pressable>
  )

  if (p.selecting) return body
  return (
    <Swipeable
      ref={swipe}
      friction={1.4}
      leftThreshold={96}
      onSwipeableWillOpen={(dir) => {
        // RIGHT: the row moved right, uncovering the left action (Complete).
        if (dir !== SwipeDirection.RIGHT) return
        swipe.current?.close()
        p.onAction(task, 'complete')
      }}
      overshootRight={false}
      renderLeftActions={() => (
        <View style={[styles.complete, { backgroundColor: c.accent }]}>
          <Icon color={c.onAccent} name="check" />
        </View>
      )}
      renderRightActions={() => (
        <View style={styles.actions}>
          <Action c={c} color={c.warning} icon="schedule" label={t('Schedule')} onPress={() => { swipe.current?.close(); p.onAction(task, 'schedule') }} />
          <Action c={c} color={p.inbox ? c.accent : c.danger} icon={second} label={p.inbox ? t('Move') : t('Delete')} onPress={() => { swipe.current?.close(); p.onAction(task, p.inbox ? 'move' : 'delete') }} />
        </View>
      )}
      rightThreshold={40}
    >
      {body}
    </Swipeable>
  )
}

export const TaskRow = memo(TaskRowView)

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingHorizontal: 20, paddingVertical: 12, minHeight: 48 },
  circle: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, marginTop: 1, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 3 },
  title: { fontSize: type.body },
  struck: { textDecorationLine: 'line-through' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metaText: { fontSize: type.footnote },
  shrink: { flexShrink: 1 },
  complete: { flex: 1, justifyContent: 'center', paddingLeft: 24 },
  actions: { flexDirection: 'row' },
  action: { width: 84, alignItems: 'center', justifyContent: 'center', gap: 4 },
  actionLabel: { fontSize: type.caption, fontWeight: '600' },
})
