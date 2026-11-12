// Notes (native-app-everyday 5.1): every note of the workspace, newest first.
import { db } from '@shared/db'
import type { Note } from '@shared/types'
import { useNavigation, type NavigationProp } from '@react-navigation/native'
import { FlatList, Pressable, StyleSheet, Text } from 'react-native'
import { useRead } from '../data/useRead'
import type { StackParams } from '../nav/types'
import { t } from '../ui/i18n'
import { useColors, type } from '../ui/theme'

export function NotesScreen() {
  const c = useColors()
  const nav = useNavigation<NavigationProp<StackParams>>()
  const notes = useRead(async () => (await db.notes.toArray()).filter((n) => !n.deleted_at).sort((a, b) => b.created_at - a.created_at), ['notes'], 'notes')
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      data={notes ?? []}
      keyExtractor={(n: Note) => n.id}
      ListEmptyComponent={notes ? <Text style={[styles.empty, { color: c.muted }]}>{t('No notes yet')}</Text> : undefined}
      renderItem={({ item }) => (
        <Pressable accessibilityRole="button" android_ripple={{ color: c.field }} onPress={() => nav.navigate('Note', { id: item.id, title: item.title })} style={[styles.row, { borderBottomColor: c.separator }]}>
          <Text style={[styles.title, { color: c.text }]}>{item.title || t('Untitled')}</Text>
          {!!item.description && <Text numberOfLines={2} style={[styles.preview, { color: c.muted }]}>{item.description}</Text>}
        </Pressable>
      )}
      style={{ backgroundColor: c.bg }}
    />
  )
}

const styles = StyleSheet.create({
  row: { borderBottomWidth: StyleSheet.hairlineWidth, gap: 4, paddingHorizontal: 20, paddingVertical: 12 },
  title: { fontSize: type.body, fontWeight: '600' },
  preview: { fontSize: type.subhead },
  empty: { fontSize: type.body, padding: 20 },
})
