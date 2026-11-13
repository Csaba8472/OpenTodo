// A choice among a few actions, the platform's own: an action sheet on iOS, a dialog list
// on Android (a task's fields, a label's actions).
import { ActionSheetIOS, Alert, Platform } from 'react-native'
import { t } from './i18n'

/** Long enough for Android's dialog to finish closing. */
const DIALOG_CLOSED_MS = 300

export interface ChoiceOption {
  label: string
  /** Shown in red on iOS: it deletes or ends something. */
  destructive?: boolean
  run(): void
}

export function choose(title: string, options: ChoiceOption[]): void {
  if (Platform.OS === 'ios') {
    const destructive = options.findIndex((o) => o.destructive)
    ActionSheetIOS.showActionSheetWithOptions({
      title, options: [...options.map((o) => o.label), t('Cancel')], cancelButtonIndex: options.length,
      destructiveButtonIndex: destructive >= 0 ? destructive : undefined,
    }, (i) => options[i]?.run())
    return
  }
  // The button's press arrives while its dialog is still closing, and Android drops an alert
  // opened then (a confirmation the action asks for): the action runs once it has closed.
  Alert.alert(title, undefined, [...options.map((o) => ({ text: o.label, onPress: () => { setTimeout(o.run, DIALOG_CLOSED_MS) } })), { text: t('Cancel'), style: 'cancel' as const }], { cancelable: true })
}
