// A list of tasks in sections (native-app-everyday D3): a recycled native list with pull
// to sync and the sync status line at the top. A completed row stays drawn completed for
// a moment, then folds away; Undo in the toast brings it back. In Select mode the rows
// are a multi-selection and a toolbar acts on them (src/ui/SelectionBar.tsx).
import { syncNow } from '@shared/sync'
import type { Task } from '@shared/types'
import { FlashList } from '@shopify/flash-list'
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as Haptics from 'expo-haptics'
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTablet } from '../nav/tabletContext'
import { moveTask, moveTaskBy } from '@shared/move'
import { complete, move, schedule, trash } from '../data/actions'
import { useLookups } from '../data/lookups'
import { usePickers } from '../nav/pickers'
import type { RootParams, StackParams } from '../nav/types'
import { useTabBarInset } from './insets'
import { SyncLine } from './SyncLine'
import { TaskRow, type RowAction } from './TaskRow'
import { useColors, type } from './theme'

export type { ListSection } from './listSection'
import type { ListSection } from './listSection'

type Item = { kind: 'header'; key: string; title: string; tone?: 'danger' } | { kind: 'task'; key: string; task: Task; done: boolean }

/** How long a completed row stays before it folds away. */
export const LINGER_MS = 1200

export interface TaskListProps {
  sections: ListSection[] | undefined
  today: string
  inbox?: boolean
  /** Today's list: rows leave out a date that is today. */
  hideToday?: boolean
  projectId?: string
  empty: string
  header?: ReactNode
  selecting?: boolean
  /** A list ordered by hand (a project): in edit mode its rows can be dragged to another place. */
  reorder?: boolean
  selected?: ReadonlySet<string>
  onToggle?(id: string): void
}

