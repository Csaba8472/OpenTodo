/**
 * @jest-environment node
 */
// Notes edited as Markdown in the app (native-app-everyday D4, 4.1): the text is written as
// `description`, and the shared fold (foldNote, as an open note or a pull runs it) merges it
// into the note's document. Every block type comes back from the document as it was
// written, and editing one paragraph leaves the rest (a table included, which the app does
// not draw) exactly as it was. On the app's own database.
import { db, useDatabase as openDatabaseNamed } from '@shared/db'
import { resetModuleState } from '@shared/moduleState'
import { createTask, foldNote, resetDeviceId, saveNote } from '@shared/ops'
import { loadRichText, resetRichTextForTests } from '@shared/docfields'
import * as richtext from '@shared/richtext'
import { installPlatform, platform } from '@shared/platform'
import { sqliteDatabase } from '../src/storage/adapter'
import { nodeSqlite } from './storage/nodeSqlite'

afterEach(() => resetModuleState())

function useAdapter() {
  resetModuleState()
  // Jest runs no dynamic import here; Metro bundles lib/richtext into the app as it is.
  resetRichTextForTests(async () => richtext)
  resetDeviceId()
  const web = platform
  installPlatform({ ...web, database: (declared) => sqliteDatabase(declared, nodeSqlite()) })
  openDatabaseNamed(`notes-${Math.random()}`)
}

// In the document's canonical Markdown (it writes emphasis as _one_, as the web editor does).
const EVERY_BLOCK = [
  '# Trip to Rome',
  '',
  'Pack **light**, take _one_ bag and `cash`. See [the guide](https://example.com/rome).',
  '',
  '## Lists',
  '',
  '- passport',
  '- tickets',
  '  - seat 12A',
  '',
  '1. Colosseum',
  '2. Vatican',
  '',
  '- [ ] book the hotel',
  '- [x] renew the card',
  '',
  '> Rome was not built in a day.',
  '',
  '```',
  'const days = 4',
  '```',
  '',
  '| Day | Plan |',
  '| --- | --- |',
  '| 1 | Forum |',
  '',
  '---',
  '',
  'The end.',
].join('\n')

describe('a task note edited as Markdown', () => {
  it('folds every block type into the document and reads back the same text', async () => {
    useAdapter()
    const id = await createTask({ title: 'Rome' })
    await saveNote('task', id, { description: EVERY_BLOCK })
    expect(await foldNote(id)).toBe(true)
    const row = await db.tasks.get(id)
    expect(row?.notes_doc).toBeTruthy()
    const rt = await loadRichText()
    expect(rt.projectDoc(row!.notes_doc!)).toBe(EVERY_BLOCK)
    expect(row?.description).toBe(EVERY_BLOCK)
  })

  it('leaves the table as it is when another paragraph is edited', async () => {
    useAdapter()
    const id = await createTask({ title: 'Rome' })
    await saveNote('task', id, { description: EVERY_BLOCK })
    await foldNote(id)
    const edited = EVERY_BLOCK.replace('The end.', 'The end, and a coffee.')
    await saveNote('task', id, { description: edited })
    await foldNote(id)
    const row = await db.tasks.get(id)
    expect((await loadRichText()).projectDoc(row!.notes_doc!)).toBe(edited)
    expect(row?.description).toBe(edited)
    expect(row?.description).toContain('| Day | Plan |\n| --- | --- |\n| 1 | Forum |')
  })
})
