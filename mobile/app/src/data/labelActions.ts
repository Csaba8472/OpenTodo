// A label's actions on the phone (native-app-labels): rename and delete through the shared
// writes the web's labels page uses (lib/labels.ts), with the web's own wording.
import { deleteLabel, LabelExistsError, labelUsage, updateLabel } from '@shared/labels'
import type { Label } from '@shared/types'
import { Alert } from 'react-native'
import { t } from '../ui/i18n'

/** The confirmation's text: how many tasks lose the label (they stay). */
export async function deleteMessage(id: string): Promise<string> {
  const n = await labelUsage(id)
  return n
    ? t('{n, plural, one {It is removed from # task. The tasks themselves stay.} other {It is removed from # tasks. The tasks themselves stay.}}', { n })
    : t('No task carries it.')
}

/** Renames, or says why not: an empty name or one another label has changes nothing. */
export async function renameTo(label: Label, name: string): Promise<boolean> {
  try {
    await updateLabel(label.id, { name })
    return true
  } catch (err) {
    Alert.alert(t('Rename label'), err instanceof LabelExistsError
      ? t('Another label has this name. Merge them from the menu or the banner on the labels page.')
      : t('A label needs a name'))
    return false
  }
}

/** Asks, then removes the label from its tasks and deletes it. */
export async function confirmDelete(label: Label): Promise<void> {
  const body = await deleteMessage(label.id)
  Alert.alert(t('Delete label “{name}”?', { name: label.name }), body, [
    { text: t('Cancel'), style: 'cancel' },
    { text: t('Delete label'), style: 'destructive', onPress: () => { void deleteLabel(label.id) } },
  ])
}
