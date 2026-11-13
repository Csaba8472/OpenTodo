// Start-up: the host for the shared library first (src/setup.ts: polyfills, Web Crypto,
// the platform port with the SQLite database), then the screens.
import './src/setup'
import { registerRootComponent } from 'expo'
import { AppRegistry } from 'react-native'
import App from './src/App'
import { backgroundAction, backgroundRefresh } from './src/background'

registerRootComponent(App)
// The runs without a screen the shared container starts (native-app-handover D3).
AppRegistry.registerHeadlessTask('OpenTodoRefresh', () => backgroundRefresh)
AppRegistry.registerHeadlessTask('OpenTodoAction', () => backgroundAction)
