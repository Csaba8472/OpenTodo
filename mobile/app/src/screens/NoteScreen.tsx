// A note (native-app-everyday 5.1): opens rendered; Edit turns it into its Markdown text,
// written as `description`, which the shared op path folds into the note's document, so a
// web edit at the same time converges.
import { db } from '@shared/db'
import { saveNote } from '@shared/ops'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native'
import { useRead } from '../data/useRead'
import type { StackParams } from '../nav/types'
import { t } from '../ui/i18n'
import { Markdown } from '../ui/Markdown'
import { useColors, type } from '../ui/theme'

export function NoteScreen({ route, navigation }: NativeStackScreenProps<StackParams, 'Note'>) {
  const c = useColors()
  const { id } = route.params
  const note = useRead(() => db.notes.get(id), ['notes'], `note:${id}`)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const save = (value: string) => {
    setText(value)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void saveNote('note', id, { description: value }) }, 800)
  }
  const finish = () => {
    if (timer.current) clearTimeout(timer.current)
    if (text !== null && text !== note?.description) void saveNote('note', id, { description: text })
    setEditing(false)
    setText(null)
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable accessibilityRole="button" hitSlop={10} onPress={editing ? finish : () => setEditing(true)}>
          <Text style={{ color: c.accent, fontSize: type.body, fontWeight: editing ? '600' : '400' }}>{editing ? t('Done') : t('Edit')}</Text>
        </Pressable>
      ),
    })
  })

  if (!note) return null
  return (
    <ScrollView contentContainerStyle={styles.page} contentInsetAdjustmentBehavior="automatic" keyboardDismissMode="interactive" style={{ backgroundColor: c.bg }}>
      <Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>{note.title || t('Untitled')}</Text>
      {editing ? (
        <TextInput accessibilityLabel={t('Note')} autoFocus multiline onChangeText={save} scrollEnabled={false} style={[styles.editor, { color: c.text }]} value={text ?? note.description} />
      ) : (
        <Markdown text={note.description} />
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { gap: 12, padding: 20, paddingBottom: 48 },
  title: { fontSize: type.title, fontWeight: '700' },
  editor: { fontFamily: 'monospace', fontSize: type.callout, minHeight: 240, textAlignVertical: 'top' },
})
