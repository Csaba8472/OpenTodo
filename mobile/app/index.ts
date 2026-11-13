// Start-up: the host for the shared library first (src/setup.ts: polyfills, Web Crypto,
// the platform port with the SQLite database), then the screens.
import './src/setup'
import { registerRootComponent } from 'expo'
import { AppRegistry } from 'react-native'
import { container } from './modules/opentodo-shared-container'
import App from './src/App'
import { backgroundAction, backgroundRefresh } from './src/background'

registerRootComponent(App)
// The runs without a screen the shared container starts (native-app-handover D3): on
// Android WorkManager starts them as headless tasks; iOS wakes the app for its refresh
// (BGAppRefreshTask) and the task ends when the run does.
AppRegistry.registerHeadlessTask('OpenTodoRefresh', () => backgroundRefresh)
AppRegistry.registerHeadlessTask('OpenTodoAction', () => backgroundAction)
const refresh = () => { void backgroundRefresh().finally(() => container.refreshDone()) }
container.on('onRefresh', refresh)
if (container.pendingRefresh()) refresh()

// A notification response can launch iOS without connecting a window. This listener
// and the peek run independently of mounting the screen's startDevice subscription.
const action = () => { void backgroundAction().catch(() => undefined) }
container.on('onAction', action)
if (container.takeActions().length) action()
