// The share extension (native-app-handover D1): the web-view app's, built into the native
// app by @bacons/apple-targets with the shared sources in ../_shared. It writes the share
// to the App Group and opens opentodo://share; the app turns it into an Inbox task.
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'share',
  name: 'OpenTodoShare',
  displayName: 'OpenTodo',
  bundleIdentifier: '.share',
  deploymentTarget: '16.4',
  entitlements: { 'com.apple.security.application-groups': ['group.app.open-todo'] },
}
