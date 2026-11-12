// The sync status line (native-app spec "Sync in the app"; everyday 2.4): only when it has
// something to say: offline with the time of the last sync, an error, or a locked account.
import { useSyncStatus } from '@shared/sync'
import { StyleSheet, Text, View } from 'react-native'
import { t } from './i18n'
import { Icon } from './Icon'
import { useColors, type } from './theme'

export function syncLine(s: ReturnType<typeof useSyncStatus>): string | null {
  const last = s.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : null
  switch (s.state) {
    case 'offline':
      return last ? t('Offline · last synced {time}', { time: last }) : t('Offline')
    case 'error':
      return s.error ?? t('Sync failed')
    case 'locked':
      return t('Locked')
    default:
      return null
  }
}

export function SyncLine() {
  const c = useColors()
  const line = syncLine(useSyncStatus())
  if (!line) return null
  return (
    <View accessibilityLiveRegion="polite" style={styles.line}>
      <Icon color={c.muted} name="offline" size={15} />
      <Text style={[styles.text, { color: c.muted }]}>{line}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 6 },
  text: { fontSize: type.subhead, flexShrink: 1 },
})
