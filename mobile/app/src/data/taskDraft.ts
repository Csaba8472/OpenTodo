// A task detail can unmount as soon as another iPad row is selected. Keep edits until
// their ops are written; blur and unmount both flush them, within the same account.
import { saveNote, updateTask } from '@shared/ops'
import { accountWork } from '../accountWork'

export class TaskDraft {
  private readonly check = accountWork()
  private title: string | null = null
  private notes: string | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly id: string) {}

  setTitle(text: string): void { this.title = text }

  setNotes(text: string): void {
    this.notes = text
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { void this.flushNotes().catch(() => undefined) }, 800)
  }

  async flushTitle(): Promise<void> {
    const text = this.title?.trim()
    if (!text) return
    this.check()
    await updateTask(this.id, { title: text })
    if (this.title?.trim() === text) this.title = null
  }

  async flushNotes(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const text = this.notes
    if (text === null) return
    this.check()
    await saveNote('task', this.id, { description: text })
    if (this.notes === text) this.notes = null
  }

  async dispose(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    await this.flushTitle()
    await this.flushNotes()
  }
}
