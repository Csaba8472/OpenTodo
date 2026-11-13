// The Today widget (native-app-handover D1): the web-view app's WidgetKit extension, built
// into the native app by @bacons/apple-targets with the shared sources in ../_shared. It
// reads the snapshot the app writes to the App Group and never makes a request.
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'OpenTodoWidget',
  displayName: 'Today',
  bundleIdentifier: '.widget',
  deploymentTarget: '16.4',
  frameworks: ['SwiftUI', 'WidgetKit'],
  entitlements: { 'com.apple.security.application-groups': ['group.app.open-todo'] },
}
