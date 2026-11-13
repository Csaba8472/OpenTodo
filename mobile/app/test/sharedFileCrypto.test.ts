/** @jest-environment node */
import { decryptFile } from '@shared/crypto'
import { sealSharedFile } from '../src/sharedFileCrypto'

let mockBytes = Buffer.alloc(0)
jest.mock('../modules/opentodo-shared-container', () => ({ container: {
  writeFile: async (parts: string[]) => { mockBytes = Buffer.concat(parts.map((p) => Buffer.from(p, 'base64'))); return '/private/share/sealed' },
} }))

it('saves the shared attachment envelope, decryptable by the web, bound to its id', async () => {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const plain = new Uint8Array(1_200_007).map((_, i) => i % 251)
  const sealed = await sealSharedFile(key, 'task-file', new Blob([plain]))
  expect(sealed.path).toBe('/private/share/sealed')
  expect(sealed.size).toBe(mockBytes.byteLength)
  const envelope = new Blob([new Uint8Array(mockBytes)])
  expect(Buffer.from(await (await decryptFile(key, 'task-file', envelope)).arrayBuffer()).equals(Buffer.from(plain))).toBe(true)
  await expect(decryptFile(key, 'another-file', envelope)).rejects.toThrow()
})
