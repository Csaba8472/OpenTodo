// Today (native-app-everyday D1): the shared Today list over the phone's indexes, split
// as the web splits it (groupToday): Earlier first, then the day, This Evening and the
// tasks waiting on another.
import { groupToday } from '@shared/dayLists'
import { logicalToday } from '@shared/dates'
import { blockedMap } from '@shared/dependencies'
import { useAddButton } from '../ui/AddButton'
import { t } from '../ui/i18n'
import { SelectionBar, useSelection } from '../ui/SelectionBar'
import { TaskList, type ListSection } from '../ui/TaskList'
import { todayTasks } from '../storage/lists'
import { useRead } from '../data/useRead'
import { ListScreen } from './ListScreen'

export const TASK_STORES = ['tasks', 'projects', 'meta', 'workspaces'] as const

async function read(today: string): Promise<ListSection[]> {
  const list = await todayTasks(today)
  const g = groupToday(list, today, blockedMap(list))
  return [
    { key: 'overdue', title: t('Earlier'), tone: 'danger', tasks: g.overdue },
    { key: 'day', tasks: g.day },
    { key: 'evening', title: t('This Evening'), tasks: g.evening },
    { key: 'blocked', title: t('Blocked'), tasks: g.blocked },
  ]
}

export function TodayScreen() {
  const today = logicalToday()
  const sections = useRead(() => read(today), TASK_STORES, `today:${today}`)
  const add = useAddButton({ today: true })
  const selection = useSelection()
  return (
    <ListScreen add={selection.selecting ? null : add} bar={<SelectionBar selection={selection} />}>
      <TaskList empty={t('Nothing for today')} hideToday onToggle={selection.toggle} sections={sections} selected={selection.selected} selecting={selection.selecting} today={today} />
    </ListScreen>
  )
}
