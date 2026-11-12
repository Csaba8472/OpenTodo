// A label (native-app-everyday 5.1): the open tasks that carry it; capture adds it.
import { logicalToday } from '@shared/dates'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useRead } from '../data/useRead'
import type { StackParams } from '../nav/types'
import { openTasks } from '../storage/lists'
import { useAddButton } from '../ui/AddButton'
import { t } from '../ui/i18n'
import { SelectionBar, useSelection } from '../ui/SelectionBar'
import { TaskList } from '../ui/TaskList'
import { ListScreen } from './ListScreen'
import { TASK_STORES } from './TodayScreen'

export function LabelScreen({ route }: NativeStackScreenProps<StackParams, 'Label'>) {
  const { id } = route.params
  const tasks = useRead(async () => (await openTasks()).list.filter((task) => task.labels.includes(id)), TASK_STORES, `label:${id}`)
  const add = useAddButton({ labelId: id })
  const selection = useSelection()
  return (
    <ListScreen add={selection.selecting ? null : add} bar={<SelectionBar selection={selection} />}>
      <TaskList empty={t('No tasks yet')} onToggle={selection.toggle} sections={tasks && [{ key: 'label', tasks }]} selected={selection.selected} selecting={selection.selecting} today={logicalToday()} />
    </ListScreen>
  )
}
