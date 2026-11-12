// The app's strings (design context: the shared i18n): the web's catalogs in its seven
// languages, so a phrase the web has is translated here too; a phrase only the app has
// reads in English until the catalogs list it. The language follows the device.
import { applyLanguagePreference } from '@shared/i18n'

export { t, useLanguageVersion } from '@shared/i18n'

/** Loads the device language's catalog; English stays when it cannot load. */
export function bootLanguage(): Promise<void> {
  return applyLanguagePreference('system').catch(() => undefined)
}
