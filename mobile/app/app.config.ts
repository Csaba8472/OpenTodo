// The app's native configuration (OpenSpec change native-app-foundation, D8 and D10):
// `npx expo prebuild` writes ios/ and android/ from this file, in CI and on demand;
// neither folder is committed or edited by hand. SDK 58 always builds with the New
// Architecture and Hermes, so neither needs a setting here.
//
// The ids are the current apps' (D10, the owner's decision of 2026-11-10): the native
// app ships under the existing App Store record as version 2.0.0, on TestFlight first,
// and as the next version of the Android app.
import type { ExpoConfig } from 'expo/config'
import { withAndroidManifest, type ConfigPlugin } from 'expo/config-plugins'

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

const config: ExpoConfig = {
  name: 'OpenTodo',
  slug: 'opentodo',
  version: '2.0.0',
  scheme: 'opentodo',
  orientation: 'portrait',
  // metro.config.js resolves @shared/* itself (with the shared modules' packages).
  experiments: { tsconfigPaths: false },
  ios: {
    bundleIdentifier: ownId || 'app.open-todo.ios',
    supportsTablet: false,
    // Light and dark with the system (on Android this needs expo-system-ui, not installed yet).
    userInterfaceStyle: 'automatic',
    infoPlist: {
      // As the shell (mobile/ios/project.yml): plain http only to a server on this network
      // (a home server at 192.168.…, a .local name), https everywhere else.
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
      NSLocalNetworkUsageDescription: 'OpenTodo connects to the server you enter so it can sync your tasks on this network.',
    },
  },
  // The Android shell's application id (mobile/android/app/build.gradle.kts).
  android: {
    package: ownId || 'app.opentodo',
  },
}

export default withCleartext(config)
