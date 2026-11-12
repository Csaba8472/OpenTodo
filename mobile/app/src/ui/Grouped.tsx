// Inset grouped lists (Browse, Settings; design D6): a heading over a card of rows.
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { useColors, type } from './theme'

export function Group({ title, children }: { title?: string; children: ReactNode }) {
  const c = useColors()
  return (
    <View style={styles.group}>
      {title && <Text accessibilityRole="header" style={[styles.title, { color: c.muted }]}>{title}</Text>}
      <View style={[styles.card, { backgroundColor: c.card }]}>{children}</View>
    </View>
  )
}

export function Row({ icon, label, detail, onPress, tint, depth = 0, last, chevron = true, right }: {
  icon?: IconName; label: string; detail?: string; onPress?(): void; tint?: string; depth?: number; last?: boolean; chevron?: boolean; right?: ReactNode
}) {
  const c = useColors()
  return (
    <Pressable
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityRole={onPress ? 'button' : 'text'}
      android_ripple={onPress ? { color: c.field } : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { paddingLeft: 16 + depth * 18, backgroundColor: pressed ? c.field : 'transparent' }]}
    >
      {icon && <Icon color={tint ?? c.accent} name={icon} />}
      <View style={[styles.body, !last && { borderBottomColor: c.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <Text numberOfLines={2} style={[styles.label, { color: tint === c.danger ? c.danger : c.text }]}>{label}</Text>
        {detail && <Text numberOfLines={1} style={[styles.detail, { color: c.muted }]}>{detail}</Text>}
        {right}
        {onPress && chevron && <Icon color={c.separator} name="chevron" size={16} />}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  title: { fontSize: type.footnote, fontWeight: '600', paddingHorizontal: 16, textTransform: 'uppercase' },
  card: { borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 16, paddingVertical: 12 },
  label: { flex: 1, fontSize: type.body },
  detail: { fontSize: type.body, maxWidth: '50%' },
})
