// Native work can await files or crypto while sign-out switches the shared database.
// Check before every side effect so a previous account cannot write into the next one.
import { db, localEpoch } from '@shared/db'

export function accountWork(): () => void {
  const account = db
  const epoch = localEpoch()
  return () => {
    if (db !== account || localEpoch() !== epoch) throw new Error('Account changed during device work')
  }
}
