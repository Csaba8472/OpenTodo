// Saving a template as a file in the browser (the web's Templates dialog only): kept
// apart from lib/templates.ts, which the native app shares, because it uses the page.

/** Offer a file as a download from a Blob URL (no server round trip). */
export function downloadJSON(data: unknown, name: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
