// A screen's read of the local database (design D4): dexie-react-hooks' live queries are
// web-only, so a screen reads again after every committed write that changed one of the
// stores it names (the adapter's onChange), and when the app comes back to the front.
import { db } from '@shared/db'
import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import type { SqliteDatabase } from '../storage/adapter'

export function useRead<T>(read: () => Promise<T>, stores: readonly string[], key: string): T | undefined {
  const [value, setValue] = useState<{ key: string; value: T } | undefined>(undefined)
  useEffect(() => {
    let live = true
    let running = false
    let again = false
    const run = async () => {
      if (running) { again = true; return }
      running = true
      try {
        do {
          again = false
          const v = await read()
          if (live) setValue({ key, value: v })
        } while (again && live)
      } finally {
        running = false
      }
    }
    void run()
    const watched = new Set(stores)
    const offChange = (db as unknown as SqliteDatabase).onChange((changed) => {
      if ([...changed].some((s) => watched.has(s))) void run()
    })
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void run() })
    return () => { live = false; offChange(); sub.remove() }
    // `read` is the caller's closure; `key` names what it reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return value?.key === key ? value.value : undefined
}
