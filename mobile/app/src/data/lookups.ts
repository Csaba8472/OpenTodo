// The projects and labels a row names (native-app-everyday D3), read once per screen and
// again when either table changes.
import { db } from '@shared/db'
import type { Label, Project } from '@shared/types'
import { useRead } from './useRead'

export interface Lookups {
  projects: Map<string, Project>
  labels: Map<string, Label>
}

const EMPTY: Lookups = { projects: new Map(), labels: new Map() }

async function read(): Promise<Lookups> {
  const [projects, labels] = await Promise.all([db.projects.toArray(), db.labels.toArray()])
  return {
    projects: new Map(projects.filter((p) => !p.deleted_at).map((p) => [p.id, p])),
    labels: new Map(labels.filter((l) => !l.deleted_at).map((l) => [l.id, l])),
  }
}

export function useLookups(): Lookups {
  return useRead(read, ['projects', 'labels'], 'lookups') ?? EMPTY
}
