// A saved view (native-app-everyday 5.1): the tasks the shared evaluator selects
// (lib/views' runView over lib/filter), grouped and ordered as the view says, the same
// set as on the web.
import { db } from '@shared/db'
import { logicalToday } from '@shared/dates'
import { runView } from '@shared/views'
import type { Task } from '@shared/types'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useRead } from '../data/useRead'
import type { StackParams } from '../nav/types'
import { visibleTasks } from '../storage/lists'
import { useAddButton } from '../ui/AddButton'
import { t } from '../ui/i18n'
import { SelectionBar, useSelection } from '../ui/SelectionBar'
import { TaskList, type ListSection } from '../ui/TaskList'
import { ListScreen } from './ListScreen'
import { TASK_STORES } from './TodayScreen'

async function read(id: string, today: string): Promise<ListSection[] | { error: string }> {
  const view = await db.views.get(id)
  if (!view) return []
  const [{ list, projects }, labels, sections] = await Promise.all([visibleTasks(), db.labels.toArray(), db.sections.toArray()])
  const r = runView(view, { today, labels, projects, tasks: list as Task[], sections })
  if (!r.ok) return { error: r.error }
  return r.groups.map((g) => ({ key: g.key || 'all', title: g.heading || undefined, tasks: g.tasks }))
}

export function ViewScreen({ route }: NativeStackScreenProps<StackParams, 'View'>) {
  const { id } = route.params
  const today = logicalToday()
  const result = useRead(() => read(id, today), [...TASK_STORES, 'views', 'labels', 'sections'], `view:${id}:${today}`)
  const add = useAddButton({})
  const selection = useSelection()
  const error = result && 'error' in result ? result.error : null
  return (
    <ListScreen add={selection.selecting ? null : add} bar={<SelectionBar selection={selection} />}>
      <TaskList empty={error ?? t('No tasks match this view.')} onToggle={selection.toggle} sections={result && !('error' in result) ? result : error ? [] : undefined} selected={selection.selected} selecting={selection.selecting} today={today} />
    </ListScreen>
  )
}
