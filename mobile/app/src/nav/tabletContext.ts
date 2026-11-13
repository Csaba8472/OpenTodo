import { createContext, useContext } from 'react'
import type { CaptureContext, StackParams } from './types'

export interface TabletList {
  ids: string[]
  context: CaptureContext
  complete(id: string): void
}

export interface TabletNavigation {
  selected: string | null
  select(id: string | null): void
  destination(name: keyof StackParams, params?: object): void
  list: { current: TabletList | null }
}

export const TabletContext = createContext<TabletNavigation | null>(null)
export const useTablet = () => useContext(TabletContext)
