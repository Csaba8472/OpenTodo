// The widget snapshot's format (native-app-handover 1.2): the Today list in the JSON the
// Swift and Kotlin widgets read, pinned by testdata/widgetSnapshot.json, which the native
// app's test and the Android widget's parser read too.
import { describe, expect, it } from 'vitest'
import { shellWidget } from './deviceSnapshot'
import fixture from './testdata/widgetSnapshot.json'
import type { Task } from './types'

const tasks = fixture.tasks.map((t) => ({ project_id: null, completed_at: null, deleted_at: null, ...t }) as unknown as Task)

describe('the widget snapshot', () => {
  it('is the fixture: open tasks due today or overdue, in Today order', () => {
    expect(shellWidget(tasks, fixture.today, fixture.now, false)).toEqual(fixture.snapshot)
  })

  it('locked, carries counts and no titles or times', () => {
    expect(shellWidget(tasks, fixture.today, fixture.now, true)).toEqual({ ...fixture.snapshot, locked: true, tasks: [] })
  })
})
