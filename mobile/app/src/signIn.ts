// The phone side of app sign-in (design D5): the authentication sheet
// (ASWebAuthenticationSession, a Custom Tab) and the account the local database
// belongs to.
import * as WebBrowser from 'expo-web-browser'
import { Platform } from 'react-native'
import { setCurrentUserId } from '@shared/sharing'
import { stopAccountSync } from './accountSync'
import { container } from '../modules/opentodo-shared-container'
import { clearDevicePrefs } from './host'
import { forgetAccount, openAccount } from './storage/account'
import { session, vault } from './appSession'
import { codeFrom, REDIRECT, SignInError, signInRequest } from './session'

export interface Account {
  server: string
  userId: string
}

const ACCOUNT = 'opentodo.account'

/** The name the server shows in the sessions list: "OpenTodo app · iPhone". */
function deviceName(): string {
  return Platform.OS === 'ios' ? 'iPhone' : 'Android'
}

let restored: Promise<Account | null> | null = null

/**
 * The account of the last launch, opened once per process: the screen and a background
 * run (src/background.ts) can start in the same JavaScript, and a second open would swap
 * the database under the first.
 */
export function restoreOnce(): Promise<Account | null> {
  restored ??= restoreAccount().catch((err: unknown) => { restored = null; throw err })
  return restored
}

/** The account signed in at the last launch, with its database open, or null. */
export async function restoreAccount(): Promise<Account | null> {
  void session.retrySignOut()
  const server = await session.load()
  const s = await vault.get(ACCOUNT)
  const account = s ? (JSON.parse(s) as Account) : null
  if (!server || !account || account.server !== server) {
    await session.signOut()
    return null
  }
  await open(account)
  return account
}

/**
 * Makes the account's database current and records who is signed in there, as the web app
 * does at sign-in: assignment, Today's "assigned to me" and new rows' authors read it.
 */
async function open(account: Account): Promise<void> {
  openAccount(account.server, account.userId)
  await setCurrentUserId(account.userId)
}

/** Signs in through the sheet and opens the account's database. Throws SignInError. */
export async function signIn(server: string): Promise<Account> {
  const request = await signInRequest(server, deviceName())
  const result = await WebBrowser.openAuthSessionAsync(request.url, REDIRECT)
  if (result.type !== 'success') throw new SignInError('cancelled')
  const code = codeFrom(result.url, request.state)
  try {
    await session.complete(server, code, request)
    const res = await session.fetch('/api/v1/me', { headers: { Accept: 'application/json' } })
    const userId = res.ok ? ((await res.json()) as { user?: { id?: string } }).user?.id : undefined
    if (!userId) throw new SignInError('failed')
    const account = { server, userId }
    await vault.set(ACCOUNT, JSON.stringify(account))
    await open(account)
    restored = Promise.resolve(account)
    return account
  } catch (err) {
    // A grant the app cannot use (no account read, the Keychain refused) ends on the server too.
    await session.signOut().catch(() => undefined)
    throw err instanceof SignInError ? err : new SignInError('failed')
  }
}

const signedOut = new Set<() => void>()

/** Called after a sign-out from anywhere in the app (Settings), so the root shows the server screen. */
export function onSignOut(fn: () => void): () => void {
  signedOut.add(fn)
  return () => { signedOut.delete(fn) }
}

/** Signs out (design D5) and deletes the account's database, tokens and record from the phone. */
export async function signOut(): Promise<void> {
  // No exchange runs on a token that is about to end, or writes into a database being deleted.
  await stopAccountSync()
  await session.signOut()
  await forgetLocal()
  for (const fn of [...signedOut]) fn()
}

/** What is left on the phone when the server ended the session: nothing of the account. */
export async function forgetLocal(): Promise<void> {
  await stopAccountSync()
  // The widget, the reminders, the queues and the background refresh go with the account.
  container.clear()
  restored = Promise.resolve(null)
  await vault.set(ACCOUNT, null)
  await forgetAccount()
  clearDevicePrefs()
}
