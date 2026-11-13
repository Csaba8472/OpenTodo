// The shared OTAT1 envelope, with React Native's FileReader for each plaintext chunk.
// Ciphertext is saved before its op is written, so offline and interrupted uploads retry.
import { b64url, encryptFileParts } from '@shared/crypto'
import { container } from '../modules/opentodo-shared-container'

export function readBlob(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('Cannot read shared file'))
    reader.readAsArrayBuffer(blob)
  })
}

export async function sealSharedFile(key: CryptoKey, id: string, blob: Blob): Promise<{ path: string; size: number }> {
  const parts = await encryptFileParts(key, id, { size: blob.size, slice: (start, end) => ({ arrayBuffer: () => readBlob(blob.slice(start, end)) }) })
  const encoded = parts.map((p) => {
    const raw = b64url(p).replace(/-/g, '+').replace(/_/g, '/')
    return raw.padEnd(Math.ceil(raw.length / 4) * 4, '=')
  })
  const path = await container.writeFile(encoded)
  if (!path) throw new Error('Cannot save encrypted shared file')
  return { path, size: parts.reduce((n, p) => n + p.byteLength, 0) }
}
