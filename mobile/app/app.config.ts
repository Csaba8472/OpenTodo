// The app's native configuration (OpenSpec change native-app-foundation, D8 and D10):
// `npx expo prebuild` writes ios/ and android/ from this file, in CI and on demand;
// neither folder is committed or edited by hand. SDK 58 always builds with the New
// Architecture and Hermes, so neither needs a setting here.
//
// The ids are the current apps' (D10, the owner's decision of 2026-11-10): the native
// app ships under the existing App Store record as version 2.0.0, on TestFlight first,
// and as the next version of the Android app.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sceneHandover } from './scripts/scene-handover.js'
import type { ExpoConfig } from 'expo/config'
import { withAndroidManifest, withAppBuildGradle, withAppDelegate, withPodfile, type ConfigPlugin } from 'expo/config-plugins'

// A build for your own phone needs an id of its own: on iOS, signed with your own Apple ID
// (app.open-todo.ios belongs to the project's team); on Android, next to an installed
// OpenTodo app signed with the project's key. `OPENTODO_APP_ID=com.you.opentodo npx expo
// prebuild`. Unset, the project's ids. Read only when the native projects are made.
const ownId = process.env.OPENTODO_APP_ID?.trim()

// Plain http to a server, as the Android shell allows (its network_security_config.xml):
// a home server on the local network often has no certificate. On iOS only the local
// network (NSAllowsLocalNetworking below).
const withCleartext: ConfigPlugin = (c) => withAndroidManifest(c, (m) => {
  const app = m.modResults.manifest.application?.[0]
  if (app) app.$['android:usesCleartextTraffic'] = 'true'
  return m
})

// The release signing of the switch (native-app-handover D7, D8): with a keystore.properties
// next to android/ (storeFile, storePassword, keyAlias, keyPassword), as CI writes it for
// the shell from the repository's secrets, the release is signed with that key; without it,
// with the debug key, as before, for a build on your own phone; with -Popentodo.unsigned=true,
// unsigned, as F-Droid builds it to compare with the published APK.
const withReleaseSigning: ConfigPlugin = (c) => withAppBuildGradle(c, (g) => {
  if (g.modResults.contents.includes('opentodo-release-signing')) return g
  g.modResults.contents = g.modResults.contents
    .replace(/signingConfigs \{\n/, `// opentodo-release-signing (app.config.ts)
    def releaseKeys = new Properties()
    def releaseKeysFile = rootProject.file('keystore.properties')
    if (releaseKeysFile.exists()) releaseKeysFile.withInputStream { releaseKeys.load(it) }
    signingConfigs {
        if (releaseKeys.getProperty('storeFile')) {
            release {
                storeFile file(releaseKeys.getProperty('storeFile'))
                storePassword releaseKeys.getProperty('storePassword')
                keyAlias releaseKeys.getProperty('keyAlias')
                keyPassword releaseKeys.getProperty('keyPassword')
            }
        }
`)
    .replace(/(release \{[^}]*?)signingConfig signingConfigs\.debug/, '$1signingConfig releaseKeys.getProperty(\'storeFile\') ? signingConfigs.release : (findProperty(\'opentodo.unsigned\') == \'true\' ? null : signingConfigs.debug)')
  return g
})

// react-native-screens' split view is in its Gamma native targets. Without this build
// setting the package links stubs with the same class names, which cannot mount a column.
const withSplitView: ConfigPlugin = (c) => withPodfile(c, (p) => {
  // 4.30.1 can create its controller after the first mounting transaction: the three
  // columns exist but no update is pending, leaving it blank. Initialize them when the
  // controller is made. Keep this narrow patch reproducible and fail on a changed source.
  const source = join(p.modRequest.projectRoot, 'node_modules/react-native-screens/ios/gamma/split/RNSSplitHostComponentView.mm')
  const original = readFileSync(source, 'utf8')
  const marker = '// OpenTodo: initialize the first split columns'
  if (!original.includes(marker)) {
    const anchor = '    _controller = [[RNSSplitHostController alloc] initWithSplitHostComponentView:self numberOfColumns:numberOfColumns];'
    if (!original.includes(anchor)) throw new Error('Recheck the react-native-screens initial split mount patch for this version')
    writeFileSync(source, original.replace(anchor, `${anchor}\n    ${marker}\n    [_controller setNeedsUpdateOfChildViewControllers];\n    [_controller reactMountingTransactionDidMount];`))
  }
  const flag = "ENV['RNS_GAMMA_ENABLED'] = '1'"
  if (!p.modResults.contents.includes(flag)) p.modResults.contents = `${flag}\n${p.modResults.contents}`
  return p
})

const withSceneHandover: ConfigPlugin = (c) => withAppDelegate(c, (a) => {
  a.modResults.contents = sceneHandover(a.modResults.contents)
  return a
})

const VERSION = '2.0.0'
// Above the web-view app's (1.4.2: 10402), as its versions count: major·10000 + minor·100 + patch.
const BUILD = VERSION.split('.').map(Number).reduce((n, part, i) => n + part * [10000, 100, 1][i], 0)

const config: ExpoConfig = {
  name: 'OpenTodo',
  slug: 'opentodo',
  icon: './assets/icon.png',
  version: VERSION,
  scheme: 'opentodo',
  orientation: 'default',
  // metro.config.js resolves @shared/* itself (with the shared modules' packages).
  experiments: { tsconfigPaths: false },
  // Face ID for biometric unlock (native-app-handover D5); the key stays out of backups.
  plugins: [
    ['expo-secure-store', { faceIDPermission: 'OpenTodo unlocks your encrypted tasks with Face ID.' }],
    // The widget and the share extension in targets/ (native-app-handover D1).
    '@bacons/apple-targets',
  ],
  ios: {
    bundleIdentifier: ownId || 'app.open-todo.ios',
    buildNumber: String(BUILD),
    supportsTablet: true,
    // Light and dark with the system (on Android this needs expo-system-ui, not installed yet).
    userInterfaceStyle: 'automatic',
    // The App Group the widget and the share extension share with the app (the web-view app's).
    entitlements: { 'com.apple.security.application-groups': ['group.app.open-todo'] },
    infoPlist: {
      // The background refresh (native-app-handover D3), the identifier the web-view app used.
      BGTaskSchedulerPermittedIdentifiers: ['app.opentodo.refresh'],
      UIBackgroundModes: ['fetch'],
      // As the shell (mobile/ios/project.yml): plain http only to a server on this network
      // (a home server at 192.168.…, a .local name), https everywhere else.
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
      NSLocalNetworkUsageDescription: 'OpenTodo connects to the server you enter so it can sync your tasks on this network.',
    },
  },
  // The Android shell's application id (mobile/android/app/build.gradle.kts).
  android: {
    package: ownId || 'app.opentodo',
    versionCode: BUILD,
    // Biometric unlock of an encrypted account (native-app-handover D5): the system's prompt.
    permissions: ['android.permission.USE_BIOMETRIC'],
    // Shares from other apps (native-app-handover): text and links, and images, one or several.
    intentFilters: [
      { action: 'SEND', category: ['DEFAULT'], data: [{ mimeType: 'text/*' }] },
      { action: 'SEND', category: ['DEFAULT'], data: [{ mimeType: 'image/*' }] },
      { action: 'SEND_MULTIPLE', category: ['DEFAULT'], data: [{ mimeType: 'image/*' }] },
    ],
  },
}

export default withSceneHandover(withSplitView(withReleaseSigning(withCleartext(config))))
