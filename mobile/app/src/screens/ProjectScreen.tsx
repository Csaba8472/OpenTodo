// A project (native-app-everyday 5.1): its open tasks under its sections (the shared
// groupBySection), with capture adding to it.
import { db } from '@shared/db'
import { logicalToday } from '@shared/dates'
import { groupBySection } from '@shared/sections'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useRead } from '../data/useRead'
import type { StackParams } from '../nav/types'
import { projectTasks } from '../storage/lists'
import { useAddButton } from '../ui/AddButton'
import { t } from '../ui/i18n'
import { SelectionBar, useSelection } from '../ui/SelectionBar'
import { TaskList, type ListSection } from '../ui/TaskList'
import { ListScreen } from './ListScreen'
import { TASK_STORES } from './TodayScreen'

async function read(projectId: string): Promise<ListSection[]> {
  const [tasks, sections] = await Promise.all([projectTasks(projectId), db.sections.where('project_id').equals(projectId).toArray()])
  // Subtasks show under their parent's detail, not as rows of their own.
  const top = tasks.filter((task) => !task.parent_id || !tasks.some((p) => p.id === task.parent_id))
  return groupBySection(projectId, top, sections).map((g) => ({ key: g.key || 'none', title: g.section?.name, tasks: g.tasks }))
}

export function ProjectScreen({ route }: NativeStackScreenProps<StackParams, 'Project'>) {
  const { id } = route.params
  const sections = useRead(() => read(id), [...TASK_STORES, 'sections'], `project:${id}`)
  const add = useAddButton({ projectId: id })
  const selection = useSelection()
  return (
    <ListScreen add={selection.selecting ? null : add} bar={<SelectionBar selection={selection} />}>
      <TaskList empty={t('No tasks yet')} onToggle={selection.toggle} projectId={id} reorder sections={sections} selected={selection.selected} selecting={selection.selecting} today={logicalToday()} />
    </ListScreen>
  )
}
