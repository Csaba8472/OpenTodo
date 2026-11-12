// Opening a sheet and awaiting its choice (design D5), from any screen: the date sheet,
// the project list, the label list. The sheets answer through src/nav/sheets.ts.
import { useNavigation, type NavigationProp } from '@react-navigation/native'
import type { Due } from '@shared/types'
import type { WhenAnswer } from '../screens/WhenSheet'
import { useMemo } from 'react'
import { request } from './sheets'
import type { RootParams } from './types'

export interface Pickers {
  /** The chosen do-on date (null: no date), or undefined when the sheet was closed. */
  when(due: Due | null, title?: string): Promise<Due | null | undefined>
  /** The date and, when it was changed, the repeat rule; undefined when the sheet was closed. */
  schedule(due: Due | null, title?: string): Promise<WhenAnswer | undefined>
  /** The chosen project id (null: Inbox), or undefined when closed. */
  project(current: string | null): Promise<string | null | undefined>
  /** The chosen label ids, or undefined when closed. */
  labels(current: readonly string[]): Promise<string[] | undefined>
}

const CLOSED = Symbol('closed')

export function usePickers(): Pickers {
  const nav = useNavigation<NavigationProp<RootParams>>()
  return useMemo(() => {
    const open = async <T>(route: 'When' | 'Choose', params: object): Promise<T | undefined> => {
      const r = request<T | typeof CLOSED>()
      // The params of either sheet; the route decides which.
      ;(nav.navigate as (name: string, params: object) => void)(route, { ...params, request: r.id })
      const v = await r.answer
      return v === null || v === CLOSED ? undefined : (v as T)
    }
    return {
      when: async (due, title) => {
        const v = await open<WhenAnswer>('When', { due, title })
        return v === undefined ? undefined : v.due
      },
      schedule: (due, title) => open<WhenAnswer>('When', { due, title }),
      project: async (current) => {
        const v = await open<{ ids: string[] }>('Choose', { kind: 'project', selected: current ? [current] : [] })
        return v === undefined ? undefined : (v.ids[0] ?? null)
      },
      labels: async (current) => (await open<{ ids: string[] }>('Choose', { kind: 'labels', selected: [...current] }))?.ids,
    }
  }, [nav])
}
