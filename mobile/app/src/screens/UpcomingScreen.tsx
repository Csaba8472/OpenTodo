// Upcoming (native-app-everyday D1): the next 14 days as sections (the shared nextDays),
// each headed by its date as the web words it.
import { formatDateHeading, logicalToday } from '@shared/dates'
import { useAddButton } from '../ui/AddButton'
import { t } from '../ui/i18n'
import { SelectionBar, useSelection } from '../ui/SelectionBar'
import { TaskList, type ListSection } from '../ui/TaskList'
import { upcomingDays } from '../storage/lists'
import { useRead } from '../data/useRead'
import { ListScreen } from './ListScreen'
import { TASK_STORES } from './TodayScreen'

async function read(today: string): Promise<ListSection[]> {
  const days = await upcomingDays(today, 14)
  return days.map((d) => ({ key: d.date, title: formatDateHeading(d.date, today), tasks: d.tasks }))
}

export function UpcomingScreen() {
  const today = logicalToday()
  const sections = useRead(() => read(today), TASK_STORES, `upcoming:${today}`)
  const add = useAddButton({})
  const selection = useSelection()
  return (
    <ListScreen add={selection.selecting ? null : add} bar={<SelectionBar selection={selection} />}>
      <TaskList empty={t('Nothing planned')} onToggle={selection.toggle} sections={sections} selected={selection.selected} selecting={selection.selecting} today={today} />
    </ListScreen>
  )
}
