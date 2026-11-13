// A list's section (native-app-everyday D3), apart from the list's drawing so data code can name it.
import type { Task } from '@shared/types'

export interface ListSection {
  key: string
  title?: string
  tone?: 'danger'
  tasks: Task[]
}
