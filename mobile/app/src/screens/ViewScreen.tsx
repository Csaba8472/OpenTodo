// A saved view (native-app-everyday 5.1): the tasks the shared evaluator selects
// (lib/views' runView over lib/filter), grouped and ordered as the view says, the same
// set as on the web.
import { db } from '@shared/db'
import { logicalToday } from '@shared/dates'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useRead } from '../data/useRead'
import type { StackParams } from '../nav/types'
import { savedViewSections } from '../data/views'
import { useAddButton } from '../ui/AddButton'
import { t } from '../ui/i18n'
import { SelectionBar, useSelection } from '../ui/SelectionBar'
import { TaskList } from '../ui/TaskList'
import type { ListSection } from '../ui/listSection'
import { ListScreen } from './ListScreen'
import { TASK_STORES } from './TodayScreen'

async function read(id: string, today: string): Promise<ListSection[] | { error: string }> {
  const view = await db.views.get(id)
  return view ? savedViewSections(view, today) : []
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
