// The Logbook (native-app-everyday 5.1): what was completed in the last 30 days, by day,
// newest first, as the web groups it (lib/logbook); a row's circle reopens it.
import { logicalToday } from '@shared/dates'
import { logbookGroups, logbookHeading } from '@shared/logbook'
import { useRead } from '../data/useRead'
import { completedSince } from '../storage/lists'
import { t } from '../ui/i18n'
import { TaskList, type ListSection } from '../ui/TaskList'
import { TASK_STORES } from './TodayScreen'

const DAYS = 30
const LIMIT = 500

async function read(today: string): Promise<ListSection[]> {
  const done = await completedSince(Date.now() - DAYS * 86_400_000)
  return logbookGroups(done, LIMIT).groups.map((g) => ({ key: g.date, title: logbookHeading(g.date, today), tasks: g.tasks }))
}

export function LogbookScreen() {
  const today = logicalToday()
  const sections = useRead(() => read(today), TASK_STORES, `logbook:${today}`)
  return <TaskList empty={t('Nothing completed yet')} sections={sections} today={today} />
}
