// Settings (native-app-everyday 5.3): the account, the server, the appearance (the system,
// light or dark, kept on this phone), the app's notifications in the system settings, Open
// on the web for everything configured there (the default browser, never a web view
// inside the app), and Sign out, which leaves nothing of the account on the phone.
import { platform } from '@shared/platform'
import { useEffect, useState } from 'react'
import { Alert, Appearance, Linking, ScrollView, StyleSheet } from 'react-native'
import { session } from '../appSession'
import { signOut } from '../signIn'
import { Group, Row } from '../ui/Grouped'
import { Icon } from '../ui/Icon'
import { t } from '../ui/i18n'
import { useTabBarInset } from '../ui/insets'
import { useColors } from '../ui/theme'

export type AppearanceChoice = 'system' | 'light' | 'dark'
const APPEARANCE = 'opentodo.appearance'

/** The appearance chosen on this phone, applied at start-up and when it changes. */
export function applyAppearance(choice: AppearanceChoice = (platform.prefs.get(APPEARANCE) as AppearanceChoice | null) ?? 'system'): void {
  Appearance.setColorScheme(choice === 'system' ? 'unspecified' : choice)
}

export function SettingsScreen() {
  const c = useColors()
  const bottom = useTabBarInset()
  const [me, setMe] = useState<{ name?: string; email?: string } | null>(null)
  const [appearance, setAppearance] = useState<AppearanceChoice>((platform.prefs.get(APPEARANCE) as AppearanceChoice | null) ?? 'system')
  const server = session.server ?? ''

  useEffect(() => {
    void session.fetch('/api/v1/me', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { user?: { name?: string; email?: string } } | null) => setMe(b?.user ?? null), () => undefined)
  }, [])

  const choose = (next: AppearanceChoice) => {
    setAppearance(next)
    platform.prefs.set(APPEARANCE, next)
    applyAppearance(next)
  }
  const confirmSignOut = () => Alert.alert(t('Sign out?'), t('The tasks on this phone are removed; they stay on your server.'), [
    { text: t('Cancel'), style: 'cancel' },
    { text: t('Sign out'), style: 'destructive', onPress: () => { void signOut() } },
  ])

  return (
    <ScrollView contentContainerStyle={[styles.page, { paddingBottom: 48 + bottom }]} contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.grouped }}>
      <Group title={t('Account')}>
        <Row chevron={false} label={me?.name || me?.email || '…'} detail={me?.name ? me.email : undefined} />
        <Row chevron={false} label={t('Server')} detail={server.replace(/^https?:\/\//, '')} last />
      </Group>
      <Group title={t('Appearance')}>
        {(['system', 'light', 'dark'] as const).map((choice, i) => (
          <Row
            chevron={false}
            key={choice}
            label={choice === 'system' ? t('System') : choice === 'light' ? t('Light') : t('Dark')}
            last={i === 2}
            onPress={() => choose(choice)}
            right={appearance === choice ? <Icon color={c.accent} name="check" /> : undefined}
          />
        ))}
      </Group>
      <Group>
        <Row icon="reminder" label={t('Notifications')} onPress={() => { void Linking.openSettings() }} />
        <Row icon="web" label={t('Open on the web')} last onPress={() => { void Linking.openURL(`${server}/settings`) }} />
      </Group>
      <Group>
        <Row chevron={false} label={t('Sign out')} last onPress={confirmSignOut} tint={c.danger} />
      </Group>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { gap: 24, padding: 16, paddingBottom: 48 },
})
