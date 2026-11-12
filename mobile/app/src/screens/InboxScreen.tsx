// Inbox (native-app-everyday D1): the shared Inbox, tasks with no project and no date,
// with the triage swipes (Schedule and Move).
import { logicalToday } from '@shared/dates'
import { useAddButton } from '../ui/AddButton'
import { t } from '../ui/i18n'
import { SelectionBar, useSelection } from '../ui/SelectionBar'
import { TaskList } from '../ui/TaskList'
import { inboxList } from '../storage/lists'
import { useRead } from '../data/useRead'
import { ListScreen } from './ListScreen'
import { TASK_STORES } from './TodayScreen'

export function InboxScreen() {
  const today = logicalToday()
  const tasks = useRead(inboxList, TASK_STORES, 'inbox')
  const add = useAddButton({})
  const selection = useSelection()
  return (
    <ListScreen add={selection.selecting ? null : add} bar={<SelectionBar selection={selection} />}>
      <TaskList empty={t('Inbox zero: every task has a place.')} inbox onToggle={selection.toggle} sections={tasks && [{ key: 'inbox', tasks }]} selected={selection.selected} selecting={selection.selecting} today={today} />
    </ListScreen>
  )
}
