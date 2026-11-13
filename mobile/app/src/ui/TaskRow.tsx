// A task row (native-app-everyday D3, D8): the circle, the title (growing, never cut short),
// and at most one line under it: the date, the project outside its own list, and one icon
// each for priority, repeat and notes. A full swipe right completes; a swipe left shows
// Schedule and Delete (Schedule and Move in the Inbox); a long-press opens the task's menu.
// Every swipe action is an accessibility action of the row too.
import { describeDue } from '@shared/dates'
import { priorityName } from '@shared/priority'
import type { Project, Task } from '@shared/types'
import * as Haptics from 'expo-haptics'
import { memo, useRef, useState } from 'react'
import { Animated, Platform, Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native'
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler'
import Swipeable, { SwipeDirection, type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable'
import { TabletView } from '../../modules/opentodo-shared-container/TabletView'
import { useTablet } from '../nav/tabletContext'
import { t } from './i18n'
import { Icon, type IconName } from './Icon'
import { useColors, type, type Colors } from './theme'
import { around } from './target'

export type RowAction = 'complete' | 'schedule' | 'delete' | 'move' | 'up' | 'down'

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
  /** In edit mode of a list ordered by hand: a handle to drag the row to another place. */
  onDrop?(task: Task, dy: number): void
  selected?: boolean
  onPress(task: Task): void
  onLongPress(task: Task): void
  onAction(task: Task, action: RowAction): void
}

/** How far a finger moves sideways before a row's swipe starts, in dp. */
const SWIPE_START = 24

const PRIORITY_TONE = (c: Colors, p: number) => (p === 1 ? c.danger : p === 2 ? c.warning : c.accent)

function Action({ icon, label, color, c, onPress }: { icon: IconName; label: string; color: string; c: Colors; onPress(): void }) {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={[styles.action, { backgroundColor: color }]}>
      <Icon color={c.onAccent} name={icon} />
      <Text style={[styles.actionLabel, { color: c.onAccent }]}>{label}</Text>
    </Pressable>
  )
}

/**
 * The reorder handle (design D3): hold and drag; the row follows the finger and lands where
 * it is let go. Move up and Move down are its accessibility actions.
 */
function DragHandle({ c, onMove, onDrop, offset }: { c: Colors; onMove(dir: 'up' | 'down'): void; onDrop(dy: number): void; offset: Animated.Value }) {
  const [active, setActive] = useState(false)
  const pan = usePanGesture({
    runOnJS: true,
    activateAfterLongPress: 120,
    onActivate: () => { setActive(true); void Haptics.selectionAsync() },
    onUpdate: (e) => offset.setValue(e.translationY),
    onDeactivate: (e) => { setActive(false); offset.setValue(0); onDrop(e.translationY) },
  })
  return (
    <GestureDetector gesture={pan}>
      <View
        accessibilityActions={[{ name: 'up', label: t('Move up') }, { name: 'down', label: t('Move down') }]}
        accessibilityLabel={t('Reorder')}
        accessibilityRole="adjustable"
        accessible
        onAccessibilityAction={(e) => onMove(e.nativeEvent.actionName === 'up' ? 'up' : 'down')}
        style={styles.handle}
      >
        <Icon color={active ? c.accent : c.muted} name="drag" />
      </View>
    </GestureDetector>
  )
}

function TaskRowView(p: TaskRowProps) {
  const c = useColors()
  const tablet = useTablet()
  const [hovered, setHovered] = useState(false)
  const swipe = useRef<SwipeableMethods>(null)
  const offset = useRef(new Animated.Value(0)).current
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
      onLongPress={p.selecting || tablet ? undefined : () => p.onLongPress(task)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={() => p.onPress(task)}
      style={({ pressed }) => [styles.row, { backgroundColor: (pressed || hovered || (!p.selecting && p.selected)) && Platform.OS === 'ios' ? c.field : c.bg }]}
      android_ripple={{ color: c.field }}
    >
      <Pressable
        accessibilityElementsHidden
        disabled={p.selecting}
        importantForAccessibility="no-hide-descendants"
        onPress={() => p.onAction(task, 'complete')}
        style={styles.target}
      >
        <View
          style={[
            styles.circle,
            { borderColor: (p.selecting && p.selected) || done ? c.accent : task.priority < 4 ? PRIORITY_TONE(c, task.priority) : c.muted },
            ((p.selecting && p.selected) || done) && { backgroundColor: c.accent },
          ]}
        >
          {((p.selecting && p.selected) || done) && <Icon color={c.onAccent} name="check" size={14} />}
        </View>
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
      {p.selecting && p.onDrop && (
        <DragHandle c={c} offset={offset} onDrop={(dy) => p.onDrop?.(task, dy)} onMove={(dir) => p.onAction(task, dir)} />
      )}
    </Pressable>
  )

  if (p.selecting) return p.onDrop ? <Animated.View style={{ transform: [{ translateY: offset }], zIndex: 2 }}>{body}</Animated.View> : body
  return (
    <TabletView taskId={tablet ? task.id : ''}><Swipeable
      ref={swipe}
      // A swipe starts after 24 dp sideways, not the library's 10: a thumb drifts that much
      // sideways while it starts to scroll, and the row then took the drag from the list.
      dragOffsetFromLeft={SWIPE_START}
      dragOffsetFromRight={-SWIPE_START}
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
    </Swipeable></TabletView>
  )
}

export const TaskRow = memo(TaskRowView)

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingHorizontal: 20, paddingVertical: 12, minHeight: 48 },
  target: { ...around(22), marginTop: -12 },
  circle: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
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
  handle: { alignSelf: 'center', paddingLeft: 8, paddingVertical: 4 },
})
