// The answer of a sheet (native-app-everyday D5): a screen opens the date sheet or a
// picker and awaits what was chosen. Navigation params carry only the request's id and
// plain values; the promise lives here and is settled when the sheet closes (null when it
// was dismissed without a choice).
type Settle = (value: unknown) => void

const waiting = new Map<string, Settle>()
let next = 0

/** A new request: its id for the sheet's params, and the promise of its answer. */
export function request<T>(): { id: string; answer: Promise<T | null> } {
  const id = `sheet-${++next}`
  const answer = new Promise<T | null>((resolve) => waiting.set(id, resolve as Settle))
  return { id, answer }
}

/** The sheet's choice; the first answer wins, later ones (a close after a choice) are ignored. */
export function answer(id: string, value: unknown): void {
  const settle = waiting.get(id)
  if (!settle) return
  waiting.delete(id)
  settle(value)
}
