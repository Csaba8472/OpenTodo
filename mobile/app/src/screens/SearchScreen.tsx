// Search (native-app-everyday 5.2): tasks and notes on the device, offline, with the
// shared matching and ranking (lib/noteSearch: a task is its title and its notes), in the
// platform's search field in the navigation bar.
import { db } from '@shared/db'
import { logicalToday } from '@shared/dates'
import { compareHits, matchNote, parseQuery, type NoteHit, type SearchableNote } from '@shared/noteSearch'
import type { Note, Task } from '@shared/types'
import { useNavigation, type NavigationProp } from '@react-navigation/native'
import { useEffect, useLayoutEffect, useState } from 'react'
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTablet } from '../nav/tabletContext'
import { complete } from '../data/actions'
import { useLookups } from '../data/lookups'
import type { RootParams, StackParams } from '../nav/types'
import { visibleTasks } from '../storage/lists'
import { t } from '../ui/i18n'
import { Icon } from '../ui/Icon'
import { TaskRow } from '../ui/TaskRow'
import { useColors, type } from '../ui/theme'

const MAX = 100

type Hit = { kind: 'task'; task: Task } | { kind: 'note'; note: Note } | { kind: 'header'; title: string }

export async function search(query: string): Promise<{ tasks: Task[]; notes: Note[] }> {
  const terms = parseQuery(query)
  if (!terms.length) return { tasks: [], notes: [] }
  const rank = <T,>(items: { item: T; s: SearchableNote }[]) => items
    .map(({ item, s }) => ({ ...matchNote(s, terms), note: s, item }))
    .filter((h) => h.matched)
    .sort((a, b) => compareHits(a as NoteHit<SearchableNote>, b as NoteHit<SearchableNote>))
    .slice(0, MAX)
    .map((h) => h.item)
  const [{ list }, notes] = await Promise.all([visibleTasks(), db.notes.toArray()])
  return {
    tasks: rank(list.map((task) => ({ item: task, s: { key: task.id, title: task.title, text: task.description ?? '', updated: task.completed_at ?? task.created_at } }))),
    notes: rank(notes.filter((n) => !n.deleted_at).map((note) => ({ item: note, s: { key: note.id, title: note.title, text: note.description, updated: note.created_at } }))),
  }
}

export function SearchScreen() {
  const c = useColors()
  const tablet = useTablet()
  const nav = useNavigation<NavigationProp<StackParams & RootParams>>()
  const { projects } = useLookups()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const today = logicalToday()

  // iOS: the search field of the navigation bar. Android: Material's search bar, always
  // shown at the top (the app bar's collapsed search icon hides where to type).
  useLayoutEffect(() => {
    if (Platform.OS !== 'ios' || tablet) return
    nav.setOptions({ headerSearchBarOptions: { placeholder: t('Search tasks and notes'), onChangeText: (e: { nativeEvent: { text: string } }) => setQuery(e.nativeEvent.text), hideWhenScrolling: false, autoFocus: !!tablet } })
  }, [nav, tablet])

  useEffect(() => {
    let live = true
    if (!query.trim()) { setHits(null); return }
    const timer = setTimeout(() => {
      void search(query).then((r) => {
        if (!live) return
        const out: Hit[] = []
        if (r.tasks.length) out.push({ kind: 'header', title: t('Tasks') }, ...r.tasks.map((task) => ({ kind: 'task' as const, task })))
        if (r.notes.length) out.push({ kind: 'header', title: t('Notes') }, ...r.notes.map((note) => ({ kind: 'note' as const, note })))
        setHits(out)
      })
    }, 120)
    return () => { live = false; clearTimeout(timer) }
  }, [query])

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      data={hits ?? []}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={Platform.OS === 'ios' && !tablet ? undefined : (
        <TextInput
          accessibilityLabel={tablet ? t('Search tasks and notes') : t('Search')}
          autoFocus={!!tablet}
          autoCorrect={false}
          onChangeText={setQuery}
          placeholder={t('Search tasks and notes')}
          placeholderTextColor={c.muted}
          returnKeyType="search"
          style={[styles.field, { backgroundColor: c.field, color: c.text }]}
          value={query}
        />
      )}
      keyExtractor={(h, i) => (h.kind === 'task' ? h.task.id : h.kind === 'note' ? h.note.id : `h${i}`)}
      ListEmptyComponent={hits ? <Text style={[styles.empty, { color: c.muted }]}>{t('No results')}</Text> : undefined}
      renderItem={({ item }) => {
        if (item.kind === 'header') return <Text accessibilityRole="header" style={[styles.heading, { color: c.text }]}>{item.title}</Text>
        if (item.kind === 'task') {
          return (
            <TaskRow
              onAction={(task, a) => { if (a === 'complete') void complete(task.id, !task.completed_at) }}
              onLongPress={(task) => nav.navigate('TaskMenu', { id: task.id })}
              onPress={(task) => tablet ? tablet.select(task.id) : nav.navigate('Task', { id: task.id })}
              projects={projects}
              task={item.task}
              today={today}
            />
          )
        }
        return (
          <Pressable accessibilityRole="button" android_ripple={{ color: c.field }} onPress={() => nav.navigate('Note', { id: item.note.id, title: item.note.title })} style={styles.note}>
            <Icon color={c.muted} name="note" />
            <View style={styles.flex}>
              <Text style={[styles.noteTitle, { color: c.text }]}>{item.note.title || t('Untitled')}</Text>
              {!!item.note.description && <Text numberOfLines={1} style={[styles.preview, { color: c.muted }]}>{item.note.description}</Text>}
            </View>
          </Pressable>
        )
      }}
      style={{ backgroundColor: c.bg }}
    />
  )
}

const styles = StyleSheet.create({
  field: { borderRadius: 28, fontSize: type.body, marginHorizontal: 16, marginVertical: 8, paddingHorizontal: 20, paddingVertical: 14 },
  heading: { fontSize: type.subhead, fontWeight: '600', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 6 },
  empty: { fontSize: type.body, padding: 20 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingHorizontal: 20, paddingVertical: 12 },
  flex: { flex: 1, gap: 3 },
  noteTitle: { fontSize: type.body },
  preview: { fontSize: type.footnote },
})
