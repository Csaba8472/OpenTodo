// The iPad's responder-chain keyboard commands and system drag/drop. On other devices
// this is a plain View, so the phone's swipes and long-press menu keep working.
import { requireNativeView } from 'expo'
import type { ReactNode } from 'react'
import { Platform, View, type ViewProps } from 'react-native'

interface Props extends ViewProps {
  children?: ReactNode
  keyboardEnabled?: boolean
  taskId?: string
  projectId?: string
  onCommand?(e: { nativeEvent: { command: string } }): void
  onTaskDrop?(e: { nativeEvent: { taskId: string } }): void
}

const NativeView = Platform.OS === 'ios' ? requireNativeView<Props>('OpenTodoSharedContainer', 'TabletView') : View
export function TabletView(props: Props) { return <NativeView {...props} /> }
