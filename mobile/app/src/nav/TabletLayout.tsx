// iPad's three native columns (native-app-handover D6). The phone's list screens and
// sheets are reused; only task selection stays beside the list instead of pushing it.
import { NavigationContainer, NavigationIndependentTree, useNavigation, useTheme, type NavigationProp } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Split } from 'react-native-screens/experimental'
import { TabletView } from '../../modules/opentodo-shared-container/TabletView'
import { BrowseScreen } from '../screens/BrowseScreen'
import { ChooseSheet } from '../screens/ChooseSheet'
import { TaskScreen } from '../screens/TaskScreen'
import { WhenSheet } from '../screens/WhenSheet'
import { t } from '../ui/i18n'
import { useColors, type } from '../ui/theme'
import { TabletContext, type TabletList, type TabletNavigation } from './tabletContext'
import { nextTaskId } from './tabletState'
import type { RootParams, StackParams } from './types'

const Sidebar = createNativeStackNavigator<StackParams>()
const Detail = createNativeStackNavigator<StackParams & RootParams>()
const DESTINATIONS = ['Today', 'Inbox', 'Upcoming', 'Browse', 'Search'] as const
const TAB: Record<string, string> = { Today: 'TodayTab', Inbox: 'InboxTab', Upcoming: 'UpcomingTab', Browse: 'BrowseTab', Search: 'SearchTab' }
const SHEET = { presentation: 'formSheet', sheetGrabberVisible: true, headerShown: false } as const

function SidebarScreen() { return <BrowseScreen sidebar /> }

export function TabletLayout({ children }: { children: ReactNode }) {
  const c = useColors()
  const theme = useTheme()
  const nav = useNavigation<NavigationProp<RootParams>>()
  const [selected, select] = useState<string | null>(null)
  const list = useRef<TabletList | null>(null)
  const tablet = useMemo<TabletNavigation>(() => ({
    selected, select, list,
    destination: (name, params) => {
      select(null)
      nav.navigate('Tabs', { screen: TAB[name] ?? 'BrowseTab', params: { screen: name, params } } as RootParams['Tabs'])
    },
  }), [nav, selected])

  const command = (key: string) => {
    // A root sheet owns the keyboard while it is presented.
    if (nav.getState().routes.at(-1)?.name !== 'Tabs') return
    if (key === 'n') nav.navigate('Capture', { context: list.current?.context ?? {} })
    else if (key === 'cmd-f') tablet.destination('Search')
    else if (/^cmd-[1-5]$/.test(key)) tablet.destination(DESTINATIONS[Number(key.slice(-1)) - 1])
    else if (key === ' ' && selected) list.current?.complete(selected)
    else if (key === 'UIKeyInputUpArrow' || key === 'UIKeyInputDownArrow') {
      select(nextTaskId(list.current?.ids ?? [], selected, key === 'UIKeyInputUpArrow' ? -1 : 1))
    }
  }

  return (
    <TabletContext.Provider value={tablet}>
      <TabletView keyboardEnabled onCommand={(e) => command(e.nativeEvent.command)} style={styles.fill}>
        <Split.Host
          columnMetrics={{ minimumPrimaryColumnWidth: 220, maximumPrimaryColumnWidth: 280, preferredPrimaryColumnWidthOrFraction: 240, minimumSupplementaryColumnWidth: 280, preferredSupplementaryColumnWidthOrFraction: 340 }}
          // iOS 26's translucent sidebar overlaps the supplementary column; the native
          // tab controller does not forward that horizontal inset to its list content.
          primaryBackgroundStyle="none"
          preferredDisplayMode="twoBesideSecondary"
          preferredSplitBehavior="tile"
          topColumnForCollapsing="supplementary"
        >
          <Split.Column>
            <NavigationIndependentTree>
              <NavigationContainer theme={theme}>
                <Sidebar.Navigator screenOptions={{ headerLargeTitle: true, headerTintColor: c.accent, headerTitleStyle: { color: c.text }, headerLargeTitleStyle: { color: c.text }, contentStyle: { backgroundColor: c.grouped } }}>
                  <Sidebar.Screen component={SidebarScreen} name="Browse" options={{ title: t('Browse') }} />
                </Sidebar.Navigator>
              </NavigationContainer>
            </NavigationIndependentTree>
          </Split.Column>
          <Split.Column>{children}</Split.Column>
          <Split.Column>
            {selected ? (
              <NavigationIndependentTree key={selected}>
                <NavigationContainer theme={theme}>
                  <Detail.Navigator screenOptions={{ headerTintColor: c.accent, contentStyle: { backgroundColor: c.grouped } }}>
                    <Detail.Screen component={TaskScreen} initialParams={{ id: selected }} name="Task" options={{ title: t('Task') }} />
                    <Detail.Screen component={WhenSheet} name="When" options={{ ...SHEET, sheetAllowedDetents: 'fitToContents' }} />
                    <Detail.Screen component={ChooseSheet} name="Choose" options={{ ...SHEET, sheetAllowedDetents: [0.6, 1] }} />
                  </Detail.Navigator>
                </NavigationContainer>
              </NavigationIndependentTree>
            ) : <View style={[styles.empty, { backgroundColor: c.grouped }]}><Text style={{ color: c.muted, fontSize: type.body }}>{t('Select a task to see its details here.')}</Text></View>}
          </Split.Column>
        </Split.Host>
      </TabletView>
    </TabletContext.Provider>
  )
}

const styles = StyleSheet.create({ fill: { flex: 1 }, empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 } })
