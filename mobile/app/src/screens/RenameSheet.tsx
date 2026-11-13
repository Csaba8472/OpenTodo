// A name to change (native-app-labels): one field in a sheet, the old name selected. Return
// or Save answers with the new name; closing the sheet answers nothing. The caller writes
// it, and says when the name cannot be taken.
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { answer } from '../nav/sheets'
import type { RootParams } from '../nav/types'
import { t } from '../ui/i18n'
import { TARGET } from '../ui/target'
import { useColors, type } from '../ui/theme'

export function RenameSheet({ route, navigation }: NativeStackScreenProps<RootParams, 'Rename'>) {
  const c = useColors()
  const insets = useSafeAreaInsets()
  const { request, title, value, label } = route.params
  const [name, setName] = useState(value)
  const saved = useRef(false)

  useEffect(() => navigation.addListener('beforeRemove', () => { if (!saved.current) answer(request, null) }), [navigation, request])

  const save = () => {
    if (!name.trim()) return
    saved.current = true
    answer(request, name.trim())
    navigation.goBack()
  }

  return (
    <View style={[styles.sheet, { backgroundColor: c.card, paddingBottom: insets.bottom + 16 }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>{title}</Text>
      <TextInput
        accessibilityLabel={label}
        autoFocus
        onChangeText={setName}
        onSubmitEditing={save}
        returnKeyType="done"
        selectTextOnFocus
        style={[styles.field, { backgroundColor: c.field, color: c.text }]}
        value={name}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !name.trim() }}
        disabled={!name.trim()}
        onPress={save}
        style={[styles.button, { backgroundColor: c.accent, opacity: name.trim() ? 1 : 0.5 }]}
      >
        <Text style={[styles.buttonText, { color: c.onAccent }]}>{t('Rename')}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  sheet: { flex: 1, gap: 12, paddingHorizontal: 16, paddingTop: 20 },
  title: { fontSize: type.headline, fontWeight: '600' },
  field: { borderRadius: 12, fontSize: type.body, minHeight: TARGET, paddingHorizontal: 16, paddingVertical: 12 },
  button: { alignItems: 'center', borderRadius: 12, justifyContent: 'center', minHeight: TARGET },
  buttonText: { fontSize: type.body, fontWeight: '600' },
})
