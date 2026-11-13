/** @jest-environment node */
import { db, getMeta, setMeta, useDatabase as openDatabaseNamed } from '@shared/db'
import { resetModuleState } from '@shared/moduleState'
import { installPlatform, platform } from '@shared/platform'
import { setCurrentUserId } from '@shared/sharing'
import { attachShared, uploadPending } from '../src/sharedFiles'
import { sqliteDatabase } from '../src/storage/adapter'
import { nodeSqlite } from './storage/nodeSqlite'

const mockHash = jest.fn<Promise<string | null>, [string]>()
const mockRemove = jest.fn()
const mockPut = jest.fn<Promise<Response>, [string, unknown]>()
let mockRead: (() => Promise<Blob>) | null = null
jest.mock('../modules/opentodo-shared-container', () => ({ container: {
  fileSha256: (path: string) => mockHash(path), removeFile: (path: string) => mockRemove(path),
} }))
jest.mock('../src/appSession', () => ({ session: { server: 'https://a.example', fetchWith: () => mockPut } }))

const uploads = 'device:pendingUploads'
const file = { path: '/share/source', name: 'receipt.png', type: 'image/png', size: 4 }

beforeEach(() => {
  const sql = nodeSqlite()
  installPlatform({ ...platform, memoryOnlyKeys: true, database: (declared) => sqliteDatabase(declared, sql) })
  openDatabaseNamed('files-a')
  mockHash.mockReset().mockResolvedValue('a'.repeat(64))
  mockRemove.mockReset()
  mockPut.mockReset()
  mockRead = null
  globalThis.XMLHttpRequest = class {
    status = 200
    response: Blob | undefined
    responseType = ''
    onload = () => {}
    onerror = () => {}
    open() {}
    setRequestHeader() {}
    send() {
      void (mockRead?.() ?? Promise.resolve(new Blob(['file']))).then((blob) => { this.response = blob; this.onload() })
    }
  } as unknown as typeof XMLHttpRequest
})
afterEach(() => resetModuleState())

it('does not write attachment rows or metadata into an account opened during hashing', async () => {
  await setCurrentUserId('a')
  let finish!: (s: string) => void
  let started!: () => void
  const waiting = new Promise<void>((resolve) => { started = resolve })
  mockHash.mockImplementationOnce(() => { started(); return new Promise((resolve) => { finish = resolve }) })
  const attaching = attachShared('task-a', [file])
  await waiting
  openDatabaseNamed('files-b')
  finish('b'.repeat(64))
  await expect(attaching).rejects.toThrow('Account changed')
  expect(await db.attachments.count()).toBe(0)
  expect(await getMeta(uploads, [])).toEqual([])
  expect(mockPut).not.toHaveBeenCalled()
})

it('does not send old bytes or update metadata after switching accounts during a file read', async () => {
  await setMeta(uploads, [{ id: 'attachment-a', path: '/share/a' }])
  let finish!: (blob: Blob) => void
  let started!: () => void
  const waiting = new Promise<void>((resolve) => { started = resolve })
  mockRead = () => { started(); return new Promise((resolve) => { finish = resolve }) }
  const sending = uploadPending()
  await waiting
  openDatabaseNamed('files-b')
  finish(new Blob(['private a']))
  await expect(sending).rejects.toThrow('Account changed')
  expect(mockPut).not.toHaveBeenCalled()
  expect(mockRemove).not.toHaveBeenCalled()
  expect(await getMeta(uploads, [])).toEqual([])
})

it('finishes cleanup when retry says the server already committed a lost-response upload', async () => {
  await setMeta(uploads, [{ id: 'attachment-a', path: '/share/sealed', source: '/share/original' }])
  mockPut.mockRejectedValueOnce(new TypeError('response lost')).mockResolvedValueOnce(new Response(null, { status: 409 }))
  expect(await uploadPending()).toBe(0)
  expect(await getMeta<unknown[]>(uploads, [])).toHaveLength(1)
  expect(mockRemove).not.toHaveBeenCalled()
  expect(await uploadPending()).toBe(1)
  expect(await getMeta(uploads, [])).toEqual([])
  expect(mockRemove.mock.calls).toEqual([['/share/sealed'], ['/share/original']])
})
