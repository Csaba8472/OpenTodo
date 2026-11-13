// The app's navigation (native-app-everyday D1, D2): the platform's tab bar with five
// tabs (react-native-screens' native tabs: UITabBarController, the Material bottom
// navigation), each with its own native stack and large titles, and the sheets above them
// (capture, the date sheet, the pickers, a task's menu) as native form sheets with detents.
import { createNativeBottomTabNavigator, type NativeBottomTabIcon } from '@react-navigation/bottom-tabs/unstable'
import { DarkTheme, DefaultTheme, NavigationContainer, type LinkingOptions, type Theme } from '@react-navigation/native'
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack'
import { unstable_getMaterialSymbolSourceAsync } from 'expo-symbols'
import { useEffect, useState } from 'react'
import { Platform, useColorScheme, useWindowDimensions, type ImageSourcePropType } from 'react-native'
import { useRead } from '../data/useRead'
import { BrowseScreen } from '../screens/BrowseScreen'
import { CaptureSheet } from '../screens/CaptureSheet'
import { ChooseSheet } from '../screens/ChooseSheet'
import { InboxScreen } from '../screens/InboxScreen'
import { LabelScreen } from '../screens/LabelScreen'
import { LogbookScreen } from '../screens/LogbookScreen'
import { NoteScreen } from '../screens/NoteScreen'
import { NotesScreen } from '../screens/NotesScreen'
import { ProjectScreen } from '../screens/ProjectScreen'
import { SearchScreen } from '../screens/SearchScreen'
import { SettingsScreen } from '../screens/SettingsScreen'
import { TaskMenuSheet } from '../screens/TaskMenuSheet'
import { TaskScreen } from '../screens/TaskScreen'
import { TASK_STORES, TodayScreen } from '../screens/TodayScreen'
import { UpcomingScreen } from '../screens/UpcomingScreen'
import { ViewScreen } from '../screens/ViewScreen'
import { WhenSheet } from '../screens/WhenSheet'
import { inboxList } from '../storage/lists'
import { t, useLanguageVersion } from '../ui/i18n'
import { iconPair, type IconName } from '../ui/Icon'
import { ToastHost } from '../ui/Toast'
import { useColors } from '../ui/theme'
import { TabletLayout } from './TabletLayout'
import { useTablet } from './tabletContext'
import { tabletWidth } from './tabletState'
import type { RootParams, StackParams, TabParams } from './types'

const Root = createNativeStackNavigator<RootParams>()
const Tabs = createNativeBottomTabNavigator<TabParams>()

const TAB_ICONS: Record<keyof TabParams, IconName> = { TodayTab: 'today', InboxTab: 'inbox', UpcomingTab: 'upcoming', BrowseTab: 'browse', SearchTab: 'search' }

/** The tab icons: SF Symbols on iOS; on Android, Material Symbols drawn to images once. */
function useTabIcons(color: string): Record<string, NativeBottomTabIcon> | null {
  const [android, setAndroid] = useState<Record<string, NativeBottomTabIcon> | null>(null)
  useEffect(() => {
    if (Platform.OS === 'ios') return
    let live = true
    void Promise.all(Object.entries(TAB_ICONS).map(async ([tab, name]) => {
      const source = await unstable_getMaterialSymbolSourceAsync(iconPair(name).android as never, 24, color)
      return [tab, { type: 'image', source: source as ImageSourcePropType }] as const
    })).then((pairs) => { if (live) setAndroid(Object.fromEntries(pairs)) })
    return () => { live = false }
  }, [color])
  if (Platform.OS === 'ios') {
    return Object.fromEntries(Object.entries(TAB_ICONS).map(([tab, name]) => [tab, { type: 'sfSymbol', name: iconPair(name).ios as never }]))
  }
  return android
}

/** One tab's stack: its list first, then whatever is pushed from it. */
function TaskRoute(props: NativeStackScreenProps<StackParams, 'Task'>) {
  const tablet = useTablet()
  const id = props.route.params.id
  const nav = props.navigation
  useEffect(() => {
    if (!tablet) return
    tablet.select(id)
    if (nav.canGoBack()) nav.goBack()
  }, [tablet, id, nav])
  return tablet ? null : <TaskScreen {...props} />
}