export function TaskList(p: TaskListProps) {
  const c = useColors()
  const tablet = useTablet()
  const nav = useNavigation<NavigationProp<StackParams & RootParams>>()
  const pickers = usePickers()
  const { projects } = useLookups()
  const bottom = useTabBarInset()
  const [refreshing, setRefreshing] = useState(false)
  // Rows completed a moment ago, drawn where they were until they fold away.
  const [lingering, setLingering] = useState<ReadonlyMap<string, { task: Task; section: string; index: number }>>(new Map())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  useEffect(() => () => { for (const t of timers.current.values()) clearTimeout(t) }, [])

  const forget = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setLingering((m) => { const n = new Map(m); n.delete(id); return n })
  }, [])

  const items = useMemo<Item[]>(() => {
    if (!p.sections) return []
    const out: Item[] = []
    for (const s of p.sections) {
      const rows: { task: Task; done: boolean }[] = s.tasks.filter((t) => !lingering.has(t.id)).map((task) => ({ task, done: false }))
      for (const [, l] of lingering) if (l.section === s.key) rows.splice(Math.min(l.index, rows.length), 0, { task: l.task, done: true })
      if (!rows.length) continue
      if (s.title) out.push({ kind: 'header', key: `h:${s.key}`, title: s.title, tone: s.tone })
      for (const r of rows) out.push({ kind: 'task', key: r.task.id, task: r.task, done: r.done })
    }
    return out
  }, [p.sections, lingering])

  const onAction = useCallback(async (task: Task, action: RowAction) => {
    if (action === 'complete' && task.completed_at) {
      await complete(task.id, false)
    } else if (action === 'complete') {
      const section = p.sections?.find((s) => s.tasks.some((t) => t.id === task.id))
      if (section) {
        const index = section.tasks.findIndex((t) => t.id === task.id)
        setLingering((m) => new Map(m).set(task.id, { task, section: section.key, index }))
        timers.current.set(task.id, setTimeout(() => forget(task.id), LINGER_MS))
      }
      await complete(task.id, true, () => forget(task.id))
    } else if (action === 'delete') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
      await trash(task.id)
    } else if (action === 'schedule') {
      const due = await pickers.when(task.due, task.title)
      if (due !== undefined) await schedule(task.id, due)
    } else if (action === 'up' || action === 'down') {
      await moveTaskBy(task.id, action === 'up' ? -1 : 1)
    } else if (action === 'move') {
      const projectId = await pickers.project(task.project_id)
      if (projectId !== undefined) await move(task.id, projectId)
    }
  }, [p.sections, pickers, forget])

  // The row lands as many places away as it was dragged rows, inside its section.
  const rowHeight = useRef(56)
  const onDrop = useCallback((task: Task, dy: number) => {
    const section = p.sections?.find((s) => s.tasks.some((t) => t.id === task.id))
    if (!section) return
    const from = section.tasks.findIndex((t) => t.id === task.id)
    const to = Math.max(0, Math.min(section.tasks.length - 1, from + Math.round(dy / rowHeight.current)))
    if (to === from) return
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    void moveTask(task.id, { parent_id: task.parent_id ?? null, section_id: section.key === 'none' ? null : section.key, at: to })
  }, [p.sections])

  useFocusEffect(useCallback(() => {
    if (!tablet) return
    const current = {
      ids: p.sections?.flatMap((s) => s.tasks.map((t) => t.id)) ?? [],
      context: { today: p.hideToday, projectId: p.projectId },
      complete: (id: string) => { const task = p.sections?.flatMap((s) => s.tasks).find((t) => t.id === id); if (task) void onAction(task, 'complete') },
    }
    tablet.list.current = current
    return () => { if (tablet.list.current === current) tablet.list.current = null }
  }, [tablet, p.sections, p.hideToday, p.projectId, onAction]))

  const onPress = useCallback((task: Task) => {
    if (p.selecting) p.onToggle?.(task.id)
    else if (tablet) tablet.select(task.id)
    else nav.navigate('Task', { id: task.id })
  }, [nav, p, tablet])
  const onLongPress = useCallback((task: Task) => nav.navigate('TaskMenu', { id: task.id, inbox: p.inbox }), [nav, p.inbox])

  const refresh = async () => {
    setRefreshing(true)
    await syncNow().catch(() => undefined)
    setRefreshing(false)
  }

  return (
    <FlashList
      // Clear of the tab bar and of the floating add button (56 dp and its margin).
      contentContainerStyle={{ paddingBottom: bottom + (bottom ? 88 : 24) }}
      contentInsetAdjustmentBehavior="automatic"
      data={items}
      extraData={[p.selecting, p.selected, projects, p.today]}
      getItemType={(item) => item.kind}
      keyExtractor={(item) => item.key}
      ListEmptyComponent={p.sections ? <Text style={[styles.empty, { color: c.muted }]}>{p.empty}</Text> : null}
      ListHeaderComponent={<View>{p.header}<SyncLine /></View>}
      onRefresh={refresh}
      refreshing={refreshing}
      renderItem={({ item }) => item.kind === 'header'
        ? <Text accessibilityRole="header" style={[styles.heading, { color: item.tone === 'danger' ? c.danger : c.text }]}>{item.title}</Text>
        : (
          <TaskRow
            done={item.done}
            hideToday={p.hideToday}
            inbox={p.inbox}
            onDrop={p.reorder ? onDrop : undefined}
            onAction={(task, a) => { void onAction(task, a) }}
            onLongPress={onLongPress}
            onPress={onPress}
            projectId={p.projectId ?? null}
            projects={projects}
            selected={p.selecting ? p.selected?.has(item.task.id) : tablet?.selected === item.task.id}
            selecting={p.selecting}
            task={item.task}
            today={p.today}
          />
        )}
      style={{ backgroundColor: c.bg }}
    />
  )
}

/** The one action of an empty list, such as Add on an empty Today (design D6). */
export function EmptyAction({ label, onPress }: { label: string; onPress(): void }) {
  const c = useColors()
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.emptyAction}>
      <Text style={{ color: c.accent, fontSize: type.body }}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  heading: { fontSize: type.subhead, fontWeight: '600', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 6 },
  empty: { fontSize: type.body, paddingHorizontal: 20, paddingTop: 24 },
  emptyAction: { paddingHorizontal: 20, paddingVertical: 12 },
})
