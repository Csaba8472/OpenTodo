// A task's actions (native-app-everyday D3, D4), each through the shared undoable writes
// (lib/undoActions: one op batch with an undo entry), with the toast and the platform's
// haptic. Every one writes at once and works offline: the ops wait in the outbox.
import { planComplete, planDue, planTrash, readTicked, toProposed } from '@shared/bulk'
import { logicalToday } from '@shared/dates'
import { db } from '@shared/db'
import { updateTask, type Change } from '@shared/ops'
import { membershipMap } from '@shared/sharing'
import { duplicateTask as duplicate } from '@shared/templates'
import type { Due, Priority } from '@shared/types'
import { applyBatch } from '@shared/undo'
import { completeUndoable, dueUndoable, moveManyUndoable, moveUndoable, trashUndoable } from '@shared/undoActions'
import * as Haptics from 'expo-haptics'
import { session } from '../appSession'
import { t } from '../ui/i18n'
import { showToast } from '../ui/Toast'

export async function complete(id: string, done = true, onUndone?: () => void): Promise<void> {
  if (done) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  const r = await completeUndoable(id, done)
  showToast(r.label, r.entry?.id ?? null, onUndone)
}

export async function trash(id: string): Promise<void> {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
  const r = await trashUndoable(id)
  showToast(r.label, r.entry?.id ?? null)
}

export async function move(id: string, projectId: string | null): Promise<void> {
  const name = projectId ? (await db.projects.get(projectId))?.name ?? '' : t('Inbox')
  const r = await moveUndoable(id, projectId, name)
  showToast(r.label, r.entry?.id ?? null)
}

export async function schedule(id: string, due: Due | null): Promise<void> {
  const r = await dueUndoable(id, due)
  showToast(r.label, r.entry?.id ?? null)
}

export async function setPriority(id: string, priority: Priority): Promise<void> {
  void Haptics.selectionAsync()
  await updateTask(id, { priority })
}

export async function duplicateTask(id: string): Promise<string> {
  const copy = await duplicate(id)
  showToast(t('Task duplicated'))
  return copy
}

/** The task's page on the server, as the web's Copy link gives it. */
export function taskLink(id: string): string {
  return `${session.server ?? ''}/task/${encodeURIComponent(id)}`
}

// ---- several tasks at once (edit mode's toolbar, design D3): one batch, one Undo ----

async function batch(changes: Change[], label: string): Promise<void> {
  if (!changes.length) return
  const entry = await applyBatch(await toProposed(changes, await membershipMap()), { source: 'action', label })
  showToast(label, entry?.id ?? null)
}

export async function completeMany(ids: readonly string[]): Promise<void> {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  const { tasks, all } = await readTicked(ids)
  await batch(planComplete(tasks, all, Date.now(), logicalToday(), await membershipMap()), t('{count} tasks completed', { count: tasks.length }))
}

export async function trashMany(ids: readonly string[]): Promise<void> {
  const { tasks, all } = await readTicked(ids)
  await batch(planTrash(tasks, all, Date.now()), t('{count} tasks deleted', { count: tasks.length }))
}

export async function scheduleMany(ids: readonly string[], date: string | null): Promise<void> {
  const { tasks } = await readTicked(ids)
  await batch(planDue(tasks, date), date ? t('{count} tasks scheduled', { count: tasks.length }) : t('Dates removed'))
}

export async function moveMany(ids: readonly string[], projectId: string | null): Promise<void> {
  const name = projectId ? (await db.projects.get(projectId))?.name ?? '' : t('Inbox')
  const r = await moveManyUndoable(ids, projectId, name)
  showToast(r.label, r.entry?.id ?? null)
}
