// A saved view's tasks (native-app-everyday 5.1): the shared runView over the phone's data.
import { db } from '@shared/db'
import { membersFrom } from '@shared/filter/evaluate'
import { currentUserId } from '@shared/sharing'
import type { Task, View as SavedView } from '@shared/types'
import { runView } from '@shared/views'
import { visibleTasks } from '../storage/lists'
import type { ListSection } from '../ui/listSection'

/** Who `assigned:` and `me` name; the local viewer and the members of shared projects. */
export interface Directory { me: string | null; members: { userId: string; name: string; email: string }[] }

/**
 * A saved view's sections: the shared runView over every visible task, with the context the
 * web gives it (labels, projects, sections, custom fields, the viewer and members). Tracked
 * minutes are not read on the phone, so a `tracked` view lists nothing here yet.
 */
export async function savedViewSections(view: SavedView, today: string, directory?: Directory): Promise<ListSection[] | { error: string }> {
  const [{ list, projects }, labels, sections, fields, memberships, me] = await Promise.all([
    visibleTasks(), db.labels.toArray(), db.sections.toArray(), db.fields.toArray(), db.memberships.toArray(), currentUserId(),
  ])
  const who = directory ?? { me, members: membersFrom(memberships) }
  const r = runView(view, { today, labels, projects, tasks: list as Task[], sections, fields: fields.filter((f) => !f.deleted_at), ...who })
  if (!r.ok) return { error: r.error }
  return r.groups.map((g) => ({ key: g.key || 'all', title: g.heading || undefined, tasks: g.tasks }))
}

