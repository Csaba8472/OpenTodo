// Today (OpenSpec change native-app-foundation, task 4.6): the shared Today list over the
// phone's indexes (src/storage/lists.ts), drawn with a native list. Tapping a task's circle
// completes it, with a tap of the haptic engine, through the shared op path (ops.ts), so
// it reaches the server like any device's change. The sync status shows only when it has
// something to say: offline (with the last sync), an error, or a locked account.
import { logicalToday } from '@shared/dates'
import { completeTask } from '@shared/ops'
import { useSyncStatus } from '@shared/sync'
import type { Task } from '@shared/types'
import * as Haptics from 'expo-haptics'
import { useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { todayTasks } from './storage/lists'
import { useColors, type Colors } from './theme'
import { useRead } from './useRead'

const STORES = ['tasks', 'projects', 'meta', 'workspaces'] as const

function syncLine(s: ReturnType<typeof useSyncStatus>): string | null {
  const last = s.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : null
  switch (s.state) {
    case 'offline':
      return last ? `Offline · last synced ${last}` : 'Offline'
    case 'error':
      return s.error ?? 'Sync failed'
    case 'locked':
      return 'This account is end-to-end encrypted. Unlock it on the web for now.'
    default:
      return null
  }
}

function Row({ task, c, onComplete }: { task: Task; c: Colors; onComplete: (t: Task) => void }) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel={`Complete ${task.title}`}
        accessibilityRole="button"
        hitSlop={12}
        onPress={() => onComplete(task)}
        style={({ pressed }) => [styles.circle, { borderColor: pressed ? c.accent : c.muted }]}
      />
      <Text numberOfLines={2} style={[styles.title, { color: c.text }]}>{task.title}</Text>
      {task.due?.time ? <Text style={[styles.time, { color: c.muted }]}>{task.due.time}</Text> : null}
    </View>
  )
}

export function TodayScreen({ onSignOut }: { onSignOut: () => void }) {
  const c = useColors()
  const insets = useSafeAreaInsets()
  const today = logicalToday()
  const tasks = useRead(() => todayTasks(today), STORES, today)
  const status = useSyncStatus()
  const line = syncLine(status)
  // Gone from the list at once; the database write follows.
  const [done, setDone] = useState<ReadonlySet<string>>(new Set())

  const complete = (task: Task) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setDone((d) => new Set(d).add(task.id))
    void completeTask(task.id).catch(() => setDone((d) => { const n = new Set(d); n.delete(task.id); return n }))
  }
  const shown = tasks?.filter((t) => !done.has(t.id))

  return (
    <View style={[styles.screen, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      <FlatList
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        data={shown ?? []}
        keyExtractor={(t) => t.id}
        ListEmptyComponent={shown ? <Text style={[styles.empty, { color: c.muted }]}>Nothing for today</Text> : undefined}
        ListFooterComponent={
          <Pressable accessibilityRole="button" onPress={onSignOut} style={styles.signOut}>
            <Text style={{ color: c.accent, fontSize: 17 }}>Sign out</Text>
          </Pressable>
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.heading, { color: c.text }]}>Today</Text>
            {line && <Text accessibilityLiveRegion="polite" style={[styles.status, { color: c.muted }]}>{line}</Text>}
          </View>
        }
        // Inset under the title, as iOS lists draw them; none after the last row.
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: c.separator }]} />}
        renderItem={({ item }) => <Row c={c} onComplete={complete} task={item} />}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, gap: 4 },
  heading: { fontSize: 34, fontWeight: '700' },
  status: { fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 13 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 56 },
  circle: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5 },
  title: { flex: 1, fontSize: 17 },
  time: { fontSize: 15 },
  empty: { fontSize: 17, paddingHorizontal: 20, paddingTop: 24 },
  signOut: { alignItems: 'center', paddingVertical: 24 },
})
