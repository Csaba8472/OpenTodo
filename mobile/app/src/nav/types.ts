// The app's routes (native-app-everyday D1): five tabs, each with its own stack, and the
// sheets above them. A list route carries what the capture sheet's context rule needs.
import type { Due } from '@shared/types'
import type { NavigatorScreenParams } from '@react-navigation/native'

/** Where a capture came from: Today gives today's date, a project or a label its own. */
export interface CaptureContext {
  today?: boolean
  projectId?: string
  labelId?: string
}

export type StackParams = {
  Today: undefined
  Inbox: undefined
  Upcoming: undefined
  Browse: undefined
  Search: undefined
  Task: { id: string }
  Project: { id: string; name: string }
  Label: { id: string; name: string }
  View: { id: string; name: string }
  Notes: undefined
  Note: { id: string; title: string }
  Logbook: undefined
  Settings: undefined
}

export type TabParams = {
  TodayTab: NavigatorScreenParams<StackParams>
  InboxTab: NavigatorScreenParams<StackParams>
  UpcomingTab: NavigatorScreenParams<StackParams>
  BrowseTab: NavigatorScreenParams<StackParams>
  SearchTab: NavigatorScreenParams<StackParams>
}

export type RootParams = {
  Tabs: NavigatorScreenParams<TabParams>
  Capture: { context: CaptureContext }
  When: { request: string; due: Due | null; title?: string }
  Choose: { request: string; kind: 'project' | 'labels'; selected: string[] }
  TaskMenu: { id: string; inbox?: boolean }
}
