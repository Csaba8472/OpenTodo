// Checks the screens' hierarchies that screens.sh saved (native-app-everyday 6.1), as the
// platform's accessibility scanner would: every control has a name TalkBack reads (its own
// or its content's), and a touch target of at least 48 dp. Prints each finding with its
// screen and exits 1 when there is one.
//   node a11y.mjs <dir>/*.json
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

const APP = process.env.APP_ID ?? 'app.opentodo'
const SCREEN = process.env.SCREEN ?? '[0,0][1080,2400]'
const DENSITY = Number(process.env.DENSITY ?? 420) / 160
const MIN = 48 * DENSITY - 1

const WIDTH = Number(/\]\[(\d+),/.exec(SCREEN)[1])
const box = (b) => { const m = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(b ?? ''); return m ? { x1: +m[1], x2: +m[3], w: m[3] - m[1], h: m[4] - m[2] } : null }
const named = (n) => { const a = n.attributes ?? {}; return !!(a.text?.trim() || a.accessibilityText?.trim() || a.hintText?.trim()) }
const anyNamed = (n) => named(n) || (n.children ?? []).some(anyNamed)

let findings = 0
for (const file of process.argv.slice(2)) {
  let root
  try { root = JSON.parse(readFileSync(file, 'utf8')) } catch { console.log(`${basename(file)}: no hierarchy`); findings++; continue }
  const seen = new Set()
  const walk = (n) => {
    const a = n.attributes ?? {}
    // Other apps' views (the system bars, the keyboard) are not the app's.
    const pkg = /^([\w.]+):id\//.exec(a['resource-id'] ?? '')?.[1]
    if (pkg && pkg !== 'android' && pkg !== APP) return
    // A sheet's backdrop: Back dismisses it, so it is not a control of its own.
    if (a.bounds === SCREEN && !anyNamed(n)) { for (const c of n.children ?? []) walk(c); return }
    if (a.clickable === 'true' && a.enabled !== 'false') {
      const b = box(a.bounds)
      const what = (a.accessibilityText || a.text || a['resource-id'] || a.class || '').slice(0, 40)
      const problems = []
      // A control kept from TalkBack (the row's own actions stand for it) needs no name.
      if (!anyNamed(n) && a['important-for-accessibility'] !== 'false') problems.push('no name')
      // A control scrolled partly off the screen's side is as narrow as its visible part.
      const cut = b && (b.x1 === 0 || b.x2 === WIDTH)
      if (b && b.w > 0 && b.h > 0 && ((b.w < MIN && !cut) || b.h < MIN)) problems.push(`target ${Math.round(b.w / DENSITY)}x${Math.round(b.h / DENSITY)} dp`)
      const key = `${what}|${problems.join()}`
      if (problems.length && !seen.has(key)) { seen.add(key); findings++; console.log(`${basename(file, '.json')}: "${what}" ${problems.join(', ')} ${a.bounds}`) }
    }
    for (const c of n.children ?? []) walk(c)
  }
  walk(root)
}
console.log(findings ? `a11y: ${findings} findings` : 'a11y: no findings')
process.exit(findings ? 1 : 0)
