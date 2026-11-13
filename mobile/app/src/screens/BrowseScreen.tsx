// Browse (native-app-everyday D1): the rest, one level down. Projects as a tree, labels,
// saved views, Notes, the Logbook and Settings.
import { TabletView } from '../../modules/opentodo-shared-container/TabletView'
import { move } from '../data/actions'
import { useTablet } from '../nav/tabletContext'
import { db } from '@shared/db'
import { activeLabels } from '@shared/labels'
import type { Label, Project, View as SavedView } from '@shared/types'
import { useNavigation, type NavigationProp } from '@react-navigation/native'
import { ScrollView, StyleSheet } from 'react-native'
import { useRead } from '../data/useRead'
import type { StackParams } from '../nav/types'
import { Group, Row } from '../ui/Grouped'
import { t } from '../ui/i18n'
import { useTabBarInset } from '../ui/insets'
import { useColors } from '../ui/theme'

interface Browse { projects: { p: Project; depth: number }[]; labels: Label[]; views: SavedView[] }

/** The projects in sidebar order, each under its parent. */
export function projectTree(all: readonly Project[]): { p: Project; depth: number }[] {
  const live = all.filter((p) => !p.deleted_at && !p.archived)
  const ids = new Set(live.map((p) => p.id))
  const kids = new Map<string | null, Project[]>()
  for (const p of live) {
    const parent = p.parent_id && ids.has(p.parent_id) ? p.parent_id : null
    kids.set(parent, [...(kids.get(parent) ?? []), p])
  }
  const out: { p: Project; depth: number }[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const p of (kids.get(parent) ?? []).sort((a, b) => a.position - b.position)) {
      out.push({ p, depth })
      if (depth < 8) walk(p.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

async function read(): Promise<Browse> {
  const [projects, labels, views] = await Promise.all([db.projects.toArray(), db.labels.toArray(), db.views.toArray()])
  return {
    projects: projectTree(projects),
    labels: activeLabels(labels),
    views: views.filter((v) => !v.deleted_at).sort((a, b) => a.position - b.position),
  }
}

export function BrowseScreen({ sidebar = false }: { sidebar?: boolean }) {
  const c = useColors()
  const bottom = useTabBarInset()
  const nav = useNavigation<NavigationProp<StackParams>>()
  const tablet = useTablet()
  const go = (name: keyof StackParams, params?: object) => {
    if (sidebar && tablet) tablet.destination(name, params)
    else (nav.navigate as (name: string, params?: object) => void)(name, params)
  }
  const data = useRead(read, ['projects', 'labels', 'views'], 'browse')
  return (
    <ScrollView contentContainerStyle={[styles.page, { paddingBottom: 48 + bottom }]} contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.grouped }}>
      {sidebar && <Group>
        <Row icon="today" label={t('Today')} onPress={() => go('Today')} />
        <Row icon="inbox" label={t('Inbox')} onPress={() => go('Inbox')} />
        <Row icon="upcoming" label={t('Upcoming')} onPress={() => go('Upcoming')} />
        <Row icon="search" label={t('Search')} last onPress={() => go('Search')} />
      </Group>}
      <Group title={t('Projects')}>
        {data?.projects.length ? data.projects.map(({ p, depth }, i) => (
          <TabletView key={p.id} projectId={sidebar ? p.id : ''} onTaskDrop={(e) => { void move(e.nativeEvent.taskId, p.id) }}><Row depth={depth} icon="project" label={p.name} last={i === data.projects.length - 1} onPress={() => go('Project', { id: p.id, name: p.name })} tint={p.color || undefined} /></TabletView>
        )) : <Row chevron={false} label={t('No projects yet.')} last />}
      </Group>
      {!!data?.labels.length && (
        <Group title={t('Labels')}>
          {data.labels.map((l, i) => <Row icon="label" key={l.id} label={l.name} last={i === data.labels.length - 1} onPress={() => go('Label', { id: l.id, name: l.name })} tint={l.color || undefined} />)}
        </Group>
      )}
      {!!data?.views.length && (
        <Group title={t('Saved views')}>
          {data.views.map((v, i) => <Row icon="view" key={v.id} label={v.name} last={i === data.views.length - 1} onPress={() => go('View', { id: v.id, name: v.name })} />)}
        </Group>
      )}
      <Group>
        <Row icon="note" label={t('Notes')} onPress={() => go('Notes')} />
        <Row icon="logbook" label={t('Logbook')} onPress={() => go('Logbook')} />
        <Row icon="settings" label={t('Settings')} last onPress={() => go('Settings')} />
      </Group>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { gap: 24, padding: 16, paddingBottom: 48 },
})
