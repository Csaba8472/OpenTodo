#!/usr/bin/env node
// No Google services in the Android app (OpenSpec change native-app-handover D8, "Android
// distribution without Google services"): F-Droid builds it from source, so no module may
// bring Google Play Services or Firebase. Reads the release runtime dependency tree of the
// generated project and fails naming each such dependency.
//
//   node mobile/app/scripts/google-services.mjs            # runs Gradle in mobile/app/android
//   ./gradlew :app:dependencies … | node google-services.mjs -
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Group ids of Google's proprietary services: Play Services, Firebase and the Play Core libraries. */
const REFUSED = [/^com\.google\.firebase(\.|$)/, /^com\.google\.android\.gms(\.|$)/, /^com\.google\.android\.play(\.|$)/, /^com\.google\.mlkit(\.|$)/]

/** The refused `group:artifact` coordinates in a Gradle dependency tree, each once, sorted. */
export function googleServices(tree) {
  const found = new Set()
  for (const m of tree.matchAll(/(?:^|[\s\\|+-])([a-zA-Z0-9_.-]+):([a-zA-Z0-9_.-]+)(?::[^\s]+)?/gm)) {
    const [, group, artifact] = m
    if (REFUSED.some((r) => r.test(group))) found.add(`${group}:${artifact}`)
  }
  return [...found].sort()
}

function main() {
  const fromStdin = process.argv[2] === '-'
  const tree = fromStdin
    ? readFileSync(0, 'utf8')
    : execFileSync('./gradlew', ['-q', ':app:dependencies', '--configuration', 'releaseRuntimeClasspath'], {
      cwd: join(dirname(fileURLToPath(import.meta.url)), '..', 'android'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    })
  if (!/releaseRuntimeClasspath|\+---|\\---/.test(tree)) {
    console.error('google-services: no dependency tree to read')
    process.exit(2)
  }
  const found = googleServices(tree)
  if (found.length) {
    console.error(`google-services: the Android app depends on Google services, which F-Droid refuses:\n${found.map((d) => `  ${d}`).join('\n')}`)
    process.exit(1)
  }
  console.log('google-services: no Google Play Services or Firebase in the release build')
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
