// The project and label lists (native-app-everyday D5): a searchable list in a sheet.
// A project is one choice (the Inbox included); labels are several, and a label the
// search names that does not exist yet can be made from it.
import { db } from '@shared/db'
import { activeLabels, createLabel, labelKey } from '@shared/labels'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { answer } from '../nav/sheets'
import type { RootParams } from '../nav/types'
import { t } from '../ui/i18n'
import { Icon } from '../ui/Icon'
import { useColors, type } from '../ui/theme'
import { TARGET } from '../ui/target'

interface Choice { id: string; name: string; depth: number }

export function ChooseSheet({ route, navigation }: NativeStackScreenProps<RootParams, 'Choose'>) {
  const c = useColors()
  const insets = useSafeAreaInsets()
  const { kind, request } = route.params
  const many = kind === 'labels'
  const [items, setItems] = useState<Choice[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(route.params.selected))

  useEffect(() => navigation.addListener('beforeRemove', () => answer(request, many ? { ids: [...selected] } : null)), [navigation, request, many, selected])

  useEffect(() => {
    if (many) {
      void db.labels.toArray().then((l) => setItems(activeLabels(l).map((x) => ({ id: x.id, name: x.name, depth: 0 }))))
      return
    }
    void db.projects.toArray().then((all) => {
      const live = all.filter((p) => !p.deleted_at && !p.archived).sort((a, b) => a.position - b.position)
      const depth = (id: string | null | undefined, n = 0): number => {
        const p = id ? live.find((x) => x.id === id) : undefined
        return p && n < 8 ? depth(p.parent_id, n + 1) : n
      }
      setItems([{ id: '', name: t('Inbox'), depth: 0 }, ...live.map((p) => ({ id: p.id, name: p.name, depth: depth(p.parent_id) }))])
    })
  }, [many])

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase()
    return q ? items.filter((i) => i.name.toLocaleLowerCase().includes(q)) : items
  }, [items, query])
  const canCreate = many && query.trim() && !items.some((i) => labelKey(i.name) === labelKey(query))

  const pick = (id: string) => {
    if (!many) {
      answer(request, { ids: id ? [id] : [] })
      navigation.goBack()
      return
    }
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  const create = async () => {
    const id = await createLabel({ name: query.trim() })
    setItems((list) => [...list, { id, name: query.trim(), depth: 0 }])
    setSelected((s) => new Set(s).add(id))
    setQuery('')
  }

  return (
    <View style={[styles.sheet, { backgroundColor: c.card, paddingBottom: insets.bottom }]}>
      <TextInput
        accessibilityLabel={t('Search')}
        autoFocus={items.length > 8}
        onChangeText={setQuery}
        placeholder={many ? t('Search or create a label') : t('Search projects')}
        placeholderTextColor={c.muted}
        style={[styles.search, { backgroundColor: c.field, color: c.text }]}
        value={query}
      />
      <FlatList
        data={shown}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(i) => i.id || 'inbox'}
        ListHeaderComponent={canCreate ? (
          <Pressable accessibilityRole="button" onPress={() => { void create() }} style={styles.row}>
            <Icon color={c.accent} name="add" />
            <Text style={[styles.name, { color: c.accent }]}>{t('Create “{name}”', { name: query.trim() })}</Text>
          </Pressable>
        ) : undefined}
        renderItem={({ item }) => {
          const on = selected.has(item.id) || (!many && !item.id && selected.size === 0)
          return (
            <Pressable
              accessibilityRole={many ? 'checkbox' : 'button'}
              accessibilityState={many ? { checked: on } : { selected: on }}
              android_ripple={{ color: c.field }}
              onPress={() => pick(item.id)}
              style={[styles.row, { paddingLeft: 20 + item.depth * 16 }]}
            >
              <Icon color={c.muted} name={many ? 'label' : item.id ? 'project' : 'inbox'} />
              <Text style={[styles.name, { color: c.text }]}>{item.name}</Text>
              {on && <Icon color={c.accent} name="check" />}
            </Pressable>
          )
        }}
      />
      {many && (
        <Pressable accessibilityRole="button" onPress={() => navigation.goBack()} style={[styles.done, { backgroundColor: c.accent }]}>
          <Text style={{ color: c.onAccent, fontSize: type.body, fontWeight: '600' }}>{t('Done')}</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  sheet: { flex: 1, paddingTop: 16 },
  search: { borderRadius: 10, fontSize: type.body, marginHorizontal: 16, marginBottom: 6, minHeight: TARGET, paddingHorizontal: 14, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 13, minHeight: 48 },
  name: { flex: 1, fontSize: type.body },
  done: { alignItems: 'center', borderRadius: 12, margin: 16, paddingVertical: 14 },
})