function makeStack(first: keyof StackParams, Component: React.ComponentType, title: () => string) {
  const Stack = createNativeStackNavigator<StackParams>()
  return function TabStack() {
    const c = useColors()
    useLanguageVersion()
    return (
      <Stack.Navigator screenOptions={{ headerLargeTitle: true, headerTintColor: c.accent, headerTitleStyle: { color: c.text }, headerLargeTitleStyle: { color: c.text }, headerShadowVisible: false, headerStyle: { backgroundColor: c.bg }, headerLargeStyle: { backgroundColor: c.bg }, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen component={Component} name={first} options={{ title: title() }} />
        <Stack.Screen component={TaskRoute} name="Task" options={{ title: '', headerLargeTitle: false }} />
        <Stack.Screen component={ProjectScreen} name="Project" options={({ route }) => ({ title: route.params.name })} />
        <Stack.Screen component={LabelScreen} name="Label" options={({ route }) => ({ title: route.params.name })} />
        <Stack.Screen component={ViewScreen} name="View" options={({ route }) => ({ title: route.params.name })} />
        <Stack.Screen component={NotesScreen} name="Notes" options={{ title: t('Notes') }} />
        <Stack.Screen component={NoteScreen} name="Note" options={({ route }) => ({ title: route.params.title, headerLargeTitle: false })} />
        <Stack.Screen component={LogbookScreen} name="Logbook" options={{ title: t('Logbook') }} />
        <Stack.Screen component={SettingsScreen} name="Settings" options={{ title: t('Settings') }} />
      </Stack.Navigator>
    )
  }
}

const TodayStack = makeStack('Today', TodayScreen, () => t('Today'))
const InboxStack = makeStack('Inbox', InboxScreen, () => t('Inbox'))
const UpcomingStack = makeStack('Upcoming', UpcomingScreen, () => t('Upcoming'))
const BrowseStack = makeStack('Browse', BrowseScreen, () => t('Browse'))
const SearchStack = makeStack('Search', SearchScreen, () => t('Search'))

function TabsScreen() {
  const c = useColors()
  const tablet = useTablet()
  const icons = useTabIcons(c.text)
  const inbox = useRead(inboxList, TASK_STORES, 'inbox-count')?.length ?? 0
  useLanguageVersion()
  if (!icons) return null
  return (
    <Tabs.Navigator screenOptions={{ tabBarActiveTintColor: c.accent, tabBarActiveIndicatorColor: c.chip, tabBarStyle: { backgroundColor: c.bg, display: tablet ? 'none' : 'flex' }, tabBarLabelVisibilityMode: 'labeled' }}>
      <Tabs.Screen component={TodayStack} name="TodayTab" options={{ title: t('Today'), tabBarIcon: icons.TodayTab }} />
      <Tabs.Screen component={InboxStack} name="InboxTab" options={{ title: t('Inbox'), tabBarIcon: icons.InboxTab, tabBarBadge: inbox || undefined }} />
      <Tabs.Screen component={UpcomingStack} name="UpcomingTab" options={{ title: t('Upcoming'), tabBarIcon: icons.UpcomingTab }} />
      <Tabs.Screen component={BrowseStack} name="BrowseTab" options={{ title: t('Browse'), tabBarIcon: icons.BrowseTab }} />
      <Tabs.Screen component={SearchStack} name="SearchTab" options={{ title: t('Search'), tabBarIcon: icons.SearchTab, tabBarRole: 'search' }} />
    </Tabs.Navigator>
  )
}

function AdaptiveTabs() {
  const { width } = useWindowDimensions()
  return tabletWidth(Platform.OS, Platform.OS === 'ios' && Platform.isPad, width)
    ? <TabletLayout><TabsScreen /></TabletLayout>
    : <TabsScreen />
}

const SHEET = { presentation: 'formSheet', sheetGrabberVisible: true, headerShown: false } as const

/**
 * What the widget, the notifications and the share extension open (native-app-handover): a
 * task over Today, the capture sheet, Today, or the Inbox. `opentodo://signed-in` is
 * sign-in's own, read before this mounts.
 */
export const LINKING: LinkingOptions<RootParams> = {
  prefixes: ['opentodo://'],
  // The typed config has no initialRouteName under a tab; it keeps Today under a linked task.
  config: {
    screens: {
      Tabs: {
        screens: {
          TodayTab: { initialRouteName: 'Today', screens: { Today: 'today', Task: 'task/:id' } },
          // The share extension opens the app here; its share is in the Inbox by then.
          InboxTab: { screens: { Inbox: 'share' } },
        },
      },
      Capture: 'add',
    },
  } as LinkingOptions<RootParams>['config'],
}

export function Navigator() {
  const c = useColors()
  const dark = useColorScheme() === 'dark'
  const base = dark ? DarkTheme : DefaultTheme
  const theme: Theme = { ...base, colors: { ...base.colors, primary: c.accent, background: c.bg, card: c.bg, text: c.text, border: c.separator } }
  return (
    <NavigationContainer linking={LINKING} theme={theme}>
      <Root.Navigator screenOptions={{ headerShown: false }}>
        <Root.Screen component={AdaptiveTabs} name="Tabs" />
        <Root.Screen component={CaptureSheet} name="Capture" options={{ ...SHEET, sheetAllowedDetents: [0.5, 1], sheetInitialDetentIndex: 0 }} />
        <Root.Screen component={WhenSheet} name="When" options={{ ...SHEET, sheetAllowedDetents: 'fitToContents' }} />
        <Root.Screen component={ChooseSheet} name="Choose" options={{ ...SHEET, sheetAllowedDetents: [0.6, 1] }} />
        <Root.Screen component={TaskMenuSheet} name="TaskMenu" options={{ ...SHEET, sheetAllowedDetents: 'fitToContents' }} />
      </Root.Navigator>
      <ToastHost bottom={Platform.OS === 'ios' ? 56 : 80} />
    </NavigationContainer>
  )
}
